import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RetrievedChunk } from './retrieval.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  sw: 'Swahili',
  yo: 'Yoruba',
};

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    this.model = this.config.get<string>('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini';
  }

  async generateReply(
    message: string,
    chunks: RetrievedChunk[],
    history: ChatTurn[],
    languageCode: string,
    languageName?: string,
  ): Promise<string> {
    const language = languageName ?? LANGUAGE_NAMES[languageCode] ?? 'English';
    const context = chunks.length
      ? chunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`).join('\n\n')
      : '(No matching knowledge base entries were found for this question.)';

    const systemPrompt = `You are a supportive assistant inside a cervical cancer awareness app. You answer questions about cervical cancer: what it is, symptoms, prevention, HPV vaccination, screening (Pap smear/HPV test), risk factors, and related emotional support.

Answer ONLY using the knowledge base excerpts below. If they don't contain the answer, say you don't have verified information on that and suggest the user speak to a healthcare provider — do not invent medical facts.

If the user asks about something unrelated to cervical cancer / women's reproductive health (e.g. weather, sports, politics, entertainment), politely decline and steer back to what you can help with.

Always reply in ${language}. Keep answers concise (2-4 short paragraphs or a short list), warm, and non-alarmist. You are not a substitute for a doctor; encourage professional consultation for personal medical concerns.

Knowledge base excerpts:
${context}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content }) as OpenAI.Chat.ChatCompletionMessageParam),
      { role: 'user', content: message },
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.4,
        max_tokens: 500,
      });
      return completion.choices[0]?.message?.content?.trim() ?? this.fallbackReply(language);
    } catch (err) {
      this.logger.error(`OpenAI chat completion failed: ${err instanceof Error ? err.message : err}`);
      return this.fallbackReply(language);
    }
  }

  private fallbackReply(language: string): string {
    return language === 'Spanish'
      ? 'Lo siento, no puedo responder en este momento. Por favor, inténtalo de nuevo en un momento.'
      : "Sorry, I'm unable to answer right now. Please try again in a moment.";
  }
}
