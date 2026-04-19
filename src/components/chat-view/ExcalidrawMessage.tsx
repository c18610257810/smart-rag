import { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Download, FileText } from 'lucide-react';
import { ExcalidrawGenerationResult } from '../../services/excalidrawGenerator';
import { ExcalidrawRenderer } from '../../services/excalidrawRenderer';
import { useApp } from '../../contexts/app-context';

export interface ExcalidrawMessageProps {
  result: ExcalidrawGenerationResult;
  onInsertToNote?: () => void;
}

const ExcalidrawMessage: React.FC<ExcalidrawMessageProps> = ({ result, onInsertToNote }) => {
  const app = useApp();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    renderDiagram();
  }, [result]);

  const renderDiagram = async () => {
    console.log('[ExcalidrawMessage] renderDiagram called, result:', result)
    // If no excalidrawJson, show text summary
    if (!result.excalidrawJson) {
      console.log('[ExcalidrawMessage] No excalidrawJson')
      setIsLoading(false);
      if (result.textSummary) {
        // Show text summary as fallback
        setError(null);
      }
      return;
    }

    console.log('[ExcalidrawMessage] excalidrawJson:', result.excalidrawJson)
    console.log('[ExcalidrawMessage] elements count:', result.excalidrawJson.elements?.length)

    // If excalidrawJson has no elements, show error
    if (!result.excalidrawJson.elements || result.excalidrawJson.elements.length === 0) {
      console.log('[ExcalidrawMessage] No elements!')
      setError('No diagram elements generated. LLM may have returned empty response.');
      setIsLoading(false);
      return;
    }

    const renderer = new ExcalidrawRenderer(app);
    console.log('[ExcalidrawMessage] Renderer created')
    
    const available = renderer.isAvailable()
    console.log('[ExcalidrawMessage] Excalidraw available:', available)
    
    if (!available) {
      setError('Excalidraw plugin is not installed. Please install it from community plugins.');
      setIsLoading(false);
      return;
    }

    try {
      console.log('[ExcalidrawMessage] Calling renderToPNG...')
      const renderResult = await renderer.renderToPNG(result.excalidrawJson);
      console.log('[ExcalidrawMessage] renderResult:', renderResult)
      
      if (renderResult.error) {
        setError(renderResult.error);
      } else if (renderResult.pngBlob) {
        const dataUrl = await renderer.blobToDataUrl(renderResult.pngBlob);
        setImageUrl(dataUrl);
      }
    } catch (err) {
      setError(`Failed to render: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;
    
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `excalidraw-diagram-${Date.now()}.png`;
    link.click();
  };

  const getChartTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'mindmap': '思维导图',
      'flowchart': '流程图',
      'concept-map': '概念关系图',
      'architecture': '架构图',
      'auto': '自动识别'
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="smart-rag-excalidraw-message">
        <div className="smart-rag-excalidraw-loading">
          <div className="smart-rag-spinner"></div>
          <span>正在生成图表...</span>
        </div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="smart-rag-excalidraw-message">
        {error && (
          <div className="smart-rag-excalidraw-error">
            <span>⚠️ {error}</span>
          </div>
        )}
        {result.textSummary && (
          <div className="smart-rag-excalidraw-summary">
            <p>{result.textSummary}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="smart-rag-excalidraw-message">
      <div className="smart-rag-excalidraw-header">
        <span className="smart-rag-excalidraw-type">
          📊 {getChartTypeLabel(result.chartType)}
        </span>
        <div className="smart-rag-excalidraw-actions">
          <button
            onClick={() => setIsZoomed(!isZoomed)}
            className="smart-rag-excalidraw-action-btn"
            title={isZoomed ? '缩小' : '放大'}
          >
            {isZoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
          </button>
          <button
            onClick={handleDownload}
            className="smart-rag-excalidraw-action-btn"
            title="下载图片"
          >
            <Download size={16} />
          </button>
          {onInsertToNote && (
            <button
              onClick={onInsertToNote}
              className="smart-rag-excalidraw-action-btn"
              title="插入到笔记"
            >
              <FileText size={16} />
            </button>
          )}
        </div>
      </div>
      
      <div className={`smart-rag-excalidraw-image-container ${isZoomed ? 'zoomed' : ''}`}>
        <img
          src={imageUrl}
          alt="Excalidraw Diagram"
          className="smart-rag-excalidraw-image"
        />
      </div>

      {result.textSummary && (
        <div className="smart-rag-excalidraw-summary">
          <p>💬 {result.textSummary}</p>
        </div>
      )}
    </div>
  );
};

export default ExcalidrawMessage;