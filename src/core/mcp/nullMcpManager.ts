/**
 * Null MCP Manager
 * 
 * A stub implementation that returns empty results for all MCP operations.
 * Used when MCP is not needed (Smart RAG doesn't use MCP tools).
 */

import { McpTool, McpToolCallResult, McpServerState } from '../../types/mcp.types'
import { ToolCallResponse, ToolCallResponseStatus } from '../../types/tool-call.types'
import { NeuralComposerSettings } from '../../settings/schema/setting.types'

export class NullMcpManager {
  public readonly disabled = true
  private subscribers = new Set<(servers: McpServerState[]) => void>()

  constructor(_params: {
    settings: NeuralComposerSettings
    registerSettingsListener: (listener: (settings: NeuralComposerSettings) => void) => () => void
  }) {
    // No initialization needed
  }

  async initialize(): Promise<void> {
    // No-op
  }

  cleanup(): void {
    this.subscribers.clear()
  }

  getServers(): McpServerState[] {
    return []
  }

  subscribeServersChange(callback: (servers: McpServerState[]) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  async listAvailableTools(): Promise<McpTool[]> {
    return []
  }

  async callTool(_params: {
    name: string
    args?: Record<string, unknown> | string | undefined
    id?: string
    signal?: AbortSignal
  }): Promise<
    Extract<
      ToolCallResponse,
      {
        status:
          | ToolCallResponseStatus.Success
          | ToolCallResponseStatus.Error
          | ToolCallResponseStatus.Aborted
      }
    >
  > {
    return {
      status: ToolCallResponseStatus.Error,
      error: 'MCP is disabled in Smart RAG',
    }
  }

  allowToolForConversation(_requestToolName: string, _conversationId: string): void {
    // No-op
  }

  isToolExecutionAllowed(_params: {
    requestToolName: string
    conversationId?: string
  }): boolean {
    return false
  }

  abortToolCall(_id: string): boolean {
    return false
  }

  async handleSettingsUpdate(_settings: NeuralComposerSettings): Promise<void> {
    // No-op
  }
}