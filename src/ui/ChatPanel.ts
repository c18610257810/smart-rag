import { App, Modal, Notice, MarkdownRenderer } from 'obsidian';
import { LLMService, Message } from '../services/llm';
import SmartRAGPlugin from '../main';

/**
 * Chat Panel
 * Simple right-side panel with chat interface
 */

export class ChatPanel extends Modal {
	plugin: SmartRAGPlugin;
	llmService: LLMService;
	messages: Message[] = [];
	containerEl: HTMLElement;
	messagesContainer: HTMLElement;
	inputEl: HTMLTextAreaElement;

	constructor(app: App, plugin: SmartRAGPlugin) {
		super(app);
		this.plugin = plugin;
		this.llmService = new LLMService();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smart-rag-chat-panel');

		// Header
		const header = contentEl.createDiv('smart-rag-chat-header');
		header.createEl('h2', { text: 'Smart RAG Chat' });

		// Messages container
		this.messagesContainer = contentEl.createDiv('smart-rag-messages');

		// Input area
		const inputArea = contentEl.createDiv('smart-rag-input-area');
		
		this.inputEl = inputArea.createEl('textarea', {
			attr: {
				placeholder: 'Type your message... (Shift+Enter for new line)',
				rows: '3'
			}
		});

		const buttonContainer = inputArea.createDiv('smart-rag-button-container');
		
		const sendButton = buttonContainer.createEl('button', {
			text: 'Send',
			cls: 'mod-cta'
		});
		sendButton.onclick = () => this.sendMessage();

		const clearButton = buttonContainer.createEl('button', {
			text: 'Clear'
		});
		clearButton.onclick = () => this.clearMessages();

		// Keyboard shortcut
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Welcome message
		this.addMessage('assistant', 'Hello! I\'m Smart RAG. How can I help you today?');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	async sendMessage() {
		const input = this.inputEl.value.trim();
		if (!input) return;

		// Clear input
		this.inputEl.value = '';

		// Add user message
		this.addMessage('user', input);
		this.messages.push({ role: 'user', content: input });

		// Show loading
		const loadingEl = this.addMessage('assistant', 'Thinking...', true);

		try {
			// Call Chat LLM
			const response = await this.llmService.chat(
				this.plugin.settings.chatLLM.baseUrl,
				this.plugin.settings.chatLLM.apiKey,
				this.plugin.settings.chatLLM.modelName,
				input,
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

			// Show error
			this.addMessage('assistant', `❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			new Notice('Failed to get response from LLM');
		}
	}

	addMessage(role: 'user' | 'assistant', content: string, isLoading: boolean = false): HTMLElement {
		const messageEl = this.messagesContainer.createDiv(`smart-rag-message smart-rag-message-${role}`);
		
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
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

		return messageEl;
	}

	clearMessages() {
		this.messages = [];
		this.messagesContainer.empty();
		this.addMessage('assistant', 'Chat cleared. How can I help you?');
	}
}