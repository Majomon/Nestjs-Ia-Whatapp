import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { WhatsappController } from './whatapp.controller';
import { WhatsappService } from './whatapp.service';

@Module({
  imports: [AiModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
