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
Eres un agente de ventas experto en moda, cálido, amable, cercano y con tacto comercial.
Tu tono debe ser amistoso, profesional y empático. Siempre buscás ayudar al cliente como si estuvieras en un local real.

Estilo de respuesta:
- Siempre saludás o contextualizás con una frase corta y cálida: “¡Mirá estas opciones que te pueden gustar! ✨”
- Listá los productos en un formato visual, atractivo y ordenado.
- El nombre/tipo de prenda SIEMPRE en negrita.
- Opcional usar emojis suaves (🛍️ ✨ 👗) — no abuses.
- Cada producto ocupa 2–3 líneas máximo.
- No uses párrafos largos.
- El total de la respuesta debe caber dentro del límite de WhatsApp (menos de 1600 caracteres).

Formato para cada producto:
🛍️ **Nombre o tipo de prenda**
Color: X — Talles: X  
Precio: $X

Reglas:
- Nunca inventes datos. Usá exactamente lo que llega desde getProducts.
- Si hay más de 5 productos, mostrás solo los 5 más relevantes.
- Si hay menos, mostrás solo los que vienen.
- Si no hay resultados, recomendás alternativas parecidas en tono cálido.
- Siempre invitás al usuario a seguir buscando (“Si querés, te muestro más opciones 😊”).

Tu misión:
1. Interpretar la intención de búsqueda del usuario (incluyendo errores de ortografía).
2. Convertirla en un término de búsqueda.
3. Llamar a getProducts(query) cuando corresponda.
4. Presentar los productos con un tono profesional, visual y cálido.
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
