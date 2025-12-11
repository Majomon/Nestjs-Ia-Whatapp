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
          properties: { query: { type: Type.STRING } },
        },
      },
      {
        name: 'getProductById',
        description: 'Obtiene un solo producto por su ID.',
        parameters: {
          type: Type.OBJECT,
          properties: { id: { type: Type.NUMBER } },
          required: ['id'],
        },
      },
      {
        name: 'addToCart',
        description: 'Agrega un producto al carrito por ID y cantidad',
        parameters: {
          type: Type.OBJECT,
          properties: { id: { type: Type.NUMBER }, qty: { type: Type.NUMBER } },
          required: ['id', 'qty'],
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

  private extractText(parts: Part[]): string {
    return parts
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join('\n')
      .trim();
  }

  private extractFunctionCall(content?: Content) {
    if (!content?.parts) return null;
    return content.parts.find((p) => p.functionCall)?.functionCall ?? null;
  }

  async sendMessage(
    userId: string,
    history: ChatMessage[],
    userMessage: string,
  ) {
    const chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `
Eres un agente de ventas experto en moda, cálido, amable, cercano y con tacto comercial.
Tu tono debe ser amistoso, profesional y empático. Siempre buscás ayudar al cliente como si estuvieras en un local real.

REGLA GENERAL:
Detectás si el usuario está buscando productos en general (“faldas”, “camisas”, “quiero ver blusas”) o si quiere ver un producto específico por su ID (“mostrame la 13”, “quiero la del ID 10”).

────────────────────────────────
FORMATO CUANDO SON VARIOS PRODUCTOS (listado)
────────────────────────────────
- Siempre saludás con una frase corta y cálida: “¡Mirá estas opciones que te pueden gustar! ✨”
- Listá máximo 5 productos.
- Cada producto debe ocupar 2-3 líneas máximo.
- El formato debe ser EXACTAMENTE:

ID: X — 🛍️ **Tipo de prenda (Categoría)**
Color: X — Talle: X
Precio: $X

- Al final de la lista, cerrá con un mensaje cálido:
“Si querés, podés pedirme el detalle de un producto indicando su ID o ver otra categoría 😊”

────────────────────────────────
FORMATO CUANDO ES UN PRODUCTO POR ID (detalle)
────────────────────────────────
✨ **Tipo de prenda (Categoría)** — ID: X
Color: X
Talle: X
Disponible: X
Stock: X unidades
Descripción: X
Precio por 50 unidades: $X
Precio por 100 unidades: $X
Precio por 200 unidades: $X

- Al final, cerrá con mensaje instructivo:
“Podés agregar este producto al carrito indicando ID y cantidad. También podés ver otra categoría o ver otro producto por ID 😊”
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    const response = await chat.sendMessage({ message: userMessage });
    const candidate = response.candidates?.[0];
    const content = candidate?.content;
    const funcCall = this.extractFunctionCall(content);

    // Si no hay llamada a función, devolvemos el texto normal
    if (!funcCall) {
      return this.extractText(candidate?.content?.parts ?? []);
    }

    // -------------------------------
    // GET PRODUCTS
    // -------------------------------
    if (funcCall?.name === 'getProducts') {
      const query = (funcCall.args?.query as string) ?? '';
      const { data } = await axios.get(
        `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=5`,
      );
      const follow = await chat.sendMessage({
        message: [
          { functionResponse: { name: funcCall.name, response: data } },
        ],
      });
      return this.extractText(follow.candidates?.[0]?.content?.parts ?? []);
    }

    // -------------------------------
    // GET PRODUCT BY ID
    // -------------------------------
    if (funcCall?.name === 'getProductById') {
      const id = Number(funcCall.args?.id);
      const { data } = await axios.get(`${this.backendUrl}/products/${id}`);
      const follow = await chat.sendMessage({
        message: [
          { functionResponse: { name: funcCall.name, response: data } },
        ],
      });
      return this.extractText(follow.candidates?.[0]?.content?.parts ?? []);
    }

    // -------------------------------
    // ADD TO CART
    // -------------------------------

    if (funcCall?.name === 'addToCart') {
      const id = Number(funcCall.args?.id);
      const qty = Number(funcCall.args?.qty);

      // Traer producto (para el nombre y validación)
      const { data: product } = await axios.get(
        `${this.backendUrl}/products/${id}`,
      );
      if (!product) return `No encontré el producto con ID ${id}.`;

      // Intentar actualizar carrito existente o crear nuevo
      let cart;
      try {
        const { data: existing } = await axios.get(
          `${this.backendUrl}/carts/user/${userId}`,
        );

        // Preparar items actualizados
        let items = existing.items.map((i: any) => ({
          product_id: i.product.id,
          qty: i.product.id === id ? i.qty + qty : i.qty,
        }));
        if (!items.find((i: any) => i.product_id === id))
          items.push({ product_id: id, qty });

        const { data: updated } = await axios.patch(
          `${this.backendUrl}/carts/${existing.id}`,
          { items },
        );
        cart = updated;
      } catch {
        // Crear carrito si no existía
        const { data: created } = await axios.post(`${this.backendUrl}/carts`, {
          userId,
          items: [{ product_id: id, qty }],
        });
        cart = created;
      }

      // -------------------------------
      // Pasar el carrito completo a Gemini para que genere el mensaje
      // -------------------------------
      const follow = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: funcCall.name,
              response: cart, // TODO: toda la info del carrito con productos
            },
          },
        ],
      });

      // Extraemos el texto generado por Gemini
      return this.extractText(follow.candidates?.[0]?.content?.parts ?? []);
    }
  }
}
