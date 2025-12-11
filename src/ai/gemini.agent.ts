import { Content, GoogleGenAI, Part } from '@google/genai';
import axios from 'axios';
import pluralize from 'pluralize';
import { SYSTEM_INSTRUCTION } from './constants/system-instruction';
import { geminiTools } from './tools/gemini.tools';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

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

  private normalizeQuery(query: string): string {
    if (!query) return '';
    return pluralize.singular(query);
  }

  async sendMessage(userId: string, history: ChatMessage[], userMessage: string) {
    try {
      return await this.trySendMessage(userId, history, userMessage);
    } catch (err: any) {
      console.error('❌ Error FATAL en sendMessage:', err);

      return (
        '⚠️ El sistema de IA está temporalmente ocupado o desconectado.\n' +
        'Por favor, intentá nuevamente en unos segundos.'
      );
    }
  }

  //   FUNCIÓN REAL CON RETRY AUTOMÁTICO PARA 503
  private async trySendMessage(userId: string, history: ChatMessage[], userMessage: string) {
    let retries = 2;

    while (retries >= 0) {
      try {
        const chat = this.ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: geminiTools,
          },
          history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
        });

        const response = await chat.sendMessage({ message: userMessage });
        const candidate = response.candidates?.[0];
        const content = candidate?.content;
        const funcCall = this.extractFunctionCall(content);

        if (!funcCall)
          return this.extractText(candidate?.content?.parts ?? []);

        // GET PRODUCTS
        if (funcCall.name === 'getProducts') {
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


        // GET PRODUCT BY ID
        if (funcCall.name === 'getProductById') {
          const id = Number(funcCall.args?.id);
          const { data } = await axios.get(`${this.backendUrl}/products/${id}`);

          const follow = await chat.sendMessage({
            message: [{ functionResponse: { name: funcCall.name, response: data } }],
          });

          return this.extractText(follow.candidates?.[0]?.content?.parts ?? []);
        }

        // ADD TO CART
        if (funcCall.name === 'addToCart') {
          const id = Number(funcCall.args?.id);
          const qty = Number(funcCall.args?.qty);

          const { data: product } = await axios.get(`${this.backendUrl}/products/${id}`);
          if (!product) return `No encontré el producto con ID ${id}.`;

          await axios.post(`${this.backendUrl}/carts/add-item`, {
            userId,
            productId: id,
            qty,
          });

          return `¡Agregué ${qty} unidades del producto ID ${id} a tu carrito! ✅`;
        }

        // VIEW CART
        if (funcCall.name === 'viewCart') {
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

        // UPDATE CART ITEM
        if (funcCall.name === 'updateCartItem') {
          const id = Number(funcCall.args?.id);
          const qty = Number(funcCall.args?.qty);

          const { data: cart } = await axios.get(`${this.backendUrl}/carts/user/${userId}`);
          if (!cart) return 'No encontré tu carrito 🛒';

          await axios.patch(`${this.backendUrl}/carts/${cart.id}`, { productId: id, qty });

          return `✅ Actualicé el producto ID ${id} a ${qty} unidades.`;
        }

      } catch (error: any) {
        // ❗ ERROR 503 — MODELO SOBRE CARGADO
        if (error?.status === 503) {
          console.warn('⚠️ Gemini sobrecargado. Reintentando...');
          await new Promise((res) => setTimeout(res, 1200));
          retries--;
          continue;
        }

        console.error('❌ Error REAL:', error);
        throw error;
      }
    }

    throw new Error('Gemini está sobrecargado incluso después de reintentos.');
  }
}
