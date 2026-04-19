# Smart RAG - 详细技术文档

**版本**: 1.0.0
**最后更新**: 2026-04-14
**作者**: Frank Zhang

---

## 📋 目录

- [项目概述](#项目概述)
- [设计逻辑](#设计逻辑)
- [设计流程](#设计流程)
- [核心架构](#核心架构)
- [完整文件清单](#完整文件清单)
- [环境依赖](#环境依赖)
- [技术栈接口](#技术栈接口)
- [配置说明](#配置说明)
- [部署指南](#部署指南)

---

## 项目概述

Smart RAG 是一个为 Obsidian Vault 提供语义检索增强生成（RAG）功能的插件，集成了：
- **LightRAG**: 本地知识图谱引擎
- **Qdrant**: 向量数据库存储
- **RAG-Anything**: 文档解析服务
- **LLM Chat**: AI 对话功能

### 核心特性

✅ **多模态 RAG**: 支持文本、图片、PDF 等多种格式
✅ **知识图谱**: LightRAG 自动构建实体关系网络
✅ **向量检索**: Qdrant 高性能向量相似度搜索
✅ **灵活配置**: 支持多种 LLM Provider（OpenAI、阿里云、LM Studio 等）
✅ **实时索引**: 自动扫描 Vault 并更新索引
✅ **智能对话**: 基于知识图谱的 AI 对话

---

## 设计逻辑

### 1. 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Layer (React + Lexical)              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ChatView | Settings | Input Components | Modals    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Context Layer (React Context)            │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │Settings  │    RAG   │ Database │   Chat   │   MCP    │   │
│  │ Context  │  Context │  Context │  Context │ Context  │   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Service Layer                           │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │   RAG    │ Indexing │ Retrieval │   LLM    │  Embed   │   │
│  │  Engine  │  Engine  │  Engine  │ Manager  │ Service  │   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                     │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │ LightRAG │  Qdrant  │  RAG-    │ Database │ Platform │   │
│  │ Manager  │ Manager  │ Anything │ Manager  │ Manager  │   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2. 数据流

#### 2.1 索引流程

```
Vault Files → FileScanner → IndexingEngine → LightRAG/Qdrant
                                                    ↓
                                            Embedding Generation
                                                    ↓
                                            Knowledge Graph
```

#### 2.2 查询流程

```
User Query → Chat Input → QueryEngine → RAGEngine → LightRAG/Qdrant
                                                      ↓
                                           Vector Search + Graph Traversal
                                                      ↓
                                               Context Retrieval
                                                      ↓
                                               LLM Generation
```

### 3. 核心设计原则

| 原则 | 说明 | 实现位置 |
|------|------|----------|
| **可配置性** | 所有配置项用户可自定义 | `settings/` |
| **解耦性** | 各层独立，易于测试和扩展 | `contexts/` |
| **性能优化** | 并发处理、缓存、流式响应 | `core/` |
| **容错性** | Fallback 机制、错误处理 | `core/llm/` |
| **跨平台** | macOS、Windows、Linux 支持 | `utils/PlatformManager.ts` |

---

## 设计流程

### 1. 插件初始化流程

```typescript
// src/main.ts
export default class SmartRAGPlugin extends Plugin {
  async onload() {
    // 1. 加载配置
    await this.loadSettings();

    // 2. 初始化 Context Providers
    this.initContexts();

    // 3. 初始化核心服务
    this.initServices();

    // 4. 注册 UI
    this.registerUI();

    // 5. 启动后端服务（可选）
    if (settings.autoStart) {
      await this.startBackendServices();
    }
  }
}
```

### 2. 文件索引流程

```typescript
// src/core/indexing/IndexingEngine.ts
async indexVault(): Promise<void> {
  // 1. 扫描 Vault
  const files = await this.fileScanner.scanVault();

  // 2. 过滤已索引文件
  const newFiles = await this.filterNewFiles(files);

  // 3. 并发处理
  await Promise.all(
    newFiles.map(file => this.processFile(file))
  );

  // 4. 更新索引状态
  await this.updateIndexStatus();
}
```

### 3. RAG 查询流程

```typescript
// src/core/retrieval/QueryEngine.ts
async query(question: string): Promise<QueryResult> {
  // 1. 生成 Query Embedding
  const queryEmbedding = await this.embeddingService.generate(question);

  // 2. 向量检索
  const vectorResults = await this.vectorManager.search(queryEmbedding);

  // 3. LightRAG 图谱检索（可选）
  const graphResults = await this.lightRAGClient.query(question);

  // 4. 融合结果
  const context = this.mergeResults(vectorResults, graphResults);

  // 5. LLM 生成
  const answer = await this.llmService.chat(question, context);

  return { answer, sources: context };
}
```

### 4. LightRAG 服务管理流程

```typescript
// src/core/lightrag/LightRagManager.ts
async start(): Promise<boolean> {
  // 1. 检查是否已运行
  if (await this.isRunning()) return true;

  // 2. 构建 Python 环境变量
  const envVars = this.buildEnvVars();

  // 3. 启动 LightRAG 进程
  this.process = spawn(this.config.command, args, {
    env: { ...process.env, ...envVars }
  });

  // 4. 等待服务就绪
  await this.waitForReady();

  return true;
}
```

---

## 核心架构

### 1. 主要模块说明

#### 1.1 UI 层 (components/)

| 模块 | 功能 | 主要文件 |
|------|------|----------|
| **Chat UI** | 对话界面 | `ChatView.tsx`, `AssistantMessageContent.tsx` |
| **Chat Input** | 输入框组件 | `ChatUserInput.tsx`, `LexicalContentEditable.tsx` |
| **Mention Plugin** | @Vault/@file 提及 | `MentionPlugin.tsx`, `MentionNode.tsx` |
| **Settings UI** | 配置面板 | `SmartRAGSettingsProvider.tsx` |
| **Progress UI** | 进度显示 | `QueryProgress.tsx`, `DotLoader.tsx` |

#### 1.2 Context 层 (contexts/)

| Context | 功能 | 依赖 |
|---------|------|------|
| `SettingsContext` | 全局配置 | - |
| `RAGContext` | RAG 状态 | `SettingsContext` |
| `DatabaseContext` | 数据库连接 | - |
| `ChatViewContext` | 对话状态 | `RAGContext` |
| `MCPContext` | MCP 工具 | - |

#### 1.3 Service 层 (core/)

| Service | 功能 | 主要接口 |
|---------|------|----------|
| **RAGEngine** | RAG 查询引擎 | `query(question, mode)` |
| **IndexingEngine** | 索引引擎 | `indexVault()`, `indexFile(file)` |
| **QueryEngine** | 检索引擎 | `search(query, topK)` |
| **LightRagManager** | LightRAG 服务 | `start()`, `stop()`, `isRunning()` |
| **QdrantManager** | Qdrant 服务 | `start()`, `stop()`, `ensureBinary()` |
| **RAGAnythingManager** | RAG-Anything 服务 | `start()`, `stop()`, `processDocument()` |

#### 1.4 LLM 层 (core/llm/)

| Provider | 支持模型 | 配置文件 |
|----------|----------|----------|
| **OpenAI** | GPT-4, GPT-3.5 | `openai.ts`, `openaiCompatibleProvider.ts` |
| **Anthropic** | Claude | `anthropic.ts` |
| **Google** | Gemini | `gemini.ts` |
| **DeepSeek** | DeepSeek-V3 | `deepseekStudioProvider.ts` |
| **Mistral** | Mistral, Mixtral | `mistralProvider.ts` |
| **Groq** | Llama 3 | `groq.ts` |
| **LM Studio** | 本地模型 | `lmStudioProvider.ts` |
| **Ollama** | 本地模型 | `ollama.ts` |

#### 1.5 数据库层 (database/)

| 组件 | 功能 | 技术 |
|------|------|------|
| **DatabaseManager** | 数据库管理 | PGlite + Drizzle ORM |
| **VectorManager** | 向量操作 | `VectorRepository.ts` |
| **TemplateManager** | 模板管理 | `TemplateRepository.ts` |
| **ChatManager** | 对话历史 | `chat/ChatManager.ts` |

#### 1.6 工具层 (utils/)

| 工具 | 功能 | 文件 |
|------|------|------|
| **SemanticChunker** | 语义分块 | `SemanticChunker.ts` |
| **Token Utils** | Token 计算 | `llm/token.ts` |
| **Price Calculator** | 价格计算 | `llm/price-calculator.ts` |
| **Platform Manager** | 跨平台支持 | `PlatformManager.ts` |
| **Image Utils** | 图片处理 | `llm/image.ts` |

---

## 完整文件清单

### 源代码文件 (src/)

#### 主入口
- `src/main.ts` - 插件主入口文件
- `src/ChatView.tsx` - Chat 视图组件
- `src/ApplyView.ts` - Apply 视图组件
- `src/constants.ts` - 常量定义

#### Components (src/components/)
- `src/components/SmartRAGSettingsProvider.tsx` - 设置提供者
- `src/components/chat-input/` - 聊天输入组件
  - `ChatUserInput.tsx` - 用户输入框
  - `ImageUploadButton.tsx` - 图片上传按钮
  - `LexicalContentEditable.tsx` - Lexical 编辑器
  - `MentionableBadge.tsx` - 提及标签
  - `ModelSelect.tsx` - 模型选择器
  - `SubmitButton.tsx` - 提交按钮
  - `ToolBadge.tsx` - 工具标签
  - `VaultChatButton.tsx` - Vault 对话按钮
- `src/components/chat-input/plugins/` - Lexical 插件
  - `image/DragDropPastePlugin.tsx` - 拖拽粘贴插件
  - `image/ImagePastePlugin.tsx` - 图片粘贴插件
  - `mention/MentionPlugin.tsx` - 提及插件
  - `mention/MentionNode.tsx` - 提及节点
  - `mention/AutoLinkMentionPlugin.tsx` - 自动链接提及
  - `no-format/NoFormatPlugin.tsx` - 无格式插件
  - `on-enter/OnEnterPlugin.tsx` - Enter 键插件
  - `on-mutation/OnMutationPlugin.tsx` - 变化监听插件
  - `template/CreateTemplatePopoverPlugin.tsx` - 模板创建弹窗插件
  - `template/TemplatePlugin.tsx` - 模板插件
  - `typeahead-menu/LexicalTypeaheadMenuPlugin.tsx` - 自动完成菜单插件
  - `shared/LexicalMenu.tsx` - Lexical 菜单
- `src/components/chat-input/utils/` - 输入工具
  - `editor-state-to-plain-text.ts` - 编辑器状态转文本
  - `get-metionable-icon.ts` - 获取提及图标
- `src/components/chat-view/` - 聊天视图组件
  - `Chat.tsx` - 聊天组件
  - `ChatListDropdown.tsx` - 聊天列表下拉
  - `ExcalidrawMessage.tsx` - Excalidraw 消息
  - `LLMResponseInfoPopover.tsx` - LLM 响应信息弹窗
  - `MarkdownCodeComponent.tsx` - Markdown 代码组件
  - `MarkdownReferenceBlock.tsx` - Markdown 引用块
  - `ObsidianMarkdown.tsx` - Obsidian Markdown 渲染
  - `QueryProgress.tsx` - 查询进度
  - `SimilaritySearchResults.tsx` - 相似度搜索结果
  - `SyntaxHighlighterWrapper.tsx` - 语法高亮包装器
  - `ToolMessage.tsx` - 工具消息
  - `UserMessageItem.tsx` - 用户消息项
  - `AssistantMessageContent.tsx` - AI 助手消息内容
  - `AssistantMessageReasoning.tsx` - AI 助手推理过程
  - `AssistantMessageAnnotations.tsx` - AI 助手标注
  - `AssistantToolMessageGroupActions.tsx` - AI 助手工具消息组操作
  - `AssistantToolMessageGroupItem.tsx` - AI 助手工具消息组项
  - `useAutoScroll.ts` - 自动滚动 Hook
  - `useChatStreamManager.ts` - 聊天流管理 Hook
- `src/components/common/` - 通用组件
  - `DotLoader.tsx` - 点状加载器
  - `ObsidianButton.tsx` - Obsidian 按钮
  - `ObsidianSetting.tsx` - Obsidian 设置项
  - `ObsidianTextInput.tsx` - Obsidian 文本输入
  - `ObsidianToggle.tsx` - Obsidian 切换开关
  - `ReactModal.tsx` - React 模态框
  - `SplitButton.tsx` - 分割按钮
- `src/components/modals/` - 模态框组件
  - `ConfirmModal.tsx` - 确认模态框
  - `ErrorModal.tsx` - 错误模态框
  - `McpSectionModal.tsx` - MCP 部分模态框
  - `TemplateFormModal.tsx` - 模板表单模态框
  - `TemplateSectionModal.tsx` - 模板部分模态框

#### Contexts (src/contexts/)
- `src/contexts/app-context.tsx` - 应用上下文
- `src/contexts/chat-view-context.tsx` - 聊天视图上下文
- `src/contexts/dark-mode-context.tsx` - 暗黑模式上下文
- `src/contexts/database-context.tsx` - 数据库上下文
- `src/contexts/mcp-context.tsx` - MCP 上下文
- `src/contexts/plugin-context.tsx` - 插件上下文
- `src/contexts/rag-context.tsx` - RAG 上下文
- `src/contexts/settings-context.tsx` - 设置上下文

#### Core (src/core/)
- `src/core/indexing/` - 索引模块
  - `FileScanner.ts` - 文件扫描器
  - `IndexingEngine.ts` - 索引引擎
- `src/core/lightrag/` - LightRAG 模块
  - `LightRagManager.ts` - LightRAG 管理器
- `src/core/llm/` - LLM 模块
  - `base.ts` - LLM 基类
  - `manager.ts` - LLM 管理器
  - `exception.ts` - LLM 异常
  - `openai.ts` - OpenAI 适配器
  - `openaiCompatibleProvider.ts` - OpenAI 兼容提供者
  - `openaiMessageAdapter.ts` - OpenAI 消息适配器
  - `anthropic.ts` - Anthropic 适配器
  - `gemini.ts` - Gemini 适配器
  - `deepseekStudioProvider.ts` - DeepSeek 提供者
  - `deepseekMessageAdapter.ts` - DeepSeek 消息适配器
  - `mistralProvider.ts` - Mistral 提供者
  - `mistralMessageAdapter.ts` - Mistral 消息适配器
  - `groq.ts` - Groq 适配器
  - `ollama.ts` - Ollama 适配器
  - `lmStudioProvider.ts` - LM Studio 提供者
  - `openRouterProvider.ts` - OpenRouter 提供者
  - `perplexityProvider.ts` - Perplexity 提供者
  - `perplexityMessageAdapter.ts` - Perplexity 消息适配器
  - `morphProvider.ts` - Morph 提供者
  - `requestUrlClient.ts` - 请求 URL 客户端
  - `requestUrlMessageAdapter.ts` - 请求 URL 消息适配器
  - `azureOpenaiProvider.ts` - Azure OpenAI 提供者
  - `NoStainlessOpenAI.ts` - 非 Stainless OpenAI
- `src/core/mcp/` - MCP 模块
  - `mcpManager.ts` - MCP 管理器
  - `nullMcpManager.ts` - 空 MCP 管理器
  - `exception.ts` - MCP 异常
  - `tool-name-utils.ts` - 工具名称工具
- `src/core/qdrant/` - Qdrant 模块
  - `QdrantManager.ts` - Qdrant 管理器
  - `QdrantClient.ts` - Qdrant 客户端
  - `collections.ts` - 集合管理
- `src/core/rag-anything/` - RAG-Anything 模块
  - `RAGAnythingManager.ts` - RAG-Anything 管理器
- `src/core/rag/` - RAG 模块
  - `ragEngine.ts` - RAG 引擎
  - `embedding.ts` - Embedding 服务
- `src/core/retrieval/` - 检索模块
  - `QueryEngine.ts` - 查询引擎

#### Database (src/database/)
- `src/database/DatabaseManager.ts` - 数据库管理器
- `src/database/exception.ts` - 数据库异常
- `src/database/schema.ts` - 数据库模式
- `src/database/migrations.json` - 数据库迁移
- `src/database/json/` - JSON 数据库
  - `base.ts` - 基类
  - `constants.ts` - 常量
  - `exception.ts` - 异常
  - `chat/` - 聊天数据
    - `ChatManager.ts` - 聊天管理器
    - `types.ts` - 类型定义
  - `template/` - 模板数据
    - `TemplateManager.ts` - 模板管理器
    - `types.ts` - 类型定义
- `src/database/modules/` - 数据库模块
  - `template/` - 模板模块
    - `TemplateManager.ts` - 模板管理器
    - `TemplateRepository.ts` - 模板仓库
  - `vector/` - 向量模块
    - `VectorManager.ts` - 向量管理器
    - `VectorRepository.ts` - 向量仓库

#### Hooks (src/hooks/)
- `src/hooks/useChatHistory.ts` - 聊天历史 Hook
- `src/hooks/useJsonManagers.ts` - JSON 管理器 Hook

#### Services (src/services/)
- `src/services/excalidrawGenerator.ts` - Excalidraw 生成器
- `src/services/excalidrawRenderer.ts` - Excalidraw 渲染器

#### Settings (src/settings/)
- `src/settings/schema/` - 设置模式
  - `setting.types.ts` - 设置类型
  - `migrations/` - 迁移脚本
    - `index.ts` - 迁移索引
    - `migrationUtils.ts` - 迁移工具
    - `0_to_1.ts` - 版本 0 到 1 迁移
    - `1_to_2.ts` - 版本 1 到 2 迁移
    - `2_to_3.ts` - 版本 2 到 3 迁移
    - `3_to_4.ts` - 版本 3 到 4 迁移
    - `4_to_5.ts` - 版本 4 到 5 迁移
    - `5_to_6.ts` - 版本 5 到 6 迁移
    - `6_to_7.ts` - 版本 6 到 7 迁移
    - `7_to_8.ts` - 版本 7 到 8 迁移
    - `8_to_9.ts` - 版本 8 到 9 迁移
    - `9_to_10.ts` - 版本 9 到 10 迁移
    - `10_to_11.ts` - 版本 10 到 11 迁移
    - `11_to_12.ts` - 版本 11 到 12 迁移

#### Types (src/types/)
- `src/types/chat-model.types.ts` - 聊天模型类型
- `src/types/chat.ts` - 聊天类型
- `src/types/embedding-model.types.ts` - Embedding 模型类型
- `src/types/embedding.ts` - Embedding 类型
- `src/types/llm/` - LLM 类型
  - `request.ts` - 请求类型
  - `response.ts` - 响应类型
- `src/types/mcp.types.ts` - MCP 类型
- `src/types/mentionable.ts` - 可提及类型
- `src/types/prompt-level.types.ts` - 提示级别类型
- `src/types/provider.types.ts` - 提供者类型
- `src/types/tool-call.types.ts` - 工具调用类型

#### Utils (src/utils/)
- `src/utils/PlatformManager.ts` - 平台管理器
- `src/utils/SemanticChunker.ts` - 语义分块器
- `src/utils/common/` - 通用工具
  - `chunk-array.ts` - 数组分块
  - `classnames.ts` - 类名工具
- `src/utils/chat/` - 聊天工具
  - `apply.ts` - 应用工具
  - `fetch-annotation-titles.ts` - 获取标注标题
  - `mentionable.ts` - 可提及工具
  - `message-groups.ts` - 消息分组
  - `parse-tag-content.ts` - 解析标签内容
  - `promptGenerator.ts` - 提示生成器
  - `responseGenerator.ts` - 响应生成器
  - `youtube-transcript.ts` - YouTube 字幕
- `src/utils/llm/` - LLM 工具
  - `image.ts` - 图片工具
  - `price-calculator.ts` - 价格计算器
  - `request.ts` - 请求工具
  - `token.ts` - Token 工具
- `src/utils/fetch-utils.ts` - 获取工具
- `src/utils/fuzzy-search.ts` - 模糊搜索
- `src/utils/obsidian.ts` - Obsidian 工具
- `src/utils/requestUrlFetchAdapter.ts` - 请求 URL 获取适配器
- `src/utils/smartRAGSettingsAdapter.ts` - Smart RAG 设置适配器

### 编译输出文件 (dist/)

包含所有 `src/` 文件编译后的 JavaScript 文件，结构与 `src/` 相同。

### 配置文件

- `manifest.json` - Obsidian 插件清单
- `package.json` - Node.js 包配置
- `tsconfig.json` - TypeScript 配置
- `esbuild.config.mjs` - ESBuild 构建配置
- `styles.css` - 插件样式
- `main.js` - 主入口文件（编译输出）

### 文档文件 (docs/)

- `docs/ARCHITECTURE.md` - 架构文档
- `docs/UI-DESIGN.md` - UI 设计文档
- `docs/v1.0.0-architecture.md` - v1.0.0 架构文档

### 脚本文件 (scripts/)

- `scripts/e2e-test.js` - 端到端测试脚本

### 其他文件

- `CHANGELOG.md` - 变更日志
- `README.md` - 项目说明
- `import-meta-url-shim.js` - Import Meta URL 垫片

---

## 环境依赖

### 系统要求

| 组件 | 版本要求 | 说明 |
|------|---------|------|
| **Obsidian** | >= 1.0.0 | 主应用 |
| **Node.js** | >= 18.0.0 | 开发环境 |
| **TypeScript** | >= 5.6.0 | 编译器 |
| **Python** | >= 3.14 | LightRAG 运行时 |

### Python 依赖

```bash
# LightRAG
pip install lightrag

# Qdrant Client
pip install qdrant-client

# 文档解析
pip install docling
pip install mineru

# LLM 客户端
pip install openai
```

### Node.js 依赖

主要依赖见 `package.json`：
- `@lexical/react` - 文本编辑器
- `openai` - OpenAI SDK
- `@qdrant/js-client-rest` - Qdrant JavaScript 客户端
- `react` + `react-dom` - UI 框架
- `@tanstack/react-query` - 数据获取

### 外部服务

| 服务 | 默认端口 | 用途 |
|------|---------|------|
| **LightRAG** | 9621 | 知识图谱服务 |
| **Qdrant** | 6333 | 向量数据库 |
| **RAG-Anything** | 8000 | 文档解析服务 |
| **LM Studio** | 1234 | 本地 LLM 服务 |

---

## 技术栈接口

### 1. LightRAG 接口

#### 1.1 启动服务

```bash
lightrag-server \
  --host 127.0.0.1 \
  --port 9621 \
  --working-dir /path/to/data \
  --llm-binding openai \
  --embedding-binding openai \
  --max-async 20
```

#### 1.2 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `OPENAI_API_KEY` | LLM API Key | `sk-xxx` |
| `OPENAI_API_BASE` | LLM Base URL | `http://localhost:1234/v1` |
| `OPENAI_EMBEDDING_API_KEY` | Embedding API Key | `sk-xxx` |
| `OPENAI_EMBEDDING_API_BASE` | Embedding Base URL | `http://localhost:1234/v1` |
| `LLM_MODEL` | LLM 模型 | `qwen-plus` |
| `EMBEDDING_MODEL` | Embedding 模型 | `text-embedding-bge-m3` |
| `EMBEDDING_DIM` | Embedding 维度 | `1024` |
| `LLM_TIMEOUT` | LLM 超时（秒） | `600` |

#### 1.3 API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/index` | POST | 索引文档 |
| `/query` | POST | 查询知识图谱 |
| `/status` | GET | 索引状态 |

### 2. Qdrant 接口

#### 2.1 启动服务

```bash
qdrant --config-path /path/to/config/production.yaml
```

#### 2.2 配置文件

```yaml
# config/production.yaml
service:
  host: 127.0.0.1
  http_port: 6333
  grpc_port: 6334

storage:
  storage_path: /path/to/qdrant/storage

log_level: INFO
```

#### 2.3 API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 欢迎页面 |
| `/health` | GET | 健康检查 |
| `/collections` | GET/POST | 集合管理 |
| `/collections/{name}/points` | PUT | 插入向量 |
| `/collections/{name}/points/search` | POST | 向量搜索 |

### 3. RAG-Anything 接口

#### 3.1 启动服务

```bash
python rag_anything_server.py \
  --host 127.0.0.1 \
  --port 8000 \
  --working-dir /path/to/data \
  --parser docling
```

#### 3.2 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_BASE_URL` | LLM Base URL | `http://localhost:1234/v1` |
| `LLM_API_KEY` | LLM API Key | `sk-xxx` |
| `LLM_MODEL` | LLM 模型 | `qwen-plus` |
| `EMBEDDING_BASE_URL` | Embedding Base URL | `http://localhost:1234/v1` |
| `EMBEDDING_API_KEY` | Embedding API Key | `sk-xxx` |
| `EMBEDDING_MODEL` | Embedding 模型 | `text-embedding-bge-m3` |
| `EMBEDDING_DIMENSION` | Embedding 维度 | `1024` |

#### 3.3 API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/parse` | POST | 解析文档 |
| `/process` | POST | 处理文档（索引） |

### 4. LLM Provider 接口

#### 4.1 OpenAI 兼容接口

所有 LLM Provider 遵循 OpenAI API 规范：

```typescript
interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  maxTokens: number;
  temperature: number;
}

interface ChatRequest {
  model: string;
  messages: Array<{role: string; content: string}>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}
```

#### 4.2 支持的 Provider

| Provider | Base URL 格式 | 状态 |
|----------|--------------|------|
| **OpenAI** | `https://api.openai.com/v1` | ✅ 完整支持 |
| **阿里云百炼** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | ✅ 完整支持 |
| **LM Studio** | `http://localhost:1234/v1` | ✅ 完整支持 |
| **Ollama** | `http://localhost:11434/v1` | ✅ 完整支持 |
| **DeepSeek** | `https://api.deepseek.com/v1` | ✅ 完整支持 |
| **Groq** | `https://api.groq.com/openai/v1` | ✅ 完整支持 |
| **Mistral** | `https://api.mistral.ai/v1` | ✅ 完整支持 |

### 5. 数据库接口

#### 5.1 PGlite 接口

```typescript
// src/database/DatabaseManager.ts
class DatabaseManager {
  async initialize(): Promise<void>;
  async getVectorManager(): Promise<VectorManager>;
  async getTemplateManager(): Promise<TemplateManager>;
}
```

#### 5.2 Vector 接口

```typescript
interface VectorManager {
  async insert(embedding: number[], metadata: any): Promise<number>;
  async search(queryEmbedding: number[], topK: number): Promise<Result[]>;
  async delete(id: number): Promise<void>;
  async clear(): Promise<void>;
}
```

---

## 配置说明

### 1. 主配置结构

```typescript
interface NeuralComposerSettings {
  // Chat LLM 配置
  chatLLM: LLMConfig;

  // LightRAG 配置
  lightRAG: LightRAGConfig;

  // Embedding 配置
  embedding: EmbeddingConfig;

  // Qdrant 配置
  qdrant: QdrantConfig;

  // RAG-Anything 配置
  ragAnything: RAGAnythingConfig;

  // UI 配置
  ui: {
    theme: 'light' | 'dark' | 'system';
    fontSize: number;
    showThinking: boolean;
  };
}
```

### 2. LLM 配置

```typescript
interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  baseUrl: string;
  apiKey: string;
  modelName: string;
  maxTokens: number;
  temperature: number;
  fallbackModels: string[];
}
```

### 3. LightRAG 配置

```typescript
interface LightRAGConfig {
  serverUrl: string;
  enabled: boolean;
  command: string;
  workingDir: string;

  // LLM 配置
  llmBinding: string;
  llmModel: string;
  llmBaseUrl: string;
  llmApiKey: string;

  // Embedding 配置
  embeddingBinding: string;
  embeddingModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingDim: number;

  // 向量存储配置
  vectorStorage: 'NanoVectorDBStorage' | 'QdrantVectorDBStorage';
  qdrantUrl: string;

  // 分块配置
  chunkOverlapSize: number;
  maxGleaning: number;
  entityTypes: string[];

  // 检索配置
  summaryLanguage: string;
  cosineThreshold: number;
  forceLLMSummaryOnMerge: number;
  relatedChunkNumber: number;

  // 选项
  llmConcurrency: number;
  embeddingConcurrency: number;
  maxGraphNodes: number;
  chunkingStrategy: string;
  logLevel: string;
}
```

---

## 部署指南

### 1. 开发环境

```bash
# 1. 安装依赖
npm install

# 2. 开发模式
npm run dev

# 3. 编译
npm run build

# 4. 构建后复制到 Obsidian
cp dist/main.js ~/.obsidian/plugins/smart-rag/
cp manifest.json ~/.obsidian/plugins/smart-rag/
cp styles.css ~/.obsidian/plugins/smart-rag/
```

### 2. 生产环境

```bash
# 1. 编译
npm run build

# 2. 复制到 Obsidian 插件目录
mkdir -p ~/.obsidian/plugins/smart-rag
cp dist/main.js ~/.obsidian/plugins/smart-rag/
cp manifest.json ~/.obsidian/plugins/smart-rag/
cp styles.css ~/.obsidian/plugins/smart-rag/

# 3. 在 Obsidian 中启用插件
# 设置 → 第三方插件 → Smart RAG → 启用
```

### 3. 启动后端服务

```bash
# 1. LightRAG
cd ~/.openclaw/workspace/tools/lightrag-manager
./start.sh

# 2. Qdrant
cd ~/.openclaw/workspace/tools/qdrant
./start.sh

# 3. RAG-Anything (可选)
cd ~/.openclaw/workspace/tools/rag-anything
./start.sh
```

### 4. 配置插件

1. 打开 Obsidian 设置 → 第三方插件 → Smart RAG
2. 配置 LLM 参数（Base URL、API Key、Model）
3. 配置 LightRAG 服务地址
4. 配置 Qdrant 服务地址
5. 保存并重启 Obsidian

---

## 变量调用说明

### 1. 全局变量

| 变量 | 类型 | 访问方式 |
|------|------|----------|
| `plugin` | `SmartRAGPlugin` | 插件实例 |
| `app` | `App` | Obsidian 应用实例 |
| `settings` | `NeuralComposerSettings` | 插件配置 |

### 2. Context 变量

```typescript
// Settings Context
const { settings, updateSettings } = useSettingsContext();

// RAG Context
const { ragEngine, isIndexing } = useRAGContext();

// Chat View Context
const { messages, sendMessage } = useChatViewContext();
```

### 3. 服务变量

```typescript
// RAGEngine
const ragEngine = new RAGEngine(
  app,
  settings,
  vectorManager,
  serverUrl,
  restartServerCallback
);

// IndexingEngine
const indexingEngine = new IndexingEngine(
  app,
  settings,
  vectorManager
);

// QueryEngine
const queryEngine = new QueryEngine(
  settings,
  vectorManager
);
```

---

## 故障排除

### 1. 常见问题

#### 1.1 LightRAG 启动失败

**问题**: 端口被占用

**解决**:
```bash
lsof -i :9621
kill -9 <PID>
```

#### 1.2 Embedding 失败

**问题**: 模型未加载

**解决**:
- 检查 LM Studio 是否运行
- 确认模型已下载
- 验证 Base URL 配置

#### 1.3 Qdrant 连接失败

**问题**: 服务未运行

**解决**:
```bash
cd ~/.openclaw/workspace/tools/qdrant
./start.sh
```

### 2. 日志调试

```typescript
// 启用调试日志
console.log('[Smart RAG]', message);

// 查看 LightRAG 日志
tail -f ~/.openclaw/lightrag-data/smart-rag/lightrag.log

// 查看 Qdrant 日志
tail -f ~/.openclaw/qdrant-data/qdrant.log
```

---

## 性能优化

### 1. 索引优化

| 优化项 | 说明 | 配置 |
|--------|------|------|
| **并发处理** | 并发索引文件 | `llmConcurrency: 5` |
| **分块大小** | 控制分块粒度 | `chunkSize: 1024` |
| **缓存机制** | 避免重复计算 | 使用 Embedding Cache |

### 2. 查询优化

| 优化项 | 说明 | 配置 |
|--------|------|------|
| **Top-K** | 限制返回结果 | `topK: 10` |
| **相似度阈值** | 过滤低相关结果 | `threshold: 0.7` |
| **流式响应** | 实时显示结果 | `stream: true` |

---

## 许可证

MIT License - 免费用于个人和商业用途

---

**版本**: 1.0.0
**最后更新**: 2026-04-14
**作者**: Frank Zhang