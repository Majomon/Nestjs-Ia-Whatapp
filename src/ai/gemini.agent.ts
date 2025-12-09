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

// Productos de ejemplo para el primer mensaje (fijos)
const SAMPLE_PRODUCTS = [
  { tipoPrenda: 'Pantalón', talla: 'M', precio50U: 1200 },
  { tipoPrenda: 'Camiseta', talla: 'L', precio50U: 800 },
  { tipoPrenda: 'Falda', talla: 'S', precio50U: 1000 },
  { tipoPrenda: 'Sudadera', talla: 'M', precio50U: 1500 },
  { tipoPrenda: 'Chaqueta', talla: 'L', precio50U: 2500 },
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
          Eres un agente de ventas inteligente.
          - Si es el primer mensaje del usuario, saluda y muestra algunos productos de ejemplo.
          - Cuando el usuario indique interés, llama a getProducts para filtrar productos reales.
          - Entiende "siguiente" o "más" para paginar resultados.
          - Presenta nombre, talla y precio de forma resumida.
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    // Determinar si es el primer mensaje del usuario
    const isFirstUserMessage = !history.some((h) => h.role === 'model');

    if (isFirstUserMessage) {
      const reply =
        `¡Hola! Bienvenido/a. Algunos de nuestros productos son:\n` +
        SAMPLE_PRODUCTS.map(
          (p) => `${p.tipoPrenda} - ${p.talla} - $${p.precio50U}`,
        ).join('\n') +
        `\n¿Cuál te interesa?`;

      history.push({ role: 'model', text: reply });
      return reply;
    }

    // Envío normal al modelo para que use getProducts si corresponde
    let response = await chat.sendMessage({ message: userMessage });

    const funcCall = response.candidates?.[0]?.content?.[0]?.functionCall;
    if (funcCall?.name === 'getProducts') {
      const { query = '', limit = 5, offset = 0 } = funcCall.args as any;

      const { data } = await axios.get<{ products: any[] }>(
        `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      );

      response = await chat.sendMessage({
        message: [
          { functionResponse: { name: funcCall.name, response: data } },
        ],
      });
    }

    return response.text ?? 'Lo siento, no pude generar una respuesta.';
  }
}
