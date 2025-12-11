import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Twilio } from 'twilio';
import { AiService } from '../ai/ai.service';

@Injectable()
export class WhatsappService {
  private client: Twilio;

  constructor(private ai: AiService) {
    this.client = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }

  async handleMessage(body: any) {
    const message = body.Body;
    const from = body.From;

    let aiReply: string;

    try {
      aiReply = await this.ai.processMessage(from, message);
      aiReply = typeof aiReply === 'string' ? aiReply : JSON.stringify(aiReply);
    } catch (error) {
      console.error('Error en AI Service:', error);
      aiReply = 'Lo siento, tuvimos un problema procesando tu mensaje. Intenta nuevamente más tarde.';
    }

    try {
      await this.client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: from,
        body: aiReply,
      });
    } catch (error) {
      console.error('Error enviando mensaje por Twilio:', error);
      throw new InternalServerErrorException('No se pudo enviar la respuesta por WhatsApp.');
    }

    return 'OK';
  }
}
