import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
		modelName: 'glm-5'
	},
	lightRAGEmbedding: {
		baseUrl: 'http://127.0.0.1:1234',
		modelName: 'text-embedding-bge-m3',
		dimension: 1024
	},
	lightRAGWorkingDir: '~/.openclaw/lightrag-data'
};

export default class SmartRAGPlugin extends Plugin {
	settings: SmartRAGSettings;
	statusBarItem: HTMLElement;
	statusCheckInterval: number;

	async onload() {
		await this.loadSettings();

		// Register settings tab
		this.addSettingTab(new SmartRAGSettingTab(this.app, this));

		// Add ribbon icon
		this.addRibbonIcon('brain', 'Smart RAG', () => {
			this.openChatPanel();
		});

		// Register command: Open chat panel
		this.addCommand({
			id: 'open-chat-panel',
			name: 'Open Chat Panel',
			callback: () => {
				this.openChatPanel();
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

		console.log('Smart RAG plugin loaded - v0.1.0-skeleton');
	}

	onunload() {
		// Clear interval
		if (this.statusCheckInterval) {
			window.clearInterval(this.statusCheckInterval);
		}
		console.log('Smart RAG plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	openChatPanel() {
		// Phase 1: Simple right panel + input box
		// TODO: Implement Lexical editor + multi-panel layout in Phase 4
		console.log('Chat panel opened (placeholder - Phase 1 skeleton)');
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
				const response = await fetch('http://127.0.0.1:9621/health');
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
		} catch (error) {
			console.error('Failed to start LightRAG Server:', error);
			throw error;
		}
	}

	async stopLightRAGServer(): Promise<void> {
		try {
			// 停止 LightRAG 服务器进程
			await execAsync('pkill -f lightrag-server');
			console.log('LightRAG Server stopped');
		} catch (error) {
			// pkill 如果没有找到进程会返回错误，这是正常的
			console.log('No LightRAG Server process found or already stopped');
		}
	}
}

class SmartRAGSettingTab extends PluginSettingTab {
	plugin: SmartRAGPlugin;
	currentTab: string = 'chat-llm';

	constructor(app: App, plugin: SmartRAGPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
				}));

		new Setting(container)
			.setName('API Key')
			.setDesc('Authentication key for the API')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(this.plugin.settings.chatLLM.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.apiKey = value;
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Model identifier')
			.addText(text => text
				.setPlaceholder('model-name')
				.setValue(this.plugin.settings.chatLLM.modelName)
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.modelName = value;
				}));

		new Setting(container)
			.setName('Max Tokens')
			.setDesc('Maximum tokens for response')
			.addText(text => text
				.setPlaceholder('2048')
				.setValue(String(this.plugin.settings.chatLLM.maxTokens || ''))
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.maxTokens = value ? parseInt(value) : undefined;
				}));

		new Setting(container)
			.setName('Temperature')
			.setDesc('Response randomness (0.0-1.0)')
			.addText(text => text
				.setPlaceholder('0.7')
				.setValue(String(this.plugin.settings.chatLLM.temperature || ''))
				.onChange(async (value) => {
					this.plugin.settings.chatLLM.temperature = value ? parseFloat(value) : undefined;
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
				}));

		new Setting(container)
			.setName('API Key')
			.setDesc('Authentication key for the API')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(this.plugin.settings.lightRAGLLM.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGLLM.apiKey = value;
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Model identifier')
			.addText(text => text
				.setPlaceholder('model-name')
				.setValue(this.plugin.settings.lightRAGLLM.modelName)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGLLM.modelName = value;
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
				}));

		new Setting(container)
			.setName('API Key')
			.setDesc('Authentication key for the API')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(this.plugin.settings.semanticChunkLLM.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.semanticChunkLLM.apiKey = value;
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Model identifier')
			.addText(text => text
				.setPlaceholder('model-name')
				.setValue(this.plugin.settings.semanticChunkLLM.modelName)
				.onChange(async (value) => {
					this.plugin.settings.semanticChunkLLM.modelName = value;
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
				}));

		new Setting(container)
			.setName('Model Name')
			.setDesc('Embedding model identifier')
			.addText(text => text
				.setPlaceholder('text-embedding-bge-m3')
				.setValue(this.plugin.settings.lightRAGEmbedding.modelName)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGEmbedding.modelName = value;
				}));

		new Setting(container)
			.setName('Dimension')
			.setDesc('Vector dimension (e.g., 1024 for BGE-M3)')
			.addText(text => text
				.setPlaceholder('1024')
				.setValue(String(this.plugin.settings.lightRAGEmbedding.dimension || ''))
				.onChange(async (value) => {
					this.plugin.settings.lightRAGEmbedding.dimension = value ? parseInt(value) : undefined;
				}));

		// LightRAG Server Controls
		container.createEl('hr');
		container.createEl('h4', {text: '⚙️ LightRAG Server'});

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
					} catch (error) {
						new Notice(`Failed to start server: ${error.message}`);
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
					} catch (error) {
						new Notice(`Failed to stop server: ${error.message}`);
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
	}
}