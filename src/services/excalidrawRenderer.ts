import { App, Notice, TFile } from 'obsidian';
import { ExcalidrawClipboard } from './excalidrawGenerator';

/**
 * Excalidraw Renderer Service
 * Renders Excalidraw JSON to PNG using ExcalidrawAutomate API
 */

declare global {
  interface Window {
    ExcalidrawAutomate?: {
      create: (options: {
        filename?: string;
        foldername?: string;
        onNewPane?: boolean;
        frontmatterKeys?: Record<string, any>;
      }) => Promise<string>;
      addText: (x: number, y: number, text: string, options?: {
        id?: string;
        color?: string;
        fontSize?: number;
        fontFamily?: number;
        textAlign?: 'left' | 'center' | 'right';
      }) => string;
      addRectangle: (x: number, y: number, width: number, height: number, options?: {
        id?: string;
        color?: string;
        fillStyle?: string;
        strokeStyle?: string;
        strokeWidth?: number;
      }) => string;
      addEllipse: (x: number, y: number, width: number, height: number, options?: {
        id?: string;
        color?: string;
      }) => string;
      addLine: (x: number, y: number, points: number[][], options?: {
        id?: string;
        color?: string;
      }) => string;
      addArrow: (x: number, y: number, points: number[][], options?: {
        id?: string;
        color?: string;
        startArrowhead?: string | null;
        endArrowhead?: string | null;
      }) => string;
      connectObjects: (id1: string, connectionPoint1: string, id2: string, connectionPoint2: string, options?: {
        numberOfPoints?: number;
        startArrowHead?: string | null;
        endArrowHead?: string | null;
        padding?: number;
      }) => string;
      createPNG: (padding?: number, scale?: number, darkMode?: boolean) => Promise<Blob | null>;
      createSVG: (padding?: number, darkMode?: boolean) => Promise<string>;
      getElements: () => any[];
      getElement: (id: string) => any;
      clear: () => void;
      addElementsToView: (repositionToCursor?: boolean, save?: boolean, newElements?: boolean) => Promise<boolean>;
      getViewElements: () => any[];
      setView: (view?: any) => void;
      targetView: any;
      reset: () => void;
    };
  }
}

export interface RenderResult {
  pngBlob: Blob | null;
  svgString: string | null;
  file: TFile | null;
  error?: string;
}

export class ExcalidrawRenderer {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Check if ExcalidrawAutomate API is available
   */
  isAvailable(): boolean {
    return typeof window.ExcalidrawAutomate !== 'undefined';
  }

  /**
   * Render Excalidraw JSON to PNG
   */
  async renderToPNG(
    excalidrawJson: ExcalidrawClipboard,
    filename?: string,
    darkMode?: boolean
  ): Promise<RenderResult> {
    if (!this.isAvailable()) {
      return {
        pngBlob: null,
        svgString: null,
        file: null,
        error: 'Excalidraw plugin is not installed or enabled. Please install the Excalidraw plugin from the community plugins.'
      };
    }

    const ea = window.ExcalidrawAutomate!;

    try {
      // Reset ExcalidrawAutomate state
      ea.reset();

      // Get elements from JSON
      const elements = excalidrawJson.elements || [];
      
      // Add elements individually using ExcalidrawAutomate API
      // addElementsToView doesn't accept raw elements as third param
      for (const element of elements) {
        switch (element.type) {
          case 'rectangle':
            ea.addRectangle(
              element.x,
              element.y,
              element.width || 200,
              element.height || 100,
              {
                id: element.id,
                color: element.strokeColor || '#000000',
                fillStyle: element.fillStyle,
                strokeStyle: element.strokeStyle,
                strokeWidth: element.strokeWidth,
              }
            );
            break;

          case 'ellipse':
            ea.addEllipse(
              element.x,
              element.y,
              element.width || 200,
              element.height || 100,
              { id: element.id, color: element.strokeColor || '#000000' }
            );
            break;

          case 'text':
            ea.addText(
              element.x,
              element.y,
              element.text || '',
              {
                id: element.id,
                color: element.strokeColor || '#000000',
                fontSize: element.fontSize || 16,
                fontFamily: element.fontFamily,
                textAlign: element.textAlign as any,
              }
            );
            break;

          case 'arrow':
          case 'line':
            if (element.points && element.points.length >= 2) {
              ea.addLine(
                element.x,
                element.y,
                element.points,
                {
                  id: element.id,
                  color: element.strokeColor || '#000000',
                  startArrowhead: element.startArrowhead || null,
                  endArrowhead: element.endArrowhead || null,
                }
              );
            }
            break;

          case 'diamond':
            ea.addRectangle(
              element.x,
              element.y,
              element.width || 200,
              element.height || 100,
              { id: element.id, color: element.strokeColor || '#000000' }
            );
            break;
        }
      }

      // Generate PNG
      const pngBlob = await ea.createPNG(50, 2, darkMode);
      
      // Generate SVG
      const svgString = await ea.createSVG(50, darkMode);

      // Clean up
      ea.clear();

      return {
        pngBlob,
        svgString,
        file: null,
      };

    } catch (error) {
      console.error('Failed to render Excalidraw:', error);
      ea.clear();
      return {
        pngBlob: null,
        svgString: null,
        file: null,
        error: `Failed to render diagram: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Render and save to file
   */
  async renderAndSave(
    excalidrawJson: ExcalidrawClipboard,
    filename: string,
    folderpath?: string,
    darkMode?: boolean
  ): Promise<RenderResult> {
    if (!this.isAvailable()) {
      return {
        pngBlob: null,
        svgString: null,
        file: null,
        error: 'Excalidraw plugin is not installed or enabled.'
      };
    }

    const ea = window.ExcalidrawAutomate!;

    try {
      ea.reset();

      // Create new drawing file
      const filepath = await ea.create({
        filename,
        foldername: folderpath || 'attachments',
        onNewPane: false,
      });

      // Add elements
      const elements = excalidrawJson.elements || [];
      
      for (const element of elements) {
        switch (element.type) {
          case 'rectangle':
            ea.addRectangle(
              element.x,
              element.y,
              element.width || 200,
              element.height || 100,
              {
                id: element.id,
                color: element.strokeColor || '#000000',
              }
            );
            break;

          case 'text':
            ea.addText(
              element.x,
              element.y,
              element.text || '',
              {
                id: element.id,
                color: element.strokeColor || '#000000',
                fontSize: element.fontSize || 16,
              }
            );
            break;

          case 'arrow':
            if (element.points && element.points.length >= 2) {
              ea.addArrow(
                element.x,
                element.y,
                element.points,
                {
                  id: element.id,
                  color: element.strokeColor || '#000000',
                  endArrowhead: 'arrow',
                }
              );
            }
            break;
        }
      }

      // Save the drawing (addElementsToView with save=true)
      await ea.addElementsToView(false, true);

      // Generate PNG
      const pngBlob = await ea.createPNG(50, 2, darkMode);

      // Get the created file
      const file = this.app.vault.getAbstractFileByPath(filepath) as TFile;

      ea.clear();

      return {
        pngBlob,
        svgString: null,
        file,
      };

    } catch (error) {
      console.error('Failed to render and save Excalidraw:', error);
      ea.clear();
      return {
        pngBlob: null,
        svgString: null,
        file: null,
        error: `Failed to save diagram: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Convert blob to base64 data URL
   */
  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}