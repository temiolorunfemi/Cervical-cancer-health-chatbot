import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from './retrieval.service';
import { OpenAiService, ChatTurn } from './openai.service';
import { ChatFaqDto } from './dto/chat.dto';
import { randomUUID } from 'crypto';

const OFF_TOPIC_KEYWORDS = [
  'weather',
  'sport',
  'football',
  'music',
  'politics',
  'recipe',
  'cook',
  'movie',
  'film',
  'game',
  'travel',
  'flight',
  'hotel',
  'crypto',
  'bitcoin',
  'stock',
  'forex',
  'joke',
  'funny',
];

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly openai: OpenAiService,
  ) {}

  async chat(dto: ChatFaqDto): Promise<{ reply: string; message: string; content: string; sources: string[] }> {
    const language = dto.language ?? 'en';
    const sessionId = randomUUID();

    const isOffTopic = this.isOffTopic(dto.message);
    const chunks = isOffTopic ? [] : await this.retrieval.retrieve(dto.message, language);

    const history: ChatTurn[] = (dto.conversation_history ?? [])
      .filter((h) => h.role === 'user' || h.role === 'assistant')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: String(h.content ?? '') }));

    const reply = isOffTopic
      ? this.offTopicReply(language)
      : await this.openai.generateReply(dto.message, chunks, history, language, dto.language_name);

    await this.prisma.chatMessage.createMany({
      data: [
        { sessionId, role: 'user', content: dto.message, language, retrievedChunkIds: [] },
        {
          sessionId,
          role: 'assistant',
          content: reply,
          language,
          retrievedChunkIds: chunks.map((c) => c.id),
        },
      ],
    });

    // reply/message/content are all populated with the same text: the Flutter client
    // reads `data['reply'] ?? data['message'] ?? data['content']`, so we don't need to
    // know which key a given client build expects.
    return {
      reply,
      message: reply,
      content: reply,
      sources: chunks.map((c) => c.title),
    };
  }

  private isOffTopic(message: string): boolean {
    const lower = message.toLowerCase();
    return OFF_TOPIC_KEYWORDS.some((kw) => lower.includes(kw));
  }

  private offTopicReply(language: string): string {
    return language === 'es'
      ? 'Solo puedo responder preguntas sobre el cáncer cervical y la salud reproductiva. ¿En qué puedo ayudarte sobre ese tema?'
      : "I can only help with questions about cervical cancer and reproductive health. What would you like to know on that topic?";
  }
}
