# Smart RAG - Semantic RAG for Obsidian Vault

**Version**: 0.2.0-config (Phase 2: Configuration System)

Semantic RAG for Obsidian Vault with PGlite vector storage and LLM-powered chat.

## Features

- 🧠 **Semantic Chunking** - LLM-powered semantic text chunking
- 🔍 **Vector Search** - PGlite local vector storage with similarity search
- 💬 **Chat Interface** - Rich text editor with @vault query support
- 🔗 **LightRAG Integration** - Shared LightRAG Server for Graph RAG
- ⚙️ **Flexible Configuration** - 4 independent LLM configurations
- ✅ **Connection Testing** - Test each configuration with visual feedback
- 🔄 **Auto-save** - Settings auto-save on input change

## Architecture

### LLM Configuration

Smart RAG uses 4 independent LLM configurations:

| Config | Purpose | Example |
|--------|---------|---------|
| **Chat LLM** | User dialogue generation | Qwen/GLM (Alibaba Cloud) |
| **LightRAG LLM** | Internal LightRAG processing | LongCat-Flash-Lite |
| **Semantic Chunk LLM** | Text semantic chunking | Qwen/GLM (Alibaba Cloud) |
| **LightRAG Embedding** | Vectorization | BGE-M3 (LM Studio) |

Each configuration includes:
- Base URL
- API Key
- Model Name
- Max Tokens (optional)
- Temperature (optional)

### Connection Testing

Each configuration tab has a "Test Connection" button that:
- ✅ **Success**: Shows model name and response time
- ❌ **Failure**: Shows error details (network/auth/model error)
- 🔍 **Embedding**: Also shows embedding dimension

### Data Storage

- **PGlite** - Local vector storage in browser
- **LightRAG Server** - Shared Graph RAG (port 9621)
- **Working Directory** - `~/.openclaw/lightrag-data`

## Development Plan

### Phase 1: Minimum Skeleton (v0.1.0) ✅ Complete

- **Tabbed Settings UI** (4 LLM configurations with LightRAG Server controls)
- Simple right panel + input box
- Hard-coded config test for full pipeline

### Phase 2: Configuration System (v0.2.0) ✅ Current

- Configuration validation (connection test)
- Configuration persistence (save/load)
- Settings UI refinement
- Auto-save on input change

### Phase 3: Core Features (v0.3.0)

- PGlite database + Drizzle ORM
- Semantic chunking service
- Vector search logic

### Phase 4: Full UI (v0.4.0)

- Lexical editor integration
- Multi-panel layout
- Template system
- Chat history management

## Installation

### Development

```bash
cd ~/.openclaw/workspace/smart-rag
npm install
npm run dev
```

### Production

Copy `main.js`, `manifest.json`, `styles.css` to your Obsidian vault's `.obsidian/plugins/smart-rag/` folder.

## Configuration

Open Obsidian Settings → Smart RAG to configure:

1. **Chat LLM** - Your primary chat model
2. **LightRAG LLM** - Model for LightRAG internal processing
3. **Semantic Chunk LLM** - Model for text chunking
4. **LightRAG Embedding** - Embedding model (local LM Studio recommended)

## License

MIT

## Author

Frank Zhang

## Related Projects

- [Neural Composer](https://github.com/oscampo/obsidian-neural-composer) - Inspiration (to be replaced)
- [LightRAG](https://github.com/HKUDS/LightRAG) - Graph RAG engine
- [Smart Link Notes](https://github.com/openclaw/smart-link-notes) - Sister plugin