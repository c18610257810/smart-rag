import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConnectionTester } from './services/connectionTester';
import { DatabaseService } from './services/database';
import { EmbeddingService } from './services/embedding';
import { ChunkingService } from './services/chunking';
import { ChatView } from './ChatView';
import { CHAT_VIEW_TYPE } from './constants';
import { RAGEngine } from './contexts/rag-context';
import { ErrorModal } from './ui/ErrorModal';
import { DatabaseManager } from './database/DatabaseManager';

const execAsync = promisify(exec);
const connectionTester = new ConnectionTester();

/**
 * Smart RAG - Semantic RAG for Obsidian Vault
 * Version: 0.1.0-skeleton (Phase 1: Minimum Skeleton)
 * 
 * Architecture:
 * - Chat LLM: User dialogue generation
 * - LightRAG LLM: Internal LightRAG processing
 * - Semantic Chunk LLM: Text semantic chunking
 * - LightRAG Embedding: Vectorization
 * 
 * Each LLM config: URL, API Key, model name, max token, temperature
 */

interface LLMConfig {
	baseUrl: string;
	apiKey: string;
	modelName: string;
	maxTokens?: number;
	temperature?: number;
}

interface SmartRAGSettings {
	chatLLM: LLMConfig;
	lightRAGLLM: LLMConfig;
	semanticChunkLLM: LLMConfig;
	lightRAGEmbedding: {
		baseUrl: string;
		modelName: string;
		dimension?: number;
	};
	lightRAGWorkingDir: string;
	lightRAGServerUrl: string;  // LightRAG server URL (local or remote via Tailscale)
}

const DEFAULT_SETTINGS: SmartRAGSettings = {
	chatLLM: {
		baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
		apiKey: 'sk-sp-5dd6c4a0e3a545e0920e147687ca685a',
		modelName: 'glm-5',
		maxTokens: 2048,
		temperature: 0.7
	},
	lightRAGLLM: {
		baseUrl: 'https://api.longcat.chat/openai/v1',
		apiKey: 'ak_2pT3ly6Ix7iM56T7f37eq1It5fR2G',
		modelName: 'LongCat-Flash-Lite'
	},
	semanticChunkLLM: {
		baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
		apiKey: 'sk-sp-5dd6c4a0e3a545e0920e147687ca685a',
		modelName: 'glm-5',
		maxTokens: 1024,
		temperature: 0.1
	},
	lightRAGEmbedding: {
		baseUrl: 'http://127.0.0.1:1234',
		modelName: 'text-embedding-bge-m3',
		dimension: 1024
	},
	lightRAGWorkingDir: '~/.openclaw/lightrag-data',
	lightRAGServerUrl: 'http://127.0.0.1:9621'  // Default: local LightRAG server
};

export default class SmartRAGPlugin extends Plugin {
	settings!: SmartRAGSettings;
	statusBarItem!: HTMLElement;
	statusCheckInterval!: number;
	private databaseManager: DatabaseManager | null = null;
	private databaseService: DatabaseService | null = null;
	private settingsChangeListeners: Set<() => void> = new Set();
	private embeddingService: EmbeddingService | null = null;
	private chunkingService: ChunkingService | null = null;

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

		// Register command: Open chat panel
		this.addCommand({
			id: 'open-chat-panel',
			name: 'Open Chat Panel',
			callback: () => {
				this.openChatView();
			}
		});

		// Register command: Index current file
		this.addCommand({
			id: 'index-current-file',
			name: 'Index Current File',
			callback: async () => {
				await this.indexCurrentFile();
			}
		});

		// Register command: Index entire vault
		this.addCommand({
			id: 'index-vault',
			name: 'Index Entire Vault',
			callback: async () => {
				await this.indexVault();
			}
		});

		// Add status bar item for LightRAG Server status
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText('RAG: Checking...');
		this.updateStatusBar();

		// Auto-refresh status every 5 seconds
		this.statusCheckInterval = window.setInterval(() => {
			this.updateStatusBar();
		}, 5000);

		// Initialize local vector database (PGlite 0.4.3 + vector extension)
		// ESM compatibility handled by import-meta-url-shim.js
		try {
			this.databaseManager = await DatabaseManager.create(this.app);
			console.log('Smart RAG database initialized (PGlite 0.4.3 + vector)');
		} catch (error) {
			console.error('Failed to initialize database:', error);
			// Plugin can still work with LightRAG server if local DB fails
		}

		console.log('Smart RAG plugin loaded - v0.3.5-index');
	}

	onunload() {
		// Clear interval
		if (this.statusCheckInterval) {
			window.clearInterval(this.statusCheckInterval);
		}
		// Close local vector database
		if (this.databaseManager) {
			this.databaseManager.cleanup();
		}
		// Close database service (legacy)
		if (this.databaseService) {
			this.databaseService.close();
		}
		console.log('Smart RAG plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Save settings (with optional new values)
	 */
	async saveSettings(newSettings?: SmartRAGSettings) {
		if (newSettings) {
			this.settings = newSettings;
		}
		await this.saveData(this.settings);
		// Notify listeners
		this.settingsChangeListeners.forEach(listener => listener());
	}

	/**
	 * Add a settings change listener
	 */
	addSettingsChangeListener(listener: () => void): () => void {
		this.settingsChangeListeners.add(listener);
		return () => {
			this.settingsChangeListeners.delete(listener);
		};
	}

	/**
	 * Get database service instance
	 */
	getDatabaseManager(): DatabaseManager | null {
		return this.databaseManager;
	}

	/**
	 * Get database service instance (for embedding storage)
	 * Lazy initialization - only creates database when needed
	 */
	async getDatabaseService(): Promise<DatabaseService | null> {
		if (!this.databaseService) {
			this.databaseService = new DatabaseService();
			try {
				await this.databaseService.initialize();
				console.log('Database service initialized on demand');
			} catch (error) {
				console.error('Failed to initialize database service:', error);
				this.databaseService = null;
				return null;
			}
		}
		return this.databaseService;
	}

	/**
	 * Get RAG engine instance
	 */
	getRAGEngine(): RAGEngine | null {
		// Return a simple object that implements the RAG interface
		// This will be wrapped in a Promise by ChatView.tsx
		return {
			serverUrl: this.settings.lightRAGServerUrl,
			settings: {
				embeddingModelId: 'default',
				enableAutoStartServer: false,
				ragOptions: {
					thresholdTokens: 1000,
				},
			} as any,
			app: this.app,
		} as any;
	}

	async openChatView() {
		// Check if view already exists
		const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing.length > 0) {
			// Focus existing view
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		// Create new view in right sidebar
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
		const status = await this.checkLightRAGServerStatus();
		switch (status.status) {
			case 'running':
				this.statusBarItem.setText('RAG: ● Running');
				this.statusBarItem.style.color = '#4CAF50';
				break;
			case 'busy':
				this.statusBarItem.setText('RAG: ● Busy');
				this.statusBarItem.style.color = '#FFC107';
				break;
			case 'stopped':
				this.statusBarItem.setText('RAG: ○ Stopped');
				this.statusBarItem.style.color = '#F44336';
				break;
		}
	}

	async checkLightRAGServerStatus(): Promise<{status: 'running' | 'busy' | 'stopped'}> {
		try {
			// 先检查进程是否存在
			const { stdout } = await execAsync('ps aux | grep -v grep | grep lightrag-server');
			if (!stdout.trim()) {
				return { status: 'stopped' };
			}

			// 进程存在，检查健康状态
			try {
				const response = await fetch(`${this.settings.lightRAGServerUrl}/health`);
				if (response.ok) {
					const data = await response.json();
					// 如果 health API 返回 busy 状态
					if (data.status === 'busy' || data.processing) {
						return { status: 'busy' };
					}
					return { status: 'running' };
				}
				return { status: 'stopped' };
			} catch (fetchError) {
				// 进程存在但无法访问 API，可能正在启动中
				return { status: 'busy' };
			}
		} catch (error) {
			// 进程不存在
			return { status: 'stopped' };
		}
	}

	async writeLightRAGConfig(): Promise<void> {
		// 配置文件路径必须与启动脚本一致
		const configPath = '/Users/frankzhang/.openclaw/workspace/tools/lightrag-manager/lightrag-config.json';
		
		// 从用户设置生成配置
		const config = {
			server: {
				host: '127.0.0.1',
				port: 9621,
				working_dir: this.settings.lightRAGWorkingDir.replace('~', process.env.HOME || '')
			},
			options: {
				log_level: 'INFO',
				max_async: 4,
				timeout: 1200,
				chunking_strategy: 'semantic'
			},
			llm: {
				base_url: this.settings.lightRAGLLM.baseUrl,
				api_key_env: this.settings.lightRAGLLM.apiKey, // 启动脚本读取 api_key_env
				model: this.settings.lightRAGLLM.modelName,
				provider: 'custom',
				binding: 'openai',
				temperature: 0.1,
				max_tokens: this.settings.lightRAGLLM.maxTokens || 2048
			},
			embedding: {
				base_url: this.settings.lightRAGEmbedding.baseUrl,
				api_key_env: 'lm-studio', // Embedding 通常不需要 API key
				model: this.settings.lightRAGEmbedding.modelName,
				provider: 'custom',
				binding: 'openai',
				dimension: this.settings.lightRAGEmbedding.dimension || 1024
			}
		};

		// 写入配置文件
		// @ts-ignore
		const fs = window.require('fs');
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		console.log('LightRAG config written:', configPath);
		console.log('Config:', JSON.stringify(config, null, 2));
	}

	async startLightRAGServer(): Promise<void> {
		// 先写入配置
		await this.writeLightRAGConfig();
		
		// LightRAG 启动脚本路径
		const startScript = '/Users/frankzhang/.openclaw/workspace/tools/lightrag-manager/start-lightrag.sh';
		
		try {
			// 执行启动脚本
			const { stdout, stderr } = await execAsync(`bash "${startScript}"`);
			console.log('LightRAG Server started:', stdout);
			if (stderr) {
				console.warn('LightRAG Server stderr:', stderr);
			}
		} catch (error: any) {
			console.error('Failed to start LightRAG Server:', error);
			throw error;
		}
	}

	/**
	 * Index current file
	 */
	async indexCurrentFile(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file to index');
			return;
		}

		try {
			new Notice(`Indexing ${activeFile.name}...`);

			// Read file content
			const content = await this.app.vault.read(activeFile);

			// Send to LightRAG Server
			const response = await fetch(`${this.settings.lightRAGServerUrl}/documents/texts`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					texts: [content],
				}),
			});

			if (!response.ok) {
				throw new Error(`LightRAG server error: ${response.status}`);
			}

			const result = await response.json();
			new Notice(`✅ Indexed ${activeFile.name}`);
			console.log('Index result:', result);
		} catch (error) {
			console.error('Failed to index file:', error);
			new Notice(`❌ Failed to index: ${error instanceof Error ? error.message : String(error)}`);
			}
	}

	/**
	 * Index entire vault using LightRAG Server
	 */
	async indexVault(): Promise<void> {
		try {
			new Notice('Indexing entire vault... This may take a while.');

			const files = this.app.vault.getMarkdownFiles();
			let successCount = 0;
			let failCount = 0;

			for (const file of files) {
				try {
					const content = await this.app.vault.read(file);

					// Send to LightRAG Server
					const response = await fetch(`${this.settings.lightRAGServerUrl}/documents/texts`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							texts: [content],
						}),
					});

					if (response.ok) {
						successCount++;
					} else {
						failCount++;
						console.warn(`Failed to index ${file.path}: ${response.status}`);
					}
				} catch (error) {
					failCount++;
					console.error(`Error indexing ${file.path}:`, error);
				}
			}

			new Notice(`✅ Indexed ${successCount} files, ${failCount} failed`);
		} catch (error) {
			console.error('Failed to index vault:', error);
			new Notice(`❌ Failed to index vault: ${error instanceof Error ? error.message : String(error)}`);
			}
	}

	/**
	 * Get database statistics from LightRAG Server
	 */
	async getDatabaseStats(): Promise<{ documentsCount: number; chunksCount: number } | null> {
		try {
			const response = await fetch(`${this.settings.lightRAGServerUrl}/health`);
			if (!response.ok) {
				return null;
			}
			const result = await response.json();
			return {
				documentsCount: result.documentCount || 0,
				chunksCount: result.chunkCount || 0
			};
		} catch (error) {
			console.error('Failed to get database stats:', error);
			return null;
		}
	}

	async stopLightRAGServer(): Promise<void> {
		try {
			// 停止 LightRAG 服务器进程
			await execAsync('pkill -f lightrag-server');
			console.log('LightRAG Server stopped');
		} catch (error: any) {
			// pkill 如果没有找到进程会返回错误，这是正常的
			console.log('No LightRAG Server process found or already stopped');
		}
	}
}

class SmartRAGSettingTab extends PluginSettingTab {
	plugin: SmartRAGPlugin;
	currentTab: string = 'chat-llm';
	autoSaveTimeout: number | null = null;

	constructor(app: App, plugin: SmartRAGPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Show auto-save badge after input change
		 * Auto-saves settings after 1 second of no changes
		 */
	showAutoSaveBadge(): void {
		// Clear previous timeout
		if (this.autoSaveTimeout) {
			window.clearTimeout(this.autoSaveTimeout);
		}

		// Auto-save after 1 second
		this.autoSaveTimeout = window.setTimeout(async () => {
			await this.plugin.saveSettings();
			new Notice('✓ Auto-saved', 2000);
			this.autoSaveTimeout = null;
		}, 1000);
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.createEl('h2', {text: 'Smart RAG Settings'});

		// Create tab navigation
		const tabContainer = containerEl.createDiv('smart-rag-tabs');
		const tabs = [
			{ id: 'chat-llm', label: 'Chat LLM' },
			{ id: 'lightrag-llm', label: 'LightRAG LLM' },
			{ id: 'chunk-llm', label: 'Semantic Chunk' },
			{ id: 'embedding', label: 'LightRAG Embedding' }
		];

		const tabButtons: HTMLButtonElement[] = [];
		tabs.forEach(tab => {
			const button = tabContainer.createEl('button', {
				text: tab.label,
				cls: 'smart-rag-tab-button'
			});
			button.onclick = () => {
				this.currentTab = tab.id;
				this.display();
			};
			if (this.currentTab === tab.id) {
				button.addClass('smart-rag-tab-active');
			}
			tabButtons.push(button);
		});

		// Create content container
		const contentContainer = containerEl.createDiv('smart-rag-tab-content');

		// Display current tab content
		switch (this.currentTab) {
			case 'chat-llm':
				this.renderChatLLMSettings(contentContainer);
				break;
			case 'lightrag-llm':
				this.renderLightRAGLLMSettings(contentContainer);
				break;
			case 'chunk-llm':
				this.renderSemanticChunkSettings(contentContainer);
				break;
			case 'embedding':
				this.renderEmbeddingSettings(containerEl); // Use containerEl instead of contentContainer for proper setting integration
				break;
		}

		// Save button
		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('Save Settings')
				.setCta()
				.onClick(async () => {
					await this.plugin.saveSettings();
					new Notice('Settings saved!');
				}));
	}

	renderChatLLMSettings(container: HTMLElement) {
		container.createEl('h3', {text: 'Chat LLM Configuration'});
		
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
			.setDesc('Authentication key for the API')
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

		new Setting(container)
			.setName('Max Tokens')
			.setDesc('Maximum tokens for response')
			.addText(text => text
				.setPlaceholder('2048')
				.setValue(String(this.plugin.settings.chatLLM.maxTokens || ''))
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.maxTokens = value ? parseInt(value) : undefined;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Temperature')
			.setDesc('Response randomness (0.0-1.0)')
			.addText(text => text
				.setPlaceholder('0.7')
				.setValue(String(this.plugin.settings.chatLLM.temperature || ''))
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.temperature = value ? parseFloat(value) : undefined;
					this.showAutoSaveBadge();
				}));

		// Test Connection button
		new Setting(container)
			.setName('Connection Test')
			.setDesc('Test connection to Chat LLM API')
			.addButton(btn => btn
				.setButtonText('Test Connection')
				.onClick(async () => {
					btn.setButtonText('Testing...');
					btn.setDisabled(true);
					
					const result = await connectionTester.testLLMConnection(
						this.plugin.settings.chatLLM.baseUrl,
						this.plugin.settings.chatLLM.apiKey,
						this.plugin.settings.chatLLM.modelName
					);
					
					btn.setButtonText('Test Connection');
					btn.setDisabled(false);
					
					if (result.success) {
						new Notice(`✅ ${result.message}\nModel: ${result.details?.model}\nResponse time: ${result.details?.responseTime}ms`, 5000);
					} else {
						new Notice(`❌ ${result.message}\nError: ${result.details?.error}`, 8000);
					}
				}));
	}

	renderLightRAGLLMSettings(container: HTMLElement) {
		container.createEl('h3', {text: 'LightRAG LLM Configuration'});
		
		new Setting(container)
			.setName('Base URL')
			.setDesc('OpenAI-compatible API endpoint for LightRAG internal processing')
			.addText(text => text
				.setPlaceholder('https://api.example.com/v1')
				.setValue(this.plugin.settings.lightRAGLLM.baseUrl)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGLLM.baseUrl = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('API Key')
			.setDesc('Authentication key for the API')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(this.plugin.settings.lightRAGLLM.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGLLM.apiKey = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Model identifier')
			.addText(text => text
				.setPlaceholder('model-name')
				.setValue(this.plugin.settings.lightRAGLLM.modelName)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGLLM.modelName = value;
					this.showAutoSaveBadge();
				}));

		// Test Connection button
		new Setting(container)
			.setName('Connection Test')
			.setDesc('Test connection to LightRAG LLM API')
			.addButton(btn => btn
				.setButtonText('Test Connection')
				.onClick(async () => {
					btn.setButtonText('Testing...');
					btn.setDisabled(true);
					
					const result = await connectionTester.testLLMConnection(
						this.plugin.settings.lightRAGLLM.baseUrl,
						this.plugin.settings.lightRAGLLM.apiKey,
						this.plugin.settings.lightRAGLLM.modelName
					);
					
					btn.setButtonText('Test Connection');
					btn.setDisabled(false);
					
					if (result.success) {
						new Notice(`✅ ${result.message}\nModel: ${result.details?.model}\nResponse time: ${result.details?.responseTime}ms`, 5000);
					} else {
						new Notice(`❌ ${result.message}\nError: ${result.details?.error}`, 8000);
					}
				}));
	}

	renderSemanticChunkSettings(container: HTMLElement) {
		container.createEl('h3', {text: 'Semantic Chunk LLM Configuration'});
		
		new Setting(container)
			.setName('Base URL')
			.setDesc('OpenAI-compatible API endpoint for semantic text chunking')
			.addText(text => text
				.setPlaceholder('https://api.example.com/v1')
				.setValue(this.plugin.settings.semanticChunkLLM.baseUrl)
				.onChange(async (value) => {
					this.plugin.settings.semanticChunkLLM.baseUrl = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('API Key')
			.setDesc('Authentication key for the API')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(this.plugin.settings.semanticChunkLLM.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.semanticChunkLLM.apiKey = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Model identifier')
			.addText(text => text
				.setPlaceholder('model-name')
				.setValue(this.plugin.settings.semanticChunkLLM.modelName)
				.onChange(async (value) => {
					this.plugin.settings.semanticChunkLLM.modelName = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Max Tokens')
			.setDesc('Maximum tokens for chunking analysis (1024 recommended)')
			.addText(text => text
				.setPlaceholder('1024')
				.setValue(String(this.plugin.settings.semanticChunkLLM.maxTokens || ''))
				.onChange(async (value) => {
					this.plugin.settings.semanticChunkLLM.maxTokens = value ? parseInt(value) : undefined;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Temperature')
			.setDesc('Determinism for chunking (0.1-0.3 recommended for stable results)')
			.addText(text => text
				.setPlaceholder('0.1')
				.setValue(String(this.plugin.settings.semanticChunkLLM.temperature || ''))
				.onChange(async (value) => {
					this.plugin.settings.semanticChunkLLM.temperature = value ? parseFloat(value) : undefined;
					this.showAutoSaveBadge();
				}));

		// Test Connection button
		new Setting(container)
			.setName('Connection Test')
			.setDesc('Test connection to Semantic Chunk LLM API')
			.addButton(btn => btn
				.setButtonText('Test Connection')
				.onClick(async () => {
					btn.setButtonText('Testing...');
					btn.setDisabled(true);
					
					const result = await connectionTester.testLLMConnection(
						this.plugin.settings.semanticChunkLLM.baseUrl,
						this.plugin.settings.semanticChunkLLM.apiKey,
						this.plugin.settings.semanticChunkLLM.modelName
					);
					
					btn.setButtonText('Test Connection');
					btn.setDisabled(false);
					
					if (result.success) {
						new Notice(`✅ ${result.message}\nModel: ${result.details?.model}\nResponse time: ${result.details?.responseTime}ms`, 5000);
					} else {
						new Notice(`❌ ${result.message}\nError: ${result.details?.error}`, 8000);
					}
				}));
	}

	renderEmbeddingSettings(container: HTMLElement) {
		container.createEl('h3', {text: 'LightRAG Embedding Configuration'});
		
		new Setting(container)
			.setName('Base URL')
			.setDesc('Embedding API endpoint (e.g., LM Studio)')
			.addText(text => text
				.setPlaceholder('http://127.0.0.1:1234')
				.setValue(this.plugin.settings.lightRAGEmbedding.baseUrl)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGEmbedding.baseUrl = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Embedding model identifier')
			.addText(text => text
				.setPlaceholder('text-embedding-bge-m3')
				.setValue(this.plugin.settings.lightRAGEmbedding.modelName)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGEmbedding.modelName = value;
					this.showAutoSaveBadge();
				}));

		new Setting(container)
			.setName('Dimension')
			.setDesc('Vector dimension (e.g., 1024 for BGE-M3)')
			.addText(text => text
				.setPlaceholder('1024')
				.setValue(String(this.plugin.settings.lightRAGEmbedding.dimension || ''))
				.onChange(async (value) => {
					this.plugin.settings.lightRAGEmbedding.dimension = value ? parseInt(value) : undefined;
					this.showAutoSaveBadge();
				}));

		// Test Embedding Connection button
		new Setting(container)
			.setName('Connection Test')
			.setDesc('Test connection to Embedding API')
			.addButton(btn => btn
				.setButtonText('Test Connection')
				.onClick(async () => {
					btn.setButtonText('Testing...');
					btn.setDisabled(true);
					
					const result = await connectionTester.testEmbeddingConnection(
						this.plugin.settings.lightRAGEmbedding.baseUrl,
						this.plugin.settings.lightRAGEmbedding.modelName
					);
					
					btn.setButtonText('Test Connection');
					btn.setDisabled(false);
					
					if (result.success) {
						new Notice(`✅ ${result.message}\n${result.details?.error}\nResponse time: ${result.details?.responseTime}ms`, 5000);
					} else {
						new Notice(`❌ ${result.message}\nError: ${result.details?.error}`, 8000);
					}
				}));

		// LightRAG Server Controls
		container.createEl('hr');
		container.createEl('h4', {text: '⚙️ LightRAG Server'});

		// LightRAG Server URL (for remote access via Tailscale)
		new Setting(container)
			.setName('Server URL')
			.setDesc('LightRAG server address. Use local (http://127.0.0.1:9621) or remote via Tailscale (http://100.x.x.x:9621)')
			.addText(text => text
				.setPlaceholder('http://127.0.0.1:9621')
				.setValue(this.plugin.settings.lightRAGServerUrl)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGServerUrl = value;
					this.showAutoSaveBadge();
				}));

		// Server status
		const statusSetting = new Setting(container)
			.setName('Server Status')
			.setDesc('LightRAG server status (auto-refresh every 5 seconds)');

		const statusEl = statusSetting.settingEl.createDiv('smart-rag-server-status');
		statusEl.setText('Checking...');
		
		// 更新状态显示的函数
		const updateStatus = async () => {
			const status = await this.plugin.checkLightRAGServerStatus();
			switch (status.status) {
				case 'running':
					statusEl.setText('● Running');
					statusEl.style.color = '#4CAF50';
					break;
				case 'busy':
					statusEl.setText('● Busy (Processing)');
					statusEl.style.color = '#FFC107';
					break;
				case 'stopped':
					statusEl.setText('○ Stopped');
					statusEl.style.color = '#F44336';
					break;
			}
		};

		// 初始检查
		updateStatus();
		
		// 定时刷新（每5秒）- 使用 window.setInterval 而不是 this.register
		const statusInterval = window.setInterval(updateStatus, 5000);

		// Start/Stop buttons using Obsidian Setting API
		new Setting(container)
			.setName('Server Controls')
			.setDesc('Start or stop the LightRAG server')
			.addButton(btn => btn
				.setButtonText('Start Server')
				.setCta()
				.onClick(async () => {
					try {
						await this.plugin.startLightRAGServer();
						new Notice('LightRAG server started!');
						updateStatus();
					} catch (error: any) {
						new Notice(`Failed to start server: ${error.message || error}`);
					}
				}))
			.addButton(btn => btn
				.setButtonText('Stop Server')
				.setWarning()
				.onClick(async () => {
					try {
						await this.plugin.stopLightRAGServer();
						new Notice('LightRAG server stopped!');
						updateStatus();
					} catch (error: any) {
						new Notice(`Failed to stop server: ${error.message || error}`);
					}
				}));

		// Working Directory
		new Setting(container)
			.setName('LightRAG Working Directory')
			.setDesc('Shared LightRAG data directory (shared with Neural Composer)')
			.addText(text => text
				.setPlaceholder('~/.openclaw/lightrag-data')
				.setValue(this.plugin.settings.lightRAGWorkingDir)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGWorkingDir = value;
				}));

		// Local Vector Indexing Section
		container.createEl('hr');
		container.createEl('h4', {text: '📊 Local Vector Indexing'});

		// Database Statistics
		const statsSetting = new Setting(container)
			.setName('Database Statistics')
			.setDesc('Number of indexed documents and chunks');

		const statsEl = statsSetting.settingEl.createDiv('smart-rag-db-stats');
		statsEl.setText('Loading...');

		// Update statistics
		const updateStats = async () => {
			const stats = await this.plugin.getDatabaseStats();
			if (stats) {
				statsEl.setText(`${stats.documentsCount} documents / ${stats.chunksCount} chunks`);
			} else {
				statsEl.setText('Database not initialized');
			}
		};
		updateStats();

		// Index Current File button
		new Setting(container)
			.setName('Index Current File')
			.setDesc('Index the currently open file (uses remote Embedding API)')
			.addButton(btn => btn
				.setButtonText('Index Current File')
				.setCta()
				.onClick(async () => {
					await this.plugin.indexCurrentFile();
					updateStats();
				}));

		// Index Entire Vault button
		new Setting(container)
			.setName('Index Entire Vault')
			.setDesc('Index all Markdown files in the vault (may take a long time)')
			.addButton(btn => btn
				.setButtonText('Index Entire Vault')
				.setWarning()
				.onClick(async () => {
					if (confirm('Indexing all files may take a long time. Continue?')) {
						await this.plugin.indexVault();
						updateStats();
					}
				}));

		// Clear Database button
		new Setting(container)
			.setName('Clear Local Database')
			.setDesc('Delete all indexed documents and chunks')
			.addButton(btn => btn
				.setButtonText('Clear Database')
				.onClick(async () => {
					if (confirm('Are you sure you want to clear the database? This cannot be undone.')) {
						const db = await this.plugin.getDatabaseService();
						if (db) {
							await db.clearDatabase();
							new Notice('Database cleared');
							updateStats();
						} else {
							new Notice('Database not initialized. Index some files first.');
						}
					}
				}));
	}
}