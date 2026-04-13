import { App, Modal, Notice } from 'obsidian'

/**
 * Stub: MCP settings not supported in Smart RAG mode.
 */
export class McpSectionModal extends Modal {
  constructor(app: App) {
    super(app)
  }

  onOpen(): void {
    new Notice('MCP settings require Neural Composer configuration.')
    this.close()
  }
}
