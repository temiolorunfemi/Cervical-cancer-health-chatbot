import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RetrievalService } from './retrieval.service';
import { EmbeddingsService } from './embeddings.service';
import { OpenAiService } from './openai.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, RetrievalService, EmbeddingsService, OpenAiService],
  exports: [EmbeddingsService],
})
export class ChatModule {}
