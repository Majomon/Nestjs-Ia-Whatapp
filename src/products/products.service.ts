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
    return parts.filter((p) => p.text).map((p) => p.text!).join('\n').trim();
  }

  private extractFunctionCall(content?: Content) {
    if (!content?.parts) return null;
    return content.parts.find((p) => p.functionCall)?.functionCall ?? null;
  }

  // Normaliza query: singular + sin acentos
  private normalizeQuery(query: string): string {
    if (!query) return '';

    let singular = pluralize.singular(query);
    singular = singular.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    singular = singular.toLowerCase();

    return singular;
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
Eres un agente de ventas experto en moda, cálido y empático...
(la instrucción completa que ya tenías)
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
