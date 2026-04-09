/**
 * RAGAnythingClient - HTTP client for RAG-Anything service
 */

export interface ParseOptions {
  extractImages?: boolean;
  extractTables?: boolean;
}

export interface ParseResponse {
  document_id: string;
  chunks: Array<{
    text?: string;
    content?: string;
    page_number?: number;
    token_count?: number;
  }>;
  images: Array<{
    description: string;
    page_number?: number;
    extracted_path?: string;
  }>;
  tables: Array<{
    headers: string[];
    rows: string[][];
    page_number?: number;
  }>;
  metadata: Record<string, unknown>;
}

export interface QueryResponse {
  answer: string;
  sources: Array<{
    file_path: string;
    file_name: string;
    page_number: number;
    chunk_text: string;
    relevance_score: number;
  }>;
}

export interface HealthResponse {
  status: string;
  rag_anything_version: string;
  parser: string;
  llm_model: string;
  embedding_model: string;
}

export class RAGAnythingClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Parse a document via RAG-Anything
   */
  async parse(filePath: string, options: ParseOptions = {}): Promise<ParseResponse> {
    const response = await fetch(`${this.baseUrl}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: filePath,
        extract_images: options.extractImages ?? true,
        extract_tables: options.extractTables ?? true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RAG-Anything parse failed (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Query RAG-Anything (uses its internal retrieval)
   */
  async query(question: string, options: { topK?: number; mode?: string } = {}): Promise<QueryResponse> {
    const response = await fetch(`${this.baseUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        top_k: options.topK ?? 10,
        mode: options.mode ?? "hybrid",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RAG-Anything query failed (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Health check
   */
  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`RAG-Anything health check failed (${response.status})`);
    }
    return await response.json();
  }
}
