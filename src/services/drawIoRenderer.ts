import { App, TFile, TFolder } from 'obsidian';
import { DrawIoGenerationResult } from './drawIoGenerator';

/**
 * Draw.io Renderer Service
 * Saves draw.io XML files to Obsidian vault
 */

export interface DrawIoRenderResult {
  success: boolean;
  file: string | null;
  error?: string;
}

export class DrawIoRenderer {
  private app: App;
  private outputFolder: string;

  constructor(app: App, outputFolder: string = 'Draw.io') {
    this.app = app;
    this.outputFolder = outputFolder;
  }

  /**
   * Save draw.io XML to file
   */
  async saveToFile(
    result: DrawIoGenerationResult,
    filename?: string
  ): Promise<DrawIoRenderResult> {
    if (!result.success || !result.xml) {
      return {
        success: false,
        file: null,
        error: result.error || 'No XML to save'
      };
    }

    try {
      // Ensure output folder exists
      await this.ensureFolderExists();

      // Generate filename
      const name = filename || `diagram-${Date.now()}`;
      const filePath = `${this.outputFolder}/${name}.drawio`;

      // Check if file exists
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile instanceof TFile) {
        // Update existing file
        await this.app.vault.modify(existingFile, result.xml);
        return {
          success: true,
          file: filePath,
          error: null
        };
      }

      // Create new file
      await this.app.vault.create(filePath, result.xml);
      
      return {
        success: true,
        file: filePath,
        error: null
      };

    } catch (error) {
      console.error('[DrawIoRenderer] Save failed:', error);
      return {
        success: false,
        file: null,
        error: `Failed to save: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Ensure output folder exists
   */
  private async ensureFolderExists(): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(this.outputFolder);
    
    if (!folder) {
      await this.app.vault.createFolder(this.outputFolder);
    } else if (!(folder instanceof TFolder)) {
      throw new Error(`Path ${this.outputFolder} exists but is not a folder`);
    }
  }

  /**
   * Generate draw.io diagram and save to file
   * Combined method for convenience
   */
  async generateAndSave(
    prompt: string,
    filename?: string,
    sessionId?: string
  ): Promise<DrawIoRenderResult> {
    // This method would combine generation and saving
    // But generation should be done by DrawIoGenerator
    // So this is just a placeholder
    return {
      success: false,
      file: null,
      error: 'Use DrawIoGenerator to generate, then DrawIoRenderer to save'
    };
  }

  /**
   * Get file path for a diagram
   */
  getFilePath(filename: string): string {
    return `${this.outputFolder}/${filename}.drawio`;
  }

  /**
   * List all draw.io files in output folder
   */
  async listFiles(): Promise<string[]> {
    const folder = this.app.vault.getAbstractFileByPath(this.outputFolder);
    
    if (!folder || !(folder instanceof TFolder)) {
      return [];
    }

    const files: string[] = [];
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'drawio') {
        files.push(file.path);
      }
    }

    return files;
  }
}