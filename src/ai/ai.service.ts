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

    this.backendUrl =
      process.env.BACKEND_URL || 'https://desafio-laburen-vgux.onrender.com';
  }

  async processMessage(message: string) {
    const lower = message.toLowerCase();

    try {
      // ----------- Pregunta: cuántos productos hay -----------
      if (
        lower.includes('cuántos productos') ||
        lower.includes('total de productos')
      ) {
        const { data } = await axios.get(`${this.backendUrl}/products`);
        return `Actualmente tenemos ${data.length} productos en nuestro inventario.`;
      }

      // ----------- Pregunta: ver listado de productos -----------
      if (
        lower.includes('producto') ||
        lower.includes('ver') ||
        lower.includes('listar')
      ) {
        const queryMatch = message.match(/buscar (.*)/i);
        const query = queryMatch ? queryMatch[1] : '';
        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${encodeURIComponent(query)}`,
        );
        if (!data.length)
          return 'No encontré productos que coincidan con tu búsqueda.';
        // Mostrar ID, tipo de prenda, talla, color y disponibilidad
        const list = data
          .slice(0, 10)
          .map(
            (p: any) =>
              `ID: ${p.id} | ${p.tipoPrenda} ${p.talla} - ${p.color} | ${
                p.disponible.toLowerCase() === 'si'
                  ? '✅ Disponible'
                  : '❌ No disponible'
              } | Precio100U: $${p.precio100U}`,
          )
          .join('\n');
        return `Aquí tienes algunos productos:\n\n${list}`;
      }

      // ----------- Pregunta: detalle de producto -----------
      if (lower.includes('detalle') || lower.includes('id')) {
        const idMatch = message.match(/id (\d+)/i);
        if (!idMatch)
          return 'Por favor, indícame el ID del producto que quieres ver.';
        const id = idMatch[1];
        const { data } = await axios.get(`${this.backendUrl}/products/${id}`);
        return `Detalle del producto:\n
ID: ${data.id}
Tipo: ${data.tipoPrenda}
Talla: ${data.talla}
Color: ${data.color}
Stock: ${data.cantidadDisponible}
Disponible: ${data.disponible}
Precio50U: $${data.precio50U}
Precio100U: $${data.precio100U}
Precio200U: $${data.precio200U}
Categoría: ${data.categoria}
Descripción: ${data.descripcion}`;
      }

      // ----------- Comprar o carrito -----------
      if (lower.includes('comprar') || lower.includes('carrito')) {
        return '¡Perfecto! Para comprar, por favor indícame los productos y cantidades.';
      }

      // ----------- Pregunta genérica / Gemini AI -----------
      const prompt = `
Eres un asistente de ventas amigable y conciso. 
Responde preguntas sobre productos usando los datos que tienes.
Mensaje del cliente: ${message}
`;

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
      console.error(error);
      return 'Hubo un error procesando tu solicitud.';
    }
  }
}
