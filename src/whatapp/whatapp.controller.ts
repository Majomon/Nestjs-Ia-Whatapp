// src/whatsapp/whatsapp.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly service: WhatsappService) {}

  @Post('webhook')
  handleMessage(@Body() body: any) {
    return this.service.handleMessage(body);
  }
}
