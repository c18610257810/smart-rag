import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

/**
 * smart RAG - Semantic RAG for Obsidian Vault
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
		this.addRibbonIcon('brain', 'smart RAG', () => {
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

		console.log('smart RAG plugin loaded - v0.1.0-skeleton');
	}

	onunload() {
		console.log('smart RAG plugin unloaded');
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

	constructor(app: App, plugin: SmartRAGPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.createEl('h2', {text: 'smart RAG Settings'});

		// Chat LLM Settings
		this.createLLMSettings(containerEl, 'Chat LLM', this.plugin.settings.chatLLM, (config) => {
			this.plugin.settings.chatLLM = config;
		});

		// LightRAG LLM Settings
		this.createLLMSettings(containerEl, 'LightRAG LLM', this.plugin.settings.lightRAGLLM, (config) => {
			this.plugin.settings.lightRAGLLM = config;
		});

		// Semantic Chunk LLM Settings
		this.createLLMSettings(containerEl, 'Semantic Chunk LLM', this.plugin.settings.semanticChunkLLM, (config) => {
			this.plugin.settings.semanticChunkLLM = config;
		});

		// LightRAG Embedding Settings
		this.createEmbeddingSettings(containerEl, 'LightRAG Embedding', this.plugin.settings.lightRAGEmbedding, (config) => {
			this.plugin.settings.lightRAGEmbedding = config;
		});

		// Working Directory
		new Setting(containerEl)
			.setName('LightRAG Working Directory')
			.setDesc('Shared LightRAG data directory (shared with Neural Composer)')
			.addText(text => text
				.setPlaceholder('~/.openclaw/lightrag-data')
				.setValue(this.plugin.settings.lightRAGWorkingDir)
				.onChange(async (value) => {
					this.plugin.settings.lightRAGWorkingDir = value;
					await this.plugin.saveSettings();
				}));

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

	createLLMSettings(containerEl: HTMLElement, name: string, config: LLMConfig, updateFn: (config: LLMConfig) => void) {
		containerEl.createEl('h3', {text: name});

		new Setting(containerEl)
			.setName('Base URL')
			.addText(text => text
				.setPlaceholder('https://api.example.com/v1')
				.setValue(config.baseUrl)
				.onChange((value) => {
					config.baseUrl = value;
					updateFn(config);
				}));

		new Setting(containerEl)
			.setName('API Key')
			.addText(text => text
				.setPlaceholder('sk-xxx')
				.setValue(config.apiKey)
				.onChange((value) => {
					config.apiKey = value;
					updateFn(config);
				}));

		new Setting(containerEl)
			.setName('Model Name')
			.addText(text => text
				.setPlaceholder('model-name')
				.setValue(config.modelName)
				.onChange((value) => {
					config.modelName = value;
					updateFn(config);
				}));

		if (config.maxTokens !== undefined) {
			new Setting(containerEl)
				.setName('Max Tokens')
				.addText(text => text
					.setPlaceholder('2048')
					.setValue(String(config.maxTokens))
					.onChange((value) => {
						config.maxTokens = parseInt(value) || undefined;
						updateFn(config);
					}));
		}

		if (config.temperature !== undefined) {
			new Setting(containerEl)
				.setName('Temperature')
				.addText(text => text
					.setPlaceholder('0.7')
					.setValue(String(config.temperature))
					.onChange((value) => {
						config.temperature = parseFloat(value) || undefined;
						updateFn(config);
					}));
		}
	}

	createEmbeddingSettings(containerEl: HTMLElement, name: string, config: {baseUrl: string; modelName: string; dimension?: number}, updateFn: (config: any) => void) {
		containerEl.createEl('h3', {text: name});

		new Setting(containerEl)
			.setName('Base URL')
			.addText(text => text
				.setPlaceholder('http://127.0.0.1:1234')
				.setValue(config.baseUrl)
				.onChange((value) => {
					config.baseUrl = value;
					updateFn(config);
				}));

		new Setting(containerEl)
			.setName('Model Name')
			.addText(text => text
				.setPlaceholder('text-embedding-bge-m3')
				.setValue(config.modelName)
				.onChange((value) => {
					config.modelName = value;
					updateFn(config);
				}));

		if (config.dimension !== undefined) {
			new Setting(containerEl)
				.setName('Dimension')
				.addText(text => text
					.setPlaceholder('1024')
					.setValue(String(config.dimension))
					.onChange((value) => {
						config.dimension = parseInt(value) || undefined;
						updateFn(config);
					}));
		}
	}
}