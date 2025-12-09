// src/whatsapp/whatsapp.service.ts
import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { Twilio } from 'twilio';

@Injectable()
export class WhatsappService {
  private client: Twilio;

  constructor(private ai: AiService) {
    this.client = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }

  // Función para dividir un array en chunks
  private chunkArray<T>(arr: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Función para formatear productos como texto
  private formatProducts(products: any[]): string {
    return products
      .map(
        (p) =>
          `ID: ${p.id}\nNombre: ${p.tipoPrenda}\nPrecio 50U: $${p.precio50U}\n---`,
      )
      .join('\n');
  }

  async handleMessage(body: any) {
    const message = body.Body;
    const from = body.From;

    const aiReply = await this.ai.processMessage(message);

    // Forzamos el tipo a un objeto con products
    type AiResponse = { products?: any[] } | string;
    const reply = aiReply as AiResponse;

    if (typeof reply === 'object' && reply.products) {
      const products: any[] = reply.products; // ✅ ahora TypeScript reconoce 'products'
      const chunks = this.chunkArray(products, 10);

      for (const chunk of chunks) {
        const text = this.formatProducts(chunk);
        await this.client.messages.create({
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          to: from,
          body: text,
        });
      }
    } else {
      // Si la respuesta es un string simple
      const replyText =
        typeof reply === 'string' ? reply : JSON.stringify(reply);

      await this.client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: from,
        body: replyText,
      });
    }

    return 'OK';
  }
}
