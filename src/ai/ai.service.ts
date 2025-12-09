// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private model: any;
  private backendUrl: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenAI({ apiKey });
    this.model = genAI.models;

    // URL de tu backend donde están los endpoints reales
    this.backendUrl =
      process.env.BACKEND_URL || 'https://desafio-laburen-vgux.onrender.com';
  }

  async processMessage(message: string) {
    const lower = message.toLowerCase();

    // Detectar intención simple
    if (
      lower.includes('producto') ||
      lower.includes('ver') ||
      lower.includes('buscar')
    ) {
      // Buscar productos
      const queryMatch = message.match(/buscar (.*)/i);
      const query = queryMatch ? queryMatch[1] : '';
      try {
        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${encodeURIComponent(query)}`,
        );
        const list = data
          .slice(0, 10)
          .map((p: any) => `*${p.tipoPrenda} ${p.talla} - ${p.color}*`)
          .join('\n');
        return `¡Aquí tienes algunos productos que encontré!\n\n${list}`;
      } catch (error) {
        console.error(error);
        return 'Hubo un error consultando los productos.';
      }
    }

    if (lower.includes('detalle') || lower.includes('id')) {
      // Obtener detalle de producto por ID
      const idMatch = message.match(/id (\d+)/i);
      if (!idMatch) return 'Por favor, indícame el ID del producto.';
      const id = idMatch[1];
      try {
        const { data } = await axios.get(`${this.backendUrl}/products/${id}`);
        return `Detalle del producto:\nTipo: ${data.tipoPrenda}\nTalla: ${data.talla}\nColor: ${data.color}\nStock: ${data.cantidadDisponible}\nPrecio50U: ${data.precio50U}\nDescripción: ${data.descripcion}`;
      } catch (error) {
        console.error(error);
        return 'No pude encontrar ese producto.';
      }
    }

    if (lower.includes('comprar') || lower.includes('carrito')) {
      return '¡Perfecto! Para comprar, por favor indica los productos y cantidades.';
    }

    // Si no es algo que pueda manejar automáticamente, usamos Gemini AI
    const prompt = `
Eres un asistente de ventas. Responde de forma clara y amigable. 
Si el usuario quiere ver productos o detalles, indica que debe usar los endpoints /products.
Mensaje del cliente: ${message}
`;

    try {
      const response = await this.model.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

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
