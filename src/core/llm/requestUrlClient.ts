import { requestUrl, RequestUrlParam } from 'obsidian'
import {
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions'

/**
 * A client that uses Obsidian's requestUrl API instead of fetch.
 * This bypasses CORS restrictions in Obsidian Mobile (Capacitor environment).
 */
export class RequestUrlClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  private async makeRequest<T>(
    path: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }

    const params: RequestUrlParam = {
      url,
      method,
      headers,
      contentType: 'application/json',
      throw: false,
    }

    if (body) {
      params.body = JSON.stringify(body)
    }

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        throw new Error('Request aborted')
      })
    }

    const response = await requestUrl(params)

    if (response.status >= 400) {
      const errorText =
        typeof response.json === 'string'
          ? response.json
          : JSON.stringify(response.json)
      throw new Error(
        `API request failed with status ${response.status}: ${errorText}`,
      )
    }

    return typeof response.json === 'string'
      ? JSON.parse(response.json)
      : response.json
  }

  async createChatCompletion(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ChatCompletion> {
    return this.makeRequest<ChatCompletion>(
      '/chat/completions',
      'POST',
      params,
      signal,
    )
  }

  async *streamChatCompletion(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<ChatCompletionChunk> {
    const url = `${this.baseUrl}/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }

    const requestParams: RequestUrlParam = {
      url,
      method: 'POST',
      headers,
      contentType: 'application/json',
      body: JSON.stringify({ ...params, stream: true }),
      throw: false,
    }

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        throw new Error('Request aborted')
      })
    }

    const response = await requestUrl(requestParams)

    if (response.status >= 400) {
      const errorText =
        typeof response.json === 'string'
          ? response.json
          : JSON.stringify(response.json)
      throw new Error(
        `API request failed with status ${response.status}: ${errorText}`,
      )
    }

    // Parse SSE stream
    const text =
      typeof response.text === 'string'
        ? response.text
        : JSON.stringify(response.json)

    const lines = text.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') {
          break
        }
        try {
          const chunk = JSON.parse(data) as ChatCompletionChunk
          yield chunk
        } catch (e) {
          // Skip invalid JSON
          console.warn('Failed to parse SSE chunk:', data)
        }
      }
    }
  }
}