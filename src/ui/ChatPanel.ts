import { App, Modal, Notice, MarkdownRenderer } from 'obsidian';
import { LLMService, Message } from '../services/llm';
import { DatabaseService } from '../services/database';
import { EmbeddingService } from '../services/embedding';
import { ChunkingService } from '../services/chunking';
import SmartRAGPlugin from '../main';
import { ErrorModal, ErrorDetails } from './ErrorModal';

/**
 * Smart RAG Chat Panel
 * Multi-tab interface with Chat / Logs / Status tabs
 */

export class ChatPanel extends Modal {
	plugin: SmartRAGPlugin;
	llmService: LLMService;
	databaseService: DatabaseService;
	embeddingService: EmbeddingService;
	chunkingService: ChunkingService;
	messages: Message[] = [];
	containerEl!: HTMLElement;
	
	// Tab elements
	tabBarEl!: HTMLElement;
	chatTabEl!: HTMLElement;
	logsTabEl!: HTMLElement;
	statusTabEl!: HTMLElement;
	
	// Content containers
	chatContentEl!: HTMLElement;
	logsContentEl!: HTMLElement;
	statusContentEl!: HTMLElement;
	
	// Current active tab
	activeTab: 'chat' | 'logs' | 'status' = 'chat';

	// Status elements for updates
	chunkingStatusEl!: HTMLElement;
	lightRAGStatusEl!: HTMLElement;
	pgliteStatusEl!: HTMLElement;
	embeddingStatusEl!: HTMLElement;
	statsListEl!: HTMLElement;

	constructor(app: App, plugin: SmartRAGPlugin) {
		super(app);
		this.plugin = plugin;
		this.llmService = new LLMService();
		this.databaseService = new DatabaseService();
		this.embeddingService = new EmbeddingService();
		this.chunkingService = new ChunkingService();
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smart-rag-chat-panel');

		// Header
		const header = contentEl.createDiv('smart-rag-chat-header');
		header.createEl('h2', { text: 'Smart RAG' });

		// Create tab bar
		this.createTabBar(contentEl);

		// Create tab content areas
		this.chatContentEl = contentEl.createDiv('smart-rag-tab-content');
		this.logsContentEl = contentEl.createDiv('smart-rag-tab-content');
		this.statusContentEl = contentEl.createDiv('smart-rag-tab-content');

		// Initialize all tabs
		this.initChatTab();
		this.initLogsTab();
		this.initStatusTab();

		// Show initial tab (Chat)
		this.showTab('chat');

		// Initialize database
		await this.initializeDatabase();

		// Welcome message
		this.addMessage('assistant', 'Hello! I\'m Smart RAG. How can I help you today?');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	createTabBar(container: HTMLElement) {
		this.tabBarEl = container.createDiv('smart-rag-tab-bar');
		
		// Chat Tab Button
		this.chatTabEl = this.tabBarEl.createEl('button', {
			text: 'Chat',
			cls: 'smart-rag-tab-button'
		});
		this.chatTabEl.onclick = () => this.showTab('chat');

		// Logs Tab Button
		this.logsTabEl = this.tabBarEl.createEl('button', {
			text: 'Logs',
			cls: 'smart-rag-tab-button'
		});
		this.logsTabEl.onclick = () => this.showTab('logs');

		// Status Tab Button
		this.statusTabEl = this.tabBarEl.createEl('button', {
			text: 'Status',
			cls: 'smart-rag-tab-button'
		});
		this.statusTabEl.onclick = () => this.showTab('status');
	}

	showTab(tab: 'chat' | 'logs' | 'status') {
		// Update active tab state
		this.activeTab = tab;

		// Update button styles
		this.chatTabEl.removeClass('smart-rag-tab-active');
		this.logsTabEl.removeClass('smart-rag-tab-active');
		this.statusTabEl.removeClass('smart-rag-tab-active');

		if (tab === 'chat') {
			this.chatTabEl.addClass('smart-rag-tab-active');
		} else if (tab === 'logs') {
			this.logsTabEl.addClass('smart-rag-tab-active');
		} else if (tab === 'status') {
			this.statusTabEl.addClass('smart-rag-tab-active');
		}

		// Hide all content areas
		this.chatContentEl.hide();
		this.logsContentEl.hide();
		this.statusContentEl.hide();

		// Show active content area
		if (tab === 'chat') {
			this.chatContentEl.show();
		} else if (tab === 'logs') {
			this.logsContentEl.show();
		} else if (tab === 'status') {
			this.statusContentEl.show();
		}
	}

	initChatTab() {
		// Messages container
		const messagesContainer = this.chatContentEl.createDiv('smart-rag-messages');
		
		// Action buttons
		const actionButtons = this.chatContentEl.createDiv('smart-rag-action-buttons');
		
		const normalChatBtn = actionButtons.createEl('button', {
			text: 'Normal Chat',
			cls: 'mod-cta'
		});
		normalChatBtn.onclick = () => this.handleNormalChat();

		const vaultBtn = actionButtons.createEl('button', {
			text: '@Vault',
			cls: 'mod-cta'
		});
		vaultBtn.onclick = () => this.handleVaultChat();

		const clearBtn = actionButtons.createEl('button', {
			text: 'Clear'
		});
		clearBtn.onclick = () => this.clearMessages();

		// Input area
		const inputArea = this.chatContentEl.createDiv('smart-rag-input-area');
		
		const inputEl = inputArea.createEl('textarea', {
			attr: {
				placeholder: 'Type your message... (Shift+Enter for new line)',
				rows: '3'
			}
		});

		const sendButton = inputArea.createEl('button', {
			text: 'Send',
			cls: 'mod-cta'
		});
		sendButton.onclick = () => this.sendMessage(inputEl.value.trim());

		const stopButton = inputArea.createEl('button', {
			text: 'Stop'
		});
		stopButton.onclick = () => this.stopGeneration();

		// Keyboard shortcut
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage(inputEl.value.trim());
				inputEl.value = '';
			}
		});

		// Store references for later use
		(this as any).messagesContainer = messagesContainer;
		(this as any).inputEl = inputEl;
	}

	initLogsTab() {
		const logsHeader = this.logsContentEl.createDiv('smart-rag-logs-header');
		logsHeader.createEl('h3', { text: '📊 Semantic Chunking Progress' });

		const logsContainer = this.logsContentEl.createDiv('smart-rag-logs-container');

		// Register chunking progress callbacks
		this.chunkingService.onProgress((progress) => this.updateChunkingProgress(progress));

		// Status display
		this.chunkingStatusEl = logsContainer.createDiv('smart-rag-logs-status');
		this.chunkingStatusEl.setText('No active chunking operations');
	}

	initStatusTab() {
		const statusHeader = this.statusContentEl.createDiv('smart-rag-status-header');
		statusHeader.createEl('h4', { text: '⚙️ System Status' });

		const statusContainer = this.statusContentEl.createDiv('smart-rag-status-container');

		// Service Status Section
		const serviceSection = statusContainer.createDiv('smart-rag-status-section');
		const serviceTitle = serviceSection.createEl('h4', { text: 'Service Status' });

		this.lightRAGStatusEl = serviceSection.createDiv('smart-rag-status-item');
		this.lightRAGStatusEl.createEl('span', { text: 'LightRAG Server: ' });
		const lightRAGIndicator = this.lightRAGStatusEl.createEl('span', { cls: 'smart-rag-status-indicator' });
		lightRAGIndicator.setText('● Checking...');
		lightRAGIndicator.addClass('smart-rag-status-indicator');

		this.pgliteStatusEl = serviceSection.createDiv('smart-rag-status-item');
		this.pgliteStatusEl.createEl('span', { text: 'PGlite Database: ' });
		const pgliteIndicator = this.pgliteStatusEl.createEl('span', { cls: 'smart-rag-status-indicator' });
		pgliteIndicator.setText('● Pending...');
		pgliteIndicator.addClass('smart-rag-status-indicator');

		this.embeddingStatusEl = serviceSection.createDiv('smart-rag-status-item');
		this.embeddingStatusEl.createEl('span', { text: 'Embedding Service: ' });
		const embeddingIndicator = this.embeddingStatusEl.createEl('span', { cls: 'smart-rag-status-indicator' });
		embeddingIndicator.setText('● Ready');
		embeddingIndicator.addClass('smart-rag-status-indicator');

		// Statistics Section
		const statsSection = statusContainer.createDiv('smart-rag-status-section');
		const statsTitle = statsSection.createEl('h4', { text: '📊 Statistics' });

		this.statsListEl = statsSection.createEl('ul', { cls: 'smart-rag-stats-list' });
		this.statsListEl.createEl('li').setText('- Documents: Loading...');
		this.statsListEl.createEl('li').setText('- Chunks: Loading...');
		this.statsListEl.createEl('li').setText('- Vector Dimension: 1024 (BGE-M3)');

		// Operations Section
		const opsSection = statusContainer.createDiv('smart-rag-status-section');
		const opsTitle = opsSection.createEl('h4', { text: '🔄 Operations' });

		const opsButtons = opsSection.createDiv('smart-rag-status-buttons');
		const rebuildBtn = opsButtons.createEl('button', { text: 'Rebuild Index' });
		rebuildBtn.onclick = () => this.rebuildIndex();

		const clearBtn = opsButtons.createEl('button', {
			text: 'Clear Database',
			cls: 'mod-warning'
		});
		clearBtn.onclick = () => this.clearDatabase();

		// Refresh status
		this.refreshStatus();
		window.setInterval(() => this.refreshStatus(), 5000);
	}

	async refreshStatus() {
		try {
			// Refresh LightRAG status
			const lightRAGStatus = await this.plugin.checkLightRAGServerStatus();
			if (this.lightRAGStatusEl) {
				const indicator = this.lightRAGStatusEl.querySelector('.smart-rag-status-indicator');
				if (indicator) {
					if (lightRAGStatus.status === 'running') {
						indicator.setText('● Running');
						indicator.className = 'smart-rag-status-indicator ready';
					} else if (lightRAGStatus.status === 'busy') {
						indicator.setText('● Processing');
						indicator.className = 'smart-rag-status-indicator';
					} else {
						indicator.setText('○ Stopped');
						indicator.className = 'smart-rag-status-indicator error';
					}
				}
			}

			// Refresh database status
			if (this.databaseService && this.databaseService.isInitialized()) {
				const stats = await this.databaseService.getStats();
				if (this.statsListEl) {
					const items = this.statsListEl.querySelectorAll('li');
					if (items[0]) items[0].setText(`- Documents: ${stats.documentsCount}`);
					if (items[1]) items[1].setText(`- Chunks: ${stats.chunksCount}`);
				}

				// Update indicator
				if (this.pgliteStatusEl) {
					const indicator = this.pgliteStatusEl.querySelector('.smart-rag-status-indicator');
					if (indicator) {
						indicator.setText('● Ready');
						indicator.className = 'smart-rag-status-indicator ready';
					}
				}
			} else if (this.pgliteStatusEl) {
				const indicator = this.pgliteStatusEl.querySelector('.smart-rag-status-indicator');
				if (indicator) {
					indicator.setText('○ Not initialized');
					indicator.className = 'smart-rag-status-indicator';
				}
			}
		} catch (error) {
			console.error('Failed to refresh status:', error);
		}
	}

	updateChunkingProgress(progress: { file: string; totalChunks: number; processedChunks: number; status: 'pending' | 'processing' | 'completed' | 'error'; error?: string }) {
		if (this.chunkingStatusEl) {
			if (progress.status === 'completed') {
				this.chunkingStatusEl.setText(`✅ ${progress.file}: ${progress.totalChunks} chunks processed`);
			} else if (progress.status === 'error') {
				this.chunkingStatusEl.setText(`❌ ${progress.file}: ${progress.error}`);
			} else if (progress.status === 'processing') {
				this.chunkingStatusEl.setText(`⏳ ${progress.file}...`);
			} else {
				this.chunkingStatusEl.setText(`✅ ${progress.file}: ${progress.totalChunks} chunks processed`);
			}
		}
	}

	async rebuildIndex() {
		if (!this.databaseService.isInitialized()) {
			new Notice('Please initialize the database first');
			return;
		}

		new Notice('Rebuilding index...');
		try {
			await this.plugin.startLightRAGServer();
			new Notice('Index rebuilt successfully!');
			this.refreshStatus();
		} catch (error) {
			new Notice('Failed to rebuild index');
		}
	}

	async clearDatabase() {
		// Show confirmation
		if (!confirm('Are you sure you want to clear all database contents?')) {
			return;
		}

		new Notice('Clearing database...');
		try {
			await this.databaseService.clearDatabase();
			new Notice('Database cleared successfully!');
			this.refreshStatus();
		} catch (error) {
			new Notice('Failed to clear database');
		}
	}

	async sendMessage(message: string) {
		if (!message) return;

		// Clear input
		(this as any).inputEl.value = '';

		// Add user message
		this.addMessage('user', message);
		this.messages.push({ role: 'user', content: message });

		// Show loading
		const loadingEl = this.addMessage('assistant', 'Thinking...', true);

		try {
			// Call Chat LLM
			const response = await this.llmService.chat(
				this.plugin.settings.chatLLM.baseUrl,
				this.plugin.settings.chatLLM.apiKey,
				this.plugin.settings.chatLLM.modelName,
				message,
				'You are a helpful AI assistant integrated into Obsidian. Be concise and helpful.',
				this.plugin.settings.chatLLM.maxTokens,
				this.plugin.settings.chatLLM.temperature
			);

			// Remove loading message
			loadingEl.remove();

			// Add assistant message
			this.addMessage('assistant', response);
			this.messages.push({ role: 'assistant', content: response });

		} catch (error) {
			// Remove loading message
			loadingEl.remove();

			// Show error modal
			const errorDetails: ErrorDetails = {
				title: 'Failed to get response from LLM',
				message: error instanceof Error ? error.message : String(error),
				errorType: 'api',
				timestamp: new Date().toISOString(),
				stackTrace: error instanceof Error ? error.stack : undefined,
				suggestion: 'Check your API key and base URL in settings.'
			};

			new ErrorModal(this.app, errorDetails, () => {
				// Retry the same message
				this.sendMessage(message);
			}).open();
		}
	}

	addMessage(role: 'user' | 'assistant', content: string, isLoading: boolean = false): HTMLElement {
		const messagesContainer = (this as any).messagesContainer;
		const messageEl = messagesContainer.createDiv(`smart-rag-message smart-rag-message-${role}`);
		
		const roleEl = messageEl.createDiv('smart-rag-message-role');
		roleEl.setText(role === 'user' ? '👤 You' : '🤖 Assistant');

		const contentEl = messageEl.createDiv('smart-rag-message-content');
		
		if (isLoading) {
			contentEl.setText(content);
			messageEl.addClass('smart-rag-message-loading');
		} else {
			// Render Markdown for assistant messages
			if (role === 'assistant') {
				MarkdownRenderer.render(
					this.app,
					content,
					contentEl,
					'',
					this.plugin
				);
			} else {
				contentEl.setText(content);
			}
		}

		// Scroll to bottom
		messagesContainer.scrollTop = messagesContainer.scrollHeight;

		return messageEl;
	}

	clearMessages() {
		this.messages = [];
		const messagesContainer = (this as any).messagesContainer;
		messagesContainer.empty();
		this.addMessage('assistant', 'Chat cleared. How can I help you?');
	}

	handleNormalChat() {
		// Normal chat uses current input or shows prompt
		const inputEl = (this as any).inputEl;
		if (inputEl.value.trim()) {
			this.sendMessage(inputEl.value.trim());
			inputEl.value = '';
		} else {
			// Focus input for typing
			inputEl.focus();
		}
	}

	async initializeDatabase() {
		try {
			// Get vault base path
			const vaultBasePath = (this.app.vault.adapter as any).getBasePath();
			const pluginDataDir = `${vaultBasePath}/.obsidian/plugins/smart-rag/data/pglite`;
			
			await this.databaseService.initialize(pluginDataDir);
			console.log('Database initialized successfully at:', pluginDataDir);
		} catch (error) {
			console.error('Failed to initialize database:', error);
			new Notice('Database initialization failed. Check console for details.');
		}
	}

	handleVaultChat() {
		const inputEl = (this as any).inputEl;
		const query = inputEl.value.trim();
		
		if (!query) {
			new Notice('Please enter a query first');
			return;
		}

		// Clear input
		inputEl.value = '';

		// Add user message
		this.addMessage('user', `@vault ${query}`);
		this.messages.push({ role: 'user', content: query });

		// Show loading
		const loadingEl = this.addMessage('assistant', 'Searching your vault...', true);

		// Perform RAG search
		this.performRAGSearch(query, loadingEl);
	}

	async performRAGSearch(query: string, loadingEl: HTMLElement) {
		try {
			// Generate query embedding
			const embeddingResult = await this.embeddingService.generateEmbedding(
				this.plugin.settings.lightRAGEmbedding.baseUrl,
				this.plugin.settings.lightRAGEmbedding.modelName,
				query
			);

			// Search similar chunks in database
			const searchResults = await this.databaseService.searchChunks(
				embeddingResult.embedding,
				5
			);

			if (searchResults.length === 0) {
				loadingEl.remove();
				this.addMessage('assistant', 'No relevant content found in your vault.');
				return;
			}

			// Build context from search results
			let context = '';
			const sources: { id: string; path: string; line?: number }[] = [];
			
			for (let i = 0; i < searchResults.length; i++) {
				const result = searchResults[i];
				context += `\n--- Chunk ${i + 1} ---\n${result.content}\n`;
				
				// Extract source info
				const doc = await this.databaseService.getDocumentByPath(result.documentId);
				if (doc) {
					sources.push({
						id: `[${i + 1}]`,
						path: doc.path,
						line: result.metadata?.startLine
					});
				}
			}

			// Build prompt with context
			const systemPrompt = `You are a helpful AI assistant with access to the user's Obsidian vault. Use the following context from their notes to answer the question. If the context doesn't contain relevant information, say so.

Context:
${context}`;

			// Generate response using Chat LLM
			const response = await this.llmService.chat(
				this.plugin.settings.chatLLM.baseUrl,
				this.plugin.settings.chatLLM.apiKey,
				this.plugin.settings.chatLLM.modelName,
				query,
				systemPrompt,
				this.plugin.settings.chatLLM.maxTokens,
				this.plugin.settings.chatLLM.temperature
			);

			// Remove loading message
			loadingEl.remove();

			// Add assistant message with citations
			let finalResponse = response;
			if (sources.length > 0) {
				finalResponse += '\n\n**Sources:**';
				for (const source of sources) {
					const lineRef = source.line ? `#L${source.line}` : '';
					finalResponse += `\n${source.id} ${source.path}${lineRef}`;
				}
			}

			this.addMessage('assistant', finalResponse);
			this.messages.push({ role: 'assistant', content: finalResponse });

		} catch (error) {
			// Remove loading message
			loadingEl.remove();

			// Show error modal
			const errorDetails: ErrorDetails = {
				title: 'RAG Search Failed',
				message: error instanceof Error ? error.message : String(error),
				errorType: 'api',
				timestamp: new Date().toISOString(),
				stackTrace: error instanceof Error ? error.stack : undefined,
				suggestion: 'Check your Embedding API configuration and database status.'
			};

			new ErrorModal(this.app, errorDetails, () => {
				// Retry the same query
				const inputEl = (this as any).inputEl;
				inputEl.value = query;
				this.handleVaultChat();
			}).open();
		}
	}

	stopGeneration() {
		// Stop generation functionality will be implemented later
		// For now, just show notice
		new Notice('Stop functionality coming soon');
	}
}