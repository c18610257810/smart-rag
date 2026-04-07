# Changelog

All notable changes to this project will be documented in this file.

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