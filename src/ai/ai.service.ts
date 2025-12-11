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
      {
        name: 'viewCart',
        description: 'Muestra los productos actualmente en el carrito',
        parameters: { type: Type.OBJECT },
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

  /**
   * userCartMap mantiene el cartId por usuario
   */
  async sendMessage(
    userId: string,
    history: ChatMessage[],
    userMessage: string,
    userCartMap: Record<string, number>,
  ) {
    const chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `
Eres un agente de ventas experto en moda, cálido, amable, cercano y con tacto comercial.
Tu tono debe ser amistoso, profesional y empático.

REGLA GENERAL:
Detectás si el usuario busca productos en general o detalle por ID y formateás la respuesta según corresponda.

────────────────────────────────
FORMATO VARIOS PRODUCTOS
────────────────────────────────
ID: X — 🛍️ **Tipo de prenda (Categoría)**
Color: X — Talle: X
Precio: $X

Cerrá con mensaje cálido:
“Si querés, podés pedirme el detalle de un producto indicando su ID o ver otra categoría 😊”

────────────────────────────────
FORMATO DETALLE PRODUCTO
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

Cerrá con mensaje instructivo:
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
        if (!data || data.length === 0)
          return 'No encontré productos con esa búsqueda.';

        const lines = data.map(
          (p: any) =>
            `ID: ${p.id} — 🛍️ **${p.tipoPrenda} (${p.categoria})**\nColor: ${p.color} — Talle: ${p.talle}\nPrecio: $${p.precio50U}`,
        );
        return `¡Mirá estas opciones que te pueden gustar! ✨\n\n${lines.join('\n\n')}\n\nSi querés, podés pedirme el detalle de un producto indicando su ID o ver otra categoría 😊`;
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
        if (!data) return `No encontré el producto con ID ${id}.`;

        return `
✨ **${data.tipoPrenda} (${data.categoria})** — ID: ${data.id}
Color: ${data.color}
Talle: ${data.talle}
Disponible: ${data.disponible}
Stock: ${data.stock} unidades
Descripción: ${data.descripcion}
Precio por 50 unidades: $${data.precio50U}
Precio por 100 unidades: $${data.precio100U}
Precio por 200 unidades: $${data.precio200U}

Podés agregar este producto al carrito indicando ID y cantidad. También podés ver otra categoría o ver otro producto por ID 😊
        `.trim();
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

      try {
        const { data: product } = await axios.get(
          `${this.backendUrl}/products/${id}`,
        );
        if (!product) return `No encontré el producto con ID ${id}.`;

        // Obtener o crear carrito
        let cartId = userCartMap[userId];
        let items: { product_id: number; qty: number }[] = [];

        if (!cartId) {
          items = [{ product_id: id, qty }];
          const res = await axios.post(`${this.backendUrl}/carts`, { items });
          cartId = res.data.id;
          userCartMap[userId] = cartId;
        } else {
          const { data: currentCart } = await axios.get(
            `${this.backendUrl}/carts/${cartId}`,
          );
          items = currentCart.items || [];

          const index = items.findIndex((i: any) => i.product_id === id);
          if (index >= 0) items[index].qty = qty;
          else items.push({ product_id: id, qty });

          await axios.patch(`${this.backendUrl}/carts/${cartId}`, { items });
        }

        const itemsWithProduct = await Promise.all(
          items.map(async (i) => {
            const { data: product } = await axios.get(
              `${this.backendUrl}/products/${i.product_id}`,
            );
            return { ...i, product };
          }),
        );

        const total = itemsWithProduct.reduce(
          (sum, i) => sum + i.qty * i.product.precio50U,
          0,
        );

        return `✅ Agregaste ${qty} x ${product.tipoPrenda} al carrito.\nTotal actual: $${total}\nPodés ver tu carrito o agregar otro producto 😊`;
      } catch {
        return 'Hubo un error al agregar el producto al carrito.';
      }
    }

    // -------------------------------
    // VIEW CART
    // -------------------------------
    if (funcCall?.name === 'viewCart') {
      const cartId = userCartMap[userId];
      if (!cartId) return 'Tu carrito está vacío 🛒';

      try {
        const { data } = await axios.get(`${this.backendUrl}/carts/${cartId}`);
        if (!data.items || data.items.length === 0)
          return 'Tu carrito está vacío 🛒';

        const lines = data.items.map(
          (i: any) =>
            `ID: ${i.product.id} — ${i.qty} x ${i.product.tipoPrenda} — $${i.product.precio50U * i.qty}`,
        );
        const total = data.items.reduce(
          (sum: number, i: any) => sum + i.product.precio50U * i.qty,
          0,
        );

        return `🛒 Tu carrito:\n${lines.join('\n')}\nTotal: $${total}`;
      } catch {
        return 'Hubo un error al consultar tu carrito.';
      }
    }

    // -------------------------------
    // Respuesta normal
    // -------------------------------
    return this.extractText(content?.parts ?? []);
  }
}
