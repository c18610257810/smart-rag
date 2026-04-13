import { ItemView, WorkspaceLeaf, TFile } from 'obsidian'

export const APPLY_VIEW_TYPE = 'smart-rag-apply'

export interface ApplyViewState {
  file: TFile | null
  originalContent: string
  newContent: string
}

export class ApplyView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
  }

  getViewType(): string {
    return APPLY_VIEW_TYPE
  }

  getDisplayText(): string {
    return 'Apply'
  }

  async setState(state: ApplyViewState): Promise<void> {
    // Stub: not implemented in Smart RAG mode
  }
}
