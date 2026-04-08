import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice } from 'obsidian';
import { LLMService, Message } from '../services/llm';
import SmartRAGPlugin from '../main';

export const SMART_RAG_VIEW_TYPE = 'smart-rag-chat-view';
export type QueryMode = 'mix' | 'hybrid' | 'local' | 'global' | 'naive';

export class ChatView extends ItemView {
	plugin: SmartRAGPlugin;
	llmService: LLMService;
	messages: Message[] = [];
	currentMode: QueryMode = 'mix';
	private modeDropdownVisible: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: SmartRAGPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.llmService = new LLMService();
	}

	getViewType(): string { return SMART_RAG_VIEW_TYPE; }
	getDisplayText(): string { return 'Smart RAG'; }
	getIcon(): string { return 'brain'; }

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smart-rag-chat-view');

		// Messages container - scrollable
		const messagesContainer = contentEl.createDiv('smart-rag-messages-container');
		(this as any).messagesContainer = messagesContainer;

		// Input container - modern rounded design
		const inputContainer = contentEl.createDiv('smart-rag-input-container');

		// Textarea
		const textarea = inputContainer.createEl('textarea', {
			cls: 'smart-rag-input-textarea',
			attr: { placeholder: 'Type your message...' }
		});
		(this as any).textarea = textarea;

		// Bottom toolbar
		const toolbar = inputContainer.createDiv('smart-rag-input-toolbar');

		// Left side - selectors
		const toolbarLeft = toolbar.createDiv('smart-rag-toolbar-left');

		// Model selector button (placeholder for now)
		const modelBtn = toolbarLeft.createEl('button', { cls: 'smart-rag-model-btn' });
		modelBtn.createSpan({ cls: 'smart-rag-model-btn-icon', text: '🤖' });
		modelBtn.createSpan({ text: 'Model' });
		modelBtn.createSpan({ cls: 'smart-rag-model-btn-arrow', text: '▾' });
		modelBtn.onclick = () => { new Notice('Model selector - coming soon!'); };

		// Mode selector button
		const modeBtnContainer = toolbarLeft.createDiv();
		modeBtnContainer.style.position = 'relative';

		const modeBtn = modeBtnContainer.createEl('button', { cls: 'smart-rag-mode-btn' });
		const modeBtnIcon = modeBtn.createSpan({ cls: 'smart-rag-mode-btn-icon', text: '🔍' });
		const modeBtnLabel = modeBtn.createSpan({ text: 'Mix' });
		(this as any).modeBtnLabel = modeBtnLabel;

		// Mode dropdown menu
		const modeDropdown = modeBtnContainer.createDiv('smart-rag-mode-dropdown');
		(this as any).modeDropdown = modeDropdown;

		const modes = [
			{ value: 'mix', icon: '⚡', label: 'Mix', desc: '综合多种检索方式' },
			{ value: 'hybrid', icon: '🔀', label: 'Hybrid', desc: '全文搜索 + 向量搜索' },
			{ value: 'local', icon: '🔎', label: 'Local', desc: '当前文档/本地库搜索' },
			{ value: 'global', icon: '🌐', label: 'Global', desc: '全量知识库检索' },
			{ value: 'naive', icon: '📝', label: 'Naive', desc: '基础检索模式' }
		];

		for (const mode of modes) {
			const option = modeDropdown.createEl('button', { cls: 'smart-rag-mode-option' });
			if (mode.value === this.currentMode) option.addClass('active');
			option.createSpan({ cls: 'smart-rag-mode-option-icon', text: mode.icon });
			option.createSpan({ cls: 'smart-rag-mode-option-label', text: mode.label });
			option.createSpan({ cls: 'smart-rag-mode-option-desc', text: mode.desc });
			option.onclick = () => {
				this.currentMode = mode.value;
				modeBtnIcon.setText(mode.icon);
				modeBtnLabel.setText(mode.label);
				modeDropdown.querySelectorAll('.smart-rag-mode-option').forEach((el) => el.removeClass('active'));
				option.addClass('active');
				modeDropdown.removeClass('show');
				this.modeDropdownVisible = false;
			};
		}

		modeBtn.onclick = () => {
			this.modeDropdownVisible = !this.modeDropdownVisible;
			modeDropdown.toggleClass('show', this.modeDropdownVisible);
		};

		// Right side - actions
		const toolbarRight = toolbar.createDiv('smart-rag-toolbar-right');

		// Image button
		const imageBtn = toolbarRight.createEl('button', { cls: 'smart-rag-image-btn' });
		imageBtn.createSpan({ text: '📷 Image' });
		imageBtn.onclick = () => { new Notice('Image upload - coming soon!'); };

		// Send hint
		const sendHint = toolbarRight.createDiv('smart-rag-send-hint');
		const hintChat = sendHint.createDiv('smart-rag-send-hint-item');
		hintChat.createSpan({ cls: 'smart-rag-send-hint-key', text: '↵' });
		hintChat.createSpan({ text: 'Chat' });

		const hintVault = sendHint.createDiv('smart-rag-send-hint-item');
		hintVault.createSpan({ cls: 'smart-rag-send-hint-key', text: '⌘⇧↵' });
		hintVault.createSpan({ text: '@Vault' });

		// Keyboard shortcuts
		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				if (e.metaKey && e.shiftKey) {
					// Cmd+Shift+Enter → @Vault Chat (RAG mode)
					e.preventDefault();
					this.sendMessage(textarea.value.trim(), true);
					textarea.value = '';
				} else if (!e.shiftKey) {
					// Enter → Normal Chat
					e.preventDefault();
					this.sendMessage(textarea.value.trim(), false);
					textarea.value = '';
				}
			}
		});

		// Welcome message
		this.addMessage('assistant', '👋 Welcome to Smart RAG!\n\nChoose a search mode (Mix/Hybrid/Local/Global/Naive) and start chatting with your vault.\n\nPress **Enter** for normal chat, or **Cmd+Shift+Enter** for @Vault search.');
	}

	async onClose() { this.contentEl.empty(); }

	async sendMessage(message: string, useVaultSearch: boolean = false) {
		if (!message) return;

		const textarea = (this as any).textarea as HTMLTextAreaElement;
		textarea.disabled = true;

		this.addMessage('user', message);
		this.messages.push({ role: 'user', content: message });

		const loadingEl = this.addMessage('assistant', 'Thinking...', true);

		try {
			let response: string;

			if (useVaultSearch) {
				// @Vault mode - RAG search (placeholder for now)
				response = `🔍 **@Vault Search (${this.currentMode} mode)**\n\nSearching your vault for: "${message}"\n\n*(RAG integration coming soon!)*`;
			} else {
				// Normal chat
				response = await this.llmService.chat(
					this.plugin.settings.chatLLM.baseUrl,
					this.plugin.settings.chatLLM.apiKey,
					this.plugin.settings.chatLLM.modelName,
					message,
					'You are a helpful AI assistant. Be concise and helpful.',
					this.plugin.settings.chatLLM.maxTokens,
					this.plugin.settings.chatLLM.temperature
				);
			}

			loadingEl.remove();
			this.addMessage('assistant', response);
			this.messages.push({ role: 'assistant', content: response });
		} catch (error) {
			loadingEl.remove();
			new Notice('Failed to get response. Check your LLM settings.');
		} finally {
			textarea.disabled = false;
			textarea.focus();
		}
	}

	addMessage(role: 'user' | 'assistant', content: string, isLoading: boolean = false): HTMLElement {
		const messagesContainer = (this as any).messagesContainer;
		const messageEl = messagesContainer.createDiv(`smart-rag-message smart-rag-message-${role}`);

		const contentEl = messageEl.createDiv('smart-rag-message-content');
		if (isLoading) {
			contentEl.setText(content);
			messageEl.addClass('smart-rag-message-loading');
		} else {
			MarkdownRenderer.render(this.app, content, contentEl, '', this.plugin);
		}

		this.scrollToBottom();
		return messageEl;
	}

	scrollToBottom() {
		const mc = (this as any).messagesContainer;
		mc.scrollTop = mc.scrollHeight;
	}
}