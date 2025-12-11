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
        description:
          'Busca productos reales en el backend usando un término interpretado del usuario.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING },
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
    if (!content?.parts) return null;
    return content.parts.find((p) => p.functionCall)?.functionCall ?? null;
  }

  async sendMessage(history: ChatMessage[], userMessage: string) {
    const chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `
Eres un agente de ventas experto en moda.
Interpretas lenguaje natural, errores ortográficos y sinónimos.
Paso 1 — Entendés qué prenda o tipo de producto busca el usuario, aunque use palabras raras, abreviaciones o errores ("zapas", "shor", "remera", etc.).
Paso 2 — Convertís su intención en un término de búsqueda claro (query).
Paso 3 — Llamás a getProducts(query) cuando corresponda.
Paso 4 — Mostrás los productos de forma breve: tipo de prenda, talla, color y precio.

Nunca inventes datos. Siempre que busques productos reales, usá la función getProducts.
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    // Primer mensaje
    const response = await chat.sendMessage({ message: userMessage });
    const candidate = response.candidates?.[0];
    const content = candidate?.content;

    // → SI el modelo quiere usar la función
    const funcCall = this.extractFunctionCall(content);

    if (funcCall && funcCall.name === 'getProducts') {
      const query = (funcCall.args?.query as string) ?? '';

      try {
        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${encodeURIComponent(query)}`,
        );

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
      } catch (e) {
        return 'Hubo un problema al consultar los productos. Intentá de nuevo.';
      }
    }

    // → Respuesta normal
    return this.extractText(content?.parts ?? []);
  }
}
