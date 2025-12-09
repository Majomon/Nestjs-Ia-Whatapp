// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';

@Injectable()
export class AiService {
  private model: any;
  private backendUrl: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.backendUrl =
      process.env.BACKEND_URL || 'https://desafio-laburen-vgux.onrender.com';
    const genAI = new GoogleGenAI({ apiKey });
    this.model = genAI.models;
  }

  private async fetchProducts(query: string) {
    try {
      const { data } = await axios.get(
        `${this.backendUrl}/products?q=${encodeURIComponent(query)}`,
      );
      return data;
    } catch (err) {
      console.error('Error fetching products:', err);
      return [];
    }
  }

  async processMessage(message: string) {
    // 1️⃣ Detectar si el usuario pregunta por productos (simple keyword)
    const lowerMsg = message.toLowerCase();
    if (
      lowerMsg.includes('productos') ||
      lowerMsg.includes('ver') ||
      lowerMsg.includes('quiero')
    ) {
      const products = await this.fetchProducts(message);

      if (products.length === 0) {
        return {
          text: 'Lo siento, no encontré productos que coincidan con tu búsqueda.',
        };
      }

      // 2️⃣ Formatear listado
      const text =
        '¡Claro! Aquí tienes algunos productos:\n\n' +
        products
          .slice(0, 10) // mostrar máximo 10
          .map(
            (p: any) =>
              `*${p.tipoPrenda}* - ${p.descripcion} - 💰 ${p.precio50U} ARS`,
          )
          .join('\n');

      return { text };
    }

    // 3️⃣ Si no es consulta de productos, pasar al AI normal
    const prompt = `
Eres un asistente de ventas. Responde de manera clara y amable. No inventes productos, solo muestra reales si hay consulta.

Mensaje del cliente: ${message}
`;

    try {
      const response = await this.model.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return {
        text:
          response.text ??
          response.candidates?.[0]?.content?.parts?.[0]?.text ??
          'No pude generar una respuesta.',
      };
    } catch (error) {
      console.error('Gemini Error:', error);
      return { text: 'Hubo un error procesando tu solicitud.' };
    }
  }
}
