# Changelog

All notable changes to this project will be documented in this file.

## [0.3.4-complete] - 2026-04-08

### Added
- ✅ **PGlite Database Service** - Local vector storage with Drizzle ORM
- ✅ **Embedding Service** - Generate embeddings using LM Studio
- ✅ **Chunking Service** - LLM-powered semantic text chunking
- ✅ **@Vault Search** - Vector search in vault with citations
- ✅ **Citation Display** - [1], [2] format with sources
- ✅ **Context Injection** - Context-based response generation
- ✅ **Complete UI Enhancements** - Logs Tab and Status Tab with real-time updates
- ✅ **CSS Stylesheet** - Full styling for all interface elements

### Changed
- Version: 0.3.1-tabs → 0.3.4-complete
- Complete rewrite of ChatPanel.ts to integrate RAG services
- All services properly initialized and interconnected

### Technical Details
- **Database Service**: PGlite + Drizzle ORM with documents and chunks tables
- **Embedding Service**: OpenAI-compatible embedding API
- **Chunking Service**: LLM-powered semantic text splitting
- **RAG Integration**: Vector search with similarity scoring and citation
- **Status Updates**: Real-time monitoring with auto-refresh

## [0.3.1-tabs] - 2026-04-08

### Added
- ✅ **Multi-tab Interface** - Chat / Logs / Status tabs
- ✅ **Tab Bar** - Navigation between tabs
- ✅ **Chat Tab** - Enhanced chat interface with Normal Chat and @Vault buttons
- ✅ **Logs Tab** - Placeholder for semantic chunking progress (Step 3)
- ✅ **Status Tab** - Placeholder for system status (Step 3)
- ✅ **Error Modal** - Detailed error display with stack trace, request ID, and retry option
- ✅ **Action Buttons** - Normal Chat, @Vault, Clear, Send, Stop

### Changed
- Version: 0.2.0-config → 0.3.1-tabs
- ChatPanel.ts completely refactored from simple modal to multi-tab interface
- Added ErrorModal.ts component
- Updated main.ts to import ErrorModal

### Technical Details
- Tab switching implemented with show/hide logic
- Error handling enhanced with detailed modal
- UI follows Neural Composer design guidelines
- Reserved interfaces for Step 3-5 features (@Vault functionality, real-time logs, etc.)

## [0.2.0-config] - 2026-04-07

### Added
- ✅ **Connection Testing** - Test button for each LLM/Embedding configuration
  - Chat LLM: Send test completion request
  - LightRAG LLM: Send test completion request
  - Semantic Chunk LLM: Send test completion request
  - Embedding: Send test embedding request
- ✅ **Test Results Display** - Visual feedback for connection tests
  - Success: Show model name + response time
  - Failure: Show error details (network/auth/model)
- ✅ **Auto-save** - Settings auto-save after 1 second of input change
- ✅ **Auto-save Badge** - "✓ Auto-saved" notification on input change

### Changed
- Version: 0.1.0-skeleton → 0.2.0-config
- Added ConnectionTester service (`src/services/connectionTester.ts`)

### Technical Details
- ConnectionTester class with 3 test methods:
  - `testLLMConnection()` - Test Chat/Semantic Chunk/LightRAG LLM
  - `testEmbeddingConnection()` - Test Embedding API
  - `testLightRAGHealth()` - Test LightRAG server health
- Auto-save uses debounce (1 second timeout)
- Test buttons disable during testing with "Testing..." text

## [0.1.0-skeleton] - 2026-04-07

### Added
- 🎉 Initial release (Phase 1: Minimum Skeleton)
- Tabbed Settings UI (4 tabs: Chat LLM, LightRAG LLM, Semantic Chunk, LightRAG Embedding)
- LightRAG Server controls (Start/Stop buttons)
- Server status display (Running/Busy/Stopped)
- Status bar indicator
- Configuration persistence
- Basic plugin structure

### Features
- ✅ Plugin name: Smart RAG (capitalized)
- ✅ 4 independent LLM configurations
- ✅ LightRAG Server start/stop functionality
- ✅ Configuration write to LightRAG config file
- ✅ Settings save/load

---