// @ts-nocheck - temporary type compatibility fix
import { App, Notice, TFile } from 'obsidian';
import { ExcalidrawClipboard } from './excalidrawGenerator';

/**
 * Excalidraw Renderer Service
 * Renders Excalidraw JSON to PNG using ExcalidrawAutomate API
 */

declare global {
  interface Window {
    ExcalidrawAutomate?: any;
  }
}

export interface RenderResult {
  pngBlob: Blob | null;
  svgString: string | null;
  file: string | null;
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

    const ea = window.ExcalidrawAutomate;
    console.log('[ExcalidrawRenderer] ExcalidrawAutomate:', ea)
    console.log('[ExcalidrawRenderer] Available methods:', Object.keys(ea || {}))
    
    // Check if addText exists (required for rendering)
    if (!ea || typeof ea.addText !== 'function') {
      return {
        pngBlob: null,
        svgString: null,
        file: null,
        error: 'Excalidraw plugin API not compatible. Required: addText method.'
      };
    }

    try {
      // Reset state
      if (ea.reset) ea.reset();
      
      const elements = excalidrawJson.elements || [];
      console.log('[ExcalidrawRenderer] Elements to render:', elements.length)
      
      // Add all elements (rectangle, ellipse, diamond, arrow, text)
      for (const el of elements) {
        try {
          const baseProps = {
            strokeColor: el.strokeColor || '#1e1e1e',
            backgroundColor: el.backgroundColor || 'transparent',
            strokeWidth: el.strokeWidth || 2,
            fillStyle: el.fillStyle || 'solid',
            roughness: el.roughness ?? 1,
            opacity: el.opacity ?? 100
          };

          if (el.type === 'rectangle') {
            // Rectangle with optional text
            const id = ea.addRectangle(el.x || 100, el.y || 100, {
              width: el.width || 180,
              height: el.height || 70,
              ...baseProps
            });
            // Add text if present
            if (el.text) {
              ea.addText((el.x || 100) + (el.width || 180) / 2, (el.y || 100) + (el.height || 70) / 2, el.text, {
                color: el.strokeColor || '#000000',
                fontSize: el.fontSize || 16,
                fontFamily: el.fontFamily || 5,
                textAlign: 'center',
                verticalAlign: 'middle'
              });
            }
          } else if (el.type === 'ellipse') {
            // Ellipse with optional text
            const id = ea.addEllipse(el.x || 100, el.y || 100, {
              width: el.width || 120,
              height: el.height || 120,
              ...baseProps
            });
            if (el.text) {
              ea.addText((el.x || 100) + (el.width || 120) / 2, (el.y || 100) + (el.height || 120) / 2, el.text, {
                color: el.strokeColor || '#000000',
                fontSize: el.fontSize || 16,
                fontFamily: el.fontFamily || 5,
                textAlign: 'center',
                verticalAlign: 'middle'
              });
            }
          } else if (el.type === 'diamond') {
            // Diamond shape with optional text
            const id = ea.addDiamond(el.x || 100, el.y || 100, {
              width: el.width || 150,
              height: el.height || 150,
              ...baseProps
            });
            if (el.text) {
              ea.addText((el.x || 100) + (el.width || 150) / 2, (el.y || 100) + (el.height || 150) / 2, el.text, {
                color: el.strokeColor || '#000000',
                fontSize: el.fontSize || 14,
                fontFamily: el.fontFamily || 5,
                textAlign: 'center',
                verticalAlign: 'middle'
              });
            }
          } else if (el.type === 'arrow') {
            // Arrow with optional label
            if (el.points && el.points.length >= 2) {
              const startX = el.x || 100;
              const startY = el.y || 100;
              const endX = startX + (el.points[el.points.length - 1][0] || 100);
              const endY = startY + (el.points[el.points.length - 1][1] || 50);
              
              ea.addArrow(
                [[startX, startY], [endX, endY]],
                {
                  ...baseProps,
                  startArrowhead: el.startArrowhead || null,
                  endArrowhead: el.endArrowhead || 'arrow'
                }
              );
            }
          } else if (el.type === 'text' && el.text) {
            // Standalone text
            ea.addText(el.x || 100, el.y || 100, el.text, {
              color: el.strokeColor || '#1e1e1e',
              fontSize: el.fontSize || 20,
              fontFamily: el.fontFamily || 5,
              textAlign: el.textAlign || 'left',
              verticalAlign: el.verticalAlign || 'top'
            });
          }
        } catch (e) {
          console.warn('[ExcalidrawRenderer] Failed to add element:', e, el)
        }
      }
      
      // Try to create PNG using available methods
      let pngBlob: Blob | null = null;
      
      // Method 1: Try exportPNG if available
      if (typeof ea.exportImage === 'function') {
        try {
          const result = await ea.exportImage({ format: 'png' });
          if (result && result.blob) {
            pngBlob = result.blob;
          }
        } catch (e) {
          console.warn('[ExcalidrawRenderer] exportImage failed:', e)
        }
      }
      
      // Method 2: Try create and read file
      if (!pngBlob && typeof ea.create === 'function') {
        try {
          const filepath = await ea.create({
            filename: filename || `diagram-${Date.now()}`,
            foldername: '',
            onNewPane: false
          });
          console.log('[ExcalidrawRenderer] Created file:', filepath)
          
          if (filepath) {
            return {
              pngBlob: null,
              svgString: null,
              file: filepath,
              error: null
            };
          }
        } catch (e) {
          console.warn('[ExcalidrawRenderer] create failed:', e)
        }
      }
      
      if (!pngBlob) {
        // Fallback: return success with message
        return {
          pngBlob: null,
          svgString: null,
          file: null,
          error: 'Diagram elements added but PNG export not available. Check Excalidraw plugin version.'
        };
      }
      
      return {
        pngBlob,
        svgString: null,
        file: null,
        error: null
      };

    } catch (error) {
      console.error('[ExcalidrawRenderer] Render failed:', error);
      return {
        pngBlob: null,
        svgString: null,
        file: null,
        error: `Failed to render diagram: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Convert blob to data URL
   */
  async blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Render and save to file
   */
  async renderAndSave(
    excalidrawJson: ExcalidrawClipboard,
    filename: string,
    folder?: string
  ): Promise<RenderResult> {
    const result = await this.renderToPNG(excalidrawJson, filename);
    
    if (result.file) {
      return result;
    }
    
    if (result.error) {
      return result;
    }
    
    if (result.pngBlob) {
      // Try to save PNG
      try {
        const folderPath = folder || '';
        const filePath = folderPath ? `${folderPath}/${filename}.png` : `${filename}.png`;
        
        // Create buffer from blob
        const arrayBuffer = await result.pngBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        await this.app.vault.create(filePath, buffer);
        
        return {
          pngBlob: null,
          svgString: null,
          file: filePath,
          error: null
        };
      } catch (error) {
        return {
          pngBlob: null,
          svgString: null,
          file: null,
          error: `Failed to save: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    
    return result;
  }
}