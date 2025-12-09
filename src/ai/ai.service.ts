// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GeminiAgent } from './gemini.agent';

@Injectable()
export class AiService {
  private agent: GeminiAgent;
  private history: string[] = [];

  constructor() {
    this.agent = new GeminiAgent(process.env.GEMINI_API_KEY!);
  }

  async processMessage(message: string) {
    // Agregar mensaje del usuario al historial
    this.history.push(message);

    // Llamar al GeminiAgent
    const reply: string =
      (await this.agent.sendMessage(this.history, message)) ??
      'No pude generar respuesta';

    // Guardar la respuesta en el historial
    this.history.push(reply);

    return reply;
  }
}
