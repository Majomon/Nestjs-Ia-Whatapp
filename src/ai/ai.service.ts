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

  private isAvailable(disponible: string) {
    return ['si', 'sí', 'true', '1'].includes((disponible ?? '').toLowerCase());
  }

  private getPageFromMessage(message: string) {
    const match = message.match(/siguiente[s]? (\d+)/i);
    if (match) return parseInt(match[1]);
    if (message.toLowerCase().includes('siguientes 10')) return 2;
    return 1;
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
        const page = this.getPageFromMessage(message);
        const limit = 10;
        const offset = (page - 1) * limit;

        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
        );

        if (!data.length)
          return 'No encontré productos que coincidan con tu búsqueda.';

        const list = data
          .map(
            (p: any) =>
              `ID: ${p.id} | ${p.tipoPrenda} ${p.talla} - ${p.color} | ${
                this.isAvailable(p.disponible)
                  ? '✅ Disponible'
                  : '❌ No disponible'
              } | Precio50U: $${p.precio50U} | Precio100U: $${p.precio100U} | Precio200U: $${p.precio200U}`,
          )
          .join('\n');

        return `Aquí tienes algunos productos (Página ${page}):\n\n${list}`;
      }

      // ----------- Pregunta: detalle de producto -----------
      if (
        lower.includes('detalle') ||
        lower.includes('id') ||
        lower.includes('producto')
      ) {
        const idMatch = message.match(/(?:id|producto)\s*(\d+)/i);
        if (!idMatch)
          return 'Por favor, indícame el ID del producto que quieres ver.';

        const id = idMatch[1];
        const { data } = await axios.get(`${this.backendUrl}/products/${id}`);

        if (!data) return 'No pude encontrar ese producto.';

        return `Detalle del producto:\n
ID: ${data.id}
Tipo: ${data.tipoPrenda}
Talla: ${data.talla}
Color: ${data.color}
Stock: ${data.cantidadDisponible}
Disponible: ${this.isAvailable(data.disponible) ? '✅ Sí' : '❌ No'}
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

      // ----------- Gemini AI: fallback -----------
      const prompt = `
Eres un asistente de ventas amigable y conciso. 
Responde preguntas sobre productos usando los datos que tienes.
Si la pregunta es sobre productos, inventa un ejemplo ficticio.
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
