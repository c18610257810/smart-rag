# Smart RAG — Obsidian 语义 RAG 插件

> **版本**: 1.1.0  
> **作者**: Frank Zhang  
> **许可证**: MIT  
> **平台**: macOS Desktop Only  
> **构建时间**: 2026-04-11

---

## 📋 目录

1. [概述](#概述)
2. [系统架构](#系统架构)
3. [核心组件](#核心组件)
4. [数据流](#数据流)
5. [API 接口](#api-接口)
6. [配置说明](#配置说明)
7. [外部依赖](#外部依赖)
8. [工作流程](#工作流程)
9. [开发指南](#开发指南)
10. [故障排查](#故障排查)

---

## 概述

Smart RAG 是一个 **Obsidian 插件**，提供完整的检索增强生成（RAG）解决方案。它将 Obsidian Vault 中的笔记、外部文档（PDF/Word/图片等）和图像进行向量化索引，存储到 Qdrant 向量数据库中，通过 LLM 提供语义搜索和智能问答。

### 核心能力

| 能力 | 说明 |
|------|------|
| 📝 **Vault 笔记索引** | 自动扫描 Obsidian Vault 中的 Markdown 笔记，向量化后存入 Qdrant |
| 📄 **外部文档索引** | 通过 RAG-Anything 解析 PDF/Word/PPT/Excel/图片等文档，提取文本和图像 |
| 🔗 **知识图谱构建** | 通过 LightRAG 从笔记中提取实体和关系，构建知识图谱 |
| 💬 **语义搜索 & 问答** | 基于向量的语义搜索 + LLM 生成的自然语言回答 |
| 🖼️ **图像检索** | 支持图像描述向量化，按语义搜索图片 |
| ⚙️ **全配置化** | 所有 API Key、URL、模型名均可配置，无硬编码凭据 |

### 技术栈

- **前端**: TypeScript + React 19 + Obsidian Plugin API
- **向量数据库**: Qdrant (本地运行)
- **Embedding**: OpenAI 兼容 API（支持 DashScope、Ollama、LM Studio）
- **LLM**: OpenAI 兼容 API（支持 LongCat、Qwen、Claude 等）
- **知识图谱**: LightRAG (Python)
- **文档解析**: RAG-Anything (MinerU/Docling/PaddleOCR)
- **构建工具**: esbuild + TypeScript

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Obsidian                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Smart RAG 插件                       │  │
│  │                                                       │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ChatView  │  │SettingTab    │  │IndexingEngine   │  │  │
│  │  │(React UI)│  │(5 个配置页签) │  │(扫描/索引)      │  │  │
│  │  └────┬─────┘  └──────┬───────┘  └────────┬────────┘  │  │
│  │       │                │                    │           │  │
│  │  ┌────┴────────────────┴────────────────────┴────────┐  │  │
│  │  │              QueryEngine                          │  │  │
│  │  │   (语义检索 + LLM 回答 + 多源聚合)                   │  │  │
│  │  └────────────────────┬──────────────────────────────┘  │  │
│  │                       │                                  │  │
│  └───────────────────────┼──────────────────────────────────┘  │
│                          │                                     │
│  ┌───────────────────────┼──────────────────────────────────┐  │
│  │        外部服务（通过子进程启动）                           │  │
│  │                       │                                  │  │
│  │  ┌─────────────┐  ┌──┴───────┐  ┌──────────────────┐    │  │
│  │  │  LightRAG   │  │  Qdrant  │  │  RAG-Anything    │    │  │
│  │  │  (知识图谱)  │  │(向量存储) │  │  (文档解析)       │    │  │
│  │  │  :9621      │  │  :6333   │  │  :8000           │    │  │
│  │  └──────┬──────┘  └────┬─────┘  └────────┬─────────┘    │  │
│  └─────────┼──────────────┼─────────────────┼──────────────┘  │
└────────────┼──────────────┼─────────────────┼─────────────────┘
             │              │                 │
             ▼              ▼                 ▼
       ┌──────────┐  ┌──────────┐  ┌──────────────┐
       │  LLM API  │  │ Embedding │  │  MinerU /    │
       │ LongCat  │  │  API     │  │  Docling     │
       │ Qwen     │  │ DashScope│  │  PaddleOCR   │
       │ Claude   │  │ Ollama   │  │              │
       └──────────┘  └──────────┘  └──────────────┘
```

---

## 核心组件

### 1. 插件主模块 (`main.ts`)

**职责**: 插件生命周期管理、设置管理、服务协调

#### 关键类和方法

```typescript
class SmartRAGPlugin extends Plugin {
    settings: SmartRAGSettings;       // 全局配置
    qdrantManager: QdrantManager;     // Qdrant 进程管理
    qdrantClient: QdrantClientWrapper; // Qdrant API 客户端
    ragAnythingManager: RAGAnythingManager; // 文档解析管理
    lightRagManager: LightRagManager;  // LightRAG 进程管理
    indexingEngine: IndexingEngine;    // 索引引擎
    queryEngine: QueryEngine;          // 查询引擎
}
```

#### 生命周期

| 阶段 | 方法 | 说明 |
|------|------|------|
| 加载 | `onload()` | 读取配置、注册视图/命令/菜单、初始化子服务 |
| 保存 | `saveSettings()` | 深合并配置 → 保存到 `data.json` → 同步到 LightRagManager |
| 卸载 | `onunload()` | 清除定时器、停止所有外部服务 |

#### 注册内容

| 类型 | ID/名称 | 说明 |
|------|---------|------|
| View | `neuralcmp-chat-view` | 聊天面板视图 |
| Ribbon Icon | 🧠 Brain | 点击打开聊天面板 |
| Command | `open-chat-panel` | 打开聊天面板 |
| Command | `index-raw-folder` | 索引外部文档文件夹 |
| Context Menu | `Ingest file` | 右键文件 → 索引到 LightRAG |
| Context Menu | `Ingest entire folder` | 右键文件夹 → 批量索引 |
| Status Bar | Summary + 3 个服务状态点 | 每 5 秒刷新状态 |

### 2. Qdrant 向量数据库

#### QdrantManager (`core/qdrant/QdrantManager.ts`)

**职责**: 本地 Qdrant 进程管理

| 方法 | 说明 |
|------|------|
| `start()` | 下载二进制（如不存在）、生成配置文件、启动进程、等待健康检查 |
| `stop()` | 发送 SIGTERM → 等待退出（5s）→ SIGKILL → lsof 清理端口 |
| `isRunning()` | 通过 `lsof -i :6333 -sTCP:LISTEN` 检查进程状态 |
| `waitForHealthy()` | 轮询 `/health` 端点，最长等待 90 秒 |
| `ensureBinary()` | 下载 Qdrant 二进制到 `~/.openclaw/smart-rag/qdrant-bin/` |
| `ensureConfig()` | 生成 `storage.yaml` 配置文件 |

#### QdrantClientWrapper (`core/qdrant/QdrantClient.ts`)

**职责**: Qdrant REST API 操作封装

| 方法 | 说明 |
|------|------|
| `initialize()` | 创建 `@qdrant/js-client-rest` 客户端 |
| `createCollections(dimension)` | 创建 3 个集合 |
| `upsertVaultNotes(notes)` | 插入 Vault 笔记向量 |
| `upsertRawDocuments(docs)` | 插入外部文档向量 |
| `upsertImages(images)` | 插入图像向量 |
| `searchVault(queryVector, topK)` | 语义搜索 Vault 笔记 |
| `searchRaw(queryVector, topK)` | 语义搜索外部文档 |
| `searchImages(queryVector, topK)` | 语义搜索图像 |
| `deleteByPath(path)` | 按文件路径删除所有关联向量 |
| `getAllStats()` | 获取所有集合的统计信息 |

#### 集合定义 (`core/qdrant/collections.ts`)

| 集合名 | 用途 | Payload 字段 |
|--------|------|-------------|
| `vault-notes` | Obsidian 笔记 | `path`, `title`, `content`, `mtime`, `hash`, `startLine`, `endLine` |
| `raw-documents` | 外部文档 | `path`, `title`, `content`, `page`, `sourceFile`, `hash` |
| `images` | 文档中的图像 | `description`, `sourceFile`, `page`, `hash`, `width`, `height` |

### 3. LightRAG 知识图谱

#### LightRagManager (`core/lightrag/LightRagManager.ts`)

**职责**: 启动和管理 LightRAG Python 服务

| 方法 | 说明 |
|------|------|
| `start()` | 构建命令行参数 → 构建环境变量 → spawn 子进程 → 等待健康检查 |
| `stop()` | 发送 SIGTERM → 等待退出（5s）→ SIGKILL → lsof 清理端口 |
| `isRunning()` | 通过 `lsof -i :{port} -sTCP:LISTEN` 检查进程状态 |
| `updateConfig(config)` | 更新内部配置（用户修改设置后必须调用） |

#### 启动参数

```bash
lightrag-server \
  --host 127.0.0.1 \
  --port 9621 \
  --working-dir ~/.openclaw/lightrag-data \
  --llm-binding openai \
  --llm-binding-host <LLM_API_URL> \
  --llm-model <LLM_MODEL> \
  --embedding-binding openai \
  --embedding-binding-host <EMBEDDING_API_URL> \
  --embedding-model <EMBEDDING_MODEL> \
  --max-async 4 \
  --log-level INFO
```

#### 环境变量

| 变量 | 说明 |
|------|------|
| `LLM_BINDING` | LLM 后端类型（openai/ollama） |
| `LLM_BINDING_HOST` | LLM API 地址 |
| `LLM_MODEL` | LLM 模型名 |
| `LLM_BINDING_API_KEY` | LLM API Key |
| `EMBEDDING_BINDING` | Embedding 后端类型 |
| `EMBEDDING_BINDING_HOST` | Embedding API 地址 |
| `EMBEDDING_MODEL` | Embedding 模型名 |
| `EMBEDDING_BINDING_API_KEY` | Embedding API Key |
| `EMBEDDING_DIM` | 向量维度 |

#### LightRAG API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/documents/text` | POST | 索引单个文本文档 |
| `/documents/texts` | POST | 批量索引多个文本片段 |
| `/query` | POST | 知识图谱查询 |
| `/health` | GET | 健康检查 |

### 4. RAG-Anything 文档解析

#### RAGAnythingManager (`core/rag-anything/RAGAnythingManager.ts`)

**职责**: 启动和管理 RAG-Anything Python HTTP 服务

| 方法 | 说明 |
|------|------|
| `start()` | 启动 Python HTTP 服务，传递配置参数 |
| `stop()` | 发送 SIGTERM → 等待退出（5s）→ SIGKILL → lsof 清理端口 |
| `isRunning()` | 通过 `lsof -i :{port} -sTCP:LISTEN` 检查进程状态 |
| `isInstalled()` | 检查 RAG-Anything 是否已安装 |

#### 启动参数

```bash
python3 server.py \
  --host 127.0.0.1 \
  --port 8000 \
  --working-dir ~/.openclaw/rag-storage \
  --parser mineru \
  --llm-base-url <URL> \
  --llm-api-key <KEY> \
  --llm-model <MODEL> \
  --embedding-base-url <URL> \
  --embedding-api-key <KEY> \
  --embedding-model <MODEL> \
  --embedding-dimension 1024 \
  --llm-concurrency 6 \
  --embedding-concurrency 3
```

#### 解析器选项

| 解析器 | 说明 | 适用场景 |
|--------|------|---------|
| `mineru` | MinerU（推荐） | PDF 文档，支持公式/表格/图像提取 |
| `docling` | Docling | Word/Excel/PPT 文档 |
| `paddleocr` | PaddleOCR | 扫描件/图片中的文字识别 |

### 5. 索引引擎 (`core/indexing/IndexingEngine.ts`)

**职责**: 扫描和索引文件到 Qdrant

#### 索引流程

```
1. 扫描文件 (FileScanner)
   ├── 扫描 Obsidian Vault (.md 文件)
   └── 扫描 Raw Folder (PDF/Word/PPT/Excel/图片等)

2. 向量化
   ├── Markdown → 按段落分块 → Embedding API → 向量
   └── 其他文档 → RAG-Anything 解析 → 提取文本/图像 → Embedding API → 向量

3. 存储
   └── Qdrant (vault-notes / raw-documents / images)
```

#### 进度反馈

```typescript
interface IndexingProgress {
    phase: "scanning" | "indexing-vault" | "indexing-raw" | "done" | "error";
    totalFiles: number;
    processedFiles: number;
    failedFiles: number;
    currentFile: string;
    message: string;
}
```

### 6. 查询引擎 (`core/retrieval/QueryEngine.ts`)

**职责**: 统一查询接口，跨多个数据源检索

#### 查询流程

```
1. 用户输入问题
   ↓
2. 将问题向量化 (Embedding API)
   ↓
3. 并行搜索三个数据源
   ├── vault-notes (Obsidian 笔记)
   ├── raw-documents (外部文档)
   └── images (图像描述)
   ↓
4. 聚合搜索结果，构建上下文
   ↓
5. 将上下文 + 问题发送给 LLM
   ↓
6. 返回自然语言回答 + 引用来源
```

#### 查询选项

```typescript
interface QueryOptions {
    topK?: number;           // 返回结果数量 (默认 10)
    includeVault?: boolean;  // 是否搜索 Vault (默认 true)
    includeRaw?: boolean;    // 是否搜索外部文档 (默认 true)
    includeImages?: boolean; // 是否搜索图像 (默认 true)
    contextWindow?: number;  // 上下文窗口大小 (默认 8000)
}
```

#### 返回结果

```typescript
interface QueryResult {
    answer: string;      // LLM 生成的回答
    sources: SourceInfo[];  // 引用来源列表
    images: ImageInfo[];    // 相关图像列表
    rawAnswer: string;      // 原始 LLM 输出
    usedVault: boolean;     // 是否使用了 Vault 数据
    usedRaw: boolean;       // 是否使用了外部文档数据
    usedImages: boolean;    // 是否使用了图像数据
}
```

### 7. 语义分块器 (`utils/SemanticChunker.ts`)

**职责**: 将长文本按语义边界切分成块

#### 分块策略

| 策略 | 说明 |
|------|------|
| 基于 Embedding | 使用 Embedding API 计算段落相似度，在相似度突变处分割 |
| 基于段落 (回退) | 按自然段落分割，不需要 API 调用 |

#### 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `breakpointThreshold` | 0.75 | 语义边界阈值 |
| `maxChunkTokens` | 800 | 每个分块的最大 token 数 |
| `overlapRatio` | 0.1 | 分块重叠比例 |
| `minSentencesPerChunk` | 3 | 每个分块最少句子数 |

### 8. 聊天界面 (`ChatView.tsx` + `components/`)

**职责**: React 组件，提供用户交互界面

#### 主要组件

| 组件 | 说明 |
|------|------|
| `ChatView` | 主聊天面板，显示对话历史 |
| `ChatInput` | 输入框，支持 @Vault 搜索触发 |
| `QueryProgress` | 查询进度显示 |
| `SettingsTab` | 5 个配置页签的渲染 |

---

## 数据流

### 索引数据流

```
┌─────────────────┐
│   Obsidian      │
│   Vault (.md)   │
└────────┬────────┘
         │ 读取文件内容
         ▼
┌─────────────────┐     ┌──────────────────┐
│ SemanticChunker │ ──→ │  分块后的文本片段  │
└────────┬────────┘     └────────┬─────────┘
         │                       │ Embedding API
         ▼                       ▼
┌─────────────────────────────────────────┐
│              Qdrant                     │
│  ┌───────────┐ ┌─────────────┐         │
│  │vault-notes│ │raw-documents│  ...    │
│  └───────────┘ └─────────────┘         │
└─────────────────────────────────────────┘
```

### 查询数据流

```
┌─────────────────┐
│   用户问题       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Embedding API   │ ──→ │  问题向量         │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│           Qdrant 语义搜索                │
│  返回 Top-K 最相关片段                    │
└────────┬────────────────────────────────┘
         │ 相关上下文
         ▼
┌─────────────────┐     ┌──────────────────┐
│   LLM API       │ ──→ │  自然语言回答      │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│           ChatView 显示结果              │
│  回答 + 引用来源 + 相关图像               │
└─────────────────────────────────────────┘
```

### LightRAG 知识图谱数据流

```
┌─────────────────┐
│   Markdown 文件  │
└────────┬────────┘
         │ 语义分块
         ▼
┌─────────────────┐
│  LightRAG API   │
│  POST /documents/texts
└────────┬────────┘
         │ 提取实体和关系
         ▼
┌─────────────────┐
│  知识图谱存储     │
│  (Neo4j / JSON)  │
└────────┬────────┘
         │ 图谱检索
         ▼
┌─────────────────┐
│  相关上下文      │
│  (实体/关系/引用) │
└─────────────────┘
```

---

## API 接口

### 插件内部接口

#### Embedding API (OpenAI 兼容)

```
POST {baseUrl}/v1/embeddings
Headers:
  Content-Type: application/json
  Authorization: Bearer {apiKey}
Body:
  {
    "model": "{model}",
    "input": ["文本1", "文本2"]
  }
Response:
  {
    "data": [
      { "embedding": [0.1, 0.2, ...] }
    ]
  }
```

#### LLM API (OpenAI 兼容)

```
POST {baseUrl}/chat/completions
Headers:
  Content-Type: application/json
  Authorization: Bearer {apiKey}
Body:
  {
    "model": "{model}",
    "messages": [{"role": "user", "content": "prompt"}],
    "max_tokens": 4096,
    "temperature": 0.7
  }
Response:
  {
    "choices": [{
      "message": { "content": "回答内容" }
    }]
  }
```

#### Qdrant REST API

```
GET  http://127.0.0.1:6333/health
GET  http://127.0.0.1:6333/collections
POST http://127.0.0.1:6333/collections/{name}/points
POST http://127.0.0.1:6333/collections/{name}/points/search
```

#### LightRAG API

```
GET  http://127.0.0.1:9621/health
POST http://127.0.0.1:9621/documents/text
POST http://127.0.0.1:9621/documents/texts
POST http://127.0.0.1:9621/query
```

#### RAG-Anything API

```
POST http://127.0.0.1:8000/parse    # 解析文档
GET  http://127.0.0.1:8000/health   # 健康检查
```

---

## 配置说明

### 配置存储位置

```
~/.obsidian/plugins/smart-rag/data.json
```

### 配置结构

```typescript
interface SmartRAGSettings {
    chatLLM: ChatLLMConfig;       // 聊天 LLM 配置
    embedding: EmbeddingConfig;    // Embedding 配置
    lightRAG: LightRAGConfig;      // LightRAG 配置
    qdrant: QdrantConfig;          // Qdrant 配置
    ragAnything: RAGAnythingConfig;// RAG-Anything 配置
    rawFolderPath: string;         // 外部文档文件夹路径
}

interface LightRAGConfig {
    // ... 基础配置 ...
    vectorStorage: 'NanoVectorDBStorage' | 'QdrantVectorDBStorage'; // 向量存储类型
    qdrantUrl: string;             // Qdrant 服务地址（当 vectorStorage=QdrantVectorDBStorage）
    llmConcurrency: number;        // LLM API 并发数
    embeddingConcurrency: number;  // Embedding API 并发数
    embeddingModel: string;        // Embedding 模型名
    embeddingBaseUrl: string;      // Embedding API 地址
    embeddingApiKey: string;       // Embedding API Key
    embeddingDim: number;          // 向量维度
}
```

### 设置页签

| 页签 | 包含配置项 |
|------|----------|
| **Chat LLM** | Base URL, API Key, 模型名, Max Tokens, Temperature |
| **Embedding** | Provider, Base URL, API Key, Model, Dimension + LightRAG LLM 配置 |
| **LightRAG** | 启用开关, Server URL, 命令路径, 工作目录, LLM 配置, Embedding 配置, 并发控制, 分块策略, 日志级别 |
| **Qdrant** | HTTP 端口, 数据目录 |
| **RAG-Anything** | 启用开关, HTTP 端口, 工作目录, 解析器, LLM 配置, Embedding 配置, 并发控制 |

### 配置持久化

- 每个输入框的 `onChange` 都会自动更新 `settings` 对象
- 点击 **Save** 按钮时调用 `saveSettings()` 保存到 `data.json`
- `saveSettings()` 同时调用 `lightRagManager.updateConfig()` 同步最新配置
- `loadSettings()` 使用深合并策略，保留默认值的同时应用用户修改

### 配置同步机制

```
用户修改设置 → onChange 更新 settings 对象
                              ↓
                    点击 Save 按钮
                              ↓
            saveSettings() → 保存到 data.json
                              ↓
            lightRagManager.updateConfig() 同步配置
                              ↓
                    配置生效
```

---

## 外部依赖

### Python 服务

| 服务 | 安装方式 | Python 版本 | 端口 |
|------|---------|------------|------|
| **LightRAG** | `pip install lightrag` | 3.11+ | 9621 | **v1.4.13** |
| **Qdrant** | 自动下载二进制 | N/A (Rust) | 6333 |
| **RAG-Anything** | `pip install rag-anything` | 3.11+ | 8000 |

### Python 虚拟环境

```
~/.openclaw/workspace/venv/     # LightRAG 使用的虚拟环境
```

### Embedding 服务

| 服务 | Base URL 示例 | 模型 | 维度 | 说明 |
|------|--------------|------|------|------|
| **DashScope** | `https://dashscope.aliyuncs.com/v1` | `text-embedding-v3` | 1024 | 阿里云，推荐 |
| **Ollama** | `http://127.0.0.1:11434` | `bge-m3` | 1024 | 本地运行 |
| **LM Studio** | `http://127.0.0.1:1234` | `text-embedding-bge-m3` | 1024 | 本地运行 |
| **OpenAI** | `https://api.openai.com/v1` | `text-embedding-3-small` | 1536 | 官方 API |

### LLM 服务

| 服务 | Base URL 示例 | 模型 | 说明 |
|------|--------------|------|------|
| **LongCat** | `https://api.longcat.chat/openai/v1` | `LongCat-Flash-Lite` | 免费额度 |
| **DashScope** | `https://dashscope.aliyuncs.com/v1` | `qwen-plus` | 阿里云 |
| **Ollama** | `http://127.0.0.1:11434` | `qwen2.5` | 本地运行 |

### npm 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@qdrant/js-client-rest` | ^1.17.0 | Qdrant REST 客户端 |
| `openai` | ^6.33.0 | OpenAI SDK |
| `react` | ^19.2.4 | UI 框架 |
| `lexical` | ^0.42.0 | 富文本编辑器 |
| `@tanstack/react-query` | ^5.96.2 | 数据获取和缓存 |
| `@anthropic-ai/sdk` | ^0.85.0 | Anthropic Claude SDK |
| `@google/generative-ai` | ^0.24.1 | Google Gemini SDK |
| `langchain` | ^1.3.1 | LLM 链式调用 |
| `fuzzysort` | ^3.1.0 | 模糊搜索 |
| `minimatch` | ^10.2.5 | 文件路径匹配 |

---

## 工作流程

### 1. 首次安装设置

```
1. 安装 Obsidian 插件
   └── 复制 main.js, manifest.json 到 .obsidian/plugins/smart-rag/

2. 配置 Embedding 服务
   └── Provider: dashscope (推荐) 或 ollama
   └── Base URL: https://dashscope.aliyuncs.com/v1
   └── Model: text-embedding-v3
   └── API Key: 你的阿里云 Key

3. 配置 Chat LLM
   └── Base URL: https://api.longcat.chat/openai/v1
   └── Model: LongCat-Flash-Lite
   └── API Key: 你的 API Key

4. 启动外部服务
   └── 在设置页签点击 Start 按钮
   └── Qdrant → :6333
   └── LightRAG → :9621 (可选)
   └── RAG-Anything → :8000 (可选)

5. 索引 Vault
   └── 右键文件夹 → "Ingest entire folder"
   └── 或右键文件 → "Ingest file"

6. 开始使用
   └── 点击 🧠 Ribbon 图标打开聊天面板
   └── 输入问题，获取回答
```

### 2. 日常索引流程

#### 索引单个文件
```
右键文件 → Ingest file
  ↓
读取文件内容
  ↓
语义分块 (按段落 + Embedding API)
  ↓
POST /documents/texts → LightRAG
  ↓
完成
```

#### 索引文件夹
```
右键文件夹 → Ingest entire folder
  ↓
遍历所有 .md 文件
  ↓
逐个文件分块 → LightRAG
  ↓
统计成功/失败数量
  ↓
完成通知
```

#### 索引外部文档
```
设置 Raw Folder 路径
  ↓
命令面板 → Index Raw Folder
  ↓
FileScanner 扫描所有文件
  ↓
RAG-Anything 解析文档
  ↓
Embedding API 向量化
  ↓
Qdrant 存储
  ↓
完成通知
```

### 3. 查询流程

```
用户在聊天面板输入问题
  ↓
Embedding API 将问题向量化
  ↓
并行搜索 Qdrant:
  ├── vault-notes (语义搜索笔记)
  ├── raw-documents (语义搜索文档)
  └── images (语义搜索图像)
  ↓
聚合 Top-K 结果
  ↓
构建上下文 prompt
  ↓
LLM API 生成回答
  ↓
显示回答 + 引用来源
```

### 4. 设置保存流程

```
用户在设置界面修改配置
  ↓
onChange → 更新 settings 对象
  ↓
点击 Save 按钮
  ↓
saveSettings() 
  ├── deepMerge(DEFAULT_SETTINGS, savedData)
  ├── saveData(settings) → data.json
  └── lightRagManager.updateConfig(config)
  ↓
Notice 提示 "Settings saved"
```

---

## 开发指南

### 项目结构

```
smart-rag/
├── src/
│   ├── main.ts                    # 插件入口
│   ├── ChatView.tsx               # 聊天面板 React 组件
│   ├── ApplyView.ts               # 应用视图 (stub)
│   ├── constants.ts               # 常量定义
│   ├── components/                # React 组件
│   │   └── chat-view/            # 聊天视图相关组件
│   ├── contexts/                  # React Contexts
│   ├── core/                      # 核心模块
│   │   ├── indexing/             # 索引引擎
│   │   ├── lightrag/             # LightRAG 管理
│   │   ├── llm/                  # LLM 提供者
│   │   ├── mcp/                  # MCP 集成
│   │   ├── qdrant/               # Qdrant 管理
│   │   ├── rag/                  # RAG 引擎
│   │   ├── rag-anything/         # RAG-Anything 管理
│   │   └── retrieval/            # 查询引擎
│   ├── database/                  # 数据库层 (PGlite stub)
│   ├── hooks/                     # React Hooks
│   ├── services/                  # 服务层
│   ├── settings/                  # 设置类型
│   ├── types/                     # 类型定义
│   ├── ui/                        # UI 组件
│   ├── utils/                     # 工具函数
│   │   ├── SemanticChunker.ts    # 语义分块
│   │   ├── PlatformManager.ts    # 平台适配
│   │   └── ...
│   └── views/                     # 视图
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── manifest.json
└── main.js                        # 构建输出
```

### 构建命令

```bash
# 开发模式 (watch)
npm run dev

# 生产构建
npm run build

# 版本发布
npm run version
```

### 构建输出

```
main.js          # 打包后的插件主文件 (~8MB)
manifest.json    # 插件元数据
styles.css       # 样式文件
```

### 部署路径

```
~/Library/CloudStorage/OneDrive-个人/应用/remotely-save/OneDrive-Vault/.obsidian/plugins/smart-rag/
```

### 代码风格

- **缩进**: Tab (Obsidian 默认)
- **引号**: 单引号
- **分号**: 需要
- **TypeScript**: strict 模式
- **React**: 19 + JSX

---

## 故障排查

### LightRAG 启动失败

**症状**: 点击 Start 无反应或报错

**排查步骤**:
1. 检查配置是否正确 — 查看 `data.json` 中的 `lightRAG` 配置
2. 检查 LightRAG 是否已安装 — `which lightrag-server`
3. 查看控制台日志 — Obsidian DevTools (Cmd+Option+I)
4. 检查端口占用 — `lsof -i :9621`
5. 检查 Embedding 服务 — `curl {baseUrl}/v1/embeddings`

**常见问题**:
- Embedding API 返回空数据 → 检查 baseUrl 和 model 是否匹配
- LLM API 401 → 检查 API Key 是否正确
- 进程启动后自动退出 → 查看 stderr 日志

### Qdrant 启动失败

**症状**: 状态显示红色圆点

**排查步骤**:
1. 检查端口 — `lsof -i :6333`
2. 检查二进制 — `ls ~/.openclaw/smart-rag/qdrant-bin/`
3. 查看配置文件 — `cat ~/.openclaw/smart-rag/qdrant-data/config/storage.yaml`
4. 首次启动可能较慢（90 秒超时）

### Embedding 失败

**症状**: 索引时报错 "No embedding data received"

**排查步骤**:
1. 直接测试 API — `curl -X POST {baseUrl}/v1/embeddings -d '{"model":"xxx","input":["test"]}'`
2. 检查模型名 — 确保模型名与 provider 匹配
3. 检查网络 — localhost 服务是否运行
4. 检查返回格式 — 必须是 OpenAI 兼容格式

### 索引慢

**原因**:
- Embedding API 并发数过低
- 文档数量过多
- 语义分块需要额外 API 调用

**优化**:
- 增加 `Embedding Concurrency` (默认 3 → 6)
- 使用更快的 Embedding 模型
- 减少语义分块的最大 chunk 大小

### Electron 网络限制

**问题**: Obsidian 的 Electron 渲染进程对 localhost 的网络请求可能被限制

**解决方案**:
- Embedding 请求使用 `curl` 子进程绕过限制
- Qdrant 请求通过 `@qdrant/js-client-rest`（Node.js 层）处理

### 插件配置未同步到 LightRAG

**症状**: 修改设置后启动 LightRAG，参数仍是旧的

**原因**: `lightRagManager` 在 `onload()` 时创建，之后不会自动更新

**解决方案**:
1. 点击 LightRAG 页签的 **Save & Sync** 按钮（已修复）
2. 或先 Stop 再 Start，`saveSettings()` 会自动调用 `updateConfig()`

---

### MinerU 远程 API 配置（待添加到 Smart RAG 配置面板）⭐⭐⭐

**发现日期**: 2026-04-11

**问题**: RAG-anything 默认启动参数硬编码，无法动态配置 MinerU 远程 API

**背景**: 
- macOS MinerU 并发限制为 1（源码硬编码）
- Windows/Linux MinerU 默认并发 3，可配置更高
- Smart RAG 需要支持远程 MinerU API（如 Windows 服务器）

**当前硬编码参数**: 
```typescript
// src/core/rag-anything/RAGAnythingManager.ts
const args = [
  '--host', config.host || '127.0.0.1',
  '--port', config.port || 8000,
  '--working-dir', config.workingDir,
  '--parser', config.parser || 'mineru',
  // 缺少以下参数:
  // '--mineru-api-url', config.mineruApiUrl || '',
  // '--max-concurrent-files', config.maxConcurrentFiles || 4,
];
```

**需要添加的配置字段**: 

```typescript
interface RAGAnythingConfig {
  // ... 现有配置 ...
  
  // 新增 MinerU 远程 API 配置
  mineruApiUrl?: string;        // 远程 MinerU API URL (如 'http://192.168.3.253:8001')
  mineruApiEnabled?: boolean;   // 是否启用远程 MinerU API
  maxConcurrentFiles?: number;  // 最大并发文件数 (默认 4)
}
```

**Smart RAG 配置面板需要**: 

1. **RAG-Anything 页签新增输入框**:
   - MinerU API URL (文本输入)
   - 启用远程 MinerU (开关)
   - 最大并发文件数 (数字输入，默认 4)

2. **参数传递逻辑**:
```typescript
if (config.mineruApiEnabled && config.mineruApiUrl) {
  args.push('--mineru-api-url', config.mineruApiUrl);
}
args.push('--max-concurrent-files', String(config.maxConcurrentFiles || 4));
```

**远程 MinerU API 优势**: 
- ✅ Windows/Linux 无并发限制
- ✅ 远程 GPU 加速 VLM 推理
- ✅ 本地 macOS 无需安装 MinerU

**使用场景**: 
- 本地 macOS + 远程 Windows MinerU
- 本地 macOS + 远程 Linux VPS MinerU

**已验证**: 
- ✅ 远程 MinerU API (192.168.3.253:8001) 正常工作
- ✅ RAG-anything 参数传递正常
- ✅ 并发 4 文件处理正常

**修改优先级**: 中（等 LightRAG 处理完后再修改）

**相关文件**: 
- `src/main.ts` — RAGAnythingConfig 类型定义
- `src/core/rag-anything/RAGAnythingManager.ts` — 启动参数
- `src/settings/SettingsTab.tsx` — 配置页签 UI

---

**发现日期**: 2026-04-11

**症状**: 修改 `data.json` 后，RAG-Anything 运行参数仍是旧的

**现象**: 
- `data.json` 中 `ragAnything.llmBaseUrl` = `https://dashscope.aliyuncs.com/v1`
- 实际运行参数 `--llm-base-url` = `https://api.longcat.chat/openai/v1`
- **Web UI 显示的配置与实际运行参数一致**，与 `data.json` 不一致

**验证方法**:
1. 查看进程参数: `ps aux | grep rag-anything`
2. 查看 Web UI: http://127.0.0.1:8000/ → ⚙️ 配置
3. 对比 `data.json`: `.obsidian/plugins/smart-rag/data.json`

**根因分析**: 

对比 LightRAG 和 RAG-Anything 的配置同步机制：

| Manager | updateConfig() | saveSettings 同步 |
|---------|---------------|-------------------|
| LightRagManager | ✅ 有 | ✅ 调用 `updateConfig()` |
| RAGAnythingManager | ❌ **没有** | ❌ **未同步** |

**问题流程**:
```
启动时: new RAGAnythingManager(settings.ragAnything) — 用当时的 settings
  ↓
运行中: UI 修改 → saveSettings() → 保存到 data.json ✅
  ↓
关键问题: saveSettings() 未调用 ragAnythingManager.updateConfig() ❌
  ↓
结果: data.json 有新值，但 ragAnythingManager.config 仍是旧值
  ↓
验证: Stop → Start 后会用 data.json 的新配置启动
```

**修复方案**: 

1. **添加 `updateConfig()` 方法到 RAGAnythingManager**
```typescript
updateConfig(config: Partial<RAGAnythingConfig>) {
    Object.assign(this.config, config);
}
```

2. **在 `saveSettings()` 中同步 RAG-Anything 配置**
```typescript
async saveSettings(newSettings?: SmartRAGSettings) {
    // ... LightRAG 同步（已有）
    
    // 新增：同步 RAG-Anything
    if (this.ragAnythingManager) {
        this.ragAnythingManager.updateConfig(this.settings.ragAnything);
    }
    await this.saveData(this.settings);
}
```

**临时解决方案**: 
- 修改配置后，必须 **Stop → Start** RAG-Anything 才能应用新配置

**优先级**: 低（等 LightRAG 处理完 5000 文件后再修复）

**相关文件**: 
- `src/main.ts` — `saveSettings()` 方法
- `src/core/rag-anything/RAGAnythingManager.ts` — 需添加 `updateConfig()`

---

### Stop 后进程残留（v1.0.0 已修复）

**症状**: 点击 Stop 后 UI 显示已停止，但进程仍运行，再按 Start 出现 2 个进程

**原因**: `stop()` 发送 SIGTERM 后立即设置 `this.process = null`，进程还没退出

**修复**: v1.1.0 改为 async stop()，等待进程真正退出后再清理

**流程**:
```
SIGTERM → 等待 5 秒 → SIGKILL（强制）→ lsof 清理端口 → this.process = null
```

---

### INFO 日志显示为 ERROR（v1.0.0 已修复）

**症状**: Obsidian Console 中大量红色 ERROR 日志，实际只是 Python INFO

**原因**: Python 程序习惯把所有日志输出到 stderr，被错误标记为 `console.error`

**修复**: v1.1.0 区分日志级别，只有包含 `ERROR/CRITICAL/Traceback/Exception` 才显示红色

**规则**:
| stderr 内容 | 显示方式 |
|-------------|----------|
| 包含 ERROR/CRITICAL/Traceback/Exception/Failed | `console.error`（红色）|
| 其他（INFO/DEBUG/WARNING） | `console.log`（正常）|

---

### Embedding 服务离线导致索引失败

**症状**: LightRAG 索引大量失败（1204 个），日志显示 `APIConnectionError`

**原因**: LM Studio 或 Embedding 服务已关闭或网络不通

**排查**:
```bash
# 检查服务是否在线
ping 192.168.3.121
curl http://192.168.3.121:1234/v1/models
```

**解决方案**:
1. 重新启动 LM Studio 并加载 `text-embedding-bge-m3` 模型
2. 或切换到云端 Embedding（DashScope）

---

## 版本历史

### v1.1.0 (2026-04-11)

- ✅ **修复 Stop 进程残留 bug**
  - `stop()` 改为 async，等待进程真正退出后再清理 `this.process`
  - 流程：SIGTERM → 等待 5s → SIGKILL → lsof 清理端口
  - 解决点击 Stop 后进程残留、再按 Start 出现 2 个进程的问题
- ✅ **修复 INFO 日志显示为 ERROR**
  - stderr 输出区分日志级别
  - 只有包含 ERROR/CRITICAL/Traceback/Exception 才显示红色
  - Python INFO/DEBUG 日志正常显示
- ✅ **配置增强**
  - LightRAG 支持 Vector Storage 选择（NanoVectorDB vs Qdrant）
  - 新增 `qdrantUrl` 配置字段
  - LLM 和 Embedding 并发数分离
  - Embedding 配置独立页签

### v1.0.0 (2026-04-10)

- ✅ 初始版本
- ✅ Qdrant 向量数据库集成
- ✅ LightRAG 知识图谱支持
- ✅ RAG-Anything 文档解析
- ✅ 语义搜索和问答
- ✅ 5 个配置页签 + 保存按钮
- ✅ 右键菜单索引文件和文件夹
- ✅ 状态栏服务状态监控
- ✅ 取消插件激活时自动启动外部服务
- ✅ 修复设置同步问题（updateConfig）
- ✅ 修复 LightRAG embedding 参数传递

---

*本文档由薯条 🍟 于 2026-04-11 08:55 更新*