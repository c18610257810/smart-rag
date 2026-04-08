import { App, Modal, Notice } from 'obsidian';

/**
 * Error Modal
 * Display detailed error information with stack trace and request ID
 */

export interface ErrorDetails {
	title: string;
	message: string;
	errorType?: 'api' | 'network' | 'config' | 'unknown';
	requestId?: string;
	timestamp?: string;
	stackTrace?: string;
	suggestion?: string;
}

export class ErrorModal extends Modal {
	errorDetails: ErrorDetails;
	onRetry?: () => void;

	constructor(app: App, errorDetails: ErrorDetails, onRetry?: () => void) {
		super(app);
		this.errorDetails = errorDetails;
		this.onRetry = onRetry;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smart-rag-error-modal');

		// Header
		const header = contentEl.createDiv('smart-rag-error-header');
		header.createEl('h2', { text: '❌ Error' });

		// Error Title
		const titleEl = contentEl.createDiv('smart-rag-error-title');
		titleEl.createEl('strong', { text: this.errorDetails.title });

		// Error Message
		const messageEl = contentEl.createDiv('smart-rag-error-message');
		messageEl.setText(this.errorDetails.message);

		// Error Type
		if (this.errorDetails.errorType) {
			const typeEl = contentEl.createDiv('smart-rag-error-type');
			typeEl.createEl('span', {
				text: `Type: ${this.errorDetails.errorType}`,
				cls: 'smart-rag-error-badge'
			});
		}

		// Request ID
		if (this.errorDetails.requestId) {
			const requestIdEl = contentEl.createDiv('smart-rag-error-request-id');
			requestIdEl.createEl('span', { text: `Request ID: ${this.errorDetails.requestId}` });
		}

		// Timestamp
		if (this.errorDetails.timestamp) {
			const timestampEl = contentEl.createDiv('smart-rag-error-timestamp');
			timestampEl.createEl('span', { text: `Timestamp: ${this.errorDetails.timestamp}` });
		}

		// Stack Trace
		if (this.errorDetails.stackTrace) {
			const stackSection = contentEl.createDiv('smart-rag-error-stack-section');
			stackSection.createEl('h4', { text: 'Stack Trace' });
			
			const stackEl = stackSection.createEl('pre', { cls: 'smart-rag-error-stack' });
			stackEl.setText(this.errorDetails.stackTrace);
		}

		// Suggestion
		if (this.errorDetails.suggestion) {
			const suggestionEl = contentEl.createDiv('smart-rag-error-suggestion');
			suggestionEl.createEl('h4', { text: '💡 Suggestion' });
			suggestionEl.createEl('p', { text: this.errorDetails.suggestion });
		}

		// Buttons
		const buttonContainer = contentEl.createDiv('smart-rag-error-buttons');

		// Copy Log button
		buttonContainer.createEl('button', { text: 'Copy Log' }).onclick = () => {
			this.copyLog();
			new Notice('✓ Log copied to clipboard');
		};

		// Retry button (if onRetry provided)
		if (this.onRetry) {
			const retryBtn = buttonContainer.createEl('button', {
				text: 'Retry',
				cls: 'mod-cta'
			});
			retryBtn.onclick = () => {
				this.close();
				this.onRetry!();
			};
		}

		// Dismiss button
		buttonContainer.createEl('button', { text: 'Dismiss' }).onclick = () => {
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	copyLog() {
		const logContent = [
			`Error: ${this.errorDetails.title}`,
			`Message: ${this.errorDetails.message}`,
			this.errorDetails.errorType ? `Type: ${this.errorDetails.errorType}` : '',
			this.errorDetails.requestId ? `Request ID: ${this.errorDetails.requestId}` : '',
			this.errorDetails.timestamp ? `Timestamp: ${this.errorDetails.timestamp}` : '',
			this.errorDetails.stackTrace ? `Stack Trace:\n${this.errorDetails.stackTrace}` : '',
			this.errorDetails.suggestion ? `Suggestion: ${this.errorDetails.suggestion}` : ''
		].filter(line => line).join('\n');

		// Use Obsidian's clipboard API
		// @ts-ignore
		const clipboard = window.require('electron').clipboard;
		clipboard.writeText(logContent);
	}
}