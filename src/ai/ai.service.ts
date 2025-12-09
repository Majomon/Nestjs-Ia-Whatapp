// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GeminiAgent, ChatMessage } from './gemini.agent';
import axios from 'axios';

interface UserState {
  query?: string;
  page: number;
  limit: number;
}

@Injectable()
export class AiService {
  private agent: GeminiAgent;
  private userHistories: Record<string, ChatMessage[]> = {};
  private userStates: Record<string, UserState> = {};

  constructor() {
    this.agent = new GeminiAgent(process.env.GEMINI_API_KEY!);
  }

  async processMessage(userId: string, message: string) {
    if (!this.userHistories[userId]) this.userHistories[userId] = [];
    if (!this.userStates[userId])
      this.userStates[userId] = { page: 1, limit: 5 };

    const history = this.userHistories[userId];
    const state = this.userStates[userId];

    const lowerMsg = message.trim().toLowerCase();

    if (lowerMsg === 'siguiente') {
      state.page += 1;
    } else {
      state.page = 1;
      state.query = message;
    }

    history.push({ role: 'user', text: message });

    // Si el usuario aún no ha especificado interés, damos ejemplo de productos
    if (!state.query) {
      const { data } = await axios.get(
        `${process.env.BACKEND_URL}/products?limit=5&offset=0`,
      );
      const exampleProducts = data.products
        .map((p) => `${p.tipoPrenda} - ${p.talla} - $${p.precio50U}`)
        .join('\n');
      const reply = `¡Tenemos muchos productos! Algunos ejemplos:\n${exampleProducts}\n¿Cuál te interesa?`;
      history.push({ role: 'model', text: reply });
      return reply;
    }

    // Llamada a la API con query del usuario
    const offset = (state.page - 1) * state.limit;
    const { data } = await axios.get(
      `${process.env.BACKEND_URL}/products?q=${state.query}&limit=${state.limit}&offset=${offset}`,
    );

    if (data.products.length === 0) {
      const reply = `No encontramos productos que coincidan con "${state.query}". Intenta con otra búsqueda.`;
      history.push({ role: 'model', text: reply });
      return reply;
    }

    const reply = data.products
      .map((p) => `${p.tipoPrenda} - ${p.talla} - $${p.precio50U}`)
      .join('\n');

    const fullReply = `Encontré estos productos:\n${reply}\nEscribe "siguiente" para ver más.`;

    history.push({ role: 'model', text: fullReply });
    return fullReply;
  }
}
