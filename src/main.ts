import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ChatView } from './ChatView';
import { CHAT_VIEW_TYPE } from './constants';
import { QdrantManager } from './core/qdrant/QdrantManager';
import { QdrantClientWrapper } from './core/qdrant/QdrantClient';
import { RAGAnythingManager } from './core/rag-anything/RAGAnythingManager';
import { IndexingEngine, IndexingProgress } from './core/indexing/IndexingEngine';
import { QueryEngine, QueryResult } from './core/retrieval/QueryEngine';
import { PlatformManager } from './utils/PlatformManager';

const execAsync = promisify(exec);

/**
 * Smart RAG v1.0.0 - Qdrant-based RAG for Obsidian
 * 
 * Architecture:
 * - Qdrant: External vector database (replaces PGlite)
 * - RAG-Anything: Multi-format document parsing (PDF, Word, PPT, Excel, images)
 * - LLM: Chat dialogue generation
 * - Embedding: Vector generation for indexing and retrieval
 */

interface LLMConfig {
	baseUrl: string;
	apiKey: string;
	modelName: string;
	maxTokens?: number;
	temperature?: number;
}

interface QdrantSettings {
	enabled: boolean;
	httpPort: number;
	dataDir: string;
	autoStart: boolean;
}

interface RAGAnythingSettings {
	enabled: boolean;
	httpPort: number;
	autoStart: boolean;
}

interface EmbeddingSettings {
	provider: 'openai' | 'dashscope' | 'ollama';
	model: string;
	dimension: number;
	endpoint: string;
	apiKey: string;
}

interface ExternalLibrarySettings {
	enabled: boolean;
	rawFolderPath: string;
	embedding: EmbeddingSettings;
	qdrant: QdrantSettings;
	ragAnything: RAGAnythingSettings;
}

interface SmartRAGSettings {
	chatLLM: LLMConfig;
	lightRAGServerUrl: string;
	externalLibrary: ExternalLibrarySettings;
}

const DEFAULT_SETTINGS: SmartRAGSettings = {
	chatLLM: {
		baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
		apiKey: 'sk-sp-5dd6c4a0e3a545e0920e147687ca685a',
		modelName: 'glm-5',
		maxTokens: 4096,
		temperature: 0.7
	},
	lightRAGServerUrl: 'http://127.0.0.1:9621',
	externalLibrary: {
		enabled: true,
		rawFolderPath: '',
		embedding: {
			provider: 'openai',
			model: 'text-embedding-3-small',
			dimension: 1536,
			endpoint: 'https://api.openai.com/v1',
			apiKey: ''
		},
		qdrant: {
			enabled: true,
			httpPort: 6333,
			dataDir: PlatformManager.getDefaultQdrantDataDir(),
			autoStart: true
		},
		ragAnything: {
			enabled: true,
			httpPort: 8000,
			autoStart: true
		}
	}
};

export default class SmartRAGPlugin extends Plugin {
	settings!: SmartRAGSettings;
	statusBarItem!: HTMLElement;
	statusCheckInterval!: number;

	// v1.0.0 new components
	qdrantManager: QdrantManager | null = null;
	qdrantClient: QdrantClientWrapper | null = null;
	ragAnythingManager: RAGAnythingManager | null = null;
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

		this.addCommand({
			id: 'index-vault',
			name: 'Index Entire Vault',
			callback: () => this.indexVault()
		});

		this.addCommand({
			id: 'index-raw-folder',
			name: 'Index Raw Folder',
			callback: () => this.indexRawFolder()
		});

		// Add status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText('RAG: Checking...');
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
	 * Initialize v1.0.0 components (Qdrant, RAG-Anything, Indexing, Query)
	 */
	async initializeV1(): Promise<void> {
		const extLib = this.settings.externalLibrary;

		// Initialize Qdrant
		this.qdrantManager = new QdrantManager(extLib.qdrant);
		this.qdrantClient = new QdrantClientWrapper(`http://127.0.0.1:${extLib.qdrant.httpPort}`);

		// Initialize RAG-Anything
		this.ragAnythingManager = new RAGAnythingManager(extLib.ragAnything);

		// Auto-start services if configured
		if (extLib.enabled && extLib.qdrant.autoStart) {
			await this.startExternalServices();
		}

		// Initialize Qdrant client and collections
		if (await this.qdrantManager?.isRunning()) {
			await this.qdrantClient?.initialize();
			await this.qdrantClient?.createCollections(extLib.embedding.dimension);
			this.collectionStats = await this.qdrantClient?.getAllStats() || {};
		}

		// Initialize Indexing Engine
		this.indexingEngine = new IndexingEngine(this.app, this.qdrantClient!, {
			embeddingModel: extLib.embedding.model,
			embeddingDimension: extLib.embedding.dimension,
			embeddingEndpoint: extLib.embedding.endpoint,
			embeddingApiKey: extLib.embedding.apiKey,
			rawFolderPath: extLib.rawFolderPath || undefined,
			ragAnythingUrl: `http://127.0.0.1:${extLib.ragAnything.httpPort}`,
		});

		// Initialize Query Engine
		const llmProvider = {
			generate: async (prompt: string) => {
				const response = await fetch(`${this.settings.chatLLM.baseUrl}/chat/completions`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.settings.chatLLM.apiKey}`,
					},
					body: JSON.stringify({
						model: this.settings.chatLLM.modelName,
						messages: [{ role: 'user', content: prompt }],
						max_tokens: this.settings.chatLLM.maxTokens || 4096,
						temperature: this.settings.chatLLM.temperature || 0.7,
					}),
				});

				if (!response.ok) {
					throw new Error(`LLM API error: ${response.status}`);
				}

				const data = await response.json();
				return data.choices[0]?.message?.content || 'No response generated.';
			}
		};

		this.queryEngine = new QueryEngine(this.qdrantClient!, llmProvider, {
			endpoint: extLib.embedding.endpoint,
			model: extLib.embedding.model,
			apiKey: extLib.embedding.apiKey,
		});
	}

	onunload() {
		// Clear interval
		if (this.statusCheckInterval) {
			window.clearInterval(this.statusCheckInterval);
		}

		// Stop external services
		this.stopExternalServices();

		console.log('Smart RAG v1.0.0 unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(newSettings?: SmartRAGSettings) {
		if (newSettings) {
			this.settings = newSettings;
		}
		await this.saveData(this.settings);
	}

	/**
	 * Start external services (Qdrant + RAG-Anything)
	 */
	async startExternalServices(): Promise<void> {
		const extLib = this.settings.externalLibrary;

		// Start Qdrant
		if (extLib.qdrant.enabled) {
			const qdrantStarted = await this.qdrantManager?.start();
			if (qdrantStarted) {
				await this.qdrantClient?.initialize();
				await this.qdrantClient?.createCollections(extLib.embedding.dimension);
			}
		}

		// Start RAG-Anything
		if (extLib.ragAnything.enabled) {
			await this.ragAnythingManager?.start();
		}

		// Update stats
		this.collectionStats = await this.qdrantClient?.getAllStats() || {};
	}

	/**
	 * Stop external services
	 */
	async stopExternalServices(): Promise<void> {
		this.qdrantManager?.stop();
		this.ragAnythingManager?.stop();
	}

	/**
	 * Index vault
	 */
	async indexVault(): Promise<void> {
		if (this.isIndexing) {
			new Notice('Indexing already in progress');
			return;
		}

		this.isIndexing = true;
		this.indexingCancelled = false;

		this.indexingEngine?.onProgress((progress) => {
			this.indexingProgress = progress;
			this.updateStatusBar();
		});

		try {
			await this.indexingEngine?.indexVault();
			new Notice('Vault indexing complete!');
		} catch (error: any) {
			new Notice(`Indexing failed: ${error.message}`);
		} finally {
			this.isIndexing = false;
			this.indexingProgress = null;
			this.updateStatusBar();
			this.collectionStats = await this.qdrantClient?.getAllStats() || {};
		}
	}

	/**
	 * Index raw folder
	 */
	async indexRawFolder(): Promise<void> {
		if (this.isIndexing) {
			new Notice('Indexing already in progress');
			return;
		}

		if (!this.settings.externalLibrary.rawFolderPath) {
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

		if (this.isIndexing && this.indexingProgress) {
			this.statusBarItem.setText(`RAG: ${this.indexingProgress.message}`);
			this.statusBarItem.style.color = '#FFC107';
		} else if (qdrantRunning && ragRunning) {
			this.statusBarItem.setText('RAG: ● Ready');
			this.statusBarItem.style.color = '#4CAF50';
		} else if (qdrantRunning) {
			this.statusBarItem.setText('RAG: ⚠ Qdrant only');
			this.statusBarItem.style.color = '#FFC107';
		} else {
			this.statusBarItem.setText('RAG: ○ Stopped');
			this.statusBarItem.style.color = '#F44336';
		}
	}

	/**
	 * Query the RAG engine
	 */
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

	/**
	 * Get collection stats
	 */
	async getCollectionStats(): Promise<Record<string, number>> {
		return await this.qdrantClient?.getAllStats() || {};
	}

	/**
	 * Check if services are ready
	 */
	async isReady(): Promise<boolean> {
		const qdrantRunning = await this.qdrantManager?.isRunning();
		return !!qdrantRunning;
	}
}

// Settings Tab
class SmartRAGSettingTab extends PluginSettingTab {
	plugin: SmartRAGPlugin;
	currentTab: string = 'chat-llm';
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
		const tabs = [
			{ id: 'chat-llm', label: 'Chat LLM' },
			{ id: 'external', label: 'External Library' },
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

		// Content container
		const contentContainer = containerEl.createDiv('smart-rag-tab-content');

		switch (this.currentTab) {
			case 'chat-llm':
				this.renderChatLLMSettings(contentContainer);
				break;
			case 'external':
				this.renderExternalLibrarySettings(contentContainer);
				break;
		}
	}

	renderChatLLMSettings(container: HTMLElement) {
		container.createEl('h3', { text: 'Chat LLM Configuration' });

		new Setting(container)
			.setName('Base URL')
			.setDesc('OpenAI-compatible API endpoint')
			.addText(text => text
				.setPlaceholder('https://api.example.com/v1')
				.setValue(this.plugin.settings.chatLLM.baseUrl)
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.baseUrl = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('API Key')
			.setDesc('Authentication key')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(this.plugin.settings.chatLLM.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.apiKey = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Model identifier')
			.addText(text => text
				.setPlaceholder('model-name')
				.setValue(this.plugin.settings.chatLLM.modelName)
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.modelName = value;
					this.showAutoSaveBadge();
				}));
	}

	renderExternalLibrarySettings(container: HTMLElement) {
		const extLib = this.plugin.settings.externalLibrary;

		container.createEl('h3', { text: '📚 External Document Library' });

		// Enable external library
		new Setting(container)
			.setName('Enable External Library')
			.setDesc('Index and search external documents')
			.addToggle(toggle => toggle
				.setValue(extLib.enabled)
				.onChange(async (value) => {
					extLib.enabled = value;
					this.showAutoSaveBadge();
				}));

		// Raw folder path
		new Setting(container)
			.setName('Raw Folder Path')
			.setDesc('Path to external documents')
			.addText(text => text
				.setPlaceholder('/path/to/documents')
				.setValue(extLib.rawFolderPath)
				.onChange(async (value) => {
					extLib.rawFolderPath = value;
					this.showAutoSaveBadge();
				}));

		// Embedding settings
		container.createEl('hr');
		container.createEl('h4', { text: 'Embedding Configuration' });

		new Setting(container)
			.setName('Embedding Model')
			.setDesc('Model for generating embeddings')
			.addText(text => text
				.setPlaceholder('text-embedding-3-small')
				.setValue(extLib.embedding.model)
				.onChange(async (value) => {
					extLib.embedding.model = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Embedding Dimension')
			.setDesc('Vector dimension')
			.addText(text => text
				.setPlaceholder('1536')
				.setValue(String(extLib.embedding.dimension))
				.onChange(async (value) => {
					extLib.embedding.dimension = parseInt(value) || 1536;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Embedding Endpoint')
			.setDesc('URL for embedding API')
			.addText(text => text
				.setPlaceholder('https://api.openai.com/v1')
				.setValue(extLib.embedding.endpoint)
				.onChange(async (value) => {
					extLib.embedding.endpoint = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Embedding API Key')
			.setDesc('API key for embedding service')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(extLib.embedding.apiKey)
				.onChange(async (value) => {
					extLib.embedding.apiKey = value;
					this.showAutoSaveBadge();
				}));

		// Qdrant settings
		container.createEl('hr');
		container.createEl('h4', { text: '⚙️ Qdrant Settings' });

		new Setting(container)
			.setName('Qdrant HTTP Port')
			.setDesc('Port for Qdrant HTTP API')
			.addText(text => text
				.setPlaceholder('6333')
				.setValue(String(extLib.qdrant.httpPort))
				.onChange(async (value) => {
					extLib.qdrant.httpPort = parseInt(value) || 6333;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Qdrant Data Directory')
			.setDesc('Directory for Qdrant storage')
			.addText(text => text
				.setPlaceholder('~/.openclaw/smart-rag/qdrant-data')
				.setValue(extLib.qdrant.dataDir)
				.onChange(async (value) => {
					extLib.qdrant.dataDir = value;
					this.showAutoSaveBadge();
				}));

		// RAG-Anything settings
		container.createEl('hr');
		container.createEl('h4', { text: '🔧 RAG-Anything Settings' });

		new Setting(container)
			.setName('RAG-Anything HTTP Port')
			.setDesc('Port for RAG-Anything service')
			.addText(text => text
				.setPlaceholder('8000')
				.setValue(String(extLib.ragAnything.httpPort))
				.onChange(async (value) => {
					extLib.ragAnything.httpPort = parseInt(value) || 8000;
					this.showAutoSaveBadge();
				}));

		// Service status
		container.createEl('hr');
		container.createEl('h4', { text: '📊 Service Status' });

		const statusEl = container.createDiv('smart-rag-service-status');
		statusEl.setText('Checking...');

		const updateStatus = async () => {
			const qdrantRunning = await this.plugin.qdrantManager?.isRunning();
			const ragRunning = await this.plugin.ragAnythingManager?.isRunning();
			const stats = this.plugin.collectionStats;

			statusEl.innerHTML = `
				<div style="margin-bottom: 8px;">
					<strong>Qdrant:</strong> <span style="color: ${qdrantRunning ? '#4CAF50' : '#F44336'}">
						${qdrantRunning ? '● Running' : '○ Stopped'}
					span>
				</div>
				<div style="margin-bottom: 8px;">
					<strong>RAG-Anything:</strong> <span style="color: ${ragRunning ? '#4CAF50' : '#F44336'}">
						${ragRunning ? '● Running' : '○ Stopped'}
					span>
				</div>
				<div style="margin-bottom: 8px;">
					<strong>Index Stats:</strong>
					<ul style="margin: 4px 0; padding-left: 20px;">
						<li>Vault Notes: ${stats['vault_notes'] || 0}</li>
						<li>Raw Documents: ${stats['raw_documents'] || 0}</li>
						<li>Images: ${stats['images'] || 0}</li>
					ul>
				</div>
			`;
		};

		updateStatus();
		setInterval(updateStatus, 5000);

		// Service controls
		new Setting(container)
			.setName('Service Controls')
			.setDesc('Start or stop services')
			.addButton(btn => btn
				.setButtonText('Start Services')
				.setCta()
				.onClick(async () => {
					try {
						await this.plugin.startExternalServices();
						new Notice('Services started!');
						updateStatus();
					} catch (error: any) {
						new Notice(`Failed: ${error.message}`);
					}
				}))
			.addButton(btn => btn
				.setButtonText('Stop Services')
				.setWarning()
				.onClick(async () => {
					await this.plugin.stopExternalServices();
					new Notice('Services stopped!');
					updateStatus();
				}));

		// Indexing controls
		container.createEl('hr');
		container.createEl('h4', { text: '📝 Indexing Controls' });

		// Progress
		if (this.plugin.isIndexing && this.plugin.indexingProgress) {
			const p = this.plugin.indexingProgress;
			container.createEl('p', { text: p.message });
			container.createEl('p', { text: `Current: ${p.currentFile}` });
		}

		new Setting(container)
			.setName('Index Vault')
			.setDesc('Index all Markdown files in vault')
			.addButton(btn => btn
				.setButtonText('Index Vault')
				.setCta()
				.setDisabled(this.plugin.isIndexing)
				.onClick(async () => {
					await this.plugin.indexVault();
					updateStatus();
				}));

		new Setting(container)
			.setName('Index Raw Folder')
			.setDesc('Index external documents')
			.addButton(btn => btn
				.setButtonText('Index Raw Folder')
				.setCta()
				.setDisabled(this.plugin.isIndexing)
				.onClick(async () => {
					await this.plugin.indexRawFolder();
					updateStatus();
				}));
	}
}
