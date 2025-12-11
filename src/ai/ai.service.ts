import { Injectable } from '@nestjs/common';
import { GeminiAgent, ChatMessage } from './gemini.agent';

@Injectable()
export class AiService {
  private agent: GeminiAgent;
  private userHistories: Record<string, ChatMessage[]> = {};

  constructor() {
    this.agent = new GeminiAgent(process.env.GEMINI_API_KEY!);
  }

  async processMessage(userId: string, message: string) {
    if (!this.userHistories[userId]) this.userHistories[userId] = [];
    const history = this.userHistories[userId];

    history.push({ role: 'user', text: message });

    const reply = await this.agent.sendMessage(userId, history, message);

    history.push({ role: 'model', text: reply });
    return reply;
  }
}
