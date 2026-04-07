import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';

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

		console.log('Smart RAG plugin loaded - v0.1.0-skeleton');
	}

	onunload() {
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
				this.renderEmbeddingSettings(contentContainer);
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
			.setDesc('Check if LightRAG server is running on port 9621');

		const statusEl = statusSetting.settingEl.createDiv('smart-rag-server-status');
		statusEl.setText('Checking...');
		
		// Check server status
		this.checkLightRAGServerStatus().then(status => {
			if (status.running) {
				statusEl.setText('● Running');
				statusEl.style.color = 'green';
			} else {
				statusEl.setText('○ Stopped');
				statusEl.style.color = 'red';
			}
		});

		// Start/Stop buttons
		const buttonContainer = container.createDiv('smart-rag-server-buttons');
		
		const startButton = buttonContainer.createEl('button', {
			text: 'Start Server',
			cls: 'mod-cta'
		});
		startButton.onclick = async () => {
			try {
				await this.startLightRAGServer();
				new Notice('LightRAG server started!');
				this.display(); // Refresh status
			} catch (error) {
				new Notice(`Failed to start server: ${error.message}`);
			}
		};

		const stopButton = buttonContainer.createEl('button', {
			text: 'Stop Server',
			cls: 'mod-warning'
		});
		stopButton.onclick = async () => {
			try {
				await this.stopLightRAGServer();
				new Notice('LightRAG server stopped!');
				this.display(); // Refresh status
			} catch (error) {
				new Notice(`Failed to stop server: ${error.message}`);
			}
		};

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

	async checkLightRAGServerStatus(): Promise<{running: boolean}> {
		try {
			const response = await fetch('http://127.0.0.1:9621/health');
			return { running: response.ok };
		} catch (error) {
			return { running: false };
		}
	}

	async startLightRAGServer(): Promise<void> {
		// Execute start script
		const workingDir = this.plugin.settings.lightRAGWorkingDir.replace('~', process.env.HOME || '');
		const startScript = `${workingDir}/start-lightrag.sh`;
		
		// In a real implementation, this would use Node.js child_process
		// For now, we'll simulate it
		console.log(`Starting LightRAG server with script: ${startScript}`);
		
		// Simulate server start delay
		await new Promise(resolve => setTimeout(resolve, 2000));
	}

	async stopLightRAGServer(): Promise<void> {
		// Kill LightRAG server process
		// In a real implementation, this would use Node.js child_process
		// For now, we'll simulate it
		console.log('Stopping LightRAG server (pkill -f lightrag_server)');
		
		// Simulate server stop delay
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
}