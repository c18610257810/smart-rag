/**
 * Semantic Chunker — embedding similarity based document splitting
 * 
 * Algorithm:
 * 1. Clean text (remove headers/footers, empty lines, page numbers)
 * 2. Split into sentences
 * 3. Embed each sentence
 * 4. Compute cosine similarity between adjacent sentences
 * 5. Find breakpoints where similarity drops below threshold
 * 6. Assemble chunks with overlap, respecting max token size
 */

export interface SemanticChunkerConfig {
	/** Embedding API base URL (e.g. http://192.168.3.121:1234/v1) */
	embeddingBaseUrl: string;
	/** Embedding model name */
	embeddingModel: string;
	/** Embedding API key (or 'EMPTY') */
	embeddingApiKey: string;
	/** Embedding dimension */
	embeddingDim: number;
	/** Similarity threshold for breakpoints (0.0-1.0). Lower = more splits. */
	breakpointThreshold: number;
	/** Max tokens per chunk (hard limit) */
	maxChunkTokens: number;
	/** Overlap between chunks (percentage, 0.0-1.0) */
	overlapRatio: number;
	/** Min sentences per chunk */
	minSentencesPerChunk: number;
}

export interface Chunk {
	content: string;
	tokens: number;
	index: number;
	sentenceCount: number;
}

const DEFAULT_CONFIG: SemanticChunkerConfig = {
	embeddingBaseUrl: '',
	embeddingModel: 'text-embedding-bge-m3',
	embeddingApiKey: 'EMPTY',
	embeddingDim: 1024,
	breakpointThreshold: 0.75,
	maxChunkTokens: 1000,
	overlapRatio: 0.1,
	minSentencesPerChunk: 3,
};

/**
 * Estimate token count from text (rough: ~4 chars per token for Chinese/English mix)
 */
function estimateTokens(text: string): number {
	// Chinese chars count as ~1 token each, English words as ~1.3 tokens
	const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
	const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
	const otherChars = text.length - chineseChars - englishWords;
	return Math.ceil(chineseChars + englishWords * 1.3 + otherChars / 4);
}

/**
 * Split text into sentences
 */
function splitSentences(text: string): string[] {
	// Handle Chinese sentence boundaries (。！？；) and English (.!?)
	const sentenceRegex = /[^。！？；.!?]+[。！？；.!?]*/g;
	const sentences: string[] = [];
	let match;
	while ((match = sentenceRegex.exec(text)) !== null) {
		const s = match[0].trim();
		if (s.length > 0) {
			sentences.push(s);
		}
	}
	// If no sentence boundaries found, return the whole text as one sentence
	if (sentences.length === 0 && text.trim().length > 0) {
		sentences.push(text.trim());
	}
	return sentences;
}

/**
 * Clean text: remove page numbers, headers/footers, excessive whitespace
 */
function cleanText(text: string): string {
	return text
		// Remove page number patterns like "- 1 -", "Page 1 of 10", "— 1 —"
		.replace(/[-—]\s*\d+\s*[-—]/g, '\n')
		.replace(/Page\s+\d+\s+of\s+\d+/gi, '\n')
		.replace(/第\s*\d+\s*页/g, '\n')
		// Remove excessive blank lines
		.replace(/\n{3,}/g, '\n\n')
		// Remove leading/trailing whitespace per line
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0)
		.join('\n')
		.trim();
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Get embeddings for a batch of texts via embedding API
 */
async function getEmbeddings(
	texts: string[],
	config: SemanticChunkerConfig
): Promise<number[][]> {
	const response = await fetch(`${config.embeddingBaseUrl}/embeddings`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${config.embeddingApiKey}`,
		},
		body: JSON.stringify({
			model: config.embeddingModel,
			input: texts,
			encoding_format: 'float',
		}),
	});

	if (!response.ok) {
		throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	if (!data.data || data.data.length === 0) {
		throw new Error('Embedding API returned no data');
	}

	return data.data.map((item: any) => item.embedding);
}

/**
 * Main semantic chunker class
 */
export class SemanticChunker {
	private config: SemanticChunkerConfig;

	constructor(config: Partial<SemanticChunkerConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Chunk text using embedding-based semantic similarity
	 */
	async chunk(text: string, sourcePath: string = ''): Promise<Chunk[]> {
		if (!text || text.trim().length === 0) {
			return [];
		}

		// Step 1: Clean
		const cleaned = cleanText(text);

		// Step 2: Split into sentences
		const sentences = splitSentences(cleaned);
		if (sentences.length <= this.config.minSentencesPerChunk) {
			return [{
				content: cleaned,
				tokens: estimateTokens(cleaned),
				index: 0,
				sentenceCount: sentences.length,
			}];
		}

		// Step 3: Embed sentences (batch for efficiency)
		const batchSize = 10; // LM Studio handles this fine
		const embeddings: number[][] = [];

		for (let i = 0; i < sentences.length; i += batchSize) {
			const batch = sentences.slice(i, i + batchSize);
			const batchEmbeddings = await getEmbeddings(batch, this.config);
			embeddings.push(...batchEmbeddings);
			// Small delay between batches to avoid overwhelming the API
			if (i + batchSize < sentences.length) {
				await new Promise(r => setTimeout(r, 100));
			}
		}

		// Step 4: Compute similarity between adjacent sentences
		const similarities: number[] = [];
		for (let i = 0; i < embeddings.length - 1; i++) {
			similarities.push(cosineSimilarity(embeddings[i], embeddings[i + 1]));
		}

		// Step 5: Find breakpoints (where similarity drops below threshold)
		const breakpoints: number[] = [];
		for (let i = 0; i < similarities.length; i++) {
			if (similarities[i] < this.config.breakpointThreshold) {
				breakpoints.push(i);
			}
		}

		// Step 6: Assemble chunks from breakpoints
		const chunks = this.assembleChunks(sentences, breakpoints);

		return chunks.map((chunk, idx) => ({
			content: chunk,
			tokens: estimateTokens(chunk),
			index: idx,
			sentenceCount: chunk.split(/[。！？；.!?]/).filter(s => s.trim()).length,
		}));
	}

	/**
	 * Assemble sentences into chunks based on breakpoints
	 */
	private assembleChunks(sentences: string[], breakpoints: Set<number> | number[]): string[] {
		const bpSet = Array.isArray(breakpoints) ? new Set(breakpoints) : breakpoints;
		const chunks: string[] = [];
		let currentChunk: string[] = [];
		let currentTokens = 0;

		for (let i = 0; i < sentences.length; i++) {
			const sentence = sentences[i];
			const sentenceTokens = estimateTokens(sentence);

			// Check if adding this sentence would exceed max tokens
			if (currentTokens + sentenceTokens > this.config.maxChunkTokens && currentChunk.length >= this.config.minSentencesPerChunk) {
				// Finalize current chunk
				chunks.push(currentChunk.join(' '));
				
				// Add overlap from end of previous chunk
				const overlapCount = Math.max(1, Math.floor(currentChunk.length * this.config.overlapRatio));
				currentChunk = currentChunk.slice(-overlapCount);
				currentTokens = currentChunk.reduce((sum, s) => sum + estimateTokens(s), 0);
			}

			currentChunk.push(sentence);
			currentTokens += sentenceTokens;

			// Check if we should split here (breakpoint)
			if (bpSet.has(i) && currentChunk.length >= this.config.minSentencesPerChunk) {
				chunks.push(currentChunk.join(' '));
				currentChunk = [];
				currentTokens = 0;
			}
		}

		// Don't forget the last chunk
		if (currentChunk.length > 0) {
			chunks.push(currentChunk.join(' '));
		}

		return chunks;
	}
}

/**
 * Paragraph-based chunking (fallback, no API needed)
 * Splits by markdown headings and paragraphs
 */
export function chunkByParagraph(text: string, maxTokens: number = 800): string[] {
	const cleaned = cleanText(text);
	
	// Split by markdown headings first
	const headingSplit = cleaned.split(/(?=^#{1,6}\s)/m);
	
	const chunks: string[] = [];
	let currentChunk = '';
	let currentTokens = 0;

	for (const section of headingSplit) {
		const sectionTokens = estimateTokens(section);
		
		if (sectionTokens > maxTokens) {
			// Section too big, split by paragraphs
			if (currentChunk) {
				chunks.push(currentChunk.trim());
				currentChunk = '';
				currentTokens = 0;
			}
			
			const paragraphs = section.split(/\n\n+/);
			for (const para of paragraphs) {
				const paraTokens = estimateTokens(para);
				if (currentTokens + paraTokens > maxTokens && currentChunk) {
					chunks.push(currentChunk.trim());
					currentChunk = '';
					currentTokens = 0;
				}
				if (currentChunk) {
					currentChunk += '\n\n' + para;
				} else {
					currentChunk = para;
				}
				currentTokens += paraTokens;
			}
		} else if (currentTokens + sectionTokens > maxTokens && currentChunk) {
			chunks.push(currentChunk.trim());
			currentChunk = section;
			currentTokens = sectionTokens;
		} else {
			if (currentChunk) {
				currentChunk += '\n\n' + section;
			} else {
				currentChunk = section;
			}
			currentTokens += sectionTokens;
		}
	}

	if (currentChunk.trim()) {
		chunks.push(currentChunk.trim());
	}

	return chunks;
}
