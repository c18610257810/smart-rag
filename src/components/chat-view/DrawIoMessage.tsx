import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Download } from 'lucide-react';
import { DrawIoGenerationResult } from '../../services/drawIoGenerator';
import { DrawIoRenderer } from '../../services/drawIoRenderer';
import { useApp } from '../../contexts/app-context';
import { Notice } from 'obsidian';

export interface DrawIoMessageProps {
  result: DrawIoGenerationResult;
  onInsertToNote?: () => void;
}

const DrawIoMessage: React.FC<DrawIoMessageProps> = ({ result, onInsertToNote }) => {
  const app = useApp();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveDiagram();
  }, [result]);

  const saveDiagram = async () => {
    console.log('[DrawIoMessage] saveDiagram called, result:', result);

    if (!result.success || !result.xml) {
      console.log('[DrawIoMessage] No XML or generation failed');
      setError(result.error || 'No diagram XML generated');
      setIsLoading(false);
      return;
    }

    const renderer = new DrawIoRenderer(app);
    
    try {
      console.log('[DrawIoMessage] Saving to file...');
      const saveResult = await renderer.saveToFile(result);
      console.log('[DrawIoMessage] Save result:', saveResult);

      if (saveResult.error) {
        setError(saveResult.error);
      } else if (saveResult.file) {
        setFilePath(saveResult.file);
        new Notice(`Draw.io diagram saved: ${saveResult.file}`);
      }
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenFile = async () => {
    if (!filePath) return;
    
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file) {
      await app.workspace.openLinkText(filePath, '', false);
    }
  };

  const handleDownload = async () => {
    if (!filePath) return;
    
    // Copy file to desktop
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof app.vault.getAbstractFileByPath(filePath).constructor) {
      const content = await app.vault.read(file);
      // Create download link
      const blob = new Blob([content], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filePath.split('/').pop() || 'diagram.drawio';
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  if (isLoading) {
    return (
      <div className="excalidraw-message-container">
        <div className="excalidraw-loading">
          <div className="loading-spinner"></div>
          <span>Generating Draw.io diagram...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="excalidraw-message-container">
        <div className="excalidraw-error">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="excalidraw-message-container">
      <div className="drawio-result">
        <div className="drawio-info">
          <FileText size={20} />
          <span>Draw.io diagram saved</span>
        </div>
        <div className="drawio-path">{filePath}</div>
        <div className="drawio-actions">
          <button 
            className="drawio-action-btn"
            onClick={handleOpenFile}
            title="Open in Obsidian"
          >
            <ExternalLink size={16} />
            <span>Open</span>
          </button>
          <button 
            className="drawio-action-btn"
            onClick={handleDownload}
            title="Download .drawio file"
          >
            <Download size={16} />
            <span>Download</span>
          </button>
          {onInsertToNote && (
            <button 
              className="drawio-action-btn"
              onClick={onInsertToNote}
              title="Insert link to note"
            >
              <FileText size={16} />
              <span>Insert</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DrawIoMessage;