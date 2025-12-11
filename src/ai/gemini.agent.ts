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
    // GET PRODUCTS
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
        return (
          this.extractText(follow.candidates?.[0]?.content?.parts ?? []) +
          `\n\nSi querés, podés pedirme el detalle de un producto indicando su ID o ver otra categoría 😊`
        );
      } catch {
        return 'Hubo un problema al consultar los productos. Intentá de nuevo.';
      }
    }

    // -------------------------------
    // GET PRODUCT BY ID
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
        return (
          this.extractText(follow.candidates?.[0]?.content?.parts ?? []) +
          `\n\nPodés agregar este producto al carrito indicando ID y cantidad. También podés ver otra categoría o ver otro producto por ID 😊`
        );
      } catch {
        return `No encontré el producto con ID ${id}. Verificá el número.`;
      }
    }

    // -------------------------------
    // ADD TO CART
    // -------------------------------
    if (funcCall?.name === 'addToCart') {
      const id = Number(funcCall.args?.id);
      const qty = Number(funcCall.args?.qty);

      // Obtener producto
      const { data: product } = await axios.get(
        `${this.backendUrl}/products/${id}`,
      );
      if (!product) return `No encontré el producto con ID ${id}.`;

      // Obtener carrito del usuario
      let cart;
      try {
        const res = await axios.get(`${this.backendUrl}/carts/user/${userId}`);
        cart = res.data;
      } catch {
        cart = null;
      }

      // Preparar items
      let items: { product_id: number; qty: number }[] = [];
      if (cart && cart.items?.length) {
        items = cart.items.map((i: any) => ({
          product_id: i.product.id,
          qty: i.product.id === id ? i.qty + qty : i.qty,
        }));

        if (!items.find((i) => i.product_id === id))
          items.push({ product_id: id, qty });

        // Actualizar carrito
        await axios.patch(`${this.backendUrl}/carts/${cart.id}`, { items });
      } else {
        items = [{ product_id: id, qty }];
        const res = await axios.post(`${this.backendUrl}/carts`, {
          userId,
          items,
        });
        cart = res.data;
      }

      // Calcular total usando el producto recién consultado
      const total = items.reduce((sum, i) => {
        if (i.product_id === product.id) return sum + product.precio50U * i.qty;

        // Para los demás items, si ya tienes el precio en cart.items, úsalo
        const itemInCart = cart.items.find(
          (ci: any) => ci.product.id === i.product_id,
        );
        const price = itemInCart ? itemInCart.product.precio50U : 0;
        return sum + price * i.qty;
      }, 0);

      return `✅ Agregaste ${qty} x ${product.tipoPrenda} al carrito.\nTotal actual: $${total}\nPodés ver tu carrito o agregar otro producto 😊`;
    }

    // -------------------------------
    // VIEW CART
    // -------------------------------
    if (funcCall?.name === 'viewCart') {
      try {
        const { data: cart } = await axios.get(
          `${this.backendUrl}/carts/user/${userId}`,
        );
        if (!cart || !cart.items?.length) return 'Tu carrito está vacío 🛒';

        const lines = cart.items.map(
          (i: any) =>
            `${i.qty} x ${i.product.tipoPrenda} — $${i.qty * i.product.precio50U}`,
        );
        const total = cart.items.reduce(
          (sum: number, i: any) => sum + i.qty * i.product.precio50U,
          0,
        );
        return `🛒 Tu carrito:\n${lines.join('\n')}\nTotal: $${total}`;
      } catch {
        return 'Tu carrito está vacío 🛒';
      }
    }

    // -------------------------------
    // Respuesta normal
    // -------------------------------
    return this.extractText(content?.parts ?? []);
  }
}
