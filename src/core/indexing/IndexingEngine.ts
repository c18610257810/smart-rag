// @ts-nocheck - temporary type compatibility fix
/**
 * IndexingEngine - Index vault notes and raw folder documents into Qdrant
 */

import { App, Notice, TFile, requestUrl } from "obsidian";
import { QdrantClientWrapper } from "../qdrant/QdrantClient";
import { COLLECTIONS, VaultNotePayload, RawDocumentPayload } from "../qdrant/collections";
import { FileScanner, FileInfo, ScanResult } from "./FileScanner";
import { RAGAnythingClient } from "../rag-anything/RAGAnythingManager";

export interface IndexingProgress {
  phase: "scanning" | "indexing-vault" | "indexing-raw" | "done" | "error";
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  currentFile: string;
  message: string;
}

export interface IndexingConfig {
  embeddingModel: string;
  embeddingDimension: number;
  embeddingEndpoint: string;
  embeddingApiKey: string;
  rawFolderPath?: string;
  ragAnythingUrl?: string;
}

export class IndexingEngine {
  private app: App;
  private qdrant: QdrantClientWrapper;
  private config: IndexingConfig;
  private progressCallback?: (progress: IndexingProgress) => void;
  private fileScanner?: FileScanner;
  private ragClient?: RAGAnythingClient;
  private knownFiles: Map<string, { hash: string; modifiedTime: number }> = new Map();

  constructor(app: App, qdrant: QdrantClientWrapper, config: IndexingConfig) {
    this.app = app;
    this.qdrant = qdrant;
    this.config = config;
    if (config.rawFolderPath) {
      this.fileScanner = new FileScanner(config.rawFolderPath);
    }
    if (config.ragAnythingUrl) {
      this.ragClient = new RAGAnythingClient(config.ragAnythingUrl);
    }
  }

  /**
   * Set progress callback
   */
  onProgress(callback: (progress: IndexingProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Index the entire vault
   */
  async indexVault(): Promise<void> {
    const mdFiles = this.app.vault.getMarkdownFiles();
    const total = mdFiles.length;

    this.reportProgress({
      phase: "indexing-vault",
      totalFiles: total,
      processedFiles: 0,
      failedFiles: 0,
      currentFile: "",
      message: `Indexing ${total} vault notes...`,
    });

    let processed = 0;
    let failed = 0;

    for (const file of mdFiles) {
      try {
        await this.indexVaultFile(file);
        processed++;
      } catch (err) {
        failed++;
        console.error(`[Smart RAG] Failed to index ${file.path}:`, err);
      }

      this.reportProgress({
        phase: "indexing-vault",
        totalFiles: total,
        processedFiles: processed,
        failedFiles: failed,
        currentFile: file.path,
        message: `Indexed ${processed}/${total} vault notes`,
      });
    }

    this.reportProgress({
      phase: "done",
      totalFiles: total,
      processedFiles: processed,
      failedFiles: failed,
      currentFile: "",
      message: `Vault indexing complete: ${processed} success, ${failed} failed`,
    });
  }

  /**
   * Index a single vault file
   */
  async indexVaultFile(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    if (!content.trim()) return;

    const fileHash = this.computeHash(content);
    const pointId = `vault_${fileHash}`;

    // Get embeddings
    const embeddings = await this.getEmbeddings(content);
    if (!embeddings.length) return;

    // Create points
    const points = embeddings.map((emb, i) => ({
      id: `${pointId}_chunk_${i}`,
      vector: emb.vector,
      payload: {
        path: file.path,
        title: file.basename,
        content: emb.text,
        tags: [],
        modified_time: file.stat.mtime,
        word_count: content.length,
      } as VaultNotePayload,
    }));

    // Delete old points for this file
    await this.qdrant.deleteByFilter(COLLECTIONS.vault_notes, {
      must: [{ key: "path", match: { value: file.path } }],
    });

    // Upsert new points
    await this.qdrant.upsert(COLLECTIONS.vault_notes, points);
  }

  /**
   * Index raw folder documents
   */
  async indexRawFolder(): Promise<void> {
    if (!this.fileScanner || !this.ragClient) {
      console.warn("[Smart RAG] Raw folder indexing not configured");
      return;
    }

    // Load known files from Qdrant
    await this.loadKnownFiles();
    this.fileScanner.loadKnownFiles(this.knownFiles);

    // Scan for changes
    const scanResult = await this.fileScanner.scan();

    const totalNew = scanResult.newFiles.length;
    const totalModified = scanResult.modifiedFiles.length;
    const totalToDelete = scanResult.deletedFiles.length;

    this.reportProgress({
      phase: "scanning",
      totalFiles: totalNew + totalModified,
      processedFiles: 0,
      failedFiles: 0,
      currentFile: "",
      message: `Found ${totalNew} new, ${totalModified} modified, ${totalToDelete} deleted files`,
    });

    // Delete removed files from Qdrant
    for (const filePath of scanResult.deletedFiles) {
      await this.qdrant.deleteByFilter(COLLECTIONS.raw_documents, {
        must: [{ key: "file_path", match: { value: filePath } }],
      });
      await this.qdrant.deleteByFilter(COLLECTIONS.images, {
        must: [{ key: "source_file", match: { value: filePath } }],
      });
      this.knownFiles.delete(filePath);
    }

    // Index new and modified files
    const filesToIndex = [...scanResult.newFiles, ...scanResult.modifiedFiles];
    let processed = 0;
    let failed = 0;

    for (const fileInfo of filesToIndex) {
      try {
        await this.indexRawFile(fileInfo);
        processed++;
        this.knownFiles.set(fileInfo.filePath, {
          hash: fileInfo.fileHash,
          modifiedTime: fileInfo.modifiedTime,
        });
      } catch (err) {
        failed++;
        console.error(`[Smart RAG] Failed to index ${fileInfo.filePath}:`, err);
      }

      this.reportProgress({
        phase: "indexing-raw",
        totalFiles: filesToIndex.length,
        processedFiles: processed,
        failedFiles: failed,
        currentFile: fileInfo.fileName,
        message: `Indexed ${processed}/${filesToIndex.length} raw documents`,
      });
    }

    this.reportProgress({
      phase: "done",
      totalFiles: filesToIndex.length,
      processedFiles: processed,
      failedFiles: failed,
      currentFile: "",
      message: `Raw folder indexing complete: ${processed} success, ${failed} failed`,
    });
  }

  /**
   * Index a single raw file via RAG-Anything
   */
  async indexRawFile(fileInfo: FileInfo): Promise<void> {
    if (!this.ragClient) return;

    // Parse document via RAG-Anything
    const parsed = await this.ragClient.parse(fileInfo.filePath, {
      extractImages: true,
      extractTables: true,
    });

    const chunks = parsed.chunks || [];
    const images = parsed.images || [];
    const now = Date.now();

    // Index chunks
    if (chunks.length > 0) {
      const points = chunks.map((chunk: any, i: number) => ({
        id: `raw_${fileInfo.fileHash}_chunk_${i}`,
        vector: [], // Will be filled by embedding
        payload: {
          file_path: fileInfo.filePath,
          file_name: fileInfo.fileName,
          file_type: fileInfo.fileType,
          chunk_index: i,
          chunk_text: chunk.text || chunk.content || "",
          page_number: chunk.page_number,
          total_pages: parsed.metadata?.page_count,
          file_hash: fileInfo.fileHash,
          indexed_at: now,
        } as RawDocumentPayload,
      }));

      // Get embeddings for all chunks
      const texts = chunks.map((c: any) => c.text || c.content || "");
      const embeddings = await this.getEmbeddings(texts);

      points.forEach((p: any, i: number) => {
        if (embeddings[i]) {
          p.vector = embeddings[i];
        }
      });

      // Delete old points for this file
      await this.qdrant.deleteByFilter(COLLECTIONS.raw_documents, {
        must: [{ key: "file_path", match: { value: fileInfo.filePath } }],
      });

      // Upsert
      const validPoints = points.filter((p: any) => p.vector.length > 0);
      if (validPoints.length > 0) {
        await this.qdrant.upsert(COLLECTIONS.raw_documents, validPoints);
      }
    }

    // Index images
    if (images.length > 0) {
      const imageDescriptions = images.map((img: any) => img.description || "");
      const imageEmbeddings = await this.getEmbeddings(imageDescriptions);

      const imagePoints = images.map((img: any, i: number) => ({
        id: `img_${fileInfo.fileHash}_${i}`,
        vector: imageEmbeddings[i] || [],
        payload: {
          description: img.description || "",
          source_file: fileInfo.filePath,
          page_number: img.page_number,
          extracted_path: img.extracted_path,
          vlm_model: "rag-anything",
          indexed_at: now,
        },
      }));

      // Delete old image points
      await this.qdrant.deleteByFilter(COLLECTIONS.images, {
        must: [{ key: "source_file", match: { value: fileInfo.filePath } }],
      });

      // Upsert
      const validImagePoints = imagePoints.filter((p: any) => p.vector.length > 0);
      if (validImagePoints.length > 0) {
        await this.qdrant.upsert(COLLECTIONS.images, validImagePoints);
      }
    }
  }

  /**
   * Load known files from Qdrant
   */
  private async loadKnownFiles(): Promise<void> {
    // This is a simplified version - in production, query Qdrant for all known file paths
    this.knownFiles = new Map();
  }

  /**
   * Get embeddings for texts
   */
  private async getEmbeddings(texts: string | string[]): Promise<number[][]> {
    const textArray = Array.isArray(texts) ? texts : [texts];
    const filtered = textArray.filter(t => t.trim().length > 0);

    if (filtered.length === 0) return [];

    const response = await requestUrl({
      url: `${this.config.embeddingEndpoint}/embeddings`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.embeddingApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: filtered,
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = typeof response.json === 'object' ? response.json : JSON.parse(response.text);
    return data.data.map((item: any) => item.embedding);
  }

  /**
   * Compute hash of content
   */
  private computeHash(content: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Report progress
   */
  private reportProgress(progress: IndexingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}
