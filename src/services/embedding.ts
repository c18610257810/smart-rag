import { requestUrl } from 'obsidian';

/**
 * Embedding Service
 * Generate embeddings using OpenAI-compatible API (LM Studio, etc.)
 */

export interface EmbeddingConfig {
	baseUrl: string;
	modelName: string;
	dimension?: number;
}

export interface EmbeddingResult {
	embedding: number[];
	model: string;
	dimension: number;
	usage?: {
		promptTokens: number;
		totalTokens: number;
	};
}

export class EmbeddingService {
	/**
	 * Generate embedding for text
	 */
	async generateEmbedding(
		baseUrl: string,
		modelName: string,
		text: string
	): Promise<EmbeddingResult> {
		// Normalize URL
		let normalizedUrl = baseUrl.replace(/\/+$/, '');
		if (!normalizedUrl.endsWith('/v1')) {
			normalizedUrl += '/v1';
		}

		try {
			const response = await requestUrl({
				url: `${normalizedUrl}/embeddings`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: modelName,
					input: text
				})
			});

			if (response.status !== 200) {
				throw new Error(`Embedding API returned ${response.status}: ${response.text}`);
			}

			const data = response.json;
			const embedding = data.data?.[0]?.embedding || [];

			return {
				embedding,
				model: data.model || modelName,
				dimension: embedding.length,
				usage: data.usage ? {
					promptTokens: data.usage.prompt_tokens,
					totalTokens: data.usage.total_tokens
				} : undefined
			};
		} catch (error) {
			throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Generate embeddings for multiple texts (batch)
	 */
	async generateEmbeddings(
		baseUrl: string,
		modelName: string,
		texts: string[]
	): Promise<EmbeddingResult[]> {
		// Normalize URL
		let normalizedUrl = baseUrl.replace(/\/+$/, '');
		if (!normalizedUrl.endsWith('/v1')) {
			normalizedUrl += '/v1';
		}

		try {
			const response = await requestUrl({
				url: `${normalizedUrl}/embeddings`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: modelName,
					input: texts
				})
			});

			if (response.status !== 200) {
				throw new Error(`Embedding API returned ${response.status}: ${response.text}`);
			}

			const data = response.json;
			const embeddings = data.data?.map((item: any) => ({
				embedding: item.embedding || [],
				model: data.model || modelName,
				dimension: (item.embedding || []).length,
				usage: data.usage ? {
					promptTokens: data.usage.prompt_tokens,
					totalTokens: data.usage.total_tokens
				} : undefined
			})) || [];

			return embeddings;
		} catch (error) {
			throw new Error(`Batch embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Calculate cosine similarity between two embeddings
	 */
	cosineSimilarity(embedding1: number[], embedding2: number[]): number {
		if (embedding1.length !== embedding2.length) {
			throw new Error('Embeddings must have the same dimension');
		}

		let dotProduct = 0;
		let norm1 = 0;
		let norm2 = 0;

		for (let i = 0; i < embedding1.length; i++) {
			dotProduct += embedding1[i] * embedding2[i];
			norm1 += embedding1[i] * embedding1[i];
			norm2 += embedding2[i] * embedding2[i];
		}

		norm1 = Math.sqrt(norm1);
		norm2 = Math.sqrt(norm2);

		if (norm1 === 0 || norm2 === 0) {
			return 0;
		}

		return dotProduct / (norm1 * norm2);
	}
}