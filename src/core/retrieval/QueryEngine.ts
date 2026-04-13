// @ts-nocheck - temporary type compatibility fix
/**
 * QueryEngine - Unified query across vault notes, raw documents, and images
 */

import { QdrantClientWrapper, SearchResult } from "../qdrant/QdrantClient";
import { LLMProvider } from "../llm/openaiCompatibleProvider";
import { requestUrl } from "obsidian";

export interface QueryResult {
  answer: string;
  sources: SourceInfo[];
  images: ImageInfo[];
  rawAnswer: string;
  usedVault: boolean;
  usedRaw: boolean;
  usedImages: boolean;
}

export interface SourceInfo {
  type: "vault" | "raw";
  path: string;
  title: string;
  content: string;
  score: number;
  page?: number;
}

export interface ImageInfo {
  description: string;
  sourceFile: string;
  score: number;
  page?: number;
}

export interface QueryOptions {
  topK?: number;
  includeVault?: boolean;
  includeRaw?: boolean;
  includeImages?: boolean;
  contextWindow?: number;
}

const DEFAULT_OPTIONS: QueryOptions = {
  topK: 10,
  includeVault: true,
  includeRaw: true,
  includeImages: true,
  contextWindow: 8000,
};

export class QueryEngine {
  private qdrant: QdrantClientWrapper;
  private llmProvider: LLMProvider;
  private embeddingEndpoint: string;
  private embeddingModel: string;
  private embeddingApiKey: string;

  constructor(
    qdrant: QdrantClientWrapper,
    llmProvider: LLMProvider,
    embeddingConfig: {
      endpoint: string;
      model: string;
      apiKey: string;
    }
  ) {
    this.qdrant = qdrant;
    this.llmProvider = llmProvider;
    this.embeddingEndpoint = embeddingConfig.endpoint;
    this.embeddingModel = embeddingConfig.model;
    this.embeddingApiKey = embeddingConfig.apiKey;
  }

  /**
   * Main query method
   */
  async query(question: string, options: QueryOptions = {}): Promise<QueryResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Step 1: Get embedding for the question
    const queryVector = await this.getEmbedding(question);

    // Step 2: Search across collections
    const results = await this.qdrant.searchAll(queryVector, {
      vaultLimit: opts.includeVault ? Math.ceil(opts.topK! * 0.3) : 0,
      rawLimit: opts.includeRaw ? Math.ceil(opts.topK! * 0.6) : 0,
      imageLimit: opts.includeImages ? Math.ceil(opts.topK! * 0.1) : 0,
    });

    // Step 3: Categorize results
    const vaultResults: SearchResult[] = [];
    const rawResults: SearchResult[] = [];
    const imageResults: SearchResult[] = [];

    for (const r of results) {
      switch (r.collection) {
        case "vault_notes":
          vaultResults.push(r);
          break;
        case "raw_documents":
          rawResults.push(r);
          break;
        case "images":
          imageResults.push(r);
          break;
      }
    }

    // Step 4: Build sources
    const sources: SourceInfo[] = [];
    for (const r of vaultResults) {
      const p = r.payload as any;
      sources.push({
        type: "vault",
        path: p.path,
        title: p.title || p.path,
        content: p.content || "",
        score: r.score,
      });
    }
    for (const r of rawResults) {
      const p = r.payload as any;
      sources.push({
        type: "raw",
        path: p.file_path,
        title: p.file_name,
        content: p.chunk_text || "",
        score: r.score,
        page: p.page_number,
      });
    }

    // Step 5: Build image infos
    const images: ImageInfo[] = imageResults.map(r => {
      const p = r.payload as any;
      return {
        description: p.description || "",
        sourceFile: p.source_file || "",
        score: r.score,
        page: p.page_number,
      };
    });

    // Step 6: Build context for LLM
    const context = this.buildContext(sources, images, opts.contextWindow!);

    // Step 7: Generate answer
    const prompt = this.buildPrompt(question, context);
    const rawAnswer = await this.llmProvider.generate(prompt);

    return {
      answer: rawAnswer,
      sources,
      images,
      rawAnswer,
      usedVault: vaultResults.length > 0,
      usedRaw: rawResults.length > 0,
      usedImages: imageResults.length > 0,
    };
  }

  /**
   * Get embedding for a text
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const response = await requestUrl({
      url: `${this.embeddingEndpoint}/embeddings`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.embeddingApiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = typeof response.json === 'object' ? response.json : JSON.parse(response.text);
    return data.data[0]?.embedding || [];
  }

  /**
   * Build context from search results, respecting context window
   */
  private buildContext(sources: SourceInfo[], images: ImageInfo[], maxTokens: number): string {
    let context = "";
    let tokenCount = 0;

    // Add text sources
    for (const source of sources) {
      const entry = `[Source: ${source.title}${source.page ? ` (p.${source.page})` : ""}]\n${source.content}\n\n`;
      const entryTokens = this.estimateTokens(entry);
      if (tokenCount + entryTokens > maxTokens) break;
      context += entry;
      tokenCount += entryTokens;
    }

    // Add image descriptions
    if (images.length > 0) {
      context += "--- Image Context ---\n";
      for (const img of images) {
        const imgEntry = `[Image from ${img.sourceFile}${img.page ? ` p.${img.page}` : ""}]: ${img.description}\n`;
        const imgTokens = this.estimateTokens(imgEntry);
        if (tokenCount + imgTokens > maxTokens) break;
        context += imgEntry;
        tokenCount += imgTokens;
      }
    }

    return context;
  }

  /**
   * Build prompt for LLM
   */
  private buildPrompt(question: string, context: string): string {
    return `You are a helpful assistant. Answer the user's question based on the provided context.

Context:
${context || "No relevant context found."}

Question: ${question}

Please provide a clear and concise answer based on the context above. If the context doesn't contain relevant information, say so honestly.`;
  }

  /**
   * Estimate token count (rough: 1 token ≈ 4 chars for English, 1.5 chars for Chinese)
   */
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
