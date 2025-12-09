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

  async handleMessage(body: any) {
    const message = body.Body;
    const from = body.From;

    const aiReply = await this.ai.processMessage(message);

    await this.client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: aiReply,
    });

    return 'OK';
  }
}
