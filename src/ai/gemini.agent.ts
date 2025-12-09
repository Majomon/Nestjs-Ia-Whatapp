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
            query: { type: Type.STRING, description: 'Búsqueda opcional' },
            limit: { type: Type.INTEGER, description: 'Cantidad de productos' },
            offset: {
              type: Type.INTEGER,
              description: 'Offset para paginación',
            },
          },
          required: [],
        },
      },
      {
        name: 'getProductDetail',
        description: 'Obtiene detalle de un producto por ID',
        parameters: {
          type: Type.OBJECT,
          properties: { id: { type: Type.INTEGER } },
          required: ['id'],
        },
      },
    ],
  },
];

export class GeminiAgent {
  private ai: GoogleGenAI;
  private modelName = 'gemini-2.5-flash';
  private backendUrl =
    process.env.BACKEND_URL || 'https://desafio-laburen-vgux.onrender.com';

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  // Método principal para enviar mensaje al agente
  public async sendMessage(
    history: ChatMessage[],
    userMessage: string,
  ): Promise<string> {
    const historyContent: Content[] = history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    }));

    const chat = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction:
          'Eres un asistente de ventas. Usa herramientas para pedir info de productos. Saluda, pregunta qué productos le interesa al usuario, muestra precios y detalles amablemente.',
        tools,
      },
      history: historyContent,
    });

    // Enviamos el mensaje del usuario
    let response = await chat.sendMessage({ message: userMessage });

    // Si el modelo quiere usar una función (getProducts / getProductDetail)
    const funcCall = response.candidates?.[0]?.content?.[0]?.functionCall;
    if (funcCall) {
      let result;
      try {
        if (funcCall.name === 'getProducts') {
          const { query = '', limit = 5, offset = 0 } = funcCall.args as any;
          const { data } = await axios.get(
            `${this.backendUrl}/products?q=${query}&limit=${limit}&offset=${offset}`,
          );
          result = data;
        }
        if (funcCall.name === 'getProductDetail') {
          const { id } = funcCall.args as any;
          const { data } = await axios.get(`${this.backendUrl}/products/${id}`);
          result = { product: data };
        }
      } catch (err) {
        console.error('Error llamando al backend:', err);
        result = { error: 'No se pudo obtener la información.' };
      }

      // Mandamos la respuesta de la función de vuelta al modelo
      response = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: funcCall.name,
              response: result,
            },
          },
        ] as Part[],
      });
    }

    return response.text ?? 'Lo siento, no pude generar una respuesta.';
  }
}
