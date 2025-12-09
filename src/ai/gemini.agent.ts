// src/ai/gemini.agent.ts
import { GoogleGenAI, Tool, Type, Content, Part } from '@google/genai';
import axios from 'axios';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Simplificado para este flujo
const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'getProducts',
        description: 'Busca productos según query, límite y offset.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING },
            limit: { type: Type.INTEGER },
            offset: { type: Type.INTEGER },
          },
          required: [],
        },
      },
    ],
  },
];

export class GeminiAgent {
  private ai: GoogleGenAI;
  private backendUrl = process.env.BACKEND_URL!;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async sendMessage(history: ChatMessage[], userMessage: string) {
    const chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `
          Eres un agente de ventas de productos.
          - Siempre respondes al usuario.
          - Inicia la conversación mostrando 2-3 productos reales de la base de datos.
          - Cuando el usuario indique interés, filtra productos usando getProducts y devuelve solo los que coinciden.
          - Maneja paginación automáticamente si el usuario quiere "más".
          - Presenta nombre, talla, precio de forma resumida.
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    let response = await chat.sendMessage({ message: userMessage });

    const funcCall = response.candidates?.[0]?.content?.[0]?.functionCall;
    if (funcCall?.name === 'getProducts') {
      const { query = '', limit = 3, offset = 0 } = funcCall.args as any;
      const { data } = await axios.get(
        `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      );

      // Mandamos la respuesta de la función de vuelta al modelo para que genere un mensaje natural
      response = await chat.sendMessage({
        message: [
          { functionResponse: { name: funcCall.name, response: data } },
        ],
      });
    }

    return response.text ?? 'Lo siento, no pude generar una respuesta.';
  }
}
