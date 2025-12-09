// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private ai;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });
  }

  async processMessage(message: string) {
    const prompt = `
Eres un agente de ventas para una tienda.
- Si el usuario pregunta por productos: usar GET /products?q=
- Si quiere info específica: GET /products/:id
- Si quiere comprar: POST /carts
- Si quiere editar: PATCH /carts/:id
Responde siempre con texto y, si corresponde, una acción sugerida.

Mensaje del cliente: ${message}
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash', // 🔥 modelo actualizado
      contents: prompt,
    });

    return response.text().trim();
  }
}
