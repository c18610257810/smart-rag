import OpenAI from 'openai'
import { Platform } from 'obsidian'

import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import { formatMessages } from '../../utils/llm/request'

import { BaseLLMProvider } from './base'
import { LLMBaseUrlNotSetException } from './exception'
import { NoStainlessOpenAI } from './NoStainlessOpenAI'
import { OpenAIMessageAdapter } from './openaiMessageAdapter'
import { RequestUrlClient } from './requestUrlClient'
import { RequestUrlMessageAdapter } from './requestUrlMessageAdapter'

export class OpenAICompatibleProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'openai-compatible' }>
> {
  private adapter: OpenAIMessageAdapter | RequestUrlMessageAdapter
  private client: OpenAI | RequestUrlClient
  private useRequestUrl: boolean

  constructor(provider: Extract<LLMProvider, { type: 'openai-compatible' }>) {
    super(provider)

    // Use requestUrl on mobile to bypass CORS restrictions
    // Also use on desktop if the API is known to have CORS issues (e.g., Alibaba Cloud)
    // For now, always use requestUrl to ensure compatibility
    this.useRequestUrl = true // !Platform.isDesktop

    if (this.useRequestUrl) {
      // Use requestUrl API to bypass CORS
      this.adapter = new RequestUrlMessageAdapter()
      this.client = new RequestUrlClient(
        provider.baseUrl ?? '',
        provider.apiKey ?? '',
      )
    } else {
      // Desktop: use OpenAI SDK
      this.adapter = new OpenAIMessageAdapter()
      this.client = new (
        provider.additionalSettings?.noStainless ? NoStainlessOpenAI : OpenAI
      )({
        apiKey: provider.apiKey ?? '',
        baseURL: provider.baseUrl ? provider.baseUrl?.replace(/\/+$/, '') : '',
        dangerouslyAllowBrowser: true,
      })
    }
  }

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI Compatible model')
    }

    if (!this.provider.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing. Please set it in settings menu.`,
      )
    }

    const formattedRequest = {
      ...request,
      messages: formatMessages(request.messages),
    }

    if (this.useRequestUrl) {
      return (this.adapter as RequestUrlMessageAdapter).generateResponse(
        this.client as RequestUrlClient,
        formattedRequest,
        options,
      )
    } else {
      return (this.adapter as OpenAIMessageAdapter).generateResponse(
        this.client as OpenAI,
        formattedRequest,
        options,
      )
    }
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI Compatible model')
    }

    if (!this.provider.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing. Please set it in settings menu.`,
      )
    }

    const formattedRequest = {
      ...request,
      messages: formatMessages(request.messages),
    }

    if (this.useRequestUrl) {
      return (this.adapter as RequestUrlMessageAdapter).streamResponse(
        this.client as RequestUrlClient,
        formattedRequest,
        options,
      )
    } else {
      return (this.adapter as OpenAIMessageAdapter).streamResponse(
        this.client as OpenAI,
        formattedRequest,
        options,
      )
    }
  }

  async getEmbedding(
    model: string,
    text: string,
    options?: { dimensions?: number },
  ): Promise<number[]> {
    if (this.useRequestUrl) {
      // Use requestUrl for embeddings
      const client = this.client as RequestUrlClient
      const response = await (client as any).makeRequest(
        '/embeddings',
        'POST',
        {
          model,
          input: text,
          encoding_format: 'float',
          ...(options?.dimensions && { dimensions: options.dimensions }),
        },
      )
      return response.data[0].embedding
    } else {
      // Use OpenAI SDK
      const embedding = await (this.client as OpenAI).embeddings.create({
        model: model,
        input: text,
        encoding_format: 'float',
        ...(options?.dimensions && { dimensions: options.dimensions }),
      })
      return embedding.data[0].embedding
    }
  }
}