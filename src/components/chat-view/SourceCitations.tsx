/**
 * SourceCitations - UI component displaying source citations in chat results
 */

import * as React from "react";
import { SourceInfo, ImageInfo } from "../../core/retrieval/QueryEngine";

interface SourceCitationsProps {
  sources: SourceInfo[];
  images: ImageInfo[];
  onSourceClick?: (source: SourceInfo) => void;
}

export const SourceCitations: React.FC<SourceCitationsProps> = ({
  sources,
  images,
  onSourceClick,
}) => {
  if (sources.length === 0 && images.length === 0) {
    return null;
  }

  return React.createElement("div", { className: "smart-rag-citations" },
    // Sources section
    sources.length > 0 && React.createElement("div", { className: "citations-section" },
      React.createElement("div", { className: "citations-header" },
        React.createElement("span", { className: "citations-icon" }, "📄"),
        React.createElement("span", null, `Sources (${sources.length})`)
      ),
      React.createElement("div", { className: "citations-list" },
        sources.map((source, i) =>
          React.createElement("div", {
            key: i,
            className: "citation-item",
            onClick: () => onSourceClick?.(source),
            title: "Click to open source",
          },
            React.createElement("div", { className: "citation-title" },
              React.createElement("span", { className: "citation-number" }, `[${i + 1}]`),
              source.title
            ),
            source.page && React.createElement("span", { className: "citation-page" },
              `p.${source.page}`
            ),
            React.createElement("div", { className: "citation-preview" },
              source.content.substring(0, 150) + (source.content.length > 150 ? "..." : "")
            ),
            React.createElement("div", { className: "citation-score" },
              `Relevance: ${(source.score * 100).toFixed(0)}%`
            )
          )
        )
      )
    ),

    // Images section
    images.length > 0 && React.createElement("div", { className: "citations-section" },
      React.createElement("div", { className: "citations-header" },
        React.createElement("span", { className: "citations-icon" }, "🖼️"),
        React.createElement("span", null, `Related Images (${images.length})`)
      ),
      React.createElement("div", { className: "citations-list" },
        images.map((img, i) =>
          React.createElement("div", {
            key: i,
            className: "citation-item citation-image",
          },
            React.createElement("div", { className: "citation-description" },
              img.description
            ),
            img.page && React.createElement("span", { className: "citation-page" },
              `p.${img.page}`
            ),
            React.createElement("div", { className: "citation-source" },
              `Source: ${img.sourceFile}`
            )
          )
        )
      )
    )
  );
};
