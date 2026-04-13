import { App, Modal, Notice } from 'obsidian'

/**
 * Stub: Template settings not supported in Smart RAG mode.
 */
export class TemplateSectionModal extends Modal {
  constructor(app: App) {
    super(app)
  }

  onOpen(): void {
    new Notice('Template settings require Neural Composer configuration.')
    this.close()
  }
}
