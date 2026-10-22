import { Injectable, Logger } from '@nestjs/common';

/**
 * Generates sentence embeddings locally with @xenova/transformers (all-MiniLM-L6-v2,
 * 384 dimensions) — no API key or network call needed at inference time, and no
 * per-request cost. We chose a local embedding model over an API-based one (e.g.
 * OpenAI's text-embedding-3-small) specifically because retrieval runs on every chat
 * message and on the full knowledge base at seed time; keeping it local and free lets
 * us re-embed the knowledge base freely while still using the OpenAI API for the part
 * that actually benefits most from a large hosted model: answer generation.
 *
 * The pipeline is loaded lazily and cached because @xenova/transformers downloads the
 * ONNX model weights (~90MB) on first use and initialisation is relatively slow.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private extractorPromise: Promise<any> | null = null;

  private async getExtractor() {
    if (!this.extractorPromise) {
      this.logger.log('Loading local embedding model (Xenova/all-MiniLM-L6-v2)...');
      const { pipeline } = await import('@xenova/transformers');
      this.extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return this.extractorPromise;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /** Formats a vector as the pgvector literal expected by raw SQL (`'[0.1,0.2,...]'::vector`). */
  toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }
}
