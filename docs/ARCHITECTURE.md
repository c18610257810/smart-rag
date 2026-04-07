# smart RAG Architecture

**Version**: 0.1.0-skeleton  
**Date**: 2026-04-07

## Project Goals

Replace Neural Composer with a simpler, more configurable Obsidian plugin for semantic RAG.

## Design Decisions

### 1. Project Name

**Decision**: `smart RAG`

**Rationale**:
- Simple and descriptive
- Highlights RAG capability
- Easy to remember

### 2. LLM Provider Configuration

**Decision**: Fully user-configurable, no hard-coded providers

**Rationale**:
- User wants flexibility to use any OpenAI-compatible API
- Support for: Alibaba Cloud (Qwen/GLM), LongCat, Ollama, LM Studio, etc.
- No preset limitations

**Configuration Structure**:

```typescript
interface SmartRAGSettings {
  chatLLM: LLMConfig;         // User dialogue generation
  lightRAGLLM: LLMConfig;     // LightRAG internal processing
  semanticChunkLLM: LLMConfig; // Text semantic chunking
  lightRAGEmbedding: EmbeddingConfig; // Vectorization
}

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  maxTokens?: number;
  temperature?: number;
}
```

**Default Values** (user can override):

| Config | Base URL | Model | API Key |
|--------|----------|-------|---------|
| Chat LLM | `https://coding.dashscope.aliyuncs.com/v1` | `glm-5` | Alibaba Cloud |
| LightRAG LLM | `https://api.longcat.chat/openai/v1` | `LongCat-Flash-Lite` | LongCat |
| Semantic Chunk LLM | `https://coding.dashscope.aliyuncs.com/v1` | `glm-5` | Alibaba Cloud |
| LightRAG Embedding | `http://127.0.0.1:1234` | `text-embedding-bge-m3` | LM Studio |

### 3. UI Complexity

**Decision**: Full UI (Lexical editor + multi-panel) + enhancements

**Rationale**:
- User wants full Neural Composer-like experience
- Enhancements: clearer config UI, real-time status, better error messages

**Components**:
- Lexical editor (rich text, Markdown rendering)
- Multi-panel layout (chat, notes, settings)
- Template system
- Multi-turn conversation history

**Enhancements over Neural Composer**:
- 4 LLM configs grouped clearly
- Real-time status monitoring (LLM connection, Embedding progress)
- Better error messages (specific config problem location)
- Semantic chunking visualization (show chunk boundaries)

### 4. LightRAG Integration

**Decision**: Shared LightRAG Server

**Rationale**:
- User will delete Neural Composer after smart RAG is complete
- Transitional period: share config file with Neural Composer
- Final state: smart RAG sole user of LightRAG Server

**Architecture**:

```
~/.openclaw/lightrag-data/lightrag-config.json (shared config)
                ↓
         LightRAG Server (port 9621)
                ↓
            smart RAG
        (replaces Neural Composer)
```

**Config File**: `~/.openclaw/lightrag-data/lightrag-config.json`

### 5. Development Priority

**Decision**: Layered incremental development

**Rationale**:
- All three modules (config, core, UI) depend on each other
- Cannot test independently
- Strategy: each phase keeps system in testable state

**Development Phases**:

```
Phase 1: Minimum Skeleton (v0.1.0) ✅ Current
├── Config: Basic Settings Tab
├── UI: Simple right panel
├── Features: Hard-coded test
└── ✅ Testable: Complete one dialogue + RAG query

Phase 2: Configuration System (v0.2.0)
├── Config validation (connection test)
├── Config persistence (save/load)
├── Settings UI refinement
└── ✅ Testable: User can modify and verify config

Phase 3: Core Features (v0.3.0)
├── PGlite database + Drizzle ORM
├── Semantic chunking service
├── Vector search logic
└── ✅ Testable: Query local vector store

Phase 4: Full UI (v0.4.0)
├── Lexical editor
├── Multi-panel layout
├── Template system
└── ✅ Testable: Full user experience
```

## Data Architecture

### PGlite + Drizzle

**Purpose**: Local vector storage in Obsidian

**Schema** (planned):

```sql
-- Documents table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Chunks table
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id),
  content TEXT NOT NULL,
  embedding VECTOR(1024), -- BGE-M3 dimension
  metadata JSONB
);

-- Vector index (PGlite extension)
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops);
```

### LightRAG Server

**Purpose**: Graph RAG for knowledge graph queries

**Shared with**: Neural Composer (transitional), eventually only smart RAG

**Port**: 9621

**Config File**: `~/.openclaw/lightrag-data/lightrag-config.json`

## Reusable Components

From Smart Link Notes:

| Component | Path | Status |
|-----------|------|--------|
| SemanticChunkService.ts | `smart-link-notes/src/services/` | ✅ Reusable |
| EmbeddingService.ts | `smart-link-notes/src/services/` | ✅ Reusable |
| LightRAGService.ts | `smart-link-notes/src/services/` | ✅ Reusable (partial) |

From lightrag-manager:

| Component | Path | Status |
|-----------|------|--------|
| semantic_chunker_with_tags.py | `tools/lightrag-manager/` | ✅ Reference |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Plugin Framework | Obsidian API |
| Language | TypeScript |
| Build | esbuild |
| Vector DB | PGlite + Drizzle ORM |
| LLM Client | OpenAI-compatible API |
| Embedding | BGE-M3 via LM Studio |
| Graph RAG | LightRAG Server |
| UI Editor | Lexical (Phase 4) |

## File Structure

```
smart-rag/
├── manifest.json         # Obsidian plugin manifest
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript config
├── esbuild.config.mjs    # Build config
├── src/
│   ├── main.ts           # Plugin entry point
│   ├── settings.ts       # Settings tab
│   ├── services/
│   │   ├── llm.ts        # LLM service
│   │   ├── embedding.ts  # Embedding service
│   │   ├── chunking.ts   # Semantic chunking
│   │   ├── database.ts   # PGlite + Drizzle
│   │   └── lightrag.ts   # LightRAG client
│   └── ui/
│       ├── ChatPanel.ts  # Chat interface
│       └── LexicalEditor.ts # Rich text editor (Phase 4)
├── docs/
│   ├── ARCHITECTURE.md   # This file
│   └── API.md            # API documentation (future)
├── README.md
└── CHANGELOG.md
```

## Next Actions

1. ✅ Create project structure (Phase 1 skeleton)
2. ⏭️ Implement basic Settings Tab
3. ⏭️ Test hard-coded configuration
4. ⏭️ Implement simple chat panel

---

**Last Updated**: 2026-04-07  
**Status**: Phase 1 Complete - Ready for Phase 2