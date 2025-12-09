import { Injectable } from '@nestjs/common';
import { GeminiAgent } from './gemini.agent';

// Define una interfaz simple para el historial
interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

@Injectable()
export class AiService {
  private agent: GeminiAgent;
  // Cambia el tipo del historial para usar la interfaz
  private history: ChatMessage[] = [];

  constructor() {
    this.agent = new GeminiAgent(process.env.GEMINI_API_KEY!);
  }

  async processMessage(message: string) {
    // 1. Agregar mensaje del usuario al historial
    this.history.push({ role: 'user', text: message });

    // 2. Llamar al agente
    const reply = await this.agent.sendMessage(this.history, message);

    // SOLUCIÓN AL ERROR:
    // Aseguramos que 'finalReply' sea un string válido.
    // Si 'reply' viene undefined, usamos el texto de la derecha.
    const finalReply = reply ?? 'Lo siento, hubo un error técnico.';

    // 3. Guardar la respuesta del modelo en el historial
    this.history.push({ role: 'model', text: finalReply });

    return finalReply;
  }
}
