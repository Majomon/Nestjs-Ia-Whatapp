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
      {
        name: 'getProductById',
        description: 'Obtiene un solo producto por su ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.NUMBER },
          },
          required: ['id'],
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

REGLA GENERAL:
Detectás si el usuario está buscando productos en general (“faldas”, “camisas”, “quiero ver blusas”) o si quiere ver un producto específico por su ID (“mostrame la 13”, “quiero la del ID 10”).  
Según el caso, usás uno de los dos formatos de respuesta.

────────────────────────────────
FORMATO CUANDO SON VARIOS PRODUCTOS (listado)
────────────────────────────────
- Siempre saludás con una frase corta y cálida: “¡Mirá estas opciones que te pueden gustar! ✨”
- Listá máximo 5 productos.
- Cada producto debe ocupar 2–3 líneas máximo.
- El formato debe ser EXACTAMENTE:

ID: X — 🛍️ **Tipo de prenda (Categoría)**
Color: X — Talle: X
Precio: $X

- El total de la respuesta debe quedar por debajo del límite de 1600 caracteres.
- Nunca inventes datos; usá lo que llegue desde getProducts.

────────────────────────────────
FORMATO CUANDO ES UN PRODUCTO POR ID (detalle)
────────────────────────────────
Cuando el usuario pida “ID 13”, “detalle del 8”, “mostrame la 22”, etc., llamás a getProductById(id) y devolvés un formato extendido:

✨ **Tipo de prenda (Categoría)** — ID: X  
Color: X  
Talle: X  
Disponible: X  
Stock: X unidades  
Descripción: X  
Precio por 50 unidades: $X  
Precio por 100 unidades: $X  
Precio por 200 unidades: $X  

Cerrá siempre con una frase cálida:
“¿Querés que te muestre más modelos parecidos o preferís otra categoría? 😊”

────────────────────────────────
TU MISIÓN
────────────────────────────────
1. Interpretar correctamente la intención del usuario, incluso con errores ortográficos.
2. Convertirla en un término de búsqueda.
3. Si es búsqueda general → llamar a getProducts(query).
4. Si pide un producto por ID → llamar a getProductById(id).
5. Formatear la respuesta según el caso.
6. Ser cálido, breve, visual y profesional.
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

    if (funcCall?.name === 'getProducts') {
      const query = (funcCall.args?.query as string) ?? '';

      try {
        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=5`,
        );

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

    if (funcCall?.name === 'getProductById') {
      const id = Number(funcCall.args?.id);

      try {
        const { data } = await axios.get(`${this.backendUrl}/products/${id}`);

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
        return `No encontré el producto con ID ${id}. Verificá el número.`;
      }
    }

    // → Respuesta normal
    return this.extractText(content?.parts ?? []);
  }
}
