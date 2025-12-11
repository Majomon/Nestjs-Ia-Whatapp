// src/ai/gemini.agent.ts
import { GoogleGenAI, Tool, Type } from '@google/genai';
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
        description: 'Busca productos reales desde el backend según query.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING },
          },
          required: ['query'],
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
          Eres un agente de ventas profesional y amable.

          Regla principal:
          - Si el usuario menciona un tipo de prenda, color, categoría o talla,
            debes llamar a la función getProducts usando "query".
          - NUNCA inventes productos.
          - Usa SIEMPRE lo que devuelva el backend.
          - Formato de respuesta:
            • ID X - TipoPrenda (Talla, Color) - $Precio_50U
          - Si no hay productos: "No encontré productos con esa descripción."
          - Mantén las respuestas cortas y útiles.
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    // ------------------------------
    // 1) El usuario envía su mensaje
    // ------------------------------
    let response = await chat.sendMessage({
      message: userMessage,
    });

    const funcCall = response.candidates?.[0]?.content?.[0]?.functionCall;

    // ------------------------------
    // 2) El agente decide usar getProducts
    // ------------------------------
    if (funcCall?.name === 'getProducts') {
      const query = funcCall.args.query || '';

      try {
        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${encodeURIComponent(query)}`,
        );

        // Enviar la respuesta de la función al modelo
        const followUp = await chat.sendMessage({
          message: [
            {
              functionResponse: {
                name: 'getProducts',
                response: data,
              },
            },
          ],
        });

        return followUp.text ?? 'No pude generar la respuesta final.';
      } catch (err) {
        return 'Hubo un error buscando los productos.';
      }
    }

    // ------------------------------
    // 3) Respuesta normal del agente
    // ------------------------------
    return response.text ?? 'No pude generar una respuesta.';
  }
}
