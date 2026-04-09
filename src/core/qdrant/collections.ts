/**
 * Qdrant Collections Design
 * 
 * vault_notes: Obsidian vault Markdown notes
 * raw_documents: External raw folder documents (PDF/Word/PPT/Excel)
 * images: Image descriptions from documents
 */

import { CreateCollection, PointStruct, Filter } from "@qdrant/js-client-rest";

export const COLLECTIONS = {
  vault_notes: "vault_notes",
  raw_documents: "raw_documents",
  images: "images",
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

/**
 * vault_notes collection schema
 */
export const vaultNotesSchema: CreateCollection = {
  vectors: {
    size: 1536, // text-embedding-3-small default
    distance: "Cosine",
  },
  optimizers_config: {
    default_segment_number: 2,
  },
};

/**
 * raw_documents collection schema
 */
export const rawDocumentsSchema: CreateCollection = {
  vectors: {
    size: 1536,
    distance: "Cosine",
  },
  optimizers_config: {
    default_segment_number: 4,
  },
};

/**
 * images collection schema
 */
export const imagesSchema: CreateCollection = {
  vectors: {
    size: 1536,
    distance: "Cosine",
  },
  optimizers_config: {
    default_segment_number: 2,
  },
};

/**
 * Get collection schema by name
 */
export function getCollectionSchema(name: CollectionName): CreateCollection {
  switch (name) {
    case COLLECTIONS.vault_notes:
      return vaultNotesSchema;
    case COLLECTIONS.raw_documents:
      return rawDocumentsSchema;
    case COLLECTIONS.images:
      return imagesSchema;
  }
}

/**
 * vault_notes point payload
 */
export interface VaultNotePayload {
  path: string;
  title: string;
  content: string;
  tags: string[];
  modified_time: number;
  word_count: number;
}

/**
 * raw_documents point payload
 */
export interface RawDocumentPayload {
  file_path: string;
  file_name: string;
  file_type: string;
  chunk_index: number;
  chunk_text: string;
  page_number?: number;
  total_pages?: number;
  file_hash: string;
  indexed_at: number;
}

/**
 * images point payload
 */
export interface ImagePayload {
  description: string;
  source_file: string;
  page_number?: number;
  extracted_path?: string;
  vlm_model?: string;
  indexed_at: number;
}

export type AnyPayload = VaultNotePayload | RawDocumentPayload | ImagePayload;
