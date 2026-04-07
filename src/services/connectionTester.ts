import { requestUrl } from 'obsidian';

/**
 * Connection Tester Service
 * Tests LLM and Embedding API connections
 * Uses Obsidian's requestUrl API to bypass CORS restrictions
 */

export interface TestResult {
	success: boolean;
	message: string;
	details?: {
		model?: string;
		responseTime?: number;
		error?: string;
	};
}

export class ConnectionTester {
	/**
	 * Test Chat/Semantic Chunk LLM connection
	 * Sends a simple completion request to verify API works
	 */
	async testLLMConnection(baseUrl: string, apiKey: string, modelName: string): Promise<TestResult> {
		const startTime = Date.now();
		
		try {
			// Normalize URL (remove trailing slash, ensure /v1 suffix)
			let normalizedUrl = baseUrl.replace(/\/+$/, '');
			if (!normalizedUrl.endsWith('/v1')) {
				normalizedUrl += '/v1';
			}

			const response = await requestUrl({
				url: `${normalizedUrl}/chat/completions`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model: modelName,
					messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
					max_tokens: 10
				})
			});

			const responseTime = Date.now() - startTime;

			if (response.status !== 200) {
				return {
					success: false,
					message: `API returned ${response.status}`,
					details: {
						error: response.text || 'Unknown error',
						responseTime
					}
				};
			}

			const data = response.json;
			return {
				success: true,
				message: 'Connection successful!',
				details: {
					model: data.model || modelName,
					responseTime
				}
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;
			return {
				success: false,
				message: 'Connection failed',
				details: {
					error: error instanceof Error ? error.message : String(error),
					responseTime
				}
			};
		}
	}

	/**
	 * Test Embedding API connection
	 * Sends a test text to get embeddings
	 */
	async testEmbeddingConnection(baseUrl: string, modelName: string): Promise<TestResult> {
		const startTime = Date.now();
		
		try {
			// Normalize URL
			let normalizedUrl = baseUrl.replace(/\/+$/, '');
			if (!normalizedUrl.endsWith('/v1')) {
				normalizedUrl += '/v1';
			}

			const response = await requestUrl({
				url: `${normalizedUrl}/embeddings`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: modelName,
					input: 'test'
				})
			});

			const responseTime = Date.now() - startTime;

			if (response.status !== 200) {
				return {
					success: false,
					message: `API returned ${response.status}`,
					details: {
						error: response.text || 'Unknown error',
						responseTime
					}
				};
			}

			const data = response.json;
			const embeddingDim = data.data?.[0]?.embedding?.length || 0;
			
			return {
				success: true,
				message: 'Connection successful!',
				details: {
					model: data.model || modelName,
					responseTime,
					error: `Embedding dimension: ${embeddingDim}`
				}
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;
			return {
				success: false,
				message: 'Connection failed',
				details: {
					error: error instanceof Error ? error.message : String(error),
					responseTime
				}
			};
		}
	}

	/**
	 * Test LightRAG server health
	 */
	async testLightRAGHealth(): Promise<TestResult> {
		const startTime = Date.now();
		
		try {
			const response = await requestUrl({
				url: 'http://127.0.0.1:9621/health',
				method: 'GET'
			});

			const responseTime = Date.now() - startTime;

			if (response.status !== 200) {
				return {
					success: false,
					message: `LightRAG server returned ${response.status}`,
					details: {
						responseTime
					}
				};
			}

			const data = response.json;
			return {
				success: true,
				message: 'LightRAG server is healthy',
				details: {
					model: data.llm_model,
					responseTime,
					error: `Status: ${data.status}`
				}
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;
			return {
				success: false,
				message: 'LightRAG server not reachable',
				details: {
					error: error instanceof Error ? error.message : 'Server not running',
					responseTime
				}
			};
		}
	}
}