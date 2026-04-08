import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions'

import {
  LLMOptions,
  LLMRequest,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
  ToolCall,
} from '../../types/llm/response'

import { RequestUrlClient } from './requestUrlClient'

export class RequestUrlMessageAdapter {
  protected normalizeToolCalls(
    toolCalls: ChatCompletionMessageToolCall[] | undefined,
  ): ToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) {
      return undefined
    }

    const functionToolCalls = toolCalls.filter(
      (toolCall): toolCall is ChatCompletionMessageFunctionToolCall =>
        toolCall.type === 'function',
    )

    if (functionToolCalls.length === 0) {
      return undefined
    }

    return functionToolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: 'function',
      function: {
        arguments: toolCall.function.arguments,
        name: toolCall.function.name,
      },
    }))
  }

  async generateResponse(
    client: RequestUrlClient,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    const params = this.buildChatCompletionCreateParams({
      request,
      stream: false,
    })
    const response = await client.createChatCompletion(params, options?.signal)
    return this.parseNonStreamingResponse(response)
  }

  async *streamResponse(
    client: RequestUrlClient,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): AsyncIterable<LLMResponseStreaming> {
    const params = this.buildChatCompletionCreateParams({
      request,
      stream: true,
    })
    const stream = client.streamChatCompletion(params, options?.signal)

    for await (const chunk of stream) {
      yield this.parseStreamingResponseChunk(chunk)
    }
  }

  protected buildChatCompletionCreateParams(params: {
    request: LLMRequest
    stream: boolean
  }): Record<string, unknown> {
    const { request: req, stream } = params

    return {
      model: req.model,
      tools: req.tools,
      tool_choice: req.tool_choice,
      reasoning_effort: req.reasoning_effort,
      web_search_options: req.web_search_options,
      messages: req.messages.map((m) => this.parseRequestMessage(m)),
      max_tokens: req.max_tokens,
      temperature: req.temperature,
      top_p: req.top_p,
      frequency_penalty: req.frequency_penalty,
      presence_penalty: req.presence_penalty,
      logit_bias: req.logit_bias,
      prediction: req.prediction,
      ...(stream && {
        stream: true,
        stream_options: {
          include_usage: true,
        },
      }),
    }
  }

  protected parseRequestMessage(
    message: RequestMessage,
  ): ChatCompletionMessageParam {
    switch (message.role) {
      case 'user': {
        const content = Array.isArray(message.content)
          ? message.content.map((part): ChatCompletionContentPart => {
              switch (part.type) {
                case 'text':
                  return { type: 'text', text: part.text }
                case 'image_url':
                  return { type: 'image_url', image_url: part.image_url }
              }
            })
          : message.content
        return { role: 'user', content }
      }
      case 'assistant': {
        if (Array.isArray(message.content)) {
          throw new Error('Assistant message should be a string')
        }
        return {
          role: 'assistant',
          content: message.content,
          tool_calls: message.tool_calls?.map((toolCall) => ({
            id: toolCall.id,
            function: {
              arguments: toolCall.arguments ?? '{}',
              name: toolCall.name,
            },
            type: 'function',
          })),
        }
      }
      case 'system': {
        if (Array.isArray(message.content)) {
          throw new Error('System message should be a string')
        }
        return { role: 'system', content: message.content }
      }
      case 'tool': {
        return {
          role: 'tool',
          content: message.content,
          tool_call_id: message.tool_call.id,
        }
      }
    }
  }

  protected parseNonStreamingResponse(
    response: ChatCompletion,
  ): LLMResponseNonStreaming {
    return {
      id: response.id,
      choices: response.choices.map((choice) => ({
        finish_reason: choice.finish_reason,
        message: {
          content: choice.message.content,
          role: choice.message.role,
          tool_calls: this.normalizeToolCalls(choice.message.tool_calls),
        },
      })),
      created: response.created,
      model: response.model,
      object: 'chat.completion',
      system_fingerprint: response.system_fingerprint,
      usage: response.usage,
    }
  }

  protected parseStreamingResponseChunk(
    chunk: ChatCompletionChunk,
  ): LLMResponseStreaming {
    return {
      id: chunk.id,
      choices: chunk.choices.map((choice) => ({
        finish_reason: choice.finish_reason ?? null,
        delta: {
          content: choice.delta.content ?? null,
          role: choice.delta.role,
          tool_calls: choice.delta.tool_calls,
        },
      })),
      created: chunk.created,
      model: chunk.model,
      object: 'chat.completion.chunk',
      system_fingerprint: chunk.system_fingerprint,
      usage: chunk.usage ?? undefined,
    }
  }
}