# Smart RAG - Semantic RAG for Obsidian Vault

**Version**: 0.3.4-complete (All Development Complete)

Semantic RAG for Obsidian Vault with PGlite vector storage and LLM-powered chat.

## Features

- 🧠 **Semantic Chunking** - LLM-powered semantic text chunking
- 🔍 **Vector Search** - PGlite local vector storage with similarity search
- 💬 **Chat Interface** - Multi-tab interface with Chat / Logs / Status tabs
- 🔗 **LightRAG Integration** - Shared LightRAG Server for Graph RAG
- ⚙️ **Flexible Configuration** - 4 independent LLM configurations
- ✅ **Connection Testing** - Test each configuration with visual feedback
- 🔄 **Auto-save** - Settings auto-save on input change
- 💬 **Chat Panel** - Enhanced chat interface with Markdown rendering
- 🔬 **RAG Query Support** - @vault to search vault and get cited answers
- 📊 **Real-time Status** - Live service status and statistics display

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

## Development Complete

All development versions have been completed:

### Phase 1: Minimum Skeleton (v0.1.0) ✅ Complete
- **Tabbed Settings UI** (4 LLM configurations with LightRAG Server controls)
- Simple right panel + input box
- Hard-coded config test for full pipeline

### Phase 2: Configuration System (v0.2.0) ✅ Complete
- Configuration validation (connection test)
- Configuration persistence (save/load)
- Settings UI refinement
- Auto-save on input change

### Step 1: Basic Chat Panel (v0.3.0) ✅ Complete
- **Right-side panel** with Markdown rendering
- **Input box** + Send button
- **Chat LLM integration** - Generate responses
- **Conversation history** display

### Step 2: Multi-tab Interface (v0.3.1) ✅ Complete
- **Tab Bar**: [Chat] [Logs] [Status]
- **Chat Tab**: Enhanced chat with Normal Chat / @Vault buttons
- **Logs Tab**: Semantic chunking progress display
- **Status Tab**: System status and statistics
- **Error Modal**: Detailed error display with retry

### Step 3: PGlite + Embedding Services (v0.3.2) ✅ Complete
- **PGlite Database Service** - Local vector storage
- **Drizzle ORM Schema** - Documents and chunks tables
- **Embedding Service** - Generate embeddings using LM Studio
- **Chunking Service** - Semantic text chunking with LLM

### Step 4: RAG Integration (v0.3.3) ✅ Complete
- **@Vault Search** - Vector search in vault
- **Citation Display** - [1], [2] format with sources
- **Context Injection** - Context-based response generation
- **Error Handling** - Comprehensive error handling with retry

### Status: 🎉 All Development Complete!

## Installation

### Development

```bash
cd ~/.openclaw/workspace/smart-rag
npm install
npm run build
# Copy main.js, manifest.json, styles.css to your Obsidian vault's .obsidian/plugins/smart-rag/ folder
```

### Production

Copy `main.js`, `manifest.json`, `styles.css` to your Obsidian vault's `.obsidian/plugins/smart-rag/` folder.

**Setup Steps**:
1. Add plugin to Obsidian vault
2. Open Settings → Smart RAG
3. Configure 4 LLM services:
   - **Chat LLM**: Your primary chat model
   - **LightRAG LLM**: Model for LightRAG internal processing
   - **Semantic Chunk LLM**: Model for text chunking
   - **LightRAG Embedding**: Embedding model (LM Studio recommended)
4. Click "Start Server" to start LightRAG Server
5. The plugin automatically initializes the database
6. Start using the chat panel!

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