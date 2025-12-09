// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenAI({ apiKey });

    this.model = genAI.models;
  }

  async processMessage(message: string) {
    const prompt = `
Eres un agente de ventas. Debes responder como un asistente que puede ejecutar llamadas HTTP.
Si el usuario pregunta por productos, llama: GET /products?q=loquequiera
Si quiere un detalle, llama: GET /products/:id
Si quiere comprar, llama: POST /carts con el body adecuado.
Si quiere modificar un carrito: PATCH /carts/:id

Responde SIEMPRE con texto claro y solo si es necesario propone una acción.

Mensaje del cliente: ${message}
`;

    try {
      const response = await this.model.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      // La SDK nueva devuelve el texto así:
      return (
        response.text ??
        response.candidates?.[0]?.content?.parts?.[0]?.text ??
        'No pude generar una respuesta.'
      );
    } catch (error) {
      console.error('Gemini Error:', error);
      return 'Hubo un error procesando tu solicitud.';
    }
  }
}
