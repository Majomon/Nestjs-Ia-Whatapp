// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private model;

  constructor() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!); // FIX
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async processMessage(message: string) {
    const prompt = `
Eres un agente de ventas. Debes responder como un asistente que puede ejecutar llamadas HTTP.
Si el usuario pregunta por productos, llama: **GET /products?q=loquequiera**
Si quiere un detalle, llama: **GET /products/:id**
Si quiere comprar, llama: **POST /carts** con el body adecuado.
Si quiere modificar un carrito: **PATCH /carts/:id**

Responde SIEMPRE con texto claro y solo si es necesario, propone una acción.

Mensaje del cliente: ${message}
`;
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}
