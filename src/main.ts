import { App, Plugin, PluginSettingTab, Setting, Notice, requestUrl, TFile, TFolder } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { ChatView } from './ChatView';
import { CHAT_VIEW_TYPE } from './constants';
import { QdrantManager, QdrantConfig } from './core/qdrant/QdrantManager';
import { QdrantClientWrapper } from './core/qdrant/QdrantClient';
import { RAGAnythingManager } from './core/rag-anything/RAGAnythingManager';
import { LightRagManager } from './core/lightrag/LightRagManager'; // eslint-disable-line
import { SemanticChunker, chunkByParagraph } from './utils/SemanticChunker';
import { IndexingEngine, IndexingProgress } from './core/indexing/IndexingEngine';
import { QueryEngine, QueryResult } from './core/retrieval/QueryEngine';
import { PlatformManager } from './utils/PlatformManager';

const execAsync = promisify(exec);

// ============================================================================
// Helper: curl-based HTTP client for Electron renderer workaround
// ============================================================================

interface CurlResponse {
	status: number;
	body: string;
	json: any;
}

function curlPost(url: string, body: object, headers: Record<string, string> = {}): CurlResponse {
	const headerArgs = Object.entries(headers)
		.map(([k, v]) => `-H '${k}: ${v}'`)
		.join(' ');
	
	const bodyJson = JSON.stringify(body);
	const escapedBody = bodyJson.replace(/'/g, "'\\''");
	
	const cmd = `curl -s -w '\n%{http_code}' -X POST '${url}' ${headerArgs} -d '${escapedBody}'`;
	
	try {
		// Use dynamic require for Node.js builtins (Obsidian renderer workaround)
		const { execSync } = require('child_process');
		const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
		const lines = output.trim().split('\n');
		const status = parseInt(lines.pop() || '0');
		const responseBody = lines.join('\n');
		
		let json: any = null;
		try {
			json = JSON.parse(responseBody);
		} catch {}
		
		return { status, body: responseBody, json };
	} catch (e: any) {
		console.error('[Smart RAG] curl failed:', e.message);
		return { status: 0, body: e.message, json: null };
	}
}

// ============================================================================
// Settings Interfaces — all configurable, no hardcoded credentials
// ============================================================================

interface ChatLLMConfig {
	baseUrl: string;
	apiKey: string;
	modelName: string;
	maxTokens: number;
	temperature: number;
}

interface EmbeddingConfig {
	provider: 'openai' | 'dashscope' | 'ollama';
	baseUrl: string;
	apiKey: string;
	model: string;
	dimension: number;
}

interface LightRAGConfig {
	serverUrl: string;
	llmConcurrency: number;
	embeddingConcurrency: number;
	enabled: boolean;
	command: string;
	workingDir: string;
	// LLM config
	llmBinding: string;
	llmModel: string;
	llmBaseUrl: string;
	llmApiKey: string;
	// Embedding config
	embeddingBinding: string;
	embeddingModel: string;
	embeddingBaseUrl: string;
	embeddingApiKey: string;
	embeddingDim: number;
	// Vector storage config
	vectorStorage: 'NanoVectorDBStorage' | 'QdrantVectorDBStorage';
	qdrantUrl: string;
	// Chunking config
	chunkOverlapSize: number;
	maxGleaning: number;
	entityTypes: string[];
	// Retrieval config
	summaryLanguage: string;
	cosineThreshold: number;
	forceLLMSummaryOnMerge: number;
	relatedChunkNumber: number;
	// Options
	maxGraphNodes: number;
	chunkingStrategy: string;
	logLevel: string;
}


interface RAGAnythingConfig {
	enabled: boolean;
	httpPort: number;
	workingDir: string;
	parser: 'mineru' | 'docling' | 'paddleocr';
	llmBaseUrl: string;
	llmApiKey: string;
	llmModel: string;
	embeddingBaseUrl: string;
	embeddingApiKey: string;
	embeddingModel: string;
	embeddingDimension: number;
	llmConcurrency: number;
	embeddingConcurrency: number;
	// MinerU remote API configuration
	mineruApiUrl: string;
	mineruApiEnabled: boolean;
	maxConcurrentFiles: number;
}

interface SmartRAGSettings {
	chatLLM: ChatLLMConfig;
	embedding: EmbeddingConfig;
	lightRAG: LightRAGConfig;
	qdrant: QdrantConfig;
	ragAnything: RAGAnythingConfig;
	rawFolderPath: string;
}

// ============================================================================
// Default Settings — sensible defaults, NO secrets
// ============================================================================

const DEFAULT_SETTINGS: SmartRAGSettings = {
	chatLLM: {
		baseUrl: 'https://api.longcat.chat/openai/v1',
		apiKey: '',
		modelName: 'LongCat-Flash-Lite',
		maxTokens: 4096,
		temperature: 0.7
	},
	embedding: {
		provider: 'dashscope',
		baseUrl: 'http://127.0.0.1:1234/v1',
		apiKey: 'EMPTY',
		model: 'text-embedding-bge-m3',
		dimension: 1024
	},
	lightRAG: {
		serverUrl: 'http://127.0.0.1:9621',
		llmConcurrency: 6,
		embeddingConcurrency: 3,
		enabled: false,
		command: 'lightrag-server',
		workingDir: '',
		// LLM
		llmBinding: 'openai',
		llmModel: 'LongCat-Flash-Lite',
		llmBaseUrl: 'https://api.longcat.chat/openai/v1',
		llmApiKey: '',
		// Embedding
		embeddingBinding: 'openai',
		embeddingModel: 'text-embedding-bge-m3',
		embeddingBaseUrl: 'http://192.168.3.121:1234',
		embeddingApiKey: 'EMPTY',
		embeddingDim: 1024,
		// Vector storage
		vectorStorage: 'QdrantVectorDBStorage',
		qdrantUrl: 'http://127.0.0.1:6333',
		// Chunking config
		chunkOverlapSize: 200,
		maxGleaning: 2,
		entityTypes: ['Industry', 'Domain', 'Technology', 'Scenario', 'PersonType', 'Feature', 'Project', 'Company', 'Module', 'Process'],
		// Retrieval config
		summaryLanguage: 'Chinese',
		cosineThreshold: 0.2,
		forceLLMSummaryOnMerge: 8,
		relatedChunkNumber: 10,
		// Options
		maxGraphNodes: 30000,
		chunkingStrategy: 'fixed',
		logLevel: 'INFO'
	},
	qdrant: {
		httpPort: 6333,
		dataDir: PlatformManager.getDefaultQdrantDataDir(),
		autoStart: true,
	},
	ragAnything: {
		enabled: true,
		httpPort: 8000,
		workingDir: path.join(os.homedir(), '.openclaw', 'rag-storage'),
		parser: 'mineru',
		llmBaseUrl: 'https://dashscope.aliyuncs.com/v1',
		llmApiKey: '',
		llmModel: 'qwen-plus',
		embeddingBaseUrl: 'https://dashscope.aliyuncs.com/v1',
		embeddingApiKey: '',
		embeddingModel: 'text-embedding-v3',
		embeddingDimension: 1024,
		llmConcurrency: 6,
		embeddingConcurrency: 3,
		// MinerU remote API
		mineruApiUrl: 'http://192.168.3.253:8001',
		mineruApiEnabled: false,
		maxConcurrentFiles: 4
	},
	rawFolderPath: ''
};

// ============================================================================
// Plugin
// ============================================================================

export default class SmartRAGPlugin extends Plugin {
	settings!: SmartRAGSettings;
	statusBarItem!: HTMLElement;
	statusBarItemLightRAG!: HTMLElement;
	statusBarItemQdrant!: HTMLElement;
	statusBarItemRAGAnything!: HTMLElement;
	statusCheckInterval!: number;

	// v1.0.0 components
	qdrantManager: QdrantManager | null = null;
	qdrantClient: QdrantClientWrapper | null = null;
	ragAnythingManager: RAGAnythingManager | null = null;
	lightRagManager: LightRagManager | null = null;
	indexingEngine: IndexingEngine | null = null;
	queryEngine: QueryEngine | null = null;

	// Indexing state
	isIndexing = false;
	indexingProgress: IndexingProgress | null = null;
	indexingCancelled = false;

	// Stats
	collectionStats: Record<string, number> = {};

	async onload() {
		await this.loadSettings();

		// Register settings tab
		this.addSettingTab(new SmartRAGSettingTab(this.app, this));

		// Register view
		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

		// Add ribbon icon
		this.addRibbonIcon('brain', 'Smart RAG', () => {
			this.openChatView();
		});

		// Register commands
		this.addCommand({
			id: 'open-chat-panel',
			name: 'Open Chat Panel',
			callback: () => this.openChatView()
		});

		// Index Vault command removed - use right-click "RAG Index" instead

		this.addCommand({
			id: 'index-raw-folder',
			name: 'Index Raw Folder',
			callback: () => this.indexRawFolder()
		});

		// Register context menu for RAG Index (LightRAG)
		// Obsidian only has 'file-menu' event — it fires for both files AND folders
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if ('children' in file) {
					// Folder → "Ingest entire folder"
					menu.addItem((item) => {
						item
							.setTitle('Ingest Entire Folder')
							.setIcon('database')
							.onClick(async () => {
								await this.indexFolderToLightRAG(file);
							});
					});
				} else {
					// File → "Ingest file"
					menu.addItem((item) => {
						item
							.setTitle('Ingest File')
							.setIcon('database')
							.onClick(async () => {
								await this.indexFileToLightRAG(file as TFile);
							});
					});
				}
			})
		);

		// Add status bar item (summary)
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText('RAG: …');

		// Add individual service status dots
		this.statusBarItemLightRAG = this.addStatusBarItem();
		this.statusBarItemLightRAG.setText('🔴');
		this.statusBarItemLightRAG.title = 'LightRAG: Checking…';

		this.statusBarItemQdrant = this.addStatusBarItem();
		this.statusBarItemQdrant.setText('🔴');
		this.statusBarItemQdrant.title = 'Qdrant: Checking…';

		this.statusBarItemRAGAnything = this.addStatusBarItem();
		this.statusBarItemRAGAnything.setText('🔴');
		this.statusBarItemRAGAnything.title = 'RAG-Anything: Checking…';

		this.updateStatusBar();

		// Auto-refresh status every 5 seconds
		this.statusCheckInterval = window.setInterval(() => {
			this.updateStatusBar();
		}, 5000);

		// Initialize v1.0.0 components
		try {
			await this.initializeV1();
			console.log('Smart RAG v1.0.0 initialized successfully');
		} catch (error) {
			console.error('Failed to initialize Smart RAG v1.0.0:', error);
			new Notice(`Smart RAG init failed: ${error}`);
		}

		console.log('Smart RAG plugin loaded - v1.0.0');
	}

	/**
	 * Initialize v1.0.0 components
	 */
	async initializeV1(): Promise<void> {
		const s = this.settings;

		// Initialize Qdrant
		this.qdrantManager = new QdrantManager(s.qdrant);
		this.qdrantClient = new QdrantClientWrapper(`http://127.0.0.1:${s.qdrant.httpPort}`);

		// Initialize RAG-Anything
		this.ragAnythingManager = new RAGAnythingManager(s.ragAnything);

		// Initialize LightRAG
		this.lightRagManager = new LightRagManager({
			serverUrl: s.lightRAG.serverUrl,
			enabled: s.lightRAG.enabled,
			command: s.lightRAG.command,
			workingDir: s.lightRAG.workingDir,
			// LLM
			llmBinding: s.lightRAG.llmBinding,
			llmModel: s.lightRAG.llmModel,
			llmBaseUrl: s.lightRAG.llmBaseUrl,
			llmApiKey: s.lightRAG.llmApiKey,
			// Embedding
			embeddingBinding: s.lightRAG.embeddingBinding,
			embeddingModel: s.lightRAG.embeddingModel,
			embeddingBaseUrl: s.lightRAG.embeddingBaseUrl,
			embeddingApiKey: s.lightRAG.embeddingApiKey,
			embeddingDim: s.lightRAG.embeddingDim,
			// Options
			llmConcurrency: s.lightRAG.llmConcurrency,
			embeddingConcurrency: s.lightRAG.embeddingConcurrency,
			maxGraphNodes: s.lightRAG.maxGraphNodes,
			chunkingStrategy: s.lightRAG.chunkingStrategy,
			logLevel: s.lightRAG.logLevel
		});

		// Auto-start disabled - user manually starts via settings UI
		// if (s.ragAnything.enabled) {
		// 	await this.ragAnythingManager?.start();
		// }

		// if (s.lightRAG.enabled) {
		// 	await this.lightRagManager?.start();
		// }

		// Initialize Qdrant client and collections
		if (await this.qdrantManager?.isRunning()) {
			await this.qdrantClient?.initialize();
			await this.qdrantClient?.createCollections(s.lightRAG.embeddingDim || 1024);
			this.collectionStats = await this.qdrantClient?.getAllStats() || {};
		}

		// Initialize Indexing Engine (use LightRAG embedding config)
		this.indexingEngine = new IndexingEngine(this.app, this.qdrantClient!, {
			embeddingModel: s.lightRAG.embeddingModel,
			embeddingDimension: s.lightRAG.embeddingDim || 1024,
			embeddingEndpoint: s.lightRAG.embeddingBaseUrl,
			embeddingApiKey: s.lightRAG.embeddingApiKey,
			rawFolderPath: s.rawFolderPath || undefined,
			ragAnythingUrl: `http://127.0.0.1:${s.ragAnything.httpPort}`,
		});

		// Initialize Query Engine
		const llmProvider = {
			generate: async (prompt: string) => {
				const response = await requestUrl({
					url: `${s.chatLLM.baseUrl}/chat/completions`,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${s.chatLLM.apiKey}`,
					},
					body: JSON.stringify({
						model: s.chatLLM.modelName,
						messages: [{ role: 'user', content: prompt }],
						max_tokens: s.chatLLM.maxTokens,
						temperature: s.chatLLM.temperature,
					}),
				});

				if (response.status < 200 || response.status >= 300) {
					throw new Error(`LLM API error: ${response.status}`);
				}

				const data = typeof response.json === 'object' ? response.json : JSON.parse(response.body);
				return data.choices[0]?.message?.content || 'No response generated.';
			}
		};

		this.queryEngine = new QueryEngine(this.qdrantClient!, llmProvider, {
			endpoint: s.lightRAG.embeddingBaseUrl,
			model: s.lightRAG.embeddingModel,
			apiKey: s.lightRAG.embeddingApiKey,
		});
	}

	onunload() {
		if (this.statusCheckInterval) {
			window.clearInterval(this.statusCheckInterval);
		}
		this.stopExternalServices();
		console.log('Smart RAG v1.0.0 unloaded');
	}

	// Deep merge helper to preserve nested defaults
	deepMerge(target: any, source: any): any {
		for (const key in source) {
			if (source[key] instanceof Object && !Array.isArray(source[key])) {
				if (!target[key]) {
					target[key] = {};
				}
				this.deepMerge(target[key], source[key]);
			} else {
				target[key] = source[key];
			}
		}
	}

	async loadSettings() {
		const savedData = await this.loadData();
		// Use deep merge to preserve nested defaults like lightRAG.embeddingModel
		this.settings = {};
		this.deepMerge(this.settings, DEFAULT_SETTINGS);
		this.deepMerge(this.settings, savedData);
	}

	async saveSettings(newSettings?: SmartRAGSettings) {
		if (newSettings) {
			this.settings = newSettings;
		}
		// Always update LightRAG manager config — both on initial load and auto-save
		if (this.lightRagManager) {
			this.lightRagManager.updateConfig({
				serverUrl: this.settings.lightRAG.serverUrl,
				enabled: this.settings.lightRAG.enabled,
				command: this.settings.lightRAG.command,
				workingDir: this.settings.lightRAG.workingDir,
				llmBinding: this.settings.lightRAG.llmBinding,
				llmModel: this.settings.lightRAG.llmModel,
				llmBaseUrl: this.settings.lightRAG.llmBaseUrl,
				llmApiKey: this.settings.lightRAG.llmApiKey,
				embeddingBinding: this.settings.lightRAG.embeddingBinding,
				embeddingModel: this.settings.lightRAG.embeddingModel,
				embeddingBaseUrl: this.settings.lightRAG.embeddingBaseUrl,
				embeddingApiKey: this.settings.lightRAG.embeddingApiKey,
				embeddingDim: this.settings.lightRAG.embeddingDim,
				llmConcurrency: this.settings.lightRAG.llmConcurrency,
				embeddingConcurrency: this.settings.lightRAG.embeddingConcurrency,
				maxGraphNodes: this.settings.lightRAG.maxGraphNodes,
				chunkingStrategy: this.settings.lightRAG.chunkingStrategy,
				logLevel: this.settings.lightRAG.logLevel
			});
		}
		await this.saveData(this.settings);
	}

	/**
	 * Stub: Settings change listener (Neural Composer feature).
	 * Smart RAG uses direct saveSettings + context propagation.
	 */
	addSettingsChangeListener(_listener: () => void): () => void {
		return () => {} // no-op unsubscribe
	}

	async startExternalServices(): Promise<void> {
		const s = this.settings;

		// Start Qdrant
		const qdrantStarted = await this.qdrantManager?.start();
		if (qdrantStarted) {
			await this.qdrantClient?.initialize();
			await this.qdrantClient?.createCollections(s.embedding.dimension);
		}

		// Start RAG-Anything
		if (s.ragAnything.enabled) {
			await this.ragAnythingManager?.start();
		}

		// Start LightRAG
		if (s.lightRAG.enabled) {
			await this.lightRagManager?.start();
		}

		this.collectionStats = await this.qdrantClient?.getAllStats() || {};
	}

	async stopExternalServices(): Promise<void> {
		await this.qdrantManager?.stop();
		await this.ragAnythingManager?.stop();
		await this.lightRagManager?.stop();
	}

	/**
	 * Semantic chunking - preprocessing before sending to LightRAG
	 * Split by paragraphs, then use embedding + cosine similarity to find semantic boundaries
	 */
	private async semanticChunkByParagraph(
		content: string,
		filePath: string
	): Promise<string[]> {
		const lr = this.settings.lightRAG;

		// === YAML preprocessing: embed tags into content ===
		const processedContent = this.preprocessYAMLTags(content);
		// === end YAML preprocessing ===

		// Check if embedding API is available for semantic chunking
		const hasEmbeddingApi = lr.embeddingBaseUrl && lr.embeddingModel;

		if (hasEmbeddingApi) {
			// Use embedding-based semantic chunking
			try {
				const chunker = new SemanticChunker({
					embeddingBaseUrl: lr.embeddingBaseUrl.endsWith('/v1')
						? lr.embeddingBaseUrl
						: `${lr.embeddingBaseUrl}/v1`,
					embeddingModel: lr.embeddingModel,
					embeddingApiKey: lr.embeddingApiKey || 'EMPTY',
					embeddingDim: lr.embeddingDim || 1024,
					breakpointThreshold: 0.75,
					maxChunkTokens: 800,
					overlapRatio: 0.1,
					minSentencesPerChunk: 3,
				});

				const chunks = await chunker.chunk(processedContent, filePath);
				console.log(`[Smart RAG] Semantic chunking (embedding): ${processedContent.length} chars → ${chunks.length} chunks`);
				return chunks.map(c => c.content);
			} catch (e) {
				console.warn('[Smart RAG] Semantic chunking failed, falling back to paragraph:', e);
				// Fall through to paragraph-based chunking
			}
		}

		// Fallback: paragraph-based chunking (no API needed)
		return chunkByParagraph(processedContent, 800);
	}

	/**
	 * Preprocess YAML frontmatter tags - embed them into content for LightRAG entity extraction
	 * Converts YAML key:value format to readable text format
	 */
	private preprocessYAMLTags(content: string): string {
		// Extract YAML frontmatter
		const yamlMatch = content.match(/^---\s*\n(.*?)\n---\s*\n/);
		if (!yamlMatch) {
			return content; // No YAML found, return original
		}

		const yamlContent = yamlMatch[1];
		const bodyContent = content.slice(yamlMatch[0].length);

		// Define tag dimensions mapping (Chinese → English entity type)
		const tagDimensions: Record<string, string> = {
			'行业信息': 'Industry',
			'专业信息': 'Domain',
			'技术信息': 'Technology',
			'业务场景': 'Scenario',
			'人员类别': 'PersonType',
			'特性类别': 'Feature'
		};

		// Parse YAML tags and generate summary
		const tagSummary: string[] = []; 
		for (const [cnName, enType] of Object.entries(tagDimensions)) {
			// Match both single value and array format
			const singleMatch = yamlContent.match(new RegExp(`${cnName}:\s*([^\n]+)`));
			const arrayMatch = yamlContent.match(new RegExp(`${cnName}:\s*\n((?:\s*-\s*.+\n)+)`));

			if (singleMatch) {
				const value = singleMatch[1].trim();
				tagSummary.push(`**${cnName}** (${enType}): ${value}`);
			} else if (arrayMatch) {
				const values = arrayMatch[1]
					.split('\n')
					.filter(line => line.trim().startsWith('-'))
					.map(line => line.replace(/^\s*-\s*/, '').trim())
					.join(', ');
				if (values) {
					tagSummary.push(`**${cnName}** (${enType}): ${values}`);
				}
			}
		}

		if (tagSummary.length === 0) {
			return content; // No recognized tags found
		}

		// Build processed content with embedded tag summary
		const processed = `---
${yamlContent}
---

## 标签摘要

以下标签描述了文档的关键分类信息，用于知识图谱实体提取：

${tagSummary.join('\n')}

${bodyContent}`;

		return processed;
	}

	/**
	 * Get embedding for a single paragraph
	 * Uses curl subprocess to completely bypass Electron renderer network restrictions
	 * (fetch, requestUrl, http/https all blocked for localhost in Electron renderer)
	 */
	private async getParagraphEmbedding(text: string): Promise<number[]> {
		const e = this.settings.embedding;
		// Truncate to avoid token limit (most embedding models support ~8192 tokens)
		const truncated = text.slice(0, 4000);

		const body = JSON.stringify({
			model: e.model,
			input: truncated
		}).replace(/'/g, "'\"'\"'"); // Escape single quotes for shell

		// Ensure baseUrl has /v1/ path for OpenAI-compatible API
		const embeddingUrl = e.baseUrl.endsWith('/v1')
			? `${e.baseUrl}/embeddings`
			: `${e.baseUrl}/v1/embeddings`;

		const curlCmd = `curl -s -X POST '${embeddingUrl}' \
			-H 'Content-Type: application/json' \
			-H 'Authorization: Bearer ${e.apiKey}' \
			-d '${body}'`;

		const { stdout, stderr } = await execAsync(curlCmd, { timeout: 30000 });

		if (stderr) {
			throw new Error(`curl error: ${stderr}`);
		}

		const json = JSON.parse(stdout);
		if (json.error) {
			throw new Error(`Embedding API error: ${json.error.message || JSON.stringify(json.error)}`);
		}
		if (!json.data || !json.data[0]) {
			throw new Error(`Embedding API returned unexpected response: ${stdout.slice(0, 200)}`);
		}
		return json.data[0].embedding;
	}

	/**
	 * Calculate cosine similarity between two vectors
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
		const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
		const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
		return normA === 0 || normB === 0 ? 0 : dot / (normA * normB);
	}

	async indexFileToLightRAG(file: TFile): Promise<void> {
		if (!this.settings.lightRAG.enabled) {
			new Notice('LightRAG is not enabled. Please enable it in settings.');
			return;
		}

		if (!await this.lightRagManager?.isRunning()) {
			new Notice('LightRAG server is not running. Please start it from settings.');
			return;
		}

		try {
			const content = await this.app.vault.read(file);

			// Semantic chunking by paragraph
			const chunks = await this.semanticChunkByParagraph(content, file.path);

			// Build file_sources for each chunk
			const fileSources = chunks.map((_, i) => `${file.path}#chunk-${i + 1}`);

			// Use curl instead of requestUrl (Electron renderer workaround)
				const response = curlPost(
					`${this.settings.lightRAG.serverUrl}/documents/texts`,
					{ 'texts': chunks, 'file_sources': fileSources },
					{ 'Content-Type': 'application/json' }
				);

			if (response.status >= 200 && response.status < 300) {
				new Notice(`Successfully indexed: ${file.name} (${chunks.length} chunks)`);
			} else {
				new Notice(`Failed to index: ${response.body}`);
			}
		} catch (error: any) {
			new Notice(`Error indexing file: ${error.message}`);
			console.error('[Smart RAG] Index error:', error);
		}
	}

	async indexFolderToLightRAG(folder: TFolder): Promise<void> {
		if (!this.settings.lightRAG.enabled) {
			new Notice('LightRAG is not enabled. Please enable it in settings.');
			return;
		}

		if (!await this.lightRagManager?.isRunning()) {
			new Notice('LightRAG server is not running. Please start it from settings.');
			return;
		}

		const files = folder.children.filter(child => child instanceof TFile && child.extension === 'md');

		if (files.length === 0) {
			new Notice('No markdown files found in folder.');
			return;
		}

		new Notice(`Indexing ${files.length} files from ${folder.name}...`);

		let success = 0;
		let failed = 0;

		for (const file of files) {
			try {
				const content = await this.app.vault.read(file as TFile);

				// Semantic chunking
				const chunks = await this.semanticChunkByParagraph(content, file.path);
				const fileSources = chunks.map((_, i) => `${file.path}#chunk-${i + 1}`);

				// Use curl instead of requestUrl (Electron renderer workaround)
				const response = curlPost(
					`${this.settings.lightRAG.serverUrl}/documents/texts`,
					{ 'texts': chunks, 'file_sources': fileSources },
					{ 'Content-Type': 'application/json' }
				);

				if (response.status >= 200 && response.status < 300) {
					success++;
				} else {
					failed++;
					console.error(`[Smart RAG] Failed to index ${file.name}: ${response.body}`);
				}
			} catch (error: any) {
				failed++;
				console.error(`[Smart RAG] Error indexing ${file.name}:`, error);
			}
		}

		new Notice(`Folder indexing complete: ${success} success, ${failed} failed`);
	}

	async indexRawFolder(): Promise<void> {
		if (this.isIndexing) {
			new Notice('Indexing already in progress');
			return;
		}

		if (!this.settings.rawFolderPath) {
			new Notice('Please configure raw folder path in settings');
			return;
		}

		this.isIndexing = true;
		this.indexingCancelled = false;

		this.indexingEngine?.onProgress((progress) => {
			this.indexingProgress = progress;
			this.updateStatusBar();
		});

		try {
			await this.indexingEngine?.indexRawFolder();
			new Notice('Raw folder indexing complete!');
		} catch (error: any) {
			new Notice(`Indexing failed: ${error.message}`);
		} finally {
			this.isIndexing = false;
			this.indexingProgress = null;
			this.updateStatusBar();
			this.collectionStats = await this.qdrantClient?.getAllStats() || {};
		}
	}

	async openChatView() {
		const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: CHAT_VIEW_TYPE,
				active: true
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async updateStatusBar() {
		const qdrantRunning = await this.qdrantManager?.isRunning();
		const ragRunning = await this.ragAnythingManager?.isRunning();
		const lightRagRunning = await this.lightRagManager?.isRunning();

		// Update individual service dots
		this.statusBarItemLightRAG.setText(lightRagRunning ? '🟢' : '🔴');
		this.statusBarItemLightRAG.title = lightRagRunning ? 'LightRAG: Running' : 'LightRAG: Stopped';

		this.statusBarItemQdrant.setText(qdrantRunning ? '🟢' : '🔴');
		this.statusBarItemQdrant.title = qdrantRunning ? 'Qdrant: Running' : 'Qdrant: Stopped';

		this.statusBarItemRAGAnything.setText(ragRunning ? '🟢' : '🔴');
		this.statusBarItemRAGAnything.title = ragRunning ? 'RAG-Anything: Running' : 'RAG-Anything: Stopped';

		// Keep legacy summary status bar
		if (this.isIndexing && this.indexingProgress) {
			this.statusBarItem.setText(`RAG: ${this.indexingProgress.message}`);
			this.statusBarItem.style.color = '#FFC107';
		} else if (qdrantRunning && ragRunning && lightRagRunning) {
			this.statusBarItem.setText('RAG: ● Ready');
			this.statusBarItem.style.color = '#4CAF50';
		} else if (qdrantRunning && ragRunning) {
			this.statusBarItem.setText('RAG: ⚠ No LightRAG');
			this.statusBarItem.style.color = '#FFC107';
		} else if (qdrantRunning) {
			this.statusBarItem.setText('RAG: ⚠ Qdrant only');
			this.statusBarItem.style.color = '#FFC107';
		} else {
			this.statusBarItem.setText('RAG: ○ Stopped');
			this.statusBarItem.style.color = '#F44336';
		}
	}

	async query(question: string): Promise<QueryResult | null> {
		if (!this.queryEngine) {
			new Notice('Query engine not initialized');
			return null;
		}

		try {
			return await this.queryEngine.query(question);
		} catch (error: any) {
			new Notice(`Query failed: ${error.message}`);
			return null;
		}
	}

	async getCollectionStats(): Promise<Record<string, number>> {
		return await this.qdrantClient?.getAllStats() || {};
	}

	async isReady(): Promise<boolean> {
		const qdrantRunning = await this.qdrantManager?.isRunning();
		return !!qdrantRunning;
	}

	/**
	 * Stub for Neural Composer DatabaseProvider compatibility.
	 * Not used in Smart RAG v1.0.0 (Qdrant replaces PGlite database).
	 */
	getDatabaseService(): null {
		return null;
	}
}

// ============================================================================
// Settings Tab
// ============================================================================

type TabId = 'chat-llm' | 'embedding' | 'light-rag' | 'qdrant' | 'rag-anything';

class SmartRAGSettingTab extends PluginSettingTab {
	plugin: SmartRAGPlugin;
	currentTab: TabId = 'chat-llm';
	autoSaveTimeout: number | null = null;

	constructor(app: App, plugin: SmartRAGPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	showAutoSaveBadge(): void {
		if (this.autoSaveTimeout) {
			window.clearTimeout(this.autoSaveTimeout);
		}

		this.autoSaveTimeout = window.setTimeout(async () => {
			await this.plugin.saveSettings();
			new Notice('✓ Auto-saved', 2000);
			this.autoSaveTimeout = null;
		}, 1000);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Smart RAG v1.0.0 Settings' });

		// Tab navigation
		const tabContainer = containerEl.createDiv('smart-rag-tabs');
		const tabs: { id: TabId; label: string }[] = [
			{ id: 'chat-llm', label: '💬 Chat LLM' },
			{ id: 'embedding', label: '🧩 Embedding' },
			{ id: 'light-rag', label: '🔗 LightRAG' },
			{ id: 'qdrant', label: '📦 Qdrant' },
			{ id: 'rag-anything', label: '📄 RAG-Anything' },
		];

		tabs.forEach(tab => {
			const button = tabContainer.createEl('button', {
				text: tab.label,
				cls: `smart-rag-tab-button${this.currentTab === tab.id ? ' smart-rag-tab-active' : ''}`
			});
			button.onclick = () => {
				this.currentTab = tab.id;
				this.display();
			};
		});

		// Content
		const contentContainer = containerEl.createDiv('smart-rag-tab-content');

		switch (this.currentTab) {
			case 'chat-llm':
				this.renderChatLLM(contentContainer);
				break;
			case 'embedding':
				this.renderEmbedding(contentContainer);
				break;
			case 'light-rag':
				this.renderLightRAG(contentContainer);
				break;
			case 'qdrant':
				this.renderQdrant(contentContainer);
				break;
			case 'rag-anything':
				this.renderRAGAnything(contentContainer);
				break;
		}

		// Shared: Raw folder + indexing controls
		containerEl.createEl('hr');
		containerEl.createEl('h4', { text: '📂 Document Library' });

		new Setting(containerEl)
			.setName('Raw Folder Path')
			.setDesc('Path to external documents (PDF, Word, PPT, Excel, etc.)')
			.addText(text => text
				.setPlaceholder('/path/to/documents')
				.setValue(this.plugin.settings.rawFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.rawFolderPath = value;
					this.showAutoSaveBadge();
				}));

		// Indexing controls (only RAG-Anything raw folder)
		containerEl.createEl('hr');
		containerEl.createEl('h4', { text: '📝 Indexing Controls (RAG-Anything)' });

		if (this.plugin.isIndexing && this.plugin.indexingProgress) {
			const p = this.plugin.indexingProgress;
			containerEl.createEl('p', { text: p.message });
			containerEl.createEl('p', { text: `Current: ${p.currentFile}` });
		}

		new Setting(containerEl)
			.setName('Index Raw Folder')
			.setDesc('Index external documents via RAG-Anything')
			.addButton(btn => btn
				.setButtonText('Index Raw Folder')
				.setCta()
				.setDisabled(this.plugin.isIndexing)
				.onClick(async () => {
					await this.plugin.indexRawFolder();
					updateStatus();
				}));
	}

	// ─── Chat LLM ────────────────────────────────────────────────────────

	renderChatLLM(container: HTMLElement) {
		const s = this.plugin.settings.chatLLM;

		container.createEl('h3', { text: '💬 Chat LLM Configuration' });
		container.createEl('p', { text: 'LLM used for chat dialogue generation.' });

		new Setting(container)
			.setName('Base URL')
			.setDesc('OpenAI-compatible API endpoint')
			.addText(text => text
				.setPlaceholder('https://dashscope.aliyuncs.com/v1')
				.setValue(s.baseUrl)
				.onChange(async (v) => { s.baseUrl = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('API Key')
			.setDesc('Authentication key')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(s.apiKey)
				.onChange(async (v) => { s.apiKey = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Model identifier')
			.addText(text => text
				.setPlaceholder('qwen-plus')
				.setValue(s.modelName)
				.onChange(async (v) => { s.modelName = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Max Tokens')
			.setDesc('Maximum tokens in response')
			.addText(text => text
				.setPlaceholder('4096')
				.setValue(String(s.maxTokens))
				.onChange(async (v) => { s.maxTokens = parseInt(v) || 4096; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Temperature')
			.setDesc('Randomness (0-1)')
			.addText(text => text
				.setPlaceholder('0.7')
				.setValue(String(s.temperature))
				.onChange(async (v) => { s.temperature = parseFloat(v) || 0.7; this.showAutoSaveBadge(); }));

		// Save button
		container.createEl('hr');
		new Setting(container)
			.setName('💾 Save Chat LLM Settings')
			.setDesc('Click to save all Chat LLM configuration changes')
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					await this.plugin.saveSettings();
					new Notice('✅ Chat LLM settings saved!');
				}));
	}

	// ─── Embedding ───────────────────────────────────────────────────────

	renderEmbedding(container: HTMLElement) {
		container.createEl('h3', { text: '🧩 Embedding Configuration' });
		container.createEl('p', { text: 'Embedding settings are now unified with LightRAG tab. Please configure embedding in the 🔗 LightRAG tab.' });
		container.createEl('p', { text: 'This ensures consistency between vault indexing and knowledge graph extraction.' });

		// ─── LightRAG LLM Config (for graph extraction) ───
		container.createEl('hr');
		container.createEl('h4', { text: '🔗 LightRAG LLM Configuration' });
		container.createEl('p', { text: 'LLM model used by LightRAG for knowledge graph extraction.' });

		const lr = this.plugin.settings.lightRAG;

		new Setting(container)
			.setName('LLM Model')
			.setDesc('Model for entity/relation extraction')
			.addText(text => text
				.setPlaceholder('gpt-4o')
				.setValue(lr.llmModel)
				.onChange(async (v) => { lr.llmModel = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('LLM Base URL')
			.setDesc('OpenAI-compatible API endpoint for LightRAG')
			.addText(text => text
				.setPlaceholder('https://api.openai.com/v1')
				.setValue(lr.llmBaseUrl)
				.onChange(async (v) => { lr.llmBaseUrl = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('LLM API Key')
			.setDesc('API key for LightRAG LLM provider')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(lr.llmApiKey)
				.onChange(async (v) => { lr.llmApiKey = v; this.showAutoSaveBadge(); }));

		// Save button
		container.createEl('hr');
		new Setting(container)
			.setName('💾 Save Embedding Settings')
			.setDesc('Click to save all Embedding and LightRAG LLM configuration changes')
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					await this.plugin.saveSettings();
					new Notice('✅ Embedding settings saved!');
				}));
	}

	// ─── LightRAG ────────────────────────────────────────────────────────

	renderLightRAG(container: HTMLElement) {
		const s = this.plugin.settings.lightRAG;

		container.createEl('h3', { text: '🔗 LightRAG Configuration' });
		container.createEl('p', { text: 'LightRAG server for graph-based RAG retrieval.' });

		// Enable toggle
		new Setting(container)
			.setName('Enable LightRAG Server')
			.setDesc('Start LightRAG server automatically')
			.addToggle(toggle => toggle
				.setValue(s.enabled)
				.onChange(async (v) => { s.enabled = v; this.showAutoSaveBadge(); }));

		container.createEl('hr');
		container.createEl('h4', { text: '🔌 Server' });

		new Setting(container)
			.setName('Server URL')
			.setDesc('LightRAG HTTP server address')
			.addText(text => text
				.setPlaceholder('http://127.0.0.1:9621')
				.setValue(s.serverUrl)
				.onChange(async (v) => { s.serverUrl = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Command Path')
			.setDesc('Path to lightrag-server executable')
			.addText(text => text
				.setPlaceholder('lightrag-server')
				.setValue(s.command)
				.onChange(async (v) => { s.command = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Working Directory')
			.setDesc('LightRAG working directory (graph data, storage)')
			.addText(text => text
				.setPlaceholder('~/.openclaw/lightrag-data')
				.setValue(s.workingDir || '')
				.onChange(async (v) => { s.workingDir = v; this.showAutoSaveBadge(); }));

		// Service status and controls
		container.createEl('hr');
		container.createEl('h4', { text: '⚡ LightRAG Server Control' });

		const statusEl = container.createDiv();
		const updateLightRAGStatus = async () => {
			const running = await this.plugin.lightRagManager?.isRunning();
			statusEl.innerHTML = `
				<div style="margin-bottom: 12px;">
					<strong>Status:</strong> <span style="color: ${running ? '#4CAF50' : '#F44336'}">
						${running ? '● Running' : '○ Stopped'}
					</span>
				</div>
			`;
		};

		updateLightRAGStatus();

		new Setting(container)
			.setName('Server Controls')
			.setDesc('Start or stop LightRAG server')
			.addButton(btn => btn
				.setButtonText('Start')
				.setCta()
				.onClick(async () => {
					// Sync current settings before starting
					await this.plugin.saveSettings();
					// Update lightRagManager config with latest settings
					this.plugin.lightRagManager?.updateConfig({
						serverUrl: s.serverUrl,
						enabled: s.enabled,
						command: s.command,
						workingDir: s.workingDir,
						llmBinding: s.llmBinding,
						llmModel: s.llmModel,
						llmBaseUrl: s.llmBaseUrl,
						llmApiKey: s.llmApiKey,
						embeddingBinding: s.embeddingBinding,
						embeddingModel: s.embeddingModel,
						embeddingBaseUrl: s.embeddingBaseUrl,
						embeddingApiKey: s.embeddingApiKey,
						embeddingDim: s.embeddingDim,
                        vectorStorage: s.vectorStorage,
                        qdrantUrl: s.qdrantUrl,
						llmConcurrency: s.llmConcurrency,
						embeddingConcurrency: s.embeddingConcurrency,
						maxGraphNodes: s.maxGraphNodes,
						chunkingStrategy: s.chunkingStrategy,
						logLevel: s.logLevel
					});
					await this.plugin.lightRagManager?.start();
					updateLightRAGStatus();
				}))
			.addButton(btn => btn
				.setButtonText('Stop')
				.setWarning()
				.onClick(async () => {
					await this.plugin.lightRagManager?.stop();
					updateLightRAGStatus();
				}));


		container.createEl('h4', { text: '📊 Vector Storage' });
		container.createEl('p', { text: 'Vector database backend for LightRAG embeddings.' });

		new Setting(container)
			.setName('Vector Storage Type')
			.setDesc('Choose vector database backend')
			.addDropdown(dropdown => dropdown
				.addOption('NanoVectorDBStorage', 'NanoVectorDB (Local JSON)')
				.addOption('QdrantVectorDBStorage', 'Qdrant (High Performance)')
				.setValue(s.vectorStorage || 'QdrantVectorDBStorage')
				.onChange(async (v) => {
					(s as any).vectorStorage = v;
					this.showAutoSaveBadge();
					// Show/hide Qdrant URL based on selection
					qdrantUrlSetting.settingEl.style.display = v === 'QdrantVectorDBStorage' ? 'flex' : 'none';
				}));

		const qdrantUrlSetting = new Setting(container)
			.setName('Qdrant URL')
			.setDesc('Qdrant server address (e.g., http://127.0.0.1:6333)')
			.addText(text => text
				.setPlaceholder('http://127.0.0.1:6333')
				.setValue(s.qdrantUrl || 'http://127.0.0.1:6333')
				.onChange(async (v) => {
					(s as any).qdrantUrl = v;
					this.showAutoSaveBadge();
				}));
		// Initially show/hide based on current selection
		qdrantUrlSetting.settingEl.style.display = s.vectorStorage === 'QdrantVectorDBStorage' ? 'flex' : 'none';

		container.createEl('hr');
		container.createEl('h4', { text: '⚙️ Performance' });

		new Setting(container)
			.setName('LLM Concurrency')
			.setDesc('Max concurrent LLM API calls')
			.addText(text => text
				.setPlaceholder('6')
				.setValue(String(s.llmConcurrency))
				.onChange(async (v) => { s.llmConcurrency = parseInt(v) || 6; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding Concurrency')
			.setDesc('Max concurrent embedding API calls')
			.addText(text => text
				.setPlaceholder('6')
				.setValue(String(s.embeddingConcurrency))
				.onChange(async (v) => { s.embeddingConcurrency = parseInt(v) || 6; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Max Graph Nodes')
			.setDesc('Maximum nodes in knowledge graph (default 30000)')
			.addText(text => text
				.setPlaceholder('30000')
				.setValue(String(s.maxGraphNodes || 30000))
				.onChange(async (v) => { s.maxGraphNodes = parseInt(v) || 30000; this.showAutoSaveBadge(); }));

		container.createEl('hr');
		container.createEl('h4', { text: '📝 Chunking Settings' });
		container.createEl('p', { text: 'Text chunking configuration for LightRAG processing.' });

		new Setting(container)
			.setName('Chunk Overlap Size')
			.setDesc('Number of overlapping tokens between chunks (default 100, recommended 200)')
			.addText(text => text
				.setPlaceholder('200')
				.setValue(String(s.chunkOverlapSize || 200))
				.onChange(async (v) => { s.chunkOverlapSize = parseInt(v) || 200; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Max Gleaning Rounds')
			.setDesc('Entity extraction rounds (default 1, recommended 2-3)')
			.addText(text => text
				.setPlaceholder('2')
				.setValue(String(s.maxGleaning || 2))
				.onChange(async (v) => { s.maxGleaning = parseInt(v) || 2; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Entity Types')
			.setDesc('Comma-separated entity types for extraction (e.g., Industry,Domain,Technology)')
			.addText(text => text
				.setPlaceholder('Industry,Domain,Technology,Scenario,PersonType,Feature,Project,Company,Module,Process')
				.setValue((s.entityTypes || []).join(','))
				.onChange(async (v) => {
					const types = v.split(',').map(t => t.trim()).filter(t => t.length > 0);
					(s as any).entityTypes = types;
					this.showAutoSaveBadge();
				}));

		container.createEl('hr');
		container.createEl('h4', { text: '🔍 Retrieval Settings' });
		container.createEl('p', { text: 'Query and retrieval configuration for LightRAG.' });

		new Setting(container)
			.setName('Summary Language')
			.setDesc('Language for entity/relation summaries (Chinese for Chinese documents)')
			.addDropdown(dropdown => dropdown
				.addOption('Chinese', 'Chinese (中文)')
				.addOption('English', 'English')
				.setValue(s.summaryLanguage || 'Chinese')
				.onChange(async (v) => { s.summaryLanguage = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Cosine Threshold')
			.setDesc('Similarity threshold for vector retrieval (0.1-0.4, lower = more results)')
			.addText(text => text
				.setPlaceholder('0.2')
				.setValue(String(s.cosineThreshold || 0.2))
				.onChange(async (v) => { s.cosineThreshold = parseFloat(v) || 0.2; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('LLM Summary Threshold')
			.setDesc('Trigger LLM summary when entity descriptions exceed this count')
			.addText(text => text
				.setPlaceholder('8')
				.setValue(String(s.forceLLMSummaryOnMerge || 8))
				.onChange(async (v) => { s.forceLLMSummaryOnMerge = parseInt(v) || 8; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Related Chunk Number')
			.setDesc('Number of related chunks to return in queries (3-20)')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(String(s.relatedChunkNumber || 10))
				.onChange(async (v) => { s.relatedChunkNumber = parseInt(v) || 10; this.showAutoSaveBadge(); }));

		container.createEl('hr');
		container.createEl('h4', { text: '🧠 Embedding Configuration' });
		container.createEl('p', { text: 'Embedding model for text vectorization. Required for LightRAG processing.' });

		new Setting(container)
			.setName('Embedding Model')
			.setDesc('Model name (e.g., text-embedding-bge-m3, text-embedding-ada-002)')
			.addText(text => text
				.setPlaceholder('text-embedding-bge-m3')
				.setValue(s.embeddingModel || '')
				.onChange(async (v) => { s.embeddingModel = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding Base URL')
			.setDesc('Embedding service API endpoint')
			.addText(text => text
				.setPlaceholder('http://192.168.3.121:1234')
				.setValue(s.embeddingBaseUrl || '')
				.onChange(async (v) => { s.embeddingBaseUrl = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding API Key')
			.setDesc('API key for embedding service (leave EMPTY if not required)')
			.addText(text => text
				.setPlaceholder('EMPTY')
				.setValue(s.embeddingApiKey || '')
				.onChange(async (v) => { s.embeddingApiKey = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding Binding')
			.setDesc('Embedding backend: openai, ollama, xinference')
			.addText(text => text
				.setPlaceholder('openai')
				.setValue(s.embeddingBinding || '')
				.onChange(async (v) => { s.embeddingBinding = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding Dimensions')
			.setDesc('Vector dimensions (e.g., 1024 for bge-m3, 1536 for ada-002)')
			.addText(text => text
				.setPlaceholder('1024')
				.setValue(String(s.embeddingDim) || '')
				.onChange(async (v) => { s.embeddingDim = parseInt(v) || 1024; this.showAutoSaveBadge(); }));

		// Save button
		container.createEl('hr');
		new Setting(container)
			.setName('💾 Save LightRAG Settings')
			.setDesc('Click to save all LightRAG configuration changes and sync to LightRagManager')
			.addButton(btn => btn
				.setButtonText('Save & Sync')
				.setCta()
				.onClick(async () => {
					await this.plugin.saveSettings();
					// Sync to lightRagManager
					this.plugin.lightRagManager?.updateConfig({
						serverUrl: s.serverUrl,
						enabled: s.enabled,
						command: s.command,
						workingDir: s.workingDir,
						llmBinding: s.llmBinding,
						llmModel: s.llmModel,
						llmBaseUrl: s.llmBaseUrl,
						llmApiKey: s.llmApiKey,
						embeddingBinding: s.embeddingBinding,
						embeddingModel: s.embeddingModel,
						embeddingBaseUrl: s.embeddingBaseUrl,
						embeddingApiKey: s.embeddingApiKey,
						embeddingDim: s.embeddingDim,
                        vectorStorage: s.vectorStorage,
                        qdrantUrl: s.qdrantUrl,
						chunkOverlapSize: s.chunkOverlapSize,
						maxGleaning: s.maxGleaning,
						entityTypes: s.entityTypes,
						summaryLanguage: s.summaryLanguage,
						cosineThreshold: s.cosineThreshold,
						forceLLMSummaryOnMerge: s.forceLLMSummaryOnMerge,
						relatedChunkNumber: s.relatedChunkNumber,
						llmConcurrency: s.llmConcurrency,
						embeddingConcurrency: s.embeddingConcurrency,
						maxGraphNodes: s.maxGraphNodes,
						chunkingStrategy: s.chunkingStrategy,
						logLevel: s.logLevel
					});
					new Notice('✅ LightRAG settings saved and synced!');
				}));
	}

	// ─── Qdrant ──────────────────────────────────────────────────────────

	renderQdrant(container: HTMLElement) {
		const s = this.plugin.settings.qdrant;

		container.createEl('h3', { text: '📦 Qdrant Configuration' });
		container.createEl('p', { text: 'Vector database for storage and similarity search.' });

		new Setting(container)
			.setName('HTTP Port')
			.setDesc('Port for Qdrant HTTP API')
			.addText(text => text
				.setPlaceholder('6333')
				.setValue(String(s.httpPort))
				.onChange(async (v) => { s.httpPort = parseInt(v) || 6333; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Data Directory')
			.setDesc('Directory for Qdrant storage')
			.addText(text => text
				.setPlaceholder('~/.openclaw/smart-rag/qdrant-data')
				.setValue(s.dataDir)
				.onChange(async (v) => { s.dataDir = v; this.showAutoSaveBadge(); }));

		// Service status and controls
		container.createEl('hr');
		container.createEl('h4', { text: '⚡ Qdrant Server Control' });

		const statusEl = container.createDiv();
		const updateQdrantStatus = async () => {
			const running = await this.plugin.qdrantManager?.isRunning();
			let collCount = 0;
			if (running && this.plugin.qdrantClient?.isInitialized()) {
				try {
					const collections = await this.plugin.qdrantClient.getCollections();
					collCount = collections?.length ?? 0;
				} catch (error) {
					console.error('[Settings] Failed to get collections:', error);
				}
			}
			statusEl.innerHTML = `
				<div style="margin-bottom: 12px;">
					<strong>Status:</strong> <span style="color: ${running ? '#4CAF50' : '#F44336'}">
						${running ? '● Running' : '○ Stopped'}
					</span>
					${running ? ` &nbsp;|&nbsp; <strong>Collections:</strong> ${collCount}` : ''}
				</div>
			`;
		};

		updateQdrantStatus();

		new Setting(container)
			.setName('Server Controls')
			.setDesc('Start or stop Qdrant server')
			.addButton(btn => btn
				.setButtonText('Start')
				.setCta()
				.onClick(async () => {
					const started = await this.plugin.qdrantManager?.start();
					if (started) {
						// Initialize Qdrant client after server starts
						try {
							await this.plugin.qdrantClient?.initialize();
							await this.plugin.qdrantClient?.createCollections(this.plugin.settings.embedding.dimension);
						} catch (error) {
							console.error('[Settings] Failed to initialize Qdrant client:', error);
						}
					}
					updateQdrantStatus();
				}))
			.addButton(btn => btn
				.setButtonText('Stop')
				.setWarning()
				.onClick(async () => {
					await this.plugin.qdrantManager?.stop();
					updateQdrantStatus();
				}));

		// Save button
		container.createEl('hr');
		new Setting(container)
			.setName('💾 Save Qdrant Settings')
			.setDesc('Click to save all Qdrant configuration changes')
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					await this.plugin.saveSettings();
					new Notice('✅ Qdrant settings saved!');
				}));
	}

	// ─── RAG-Anything ────────────────────────────────────────────────────

	renderRAGAnything(container: HTMLElement) {
		const r = this.plugin.settings.ragAnything;

		container.createEl('h3', { text: '📄 RAG-Anything Configuration' });
		container.createEl('p', { text: 'Multi-format document parsing (PDF, Word, PPT, Excel, images).' });

		// Enable toggle
		new Setting(container)
			.setName('Enable RAG-Anything')
			.setDesc('Start RAG-Anything service automatically')
			.addToggle(toggle => toggle
				.setValue(r.enabled)
				.onChange(async (v) => { r.enabled = v; this.showAutoSaveBadge(); }));

		container.createEl('hr');
		container.createEl('h4', { text: '🔌 MinerU Server' });

		// MinerU remote API configuration
		new Setting(container)
			.setName('Enable Remote MinerU API')
			.setDesc('Use remote MinerU server instead of local installation')
			.addToggle(toggle => toggle
				.setValue(r.mineruApiEnabled)
				.onChange(async (v) => { r.mineruApiEnabled = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('MinerU API URL')
			.setDesc('Remote MinerU API endpoint (e.g., http://192.168.3.253:8001)')
			.addText(text => text
				.setPlaceholder('http://192.168.3.253:8001')
				.setValue(r.mineruApiUrl)
				.onChange(async (v) => { r.mineruApiUrl = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Max Concurrent Files')
			.setDesc('Maximum number of files to process concurrently')
			.addText(text => text
				.setPlaceholder('4')
				.setValue(String(r.maxConcurrentFiles))
				.onChange(async (v) => { r.maxConcurrentFiles = parseInt(v) || 4; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('HTTP Port')
			.setDesc('Port for RAG-Anything HTTP service')
			.addText(text => text
				.setPlaceholder('8000')
				.setValue(String(r.httpPort))
				.onChange(async (v) => { r.httpPort = parseInt(v) || 8000; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Working Directory')
			.setDesc('RAG-Anything working directory (storage, graphs, cache)')
			.addText(text => text
				.setPlaceholder('~/.openclaw/rag-storage')
				.setValue(r.workingDir)
				.onChange(async (v) => { r.workingDir = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Parser')
			.setDesc('Document parsing engine')
			.addDropdown(dd => dd
				.addOption('mineru', 'MinerU')
				.addOption('docling', 'Docling')
				.addOption('paddleocr', 'PaddleOCR')
				.setValue(r.parser)
				.onChange(async (v) => { r.parser = v as any; this.showAutoSaveBadge(); }));

		container.createEl('hr');
		container.createEl('h4', { text: '🤖 RAG-Anything LLM' });

		new Setting(container)
			.setName('LLM Base URL')
			.setDesc('LLM API endpoint for RAG-Anything')
			.addText(text => text
				.setPlaceholder('https://dashscope.aliyuncs.com/v1')
				.setValue(r.llmBaseUrl)
				.onChange(async (v) => { r.llmBaseUrl = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('LLM API Key')
			.setDesc('LLM API key for RAG-Anything')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(r.llmApiKey)
				.onChange(async (v) => { r.llmApiKey = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('LLM Model')
			.setDesc('LLM model for RAG-Anything')
			.addText(text => text
				.setPlaceholder('qwen-plus')
				.setValue(r.llmModel)
				.onChange(async (v) => { r.llmModel = v; this.showAutoSaveBadge(); }));

		container.createEl('hr');
		container.createEl('h4', { text: '🧩 RAG-Anything Embedding' });

		new Setting(container)
			.setName('Embedding Base URL')
			.setDesc('Embedding API endpoint for RAG-Anything')
			.addText(text => text
				.setPlaceholder('https://dashscope.aliyuncs.com/v1')
				.setValue(r.embeddingBaseUrl)
				.onChange(async (v) => { r.embeddingBaseUrl = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding API Key')
			.setDesc('Embedding API key for RAG-Anything')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(r.embeddingApiKey)
				.onChange(async (v) => { r.embeddingApiKey = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding Model')
			.setDesc('Embedding model for RAG-Anything')
			.addText(text => text
				.setPlaceholder('text-embedding-v3')
				.setValue(r.embeddingModel)
				.onChange(async (v) => { r.embeddingModel = v; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding Dimension')
			.setDesc('Vector dimension (1024 for DashScope v3)')
			.addText(text => text
				.setPlaceholder('1024')
				.setValue(String(r.embeddingDimension))
				.onChange(async (v) => { r.embeddingDimension = parseInt(v) || 1024; this.showAutoSaveBadge(); }));

		container.createEl('hr');
		container.createEl('h4', { text: '⚡ Concurrency' });

		new Setting(container)
			.setName('LLM Concurrency')
			.setDesc('Max concurrent LLM API calls')
			.addText(text => text
				.setPlaceholder('6')
				.setValue(String(r.llmConcurrency))
				.onChange(async (v) => { r.llmConcurrency = parseInt(v) || 6; this.showAutoSaveBadge(); }));

		new Setting(container)
			.setName('Embedding Concurrency')
			.setDesc('Max concurrent embedding API calls')
			.addText(text => text
				.setPlaceholder('6')
				.setValue(String(r.embeddingConcurrency))
				.onChange(async (v) => { r.embeddingConcurrency = parseInt(v) || 6; this.showAutoSaveBadge(); }));

		// Service status and controls
		container.createEl('hr');
		container.createEl('h4', { text: '⚡ RAG-Anything Server Control' });

		const statusEl = container.createDiv();
		const updateRAGStatus = async () => {
			const running = await this.plugin.ragAnythingManager?.isRunning();
			statusEl.innerHTML = `
				<div style="margin-bottom: 12px;">
					<strong>Status:</strong> <span style="color: ${running ? '#4CAF50' : '#F44336'}">
						${running ? '● Running' : '○ Stopped'}
					</span>
				</div>
			`;
		};

		updateRAGStatus();

		new Setting(container)
			.setName('Server Controls')
			.setDesc('Start or stop RAG-Anything service')
			.addButton(btn => btn
				.setButtonText('Start')
				.setCta()
				.onClick(async () => {
					await this.plugin.ragAnythingManager?.start();
					updateRAGStatus();
				}))
			.addButton(btn => btn
				.setButtonText('Stop')
				.setWarning()
				.onClick(async () => {
					await this.plugin.ragAnythingManager?.stop();
					updateRAGStatus();
				}));

		// Save button
		container.createEl('hr');
		new Setting(container)
			.setName('💾 Save RAG-Anything Settings')
			.setDesc('Click to save all RAG-Anything configuration changes')
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					await this.plugin.saveSettings();
					new Notice('✅ RAG-Anything settings saved!');
				}));
	}
}
