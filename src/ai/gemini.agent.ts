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
      {
        name: 'addToCart',
        description: 'Agrega un producto al carrito por ID y cantidad',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.NUMBER },
            qty: { type: Type.NUMBER },
          },
          required: ['id', 'qty'],
        },
      },
      {
        name: 'viewCart',
        description: 'Muestra los productos actualmente en el carrito',
        parameters: {
          type: Type.OBJECT,
        },
      },
    ],
  },
];

export class GeminiAgent {
  private ai: GoogleGenAI;
  private backendUrl = process.env.BACKEND_URL!;

  // Carrito en memoria
  private cartId?: number;
  private cart: {
    product_id: number;
    tipoPrenda: string;
    qty: number;
    price: number;
  }[] = [];

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

  async sendMessage(history: ChatMessage[], userMessage: string) {
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
- Cada producto debe ocupar 2–3 líneas máximo.
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

    // -------------------------------
    // GET PRODUCTS (varios)
    // -------------------------------
    if (funcCall?.name === 'getProducts') {
      const query = (funcCall.args?.query as string) ?? '';

      try {
        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=5`,
        );

        const follow = await chat.sendMessage({
          message: [
            { functionResponse: { name: funcCall.name, response: data } },
          ],
        });

        const followContent = follow.candidates?.[0]?.content;
        const followParts = followContent?.parts ?? [];

        const productsText = this.extractText(followParts);
        return `${productsText}\n\nSi querés, podés pedirme el detalle de un producto indicando su ID o ver otra categoría 😊`;
      } catch (e) {
        return 'Hubo un problema al consultar los productos. Intentá de nuevo.';
      }
    }

    // -------------------------------
    // GET PRODUCT BY ID (detalle)
    // -------------------------------
    if (funcCall?.name === 'getProductById') {
      const id = Number(funcCall.args?.id);

      try {
        const { data } = await axios.get(`${this.backendUrl}/products/${id}`);

        const follow = await chat.sendMessage({
          message: [
            { functionResponse: { name: funcCall.name, response: data } },
          ],
        });

        const followContent = follow.candidates?.[0]?.content;
        const followParts = followContent?.parts ?? [];

        const productText = this.extractText(followParts);
        return `${productText}\n\nPodés agregar este producto al carrito indicando ID y cantidad. También podés ver otra categoría o ver otro producto por ID 😊`;
      } catch (e) {
        return `No encontré el producto con ID ${id}. Verificá el número.`;
      }
    }

    // -------------------------------
    // ADD TO CART
    // -------------------------------
    if (funcCall?.name === 'addToCart') {
      const id = Number(funcCall.args?.id);
      const qty = Number(funcCall.args?.qty);

      const { data: product } = await axios.get(
        `${this.backendUrl}/products/${id}`,
      );
      if (!product) return `No encontré el producto con ID ${id}.`;

      const existing = this.cart.find((c) => c.product_id === id);
      if (existing) existing.qty += qty;
      else
        this.cart.push({
          product_id: id,
          tipoPrenda: product.tipoPrenda,
          qty,
          price: product.precio50U,
        });

      // Crear o actualizar carrito en backend
      if (!this.cartId) {
        const res = await axios.post(`${this.backendUrl}/carts`, {
          items: this.cart.map((c) => ({
            product_id: c.product_id,
            qty: c.qty,
          })),
        });
        this.cartId = res.data.id;
      } else {
        await axios.patch(`${this.backendUrl}/carts/${this.cartId}`, {
          items: this.cart.map((c) => ({
            product_id: c.product_id,
            qty: c.qty,
          })),
        });
      }

      const total = this.cart.reduce((sum, c) => sum + c.price * c.qty, 0);
      return `✅ Agregaste ${qty} x ${product.tipoPrenda} al carrito.\nTotal actual: $${total}\nPodés ver tu carrito o agregar otro producto 😊`;
    }

    // -------------------------------
    // VIEW CART
    // -------------------------------
    if (funcCall?.name === 'viewCart') {
      if (this.cart.length === 0) return 'Tu carrito está vacío 🛒';
      const lines = this.cart.map(
        (c) => `${c.qty} x ${c.tipoPrenda} — $${c.price * c.qty}`,
      );
      const total = this.cart.reduce((sum, c) => sum + c.price * c.qty, 0);
      return `🛒 Tu carrito:\n${lines.join('\n')}\nTotal: $${total}`;
    }

    // -------------------------------
    // Respuesta normal
    // -------------------------------
    return this.extractText(content?.parts ?? []);
  }
}
