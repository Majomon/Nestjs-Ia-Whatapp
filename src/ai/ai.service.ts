// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GeminiAgent, ChatMessage } from './gemini.agent';

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
    // Inicializar historial y estado si no existe
    if (!this.userHistories[userId]) this.userHistories[userId] = [];
    if (!this.userStates[userId])
      this.userStates[userId] = { page: 1, limit: 5 };

    const history = this.userHistories[userId];
    const state = this.userStates[userId];

    // Manejar "siguiente" para paginación
    const lowerMsg = message.trim().toLowerCase();
    if (lowerMsg === 'sí' || lowerMsg === 'siguiente') {
      state.page += 1;
    } else {
      state.page = 1;
      state.query = message;
    }

    // Guardar mensaje del usuario
    history.push({ role: 'user', text: message });

    // Llamar al agente IA
    const reply = await this.agent.sendMessage(history, message);

    // Guardar respuesta del modelo
    history.push({ role: 'model', text: reply });

    return reply;
  }
}
