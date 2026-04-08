import { LLMService } from './llm';

/**
 * Semantic Chunking Service
 * Split documents into semantic chunks using LLM
 */

export interface ChunkResult {
	id: string;
	content: string;
	metadata?: {
		startLine?: number;
		endLine?: number;
		heading?: string;
		[key: string]: any;
	};
}

export interface ChunkingProgress {
	file: string;
	totalChunks: number;
	processedChunks: number;
	status: 'pending' | 'processing' | 'completed' | 'error';
	error?: string;
}

export class ChunkingService {
	llmService: LLMService;
	progressCallbacks: ((progress: ChunkingProgress) => void)[] = [];

	constructor() {
		this.llmService = new LLMService();
	}

	/**
	 * Register progress callback
	 */
	onProgress(callback: (progress: ChunkingProgress) => void): void {
		this.progressCallbacks.push(callback);
	}

	/**
	 * Notify progress callbacks
	 */
	private notifyProgress(progress: ChunkingProgress): void {
		this.progressCallbacks.forEach(cb => cb(progress));
	}

	/**
	 * Chunk document using semantic analysis
	 */
	async chunkDocument(
		baseUrl: string,
		apiKey: string,
		modelName: string,
		content: string,
		maxTokens?: number,
		temperature?: number
	): Promise<ChunkResult[]> {
		// Split content into sections (by headings, paragraphs, or delimiters)
		const sections = this.splitIntoSections(content);
		const chunks: ChunkResult[] = [];

		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];
			const chunkId = this.generateChunkId(i);

			// If section is too large, split further
			if (section.content.length > 1000) {
				const subChunks = await this.semanticSplit(
					baseUrl,
					apiKey,
					modelName,
					section.content,
					maxTokens,
					temperature
				);

				subChunks.forEach((subChunk, j) => {
					chunks.push({
						id: `${chunkId}-${j}`,
						content: subChunk,
						metadata: {
							heading: section.heading,
							startLine: section.startLine,
							endLine: section.endLine,
							subChunkIndex: j
						}
					});
				});
			} else {
				chunks.push({
					id: chunkId,
					content: section.content,
					metadata: {
						heading: section.heading,
						startLine: section.startLine,
						endLine: section.endLine
					}
				});
			}
		}

		return chunks;
	}

	/**
	 * Split content into sections by headings and paragraphs
	 */
	private splitIntoSections(content: string): {
		content: string;
		heading?: string;
		startLine: number;
		endLine: number;
	}[] {
		const lines = content.split('\n');
		const sections: {
			content: string;
			heading?: string;
			startLine: number;
			endLine: number;
		}[] = [];

		let currentSection: {
			content: string[];
			heading?: string;
			startLine: number;
		} = {
			content: [],
			startLine: 1
		};

		let lineNum = 1;

		for (const line of lines) {
			// Detect Markdown headings
			if (line.startsWith('#')) {
				// Save previous section
				if (currentSection.content.length > 0) {
					sections.push({
						content: currentSection.content.join('\n').trim(),
						heading: currentSection.heading,
						startLine: currentSection.startLine,
						endLine: lineNum - 1
					});
				}

				// Start new section
				currentSection = {
					content: [line],
					heading: line.replace(/^#+\s*/, '').trim(),
					startLine: lineNum
				};
			} else {
				currentSection.content.push(line);
			}

			lineNum++;
		}

		// Save last section
		if (currentSection.content.length > 0) {
			sections.push({
				content: currentSection.content.join('\n').trim(),
				heading: currentSection.heading,
				startLine: currentSection.startLine,
				endLine: lineNum - 1
			});
		}

		return sections;
	}

	/**
	 * Semantic split using LLM
	 */
	private async semanticSplit(
		baseUrl: string,
		apiKey: string,
		modelName: string,
		content: string,
		maxTokens?: number,
		temperature?: number
	): Promise<string[]> {
		const prompt = `Split the following text into meaningful chunks. Each chunk should be a complete idea or topic. Use [SPLIT] to mark chunk boundaries.

Text:
${content}

Instructions:
1. Identify natural topic boundaries
2. Keep each chunk between 200-800 characters
3. Ensure each chunk is self-contained
4. Use [SPLIT] delimiter between chunks

Output format:
Chunk 1 content
[SPLIT]
Chunk 2 content
[SPLIT]
Chunk 3 content`;

		try {
			const response = await this.llmService.chat(
				baseUrl,
				apiKey,
				modelName,
				prompt,
				'You are a text segmentation expert. Split text into meaningful chunks.',
				maxTokens || 1024,
				temperature || 0.1
			);

			// Split by [SPLIT] delimiter
			const chunks = response.split('[SPLIT]')
				.map(chunk => chunk.trim())
				.filter(chunk => chunk.length > 0);

			return chunks;
		} catch (error) {
			// Fallback to simple paragraph split
			console.warn('Semantic split failed, using fallback:', error);
			return this.simpleSplit(content);
		}
	}

	/**
	 * Simple split fallback (paragraph-based)
	 */
	private simpleSplit(content: string): string[] {
		const paragraphs = content.split(/\n\n+/);
		const chunks: string[] = [];
		let currentChunk = '';

		for (const paragraph of paragraphs) {
			if (currentChunk.length + paragraph.length > 800) {
				if (currentChunk.length > 0) {
					chunks.push(currentChunk.trim());
					currentChunk = '';
				}
				if (paragraph.length > 800) {
					// Force split long paragraph
					const words = paragraph.split(/\s+/);
					let temp = '';
					for (const word of words) {
						if (temp.length + word.length > 600) {
							chunks.push(temp.trim());
							temp = word;
						} else {
							temp += ' ' + word;
						}
					}
					if (temp.length > 0) {
						currentChunk = temp;
					}
				} else {
					currentChunk = paragraph;
				}
			} else {
				currentChunk += '\n\n' + paragraph;
			}
		}

		if (currentChunk.length > 0) {
			chunks.push(currentChunk.trim());
		}

		return chunks;
	}

	/**
	 * Generate unique chunk ID
	 */
	private generateChunkId(index: number): string {
		return `chunk-${Date.now()}-${index}`;
	}

	/**
	 * Process multiple files
	 */
	async processFiles(
		baseUrl: string,
		apiKey: string,
		modelName: string,
		files: { path: string; content: string }[],
		maxTokens?: number,
		temperature?: number,
		onFileComplete?: (path: string, chunks: ChunkResult[]) => void
	): Promise<Map<string, ChunkResult[]>> {
		const results = new Map<string, ChunkResult[]>();

		for (const file of files) {
			// Notify progress
			this.notifyProgress({
				file: file.path,
				totalChunks: 0,
				processedChunks: 0,
				status: 'processing'
			});

			try {
				const chunks = await this.chunkDocument(
					baseUrl,
					apiKey,
					modelName,
					file.content,
					maxTokens,
					temperature
				);

				results.set(file.path, chunks);

				// Notify completion
				this.notifyProgress({
					file: file.path,
					totalChunks: chunks.length,
					processedChunks: chunks.length,
					status: 'completed'
				});

				if (onFileComplete) {
					onFileComplete(file.path, chunks);
				}
			} catch (error) {
				// Notify error
				this.notifyProgress({
					file: file.path,
					totalChunks: 0,
					processedChunks: 0,
					status: 'error',
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return results;
	}
}