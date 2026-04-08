import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { PGlite } from '@electric-sql/pglite';
import { requestUrl } from 'obsidian';

/**
 * Database Schema
 * PGlite + Drizzle ORM for local vector storage
 */

// Documents table
export const documents = pgTable('documents', {
	id: text('id').primaryKey(),
	path: text('path').notNull(),
	title: text('title'),
	content: text('content'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

// Chunks table
export const chunks = pgTable('chunks', {
	id: text('id').primaryKey(),
	documentId: text('document_id').notNull().references(() => documents.id),
	content: text('content').notNull(),
	embedding: jsonb('embedding'), // Store as JSON array for PGlite compatibility
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at').defaultNow()
});

/**
 * Database Service
 * Manages PGlite connection and operations
 * 
 * Uses the same approach as Neural Composer:
 * - Load PGlite resources from CDN
 * - Use PGlite.create() with fsBundle, wasmModule, and vector extension
 */
export class DatabaseService {
	private db: ReturnType<typeof drizzle> | null = null;
	private pglite: PGlite | null = null;
	private initialized = false;

	/**
	 * Load PGlite resources from CDN
	 * Same approach as Neural Composer
	 */
	private async loadPGliteResources(): Promise<{
		fsBundle: Blob;
		wasmModule: WebAssembly.Module;
		vectorExtensionBundlePath: string;
	}> {
		try {
			const PGLITE_VERSION = '0.2.12';
			const [fsBundleResponse, wasmResponse] = await Promise.all([
				requestUrl(
					`https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/postgres.data`,
				),
				requestUrl(
					`https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/postgres.wasm`,
				),
			]);

			const fsBundle = new Blob([fsBundleResponse.arrayBuffer], {
				type: 'application/octet-stream',
			});
			const wasmModule = await WebAssembly.compile(wasmResponse.arrayBuffer);
			// Use string instead of URL object - PGlite accepts both
			const vectorExtensionBundlePath = `https://unpkg.com/@electric-sql/pglite@${PGLITE_VERSION}/dist/vector.tar.gz`;

			return { fsBundle, wasmModule, vectorExtensionBundlePath };
		} catch (error) {
			console.error('Error loading PGlite resources:', error);
			throw error;
		}
	}

	async initialize(dbName?: string): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			// Load PGlite resources from CDN (same as Neural Composer)
			const { fsBundle, wasmModule } = await this.loadPGliteResources();

			// Create PGlite instance WITHOUT vector extension (to avoid URL issues)
			// We'll store embeddings as JSONB instead of vector type
			this.pglite = await PGlite.create({
				fsBundle: fsBundle,
				wasmModule: wasmModule,
			});

			// Create Drizzle ORM instance
			this.db = drizzle(this.pglite);

			// Create tables if not exist
			await this.createTables();

			this.initialized = true;
			console.log('Database initialized successfully (without vector extension)');
		} catch (error) {
			console.error('Failed to initialize database:', error);
			throw error;
		}
	}

	private async createTables(): Promise<void> {
		if (!this.pglite) {
			throw new Error('PGlite not initialized');
		}

		// Create documents table
		await this.pglite.exec(`
			CREATE TABLE IF NOT EXISTS documents (
				id TEXT PRIMARY KEY,
				path TEXT NOT NULL,
				title TEXT,
				content TEXT,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Create chunks table
		await this.pglite.exec(`
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				document_id TEXT NOT NULL REFERENCES documents(id),
				content TEXT NOT NULL,
				embedding JSONB,
				metadata JSONB,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Create indexes
		await this.pglite.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
			CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
		`);
	}

	async insertDocument(doc: {
		id: string;
		path: string;
		title?: string;
		content?: string;
	}): Promise<void> {
		if (!this.db) {
			throw new Error('Database not initialized');
		}

		await this.db.insert(documents).values(doc).execute();
	}

	async insertChunk(chunk: {
		id: string;
		documentId: string;
		content: string;
		embedding?: number[];
		metadata?: Record<string, any>;
	}): Promise<void> {
		if (!this.db) {
			throw new Error('Database not initialized');
		}

		await this.db.insert(chunks).values({
			id: chunk.id,
			documentId: chunk.documentId,
			content: chunk.content,
			embedding: chunk.embedding ? JSON.stringify(chunk.embedding) : null,
			metadata: chunk.metadata || null
		}).execute();
	}

	async searchChunks(queryEmbedding: number[], limit: number = 5): Promise<{
		id: string;
		documentId: string;
		content: string;
		metadata?: Record<string, any>;
		similarity: number;
	}[]> {
		if (!this.pglite) {
			throw new Error('Database not initialized');
		}

		// Cosine similarity search (simplified for PGlite)
		// Note: PGlite doesn't have native vector operations, so we use JSONB approach
		const result = await this.pglite.query(`
			SELECT 
				id,
				document_id,
				content,
				metadata,
				1 - (embedding::text::float[] <-> $1::float[]) / sqrt(
					(select sum(x*x) from unnest(embedding::text::float[]) x) *
					(select sum(y*y) from unnest($1::float[]) y)
				) as similarity
			FROM chunks
			WHERE embedding IS NOT NULL
			ORDER BY similarity DESC
			LIMIT $2;
		`, [JSON.stringify(queryEmbedding), limit]);

		return result.rows as any[];
	}

	async getDocumentByPath(path: string): Promise<{
		id: string;
		path: string;
		title?: string;
		content?: string;
	} | null> {
		if (!this.pglite) {
			throw new Error('Database not initialized');
		}

		const result = await this.pglite.query(`
			SELECT id, path, title, content
			FROM documents
			WHERE path = $1
			LIMIT 1;
		`, [path]);

		return result.rows.length > 0 ? result.rows[0] as any : null;
	}

	async getAllDocuments(): Promise<{
		id: string;
		path: string;
		title?: string;
	}[]> {
		if (!this.pglite) {
			throw new Error('Database not initialized');
		}

		const result = await this.pglite.query(`
			SELECT id, path, title
			FROM documents
			ORDER BY created_at DESC;
		`);

		return result.rows as any[];
	}

	async getStats(): Promise<{
		documentsCount: number;
		chunksCount: number;
	}> {
		if (!this.pglite) {
			throw new Error('Database not initialized');
		}

		const docsResult = await this.pglite.query(`
			SELECT COUNT(*) as count FROM documents;
		`);

		const chunksResult = await this.pglite.query(`
			SELECT COUNT(*) as count FROM chunks;
		`);

		return {
			documentsCount: (docsResult.rows[0] as any)?.count || 0,
			chunksCount: (chunksResult.rows[0] as any)?.count || 0
		};
	}

	async clearDatabase(): Promise<void> {
		if (!this.pglite) {
			throw new Error('Database not initialized');
		}

		await this.pglite.exec(`
			DELETE FROM chunks;
			DELETE FROM documents;
		`);
	}

	async close(): Promise<void> {
		if (this.pglite) {
			await this.pglite.close();
			this.pglite = null;
			this.db = null;
			this.initialized = false;
		}
	}

	isInitialized(): boolean {
		return this.initialized;
	}
}