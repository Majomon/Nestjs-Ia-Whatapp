// src/ai/gemini.agent.ts
import { GoogleGenAI, Tool, Type, Part, Content } from '@google/genai';
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
        description: 'Obtiene productos desde el backend.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING },
            limit: { type: Type.INTEGER },
            offset: { type: Type.INTEGER },
          },
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

  /** EXTRAER TEXTO DE PARTS */
  private extractText(parts: Part[]): string {
    return parts
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join('\n')
      .trim();
  }

  /** EXTRAER CALL A FUNCION */
  private extractFunctionCall(content?: Content) {
    if (!content || !content.parts) return null;

    // Buscar part.functionCall
    return content.parts.find((p) => p.functionCall)?.functionCall ?? null;
  }

  async sendMessage(history: ChatMessage[], userMessage: string) {
    const chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `
Eres un agente de ventas experto en moda.
- Interpretas lenguaje natural.
- Cuando detectes que el usuario busca productos, llamá a getProducts.
- Presentás resultados claros y resumidos.
- Nunca inventes datos; usá la función getProducts.
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    // Primer mensaje del usuario
    const response = await chat.sendMessage({ message: userMessage });

    const candidate = response.candidates?.[0];
    const content = candidate?.content;
    const parts = content?.parts ?? [];

    // Si el modelo pidió usar la tool
    const funcCall = this.extractFunctionCall(content);

    if (funcCall) {
      if (funcCall.name === 'getProducts') {
        const { data } = await axios.get(`${this.backendUrl}/products}`);

        // Respuesta a la función
        const follow = await chat.sendMessage({
          message: [
            {
              functionResponse: {
                name: funcCall.name,
                response: data,
              },
            },
          ],
        });

        const followContent = follow.candidates?.[0]?.content;
        const followParts = followContent?.parts ?? [];

        return this.extractText(followParts);
      }
    }

    // Respuesta normal
    return this.extractText(parts);
  }
}
