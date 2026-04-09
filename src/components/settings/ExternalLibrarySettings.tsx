/**
 * ExternalLibrarySettings - Settings tab for external document library
 */

import { Setting, Notice } from "obsidian";
import SmartRAGPlugin from "../../main";

export class ExternalLibrarySettings {
  private plugin: SmartRAGPlugin;

  constructor(plugin: SmartRAGPlugin) {
    this.plugin = plugin;
  }

  render(container: HTMLElement, showAutoSaveBadge: () => void) {
    container.createEl("h3", { text: "📚 External Document Library" });

    // Enable external library
    new Setting(container)
      .setName("Enable External Library")
      .setDesc("Index and search external documents (PDF, Word, PPT, Excel, images)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.externalLibrary?.enabled ?? false)
          .onChange(async (value) => {
            this.plugin.settings.externalLibrary = {
              ...this.plugin.settings.externalLibrary,
              enabled: value,
            };
            showAutoSaveBadge();
          })
      );

    // Raw folder path
    new Setting(container)
      .setName("Raw Folder Path")
      .setDesc("Path to folder containing external documents")
      .addText((text) =>
        text
          .setPlaceholder("/path/to/documents")
          .setValue(this.plugin.settings.externalLibrary?.rawFolderPath || "")
          .onChange(async (value) => {
            this.plugin.settings.externalLibrary = {
              ...this.plugin.settings.externalLibrary,
              rawFolderPath: value,
            };
            showAutoSaveBadge();
          })
      );

    // Embedding provider
    new Setting(container)
      .setName("Embedding Provider")
      .setDesc("Provider for generating embeddings")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openai", "OpenAI")
          .addOption("dashscope", "DashScope (通义千问)")
          .addOption("ollama", "Ollama (Local)")
          .setValue(this.plugin.settings.externalLibrary?.embedding?.provider || "openai")
          .onChange(async (value) => {
            this.plugin.settings.externalLibrary = {
              ...this.plugin.settings.externalLibrary,
              embedding: {
                ...this.plugin.settings.externalLibrary?.embedding,
                provider: value as any,
              },
            };
            showAutoSaveBadge();
          })
      );

    // Embedding model
    new Setting(container)
      .setName("Embedding Model")
      .setDesc("Model for generating embeddings")
      .addText((text) =>
        text
          .setPlaceholder("text-embedding-3-small")
          .setValue(this.plugin.settings.externalLibrary?.embedding?.model || "text-embedding-3-small")
          .onChange(async (value) => {
            this.plugin.settings.externalLibrary = {
              ...this.plugin.settings.externalLibrary,
              embedding: {
                ...this.plugin.settings.externalLibrary?.embedding,
                model: value,
              },
            };
            showAutoSaveBadge();
          })
      );

    // Embedding dimension
    new Setting(container)
      .setName("Embedding Dimension")
      .setDesc("Vector dimension (1536 for text-embedding-3-small, 1024 for bge-m3)")
      .addText((text) =>
        text
          .setPlaceholder("1536")
          .setValue(String(this.plugin.settings.externalLibrary?.embedding?.dimension || 1536))
          .onChange(async (value) => {
            this.plugin.settings.externalLibrary = {
              ...this.plugin.settings.externalLibrary,
              embedding: {
                ...this.plugin.settings.externalLibrary?.embedding,
                dimension: parseInt(value) || 1536,
              },
            };
            showAutoSaveBadge();
          })
      );

    // Embedding API endpoint
    new Setting(container)
      .setName("Embedding API Endpoint")
      .setDesc("URL for the embedding API")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.externalLibrary?.embedding?.endpoint || "")
          .onChange(async (value) => {
            this.plugin.settings.externalLibrary = {
              ...this.plugin.settings.externalLibrary,
              embedding: {
                ...this.plugin.settings.externalLibrary?.embedding,
                endpoint: value,
              },
            };
            showAutoSaveBadge();
          })
      );

    // Embedding API Key
    new Setting(container)
      .setName("Embedding API Key")
      .setDesc("API key for the embedding service")
      .addText((text) =>
        text
          .setPlaceholder("sk-xxx")
          .setValue(this.plugin.settings.externalLibrary?.embedding?.apiKey || "")
          .onChange(async (value) => {
            this.plugin.settings.externalLibrary = {
              ...this.plugin.settings.externalLibrary,
              embedding: {
                ...this.plugin.settings.externalLibrary?.embedding,
                apiKey: value,
              },
            };
            showAutoSaveBadge();
          })
      );

    // Qdrant settings
    container.createEl("hr");
    container.createEl("h4", { text: "⚙️ Qdrant Settings" });

    new Setting(container)
      .setName("Qdrant HTTP Port")
      .setDesc("Port for Qdrant HTTP API")
      .addText((text) =>
        text
          .setPlaceholder("6333")
          .setValue(String(this.plugin.settings.qdrant?.httpPort || 6333))
          .onChange(async (value) => {
            this.plugin.settings.qdrant = {
              ...this.plugin.settings.qdrant,
              httpPort: parseInt(value) || 6333,
            };
            showAutoSaveBadge();
          })
      );

    new Setting(container)
      .setName("Qdrant Data Directory")
      .setDesc("Directory for Qdrant storage")
      .addText((text) =>
        text
          .setPlaceholder("~/.openclaw/smart-rag/qdrant-data")
          .setValue(this.plugin.settings.qdrant?.dataDir || "~/.openclaw/smart-rag/qdrant-data")
          .onChange(async (value) => {
            this.plugin.settings.qdrant = {
              ...this.plugin.settings.qdrant,
              dataDir: value,
            };
            showAutoSaveBadge();
          })
      );

    // RAG-Anything settings
    container.createEl("hr");
    container.createEl("h4", { text: "🔧 RAG-Anything Settings" });

    new Setting(container)
      .setName("RAG-Anything HTTP Port")
      .setDesc("Port for RAG-Anything HTTP service")
      .addText((text) =>
        text
          .setPlaceholder("8000")
          .setValue(String(this.plugin.settings.ragAnything?.httpPort || 8000))
          .onChange(async (value) => {
            this.plugin.settings.ragAnything = {
              ...this.plugin.settings.ragAnything,
              httpPort: parseInt(value) || 8000,
            };
            showAutoSaveBadge();
          })
      );

    // Qdrant status
    container.createEl("hr");
    container.createEl("h4", { text: "📊 Service Status" });

    const statusEl = container.createDiv("smart-rag-service-status");
    statusEl.setText("Checking...");

    const updateStatus = async () => {
      const qdrantRunning = await this.plugin.qdrantManager?.isRunning();
      const ragRunning = await this.plugin.ragAnythingManager?.isRunning();

      statusEl.innerHTML = `
        <div class="service-item">
          <span class="service-name">Qdrant:</span>
          <span class="service-status ${qdrantRunning ? "running" : "stopped"}">
            ${qdrantRunning ? "● Running" : "○ Stopped"}
          </span>
        </div>
        <div class="service-item">
          <span class="service-name">RAG-Anything:</span>
          <span class="service-status ${ragRunning ? "running" : "stopped"}">
            ${ragRunning ? "● Running" : "○ Stopped"}
          </span>
        </div>
      `;
    };

    updateStatus();
    setInterval(updateStatus, 5000);

    // Start/Stop buttons
    new Setting(container)
      .setName("Service Controls")
      .setDesc("Start or stop Qdrant and RAG-Anything services")
      .addButton((btn) =>
        btn
          .setButtonText("Start Services")
          .setCta()
          .onClick(async () => {
            try {
              await this.plugin.startExternalServices();
              new Notice("External services started!");
              updateStatus();
            } catch (error: any) {
              new Notice(`Failed to start: ${error.message}`);
            }
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Stop Services")
          .setWarning()
          .onClick(async () => {
            await this.plugin.stopExternalServices();
            new Notice("External services stopped!");
            updateStatus();
          })
      );
  }
}
