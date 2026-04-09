/**
 * QdrantClient - Qdrant REST API client for Smart RAG
 * 
 * Handles all Qdrant operations: collections, upsert, search, delete
 */

import { QdrantClient, Schemas } from "@qdrant/js-client-rest";
import { COLLECTIONS, CollectionName, getCollectionSchema, VaultNotePayload, RawDocumentPayload, ImagePayload } from "./collections";

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
  collection: CollectionName;
}

export class QdrantClientWrapper {
  private client: QdrantClient | null = null;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Initialize Qdrant client
   */
  async initialize(): Promise<void> {
    this.client = new QdrantClient({
      url: this.baseUrl,
    });
    console.log(`[Smart RAG] Qdrant client initialized: ${this.baseUrl}`);
  }

  /**
   * Get Qdrant client instance
   */
  getClient(): QdrantClient {
    if (!this.client) {
      throw new Error("Qdrant client not initialized. Call initialize() first.");
    }
    return this.client;
  }

  /**
   * Create all collections if they don't exist
   */
  async createCollections(dimension: number = 1536): Promise<void> {
    const client = this.getClient();
    const collections = await client.getCollections();
    const existingNames = new Set(collections.collections.map(c => c.name));

    const collectionConfigs: { name: CollectionName; size: number }[] = [
      { name: COLLECTIONS.vault_notes, size: dimension },
      { name: COLLECTIONS.raw_documents, size: dimension },
      { name: COLLECTIONS.images, size: dimension },
    ];

    for (const config of collectionConfigs) {
      if (!existingNames.has(config.name)) {
        console.log(`[Smart RAG] Creating collection: ${config.name}`);
        await client.createCollection(config.name, {
          vectors: {
            size: config.size,
            distance: "Cosine",
          },
        });
      } else {
        console.log(`[Smart RAG] Collection exists: ${config.name}`);
      }
    }
  }

  /**
   * Upsert points to a collection
   */
  async upsert(collection: CollectionName, points: Schemas["PointStruct"][]): Promise<void> {
    const client = this.getClient();
    await client.upsert(collection, {
      wait: true,
      points,
    });
    console.log(`[Smart RAG] Upserted ${points.length} points to ${collection}`);
  }

  /**
   * Search a collection
   */
  async search(
    collection: CollectionName,
    vector: number[],
    limit: number = 10,
    filter?: Schemas["Filter"]
  ): Promise<SearchResult[]> {
    const client = this.getClient();
    const results = await client.queryPoints(collection, {
      query: vector,
      limit,
      filter,
      with_payload: true,
    });

    return results.map((r) => ({
      id: r.id as string,
      score: r.score ?? 0,
      payload: r.payload as Record<string, unknown>,
      collection,
    }));
  }

  /**
   * Hybrid search across multiple collections
   */
  async searchAll(
    vector: number[],
    options: {
      vaultLimit?: number;
      rawLimit?: number;
      imageLimit?: number;
      vaultFilter?: Schemas["Filter"];
      rawFilter?: Schemas["Filter"];
      imageFilter?: Schemas["Filter"];
    } = {}
  ): Promise<SearchResult[]> {
    const {
      vaultLimit = 5,
      rawLimit = 10,
      imageLimit = 3,
    } = options;

    const searches: Promise<SearchResult[]>[] = [];

    if (vaultLimit > 0) {
      searches.push(this.search(COLLECTIONS.vault_notes, vector, vaultLimit, options.vaultFilter));
    }
    if (rawLimit > 0) {
      searches.push(this.search(COLLECTIONS.raw_documents, vector, rawLimit, options.rawFilter));
    }
    if (imageLimit > 0) {
      searches.push(this.search(COLLECTIONS.images, vector, imageLimit, options.imageFilter));
    }

    const results = await Promise.all(searches);
    const allResults = results.flat();

    // Sort by score descending
    allResults.sort((a, b) => b.score - a.score);
    return allResults;
  }

  /**
   * Delete points by filter
   */
  async deleteByFilter(collection: CollectionName, filter: Schemas["Filter"]): Promise<void> {
    const client = this.getClient();
    await client.delete(collection, {
      wait: true,
      filter,
    });
  }

  /**
   * Delete a single point by ID
   */
  async deletePoint(collection: CollectionName, id: string): Promise<void> {
    const client = this.getClient();
    await client.delete(collection, {
      wait: true,
      points: [id],
    });
  }

  /**
   * Count points in a collection
   */
  async count(collection: CollectionName, filter?: Schemas["Filter"]): Promise<number> {
    const client = this.getClient();
    const result = await client.count(collection, { filter });
    return result.count;
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(collection: CollectionName) {
    const client = this.getClient();
    const info = await client.getCollection(collection);
    return info;
  }

  /**
   * Get stats for all collections
   */
  async getAllStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    for (const name of Object.values(COLLECTIONS)) {
      try {
        stats[name] = await this.count(name);
      } catch {
        stats[name] = 0;
      }
    }
    return stats;
  }

  /**
   * Clear all collections
   */
  async clearAll(): Promise<void> {
    const client = this.getClient();
    for (const name of Object.values(COLLECTIONS)) {
      try {
        await client.deleteCollection(name);
      } catch {
        // Ignore if doesn't exist
      }
    }
  }
}
