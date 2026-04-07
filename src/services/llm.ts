import { requestUrl } from 'obsidian';

/**
 * LLM Service
 * Handles chat completions and other LLM operations
 */

export interface Message {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ChatCompletionOptions {
	baseUrl: string;
	apiKey: string;
	modelName: string;
	messages: Message[];
	maxTokens?: number;
	temperature?: number;
	onStream?: (chunk: string) => void;
}

export interface ChatCompletionResponse {
	content: string;
	model: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export class LLMService {
	/**
	 * Send chat completion request
	 */
	async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
		const { baseUrl, apiKey, modelName, messages, maxTokens, temperature } = options;

		// Normalize URL
		let normalizedUrl = baseUrl.replace(/\/+$/, '');
		if (!normalizedUrl.endsWith('/v1')) {
			normalizedUrl += '/v1';
		}

		const requestBody: any = {
			model: modelName,
			messages: messages
		};

		if (maxTokens) requestBody.max_tokens = maxTokens;
		if (temperature !== undefined) requestBody.temperature = temperature;

		try {
			const response = await requestUrl({
				url: `${normalizedUrl}/chat/completions`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify(requestBody)
			});

			if (response.status !== 200) {
				throw new Error(`API returned ${response.status}: ${response.text}`);
			}

			const data = response.json;
			const content = data.choices?.[0]?.message?.content || '';

			return {
				content,
				model: data.model || modelName,
				usage: data.usage ? {
					promptTokens: data.usage.prompt_tokens,
					completionTokens: data.usage.completion_tokens,
					totalTokens: data.usage.total_tokens
				} : undefined
			};
		} catch (error) {
			throw new Error(`Chat completion failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Simple chat with context
	 */
	async chat(
		baseUrl: string,
		apiKey: string,
		modelName: string,
		userMessage: string,
		systemPrompt?: string,
		maxTokens?: number,
		temperature?: number
	): Promise<string> {
		const messages: Message[] = [];
		
		if (systemPrompt) {
			messages.push({ role: 'system', content: systemPrompt });
		}
		
		messages.push({ role: 'user', content: userMessage });

		const response = await this.chatCompletion({
			baseUrl,
			apiKey,
			modelName,
			messages,
			maxTokens,
			temperature
		});

		return response.content;
	}
}