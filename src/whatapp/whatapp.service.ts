import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { Twilio } from 'twilio';

interface UserState {
  query?: string;
  page: number;
  limit: number;
  total?: number;
}

@Injectable()
export class WhatsappService {
  private client: Twilio;
  private userStates: Record<string, UserState> = {}; // record por número

  constructor(private ai: AiService) {
    this.client = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }

  private formatProducts(products: any[]): string {
    return products
      .map((p, i) => `${i + 1}) ${p.tipoPrenda} – $${p.precio50U} – ID ${p.id}`)
      .join('\n');
  }

  private chunkMessage(text: string, chunkSize = 1600): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + chunkSize));
      start += chunkSize;
    }
    return chunks;
  }

  async handleMessage(body: any) {
    const from = body.From;
    const message = body.Body?.trim().toLowerCase() || '';
    const state = this.userStates[from] || { page: 1, limit: 10 };

    // Si dice "sí" o "siguiente", incrementamos la página
    if (message === 'sí' || message === 'siguiente') {
      state.page += 1;
    } else {
      // Nuevo query
      state.page = 1;
      state.query = message;
    }

    this.userStates[from] = state;

    // Llamamos a AI para obtener productos
    const aiReply: any = await this.ai.processMessage(state.query || message);

    // Extraemos products y total
    const products = aiReply.products || [];
    const total = aiReply.total || products.length;

    state.total = total;

    const start = (state.page - 1) * state.limit + 1;
    const end = start + products.length - 1;

    let text = `Mostrando productos ${start} a ${end} de ${total}:\n\n`;
    text += this.formatProducts(products);

    if (end < total) {
      text += `\n\n¿Querés ver los siguientes ${state.limit}?`;
    }

    // Twilio limita a 1600 caracteres
    const chunks = this.chunkMessage(text);

    for (const chunk of chunks) {
      await this.client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: from,
        body: chunk,
      });
    }

    return 'OK';
  }
}
