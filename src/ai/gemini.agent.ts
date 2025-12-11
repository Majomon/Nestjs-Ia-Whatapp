// src/ai/gemini.agent.ts
import { GoogleGenAI, Tool, Type, Part, Content } from '@google/genai';
import axios from 'axios';
import pluralize from 'pluralize';

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
        description: 'Muestra los productos actuales en el carrito del usuario',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'updateCartItem',
        description: 'Actualiza la cantidad de un producto en el carrito',
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

  // 🔹 Normaliza query: solo singular, no toca acentos
  private normalizeQuery(query: string): string {
    if (!query) return '';
    return pluralize.singular(query);
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
Tu tono debe ser amistoso, profesional y empático. Siempre ayudás al cliente como si estuviera en un local real.

REGLA GENERAL:
Detectás si el usuario está buscando productos en general (“faldas”, “camisas”, “quiero ver blusas”), un producto específico por ID (“mostrame la 13”, “quiero la del ID 10”), o si quiere interactuar con su carrito.

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

────────────────────────────────
FORMATO CUANDO QUIERE VER EL CARRITO
────────────────────────────────
- Siempre saludá con una frase cálida: “¡Acá tenés tu carrito actual! 🛒”
- Listá cada producto con su cantidad y total parcial:
Cantidad x Tipo de prenda — $PrecioTotal (ID: X)
- Al final, mostrale el total y un mensaje instructivo:
“Podés actualizar la cantidad de un producto diciendo, por ejemplo: 'Quiero 100 unidades del producto 14', o eliminarlo poniendo 0. También podés seguir agregando productos 😊”

────────────────────────────────
FORMATO CUANDO QUIERE MODIFICAR EL CARRITO
────────────────────────────────
- Si el usuario quiere actualizar la cantidad de un producto:
✅ Mostrá: “Actualicé el producto ID X a Y unidades.”
- Si el usuario quiere eliminar un producto (cantidad 0):
🗑️ Mostrá: “Eliminé el producto ID X de tu carrito.”
- Siempre terminá con un mensaje cálido que invite a seguir comprando o ver el carrito:
“Si querés, podés seguir buscando productos o ver nuevamente tu carrito 😊”
`,
        tools,
      },
      history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    });

    const response = await chat.sendMessage({ message: userMessage });
    const candidate = response.candidates?.[0];
    const content = candidate?.content;
    const funcCall = this.extractFunctionCall(content);

    if (!funcCall) return this.extractText(candidate?.content?.parts ?? []);

    // -------------------------------
    // GET PRODUCTS
    // -------------------------------
    if (funcCall?.name === 'getProducts') {
      const rawQuery = (funcCall.args?.query as string) ?? '';
      const query = this.normalizeQuery(rawQuery);

      const { data } = await axios.get(
        `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=5`,
      );

      const follow = await chat.sendMessage({
        message: [{ functionResponse: { name: funcCall.name, response: data } }],
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
        message: [{ functionResponse: { name: funcCall.name, response: data } }],
      });
      return this.extractText(follow.candidates?.[0]?.content?.parts ?? []);
    }

    // -------------------------------
    // ADD TO CART
    // -------------------------------
    if (funcCall?.name === 'addToCart') {
      const id = Number(funcCall.args?.id);
      const qty = Number(funcCall.args?.qty);

      const { data: product } = await axios.get(`${this.backendUrl}/products/${id}`);
      if (!product) return `No encontré el producto con ID ${id}.`;

      const { data: cart } = await axios.post(`${this.backendUrl}/carts/add-item`, {
        userId,
        productId: id,
        qty,
      });

      return `¡Agregué ${qty} unidades del producto ID ${id} a tu carrito! ✅`;
    }

    // -------------------------------
    // VIEW CART
    // -------------------------------
    if (funcCall?.name === 'viewCart') {
      const { data: cart } = await axios.get(`${this.backendUrl}/carts/user/${userId}`);
      if (!cart.items.length) return 'Tu carrito está vacío 🛒';

      const lines = cart.items.map((item: any) => {
        const p = item.product;
        const pricePerUnit =
          item.qty <= 50 ? p.precio50U : item.qty <= 100 ? p.precio100U : p.precio200U;
        return `${item.qty} x ${p.tipoPrenda} — $${pricePerUnit * item.qty} (ID: ${p.id})`;
      });

      const total = cart.items.reduce((sum: number, item: any) => {
        const p = item.product;
        const pricePerUnit =
          item.qty <= 50 ? p.precio50U : item.qty <= 100 ? p.precio100U : p.precio200U;
        return sum + pricePerUnit * item.qty;
      }, 0);

      return `🛒 ¡Acá tenés tu carrito actual!\n${lines.join('\n')}\nTotal: $${total}`;
    }

    // -------------------------------
    // UPDATE CART ITEM
    // -------------------------------
    if (funcCall?.name === 'updateCartItem') {
      const id = Number(funcCall.args?.id);
      const qty = Number(funcCall.args?.qty);

      const { data: cart } = await axios.get(`${this.backendUrl}/carts/user/${userId}`);
      if (!cart) return 'No encontré tu carrito 🛒';

      await axios.patch(`${this.backendUrl}/carts/${cart.id}`, { productId: id, qty });

      return `✅ Actualicé el producto ID ${id} a ${qty} unidades.`;
    }
  }
}
