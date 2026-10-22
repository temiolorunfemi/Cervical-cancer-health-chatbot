import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatFaqDto } from './dto/chat.dto';

// Route matches faq_screen.dart: POST {baseUrl}chat-faq
@Controller('chat-faq')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  chat(@Body() dto: ChatFaqDto) {
    return this.chatService.chat(dto);
  }
}
