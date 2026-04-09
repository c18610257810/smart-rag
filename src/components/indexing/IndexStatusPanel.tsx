/**
 * IndexStatusPanel - UI component showing indexing progress
 */

import { App, Notice } from "obsidian";
import * as React from "react";
import { IndexingProgress } from "../core/indexing/IndexingEngine";

interface IndexStatusPanelProps {
  app: App;
  progress: IndexingProgress | null;
  isIndexing: boolean;
  onStartVaultIndex: () => void;
  onStartRawIndex: () => void;
  onStopIndex: () => void;
  stats: Record<string, number>;
}

export const IndexStatusPanel: React.FC<IndexStatusPanelProps> = ({
  progress,
  isIndexing,
  onStartVaultIndex,
  onStartRawIndex,
  onStopIndex,
  stats,
}) => {
  const vaultCount = stats["vault_notes"] || 0;
  const rawCount = stats["raw_documents"] || 0;
  const imageCount = stats["images"] || 0;

  return React.createElement("div", { className: "smart-rag-index-panel" },
    // Stats section
    React.createElement("div", { className: "smart-rag-index-stats" },
      React.createElement("h4", null, "Index Statistics"),
      React.createElement("div", { className: "smart-rag-stat" },
        React.createElement("span", { className: "stat-label" }, "Vault Notes:"),
        React.createElement("span", { className: "stat-value" }, vaultCount)
      ),
      React.createElement("div", { className: "smart-rag-stat" },
        React.createElement("span", { className: "stat-label" }, "Raw Documents:"),
        React.createElement("span", { className: "stat-value" }, rawCount)
      ),
      React.createElement("div", { className: "smart-rag-stat" },
        React.createElement("span", { className: "stat-label" }, "Images:"),
        React.createElement("span", { className: "stat-value" }, imageCount)
      )
    ),

    // Progress section
    progress && React.createElement("div", { className: "smart-rag-index-progress" },
      React.createElement("h4", null, "Indexing Progress"),
      React.createElement("div", { className: "progress-message" }, progress.message),
      React.createElement("div", { className: "progress-bar-container" },
        React.createElement("div", {
          className: "progress-bar",
          style: {
            width: progress.totalFiles > 0
              ? `${(progress.processedFiles / progress.totalFiles) * 100}%`
              : "0%",
          }
        })
      ),
      React.createElement("div", { className: "progress-details" },
        `Processed: ${progress.processedFiles}/${progress.totalFiles}`,
        progress.failedFiles > 0 && `, Failed: ${progress.failedFiles}`
      ),
      progress.currentFile && React.createElement("div", { className: "current-file" },
        `Current: ${progress.currentFile}`
      )
    ),

    // Control buttons
    React.createElement("div", { className: "smart-rag-index-controls" },
      React.createElement("button", {
        className: "smart-rag-btn smart-rag-btn-primary",
        onClick: onStartVaultIndex,
        disabled: isIndexing,
      }, isIndexing ? "Indexing..." : "Index Vault"),

      React.createElement("button", {
        className: "smart-rag-btn smart-rag-btn-secondary",
        onClick: onStartRawIndex,
        disabled: isIndexing,
      }, isIndexing ? "Indexing..." : "Index Raw Folder"),

      isIndexing && React.createElement("button", {
        className: "smart-rag-btn smart-rag-btn-danger",
        onClick: onStopIndex,
      }, "Stop")
    )
  );
};
