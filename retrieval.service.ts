import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  category: string;
  sourceUrl: string | null;
  similarity: number;
}

const TOP_K = 4;
// Cosine distance (pgvector's `<=>`) ranges 0 (identical) to 2 (opposite); beyond this
// the chunk is not meaningfully related to the query, so we drop it rather than force
// the model to work with irrelevant context.
const MAX_DISTANCE = 0.7;

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async retrieve(query: string, language: string): Promise<RetrievedChunk[]> {
    const queryVector = await this.embeddings.embed(query);
    const literal = this.embeddings.toVectorLiteral(queryVector);

    // Prefer knowledge chunks in the requested language, but fall back to English
    // content (the app supports en/es/sw/yo and the seed base is not guaranteed to
    // have every chunk translated into every language yet).
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; title: string; content: string; category: string; sourceUrl: string | null; distance: number }>
    >(
      `
      SELECT id, title, content, category, "sourceUrl",
             embedding <=> $1::vector AS distance
      FROM knowledge_chunks
      WHERE embedding IS NOT NULL AND (language = $2 OR language = 'en')
      ORDER BY (language = $2) DESC, distance ASC
      LIMIT $3
      `,
      literal,
      language,
      TOP_K,
    );

    return rows
      .filter((r) => r.distance <= MAX_DISTANCE)
      .map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        sourceUrl: r.sourceUrl,
        similarity: 1 - r.distance,
      }));
  }
}
