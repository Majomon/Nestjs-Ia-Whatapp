// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';

@Injectable()
export class AiService {
  private model: any;
  private backendUrl = 'https://desafio-laburen-vgux.onrender.com';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenAI({ apiKey });
    this.model = genAI.models;
  }

  private async callBackend(
    method: 'get' | 'post' | 'patch',
    path: string,
    data?: any,
  ) {
    const url = `${this.backendUrl}${path}`;
    try {
      const res = await axios({ method, url, data });
      return res.data;
    } catch (err: any) {
      console.error('Backend Error:', err.response?.data || err.message);
      return { error: err.response?.data || err.message };
    }
  }

  async processMessage(message: string) {
    const prompt = `
Eres un agente de ventas conectado a un backend real:
- GET /products?q=loquequiera para listar productos
- GET /products/:id para detalle
- POST /carts para crear carrito
- PATCH /carts/:id para actualizar carrito

Debes ejecutar llamadas HTTP reales según lo que pida el cliente.
Responde SIEMPRE con texto claro y amigable.

Mensaje del cliente: ${message}
`;

    try {
      const response = await this.model.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text =
        response.text ??
        response.candidates?.[0]?.content?.parts?.[0]?.text ??
        '';

      // Detecta si la IA sugiere un endpoint
      const match = text.match(/(GET|POST|PATCH) (\/[^\s]+)(?: with (.*))?/i);
      if (match) {
        const method = match[1].toLowerCase() as 'get' | 'post' | 'patch';
        const path = match[2];
        let body;
        if (match[3]) {
          try {
            body = JSON.parse(match[3]);
          } catch {}
        }
        const result = await this.callBackend(method, path, body);
        return { text, result };
      }

      return { text };
    } catch (error) {
      console.error('Gemini Error:', error);
      return { text: 'Hubo un error procesando tu solicitud.' };
    }
  }
}
