// src/ai/gemini.agent.ts
import { GoogleGenAI, Tool, Type, Content, Part } from '@google/genai';
import axios from 'axios';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'getProducts',
        description: 'Busca productos según query, límite y offset.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'Búsqueda opcional del usuario',
            },
            limit: {
              type: Type.INTEGER,
              description: 'Cantidad de productos a traer',
            },
            offset: {
              type: Type.INTEGER,
              description: 'Offset para paginación',
            },
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
          Eres un agente de ventas autónomo de productos.
          - Siempre respondes al usuario.
          - Inicia la conversación solo con un saludo y una invitación a decir qué le interesa.
          - Cuando el usuario indique interés, llama a la función getProducts para traer los productos que coincidan.
          - Si el usuario escribe "siguiente" o "más", llama a getProducts con offset para paginación.
          - Presenta los productos resumidos (nombre, talla, precio) y de forma natural.
          - Nunca hardcodees productos ni ejemplos en el código; la IA decide qué mostrar.
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    // Enviar mensaje del usuario
    let response = await chat.sendMessage({ message: userMessage });

    // Si el modelo quiere usar una función
    const funcCall = response.candidates?.[0]?.content?.[0]?.functionCall;
    if (funcCall?.name === 'getProducts') {
      const { query = '', limit = 15, offset = 0 } = funcCall.args as any;

      // Llamada a backend real
      const { data } = await axios.get(
        `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      );

      // Mandar la respuesta de la función de vuelta al modelo para generar mensaje natural
      response = await chat.sendMessage({
        message: [
          { functionResponse: { name: funcCall.name, response: data } },
        ],
      });
    }

    return response.text ?? 'Lo siento, no pude generar una respuesta.';
  }
}
