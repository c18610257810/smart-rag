# Smart RAG

**Obsidian 语义 RAG 插件** - 基于 Qdrant 向量存储和 LLM 的智能问答系统

![Smart RAG](https://img.shields.io/badge/Obsidian-Plugin-blue?logo=obsidian)
![Version](https://img.shields.io/badge/version-1.1.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## 目录

1. [设计逻辑](#设计逻辑)
2. [设计流程](#设计流程)
3. [系统架构](#系统架构)
4. [脚本文件说明](#脚本文件说明)
5. [变量调用说明](#变量调用说明)
6. [环境依赖条件](#环境依赖条件)
7. [技术栈接口说明](#技术栈接口说明)
8. [安装与使用](#安装与使用)
9. [故障排除](#故障排除)

---

## 设计逻辑

### 核心设计理念

Smart RAG 基于以下核心设计理念构建：

1. **多源数据融合**: 同时索引 Obsidian Vault 笔记、外部文档(PDF/Word/图片)和图像，构建统一的知识库
2. **语义检索优先**: 基于 Embedding 向量相似度进行语义搜索，而非简单的关键词匹配
3. **本地优先**: 所有数据存储在本地 (Qdrant 向量数据库)，保护隐私
4. **模块化服务**: 通过独立进程运行 Qdrant、LightRAG、RAG-Anything 服务，降低耦合

### 检索增强生成逻辑

```
用户问题
    |
    v
Embedding API -> 问题向量化
    |
    v
并行搜索多源:
|-- Qdrant vault-notes (Obsidian 笔记)
|-- Qdrant raw-documents (外部文档)
|-- Qdrant images (图像描述)
|-- LightRAG 知识图谱 (可选)
    |
    v
聚合 Top-K 结果
    |
    v
构建上下文 Prompt
    |
    v
LLM API -> 生成回答
    |
    v
返回答答 + 引用来源
```

### 索引逻辑

```
文件发现
    |
    v
文件类型判断:
|-- Markdown -> 语义分块 -> Embedding -> Qdrant
|-- PDF/Word/PPT -> RAG-Anything 解析 -> 提取文本/图像 -> Embedding -> Qdrant
|-- 图像 -> VLM 描述 -> Embedding -> Qdrant
    |
    v
(可选) LightRAG 知识图谱构建
```

---

## 设计流程

### 完整查询流程

1. **Phase 1: 问题向量化**
   - 调用 Embedding API
   - 获取问题向量 (1024维)

2. **Phase 2: 并行语义搜索**
   - Qdrant vault-notes 搜索
   - Qdrant raw-documents 搜索
   - Qdrant images 搜索
   - (可选) LightRAG 知识图谱查询

3. **Phase 3: 结果聚合与排序**
   - 合并多源搜索结果
   - 按相似度排序
   - 去重处理

4. **Phase 4: 上下文构建**
   - 提取 Top-K 文档片段
   - 构建引用信息
   - 组装 LLM Prompt

5. **Phase 5: 回答生成**
   - 调用 LLM API
   - 流式输出处理
   - 解析回答内容

6. **Phase 6: 结果展示**
   - 显示自然语言回答
   - 展示引用来源
   - 显示相关图像

### 索引流程

1. **Phase 1: 文件扫描**
   - 遍历目标文件夹
   - 过滤文件类型
   - 生成文件列表

2. **Phase 2: 内容提取**
   - Markdown: 直接读取
   - PDF/Word: RAG-Anything 解析
   - 图像: VLM 生成描述

3. **Phase 3: 语义分块**
   - 按段落/语义边界切分
   - 生成文本片段列表

4. **Phase 4: 向量化**
   - 调用 Embedding API
   - 批量生成向量

5. **Phase 5: 存储**
   - 写入 Qdrant 集合
   - (可选) 写入 LightRAG

6. **Phase 6: 完成通知**
   - 统计索引数量
   - 显示完成提示

---

## 系统架构

### 架构概览

```
Obsidian
    |
    v
Smart RAG Plugin
    |
    |-- ChatView (React UI)
    |-- SettingsTab (5个配置页签)
    |-- Ribbon Icon (Brain)
    |
    v
main.ts (主控制器)
    |
    v
Core Modules:
|-- QdrantManager (向量数据库管理)
|-- LightRAGManager (知识图谱管理)
|-- RAGAnythingManager (文档解析管理)
|-- IndexingEngine (索引引擎)
|-- QueryEngine (查询引擎)
|-- SemanticChunker (语义分块)
    |
    v
External Services:
|-- Qdrant (端口 6333)
|-- LightRAG (端口 9621)
|-- RAG-Anything (端口 8000)
    |
    v
API Services:
|-- LLM API (聊天/标签分析)
|-- Embedding API (文本向量化)
```

### 核心组件说明

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| **主控制器** | `src/main.ts` | 插件生命周期、服务协调、配置管理 |
| **Qdrant 管理器** | `src/core/qdrant/QdrantManager.ts` | Qdrant 进程管理、配置生成 |
| **Qdrant 客户端** | `src/core/qdrant/QdrantClient.ts` | Qdrant REST API 封装 |
| **LightRAG 管理器** | `src/core/lightrag/LightRagManager.ts` | LightRAG 进程管理 |
| **RAG-Anything 管理器** | `src/core/rag-anything/RAGAnythingManager.ts` | 文档解析服务管理 |
| **索引引擎** | `src/core/indexing/IndexingEngine.ts` | 文件扫描、向量化、存储 |
| **查询引擎** | `src/core/retrieval/QueryEngine.ts` | 语义搜索、结果聚合、回答生成 |
| **语义分块器** | `src/utils/SemanticChunker.ts` | 文本语义切分 |
| **聊天视图** | `src/ChatView.tsx` | React 聊天界面 |
| **设置面板** | `src/settings/SettingsTab.tsx` | 配置 UI 界面 |

---

## 脚本文件说明

### 项目文件结构

```
smart-rag/
|-- src/                          # 源代码目录
|   |-- main.ts                   # 插件主入口 (57KB)
|   |-- ChatView.tsx              # React 聊天视图 (4KB)
|   |-- ApplyView.ts              # 应用视图 (1KB)
|   |-- constants.ts              # 常量定义 (13KB)
|   |-- core/                     # 核心模块
|   |   |-- indexing/             # 索引引擎
|   |   |   |-- IndexingEngine.ts # 主索引引擎
|   |   |-- lightrag/             # LightRAG 模块
|   |   |   |-- LightRagManager.ts# LightRAG 管理器
|   |   |-- llm/                  # LLM 提供者
|   |   |-- mcp/                  # MCP 集成
|   |   |-- qdrant/               # Qdrant 模块
|   |   |   |-- QdrantManager.ts  # Qdrant 管理器
|   |   |   |-- QdrantClient.ts   # Qdrant 客户端
|   |   |   |-- collections.ts    # 集合定义
|   |   |-- rag/                  # RAG 引擎
|   |   |-- rag-anything/         # RAG-Anything 模块
|   |   |   |-- RAGAnythingManager.ts
|   |   |-- retrieval/            # 检索引擎
|   |   |   |-- QueryEngine.ts    # 查询引擎
|   |-- components/               # React 组件
|   |-- contexts/                 # React Contexts
|   |-- database/                 # 数据库层
|   |-- hooks/                    # React Hooks
|   |-- services/                 # 服务层
|   |-- settings/                 # 设置相关
|   |-- types/                    # 类型定义
|   |-- ui/                       # UI 组件
|   |-- utils/                    # 工具函数
|   |   |-- SemanticChunker.ts    # 语义分块器
|   |   |-- PlatformManager.ts    # 平台适配
|   |-- views/                    # 视图
|-- package.json                  # npm 配置
|-- tsconfig.json                 # TypeScript 配置
|-- esbuild.config.mjs            # 构建配置
|-- manifest.json                 # 插件清单
|-- main.js                       # 构建输出 (~8MB)
|-- styles.css                    # 样式文件
|-- README.md                     # 本文档
```

### 关键脚本文件详细说明

#### 1. main.ts (插件主入口)
- **路径**: `src/main.ts`
- **大小**: ~57KB
- **职责**:
  - 插件生命周期管理 (`onload`, `onunload`)
  - 服务初始化协调 (Qdrant, LightRAG, RAG-Anything)
  - 配置管理 (`loadSettings`, `saveSettings`)
  - 命令注册 (打开聊天面板、索引文件夹)
  - 右键菜单注册
  - 状态栏更新

#### 2. QdrantManager.ts (Qdrant 管理器)
- **路径**: `src/core/qdrant/QdrantManager.ts`
- **职责**:
  - Qdrant 二进制下载和管理
  - 配置文件生成 (`storage.yaml`)
  - 进程启动/停止控制
  - 健康检查轮询

#### 3. QdrantClient.ts (Qdrant 客户端)
- **路径**: `src/core/qdrant/QdrantClient.ts`
- **职责**:
  - Qdrant REST API 封装
  - 集合创建和管理
  - 向量插入和搜索
  - 统计信息获取

#### 4. LightRagManager.ts (LightRAG 管理器)
- **路径**: `src/core/lightrag/LightRagManager.ts`
- **职责**:
  - LightRAG 服务进程管理
  - 配置同步和更新
  - 健康检查

#### 5. RAGAnythingManager.ts (RAG-Anything 管理器)
- **路径**: `src/core/rag-anything/RAGAnythingManager.ts`
- **职责**:
  - RAG-Anything 服务启动
  - 文档解析参数配置
  - 远程 MinerU API 支持

#### 6. IndexingEngine.ts (索引引擎)
- **路径**: `src/core/indexing/IndexingEngine.ts`
- **职责**:
  - 文件扫描和过滤
  - 内容提取和分块
  - 批量向量化
  - 进度反馈

#### 7. QueryEngine.ts (查询引擎)
- **路径**: `src/core/retrieval/QueryEngine.ts`
- **职责**:
  - 多源并行搜索
  - 结果聚合和排序
  - 上下文构建
  - LLM 回答生成

#### 8. SemanticChunker.ts (语义分块器)
- **路径**: `src/utils/SemanticChunker.ts`
- **职责**:
  - 基于 Embedding 的语义切分
  - 段落回退策略
  - 分块参数配置

#### 9. ChatView.tsx (聊天视图)
- **路径**: `src/ChatView.tsx`
- **职责**:
  - React 聊天界面渲染
  - 消息历史管理
  - 流式输出显示
  - 引用来源展示

---

## 变量调用说明

### 核心配置变量

#### SmartRAGSettings (主配置对象)

```typescript
interface SmartRAGSettings {
  // 聊天 LLM 配置
  chatLLM: ChatLLMConfig;
  
  // Embedding 配置
  embedding: EmbeddingConfig;
  
  // LightRAG 配置
  lightRAG: LightRAGConfig;
  
  // Qdrant 配置
  qdrant: QdrantConfig;
  
  // RAG-Anything 配置
  ragAnything: RAGAnythingConfig;
  
  // 外部文档文件夹路径
  rawFolderPath: string;
}
```

#### ChatLLMConfig (聊天 LLM 配置)

```typescript
interface ChatLLMConfig {
  baseUrl: string;        // API 基础 URL
  apiKey: string;         // API 密钥
  modelName: string;      // 模型名称
  maxTokens: number;      // 最大 Token 数
  temperature: number;    // 温度参数
}
```

#### EmbeddingConfig (Embedding 配置)

```typescript
interface EmbeddingConfig {
  provider: 'openai' | 'dashscope' | 'ollama';
  baseUrl: string;        // API 基础 URL
  apiKey: string;         // API 密钥
  model: string;          // 模型名称
  dimension: number;      // 向量维度 (默认 1024)
}
```

#### LightRAGConfig (LightRAG 配置)

```typescript
interface LightRAGConfig {
  enabled: boolean;               // 是否启用
  serverUrl: string;              // 服务地址
  command: string;                // 启动命令
  workingDir: string;             // 工作目录
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
  // 其他选项
  maxGraphNodes: number;
  chunkingStrategy: string;
  logLevel: string;
  // 并发控制
  llmConcurrency: number;
  embeddingConcurrency: number;
}
```

#### RAGAnythingConfig (RAG-Anything 配置)

```typescript
interface RAGAnythingConfig {
  enabled: boolean;               // 是否启用
  httpPort: number;               // HTTP 端口
  workingDir: string;             // 工作目录
  parser: 'mineru' | 'docling' | 'paddleocr';  // 解析器类型
  // LLM 配置
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  // Embedding 配置
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingDimension: number;
  // 并发控制
  llmConcurrency: number;
  embeddingConcurrency: number;
  // MinerU 远程 API 配置
  mineruApiUrl: string;
  mineruApiEnabled: boolean;
  maxConcurrentFiles: number;
}
```

#### QdrantConfig (Qdrant 配置)

```typescript
interface QdrantConfig {
  httpPort: number;               // HTTP 端口 (默认 6333)
  dataDir: string;                // 数据目录
}
```

### 全局变量访问

```typescript
// 在插件主类中访问
this.settings                          // 完整配置对象
this.qdrantManager                     // Qdrant 管理器实例
this.qdrantClient                      // Qdrant 客户端实例
this.lightRagManager                   // LightRAG 管理器实例
this.ragAnythingManager                // RAG-Anything 管理器实例
this.indexingEngine                    // 索引引擎实例
this.queryEngine                       // 查询引擎实例
```

### 环境变量

```bash
# LightRAG 服务环境变量
LLM_BINDING=openai
LLM_BINDING_HOST=<LLM_API_URL>
LLM_MODEL=<MODEL_NAME>
LLM_BINDING_API_KEY=<API_KEY>
EMBEDDING_BINDING=openai
EMBEDDING_BINDING_HOST=<EMBEDDING_URL>
EMBEDDING_MODEL=text-embedding-bge-m3
EMBEDDING_BINDING_API_KEY=<API_KEY>
EMBEDDING_DIM=1024
```

---

## 环境依赖条件

### 系统要求

| 项目 | 要求 |
|------|------|
| **操作系统** | macOS 10.15+ / Windows 10+ / Linux |
| **Obsidian** | v1.0.0+ |
| **Node.js** | v18+ (开发构建需要) |
| **Python** | v3.11+ (外部服务需要) |

### 外部服务依赖

#### 1. Qdrant (必需)
- **用途**: 向量数据库存储
- **安装**: 自动下载二进制
- **默认端口**: 6333
- **数据目录**: `~/.openclaw/smart-rag/qdrant-data/`

#### 2. LightRAG (可选)
- **用途**: 知识图谱构建
- **安装**: `pip install lightrag`
- **默认端口**: 9621
- **Python 版本**: 3.11+

#### 3. RAG-Anything (可选)
- **用途**: PDF/Word 文档解析
- **安装**: `pip install rag-anything`
- **默认端口**: 8000
- **依赖**: MinerU/Docling/PaddleOCR

#### 4. LLM 服务 (必需)
- **用途**: 聊天回答生成
- **推荐**: LongCat, DashScope, OpenAI
- **配置**: Base URL, API Key, Model

#### 5. Embedding 服务 (必需)
- **用途**: 文本向量化
- **推荐**: DashScope, LM Studio, Ollama
- **配置**: Base URL, API Key, Model, Dimension

### npm 依赖

```json
{
  "dependencies": {
    "@qdrant/js-client-rest": "^1.17.0",
    "@anthropic-ai/sdk": "^0.85.0",
    "@google/generative-ai": "^0.24.1",
    "@tanstack/react-query": "^5.96.2",
    "langchain": "^1.3.1",
    "lexical": "^0.42.0",
    "lucide-react": "^1.7.0",
    "minimatch": "^10.2.5",
    "openai": "^6.33.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "uuid": "^13.0.0",
    "fuzzysort": "^3.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.2.14",
    "esbuild": "^0.24.0",
    "obsidian": "latest",
    "typescript": "^5.6.0"
  }
}
```

### Python 依赖

```
lightrag>=0.1.0
rag-anything>=0.1.0
qdrant-client>=1.0.0
openai>=1.0.0
numpy>=1.24.0
```

---

## 技术栈接口说明

### 1. LLM API 接口 (OpenAI 兼容)

#### 聊天完成接口

```http
POST {baseUrl}/chat/completions
Content-Type: application/json
Authorization: Bearer {apiKey}

{
  "model": "{model}",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "{question}"}
  ],
  "max_tokens": 4096,
  "temperature": 0.7,
  "stream": true
}
```

### 2. Embedding API 接口 (OpenAI 兼容)

```http
POST {baseUrl}/v1/embeddings
Content-Type: application/json
Authorization: Bearer {apiKey}

{
  "model": "{embeddingModel}",
  "input": ["文本片段1", "文本片段2"]
}
```

**响应格式**:
```json
{
  "data": [
    {"embedding": [0.1, 0.2, ...], "index": 0},
    {"embedding": [0.3, 0.4, ...], "index": 1}
  ]
}
```

### 3. Qdrant REST API

#### 健康检查

```http
GET http://127.0.0.1:6333/health
```

#### 创建集合

```http
PUT http://127.0.0.1:6333/collections/{collection_name}
Content-Type: application/json

{
  "vectors": {
    "size": 1024,
    "distance": "Cosine"
  }
}
```

#### 搜索向量

```http
POST http://127.0.0.1:6333/collections/{collection_name}/points/search
Content-Type: application/json

{
  "vector": [0.1, 0.2, ...],
  "limit": 10,
  "with_payload": true
}
```

### 4. LightRAG API

#### 健康检查

```http
GET http://127.0.0.1:9621/health
```

#### 索引文本

```http
POST http://127.0.0.1:9621/documents/texts
Content-Type: application/json

{
  "texts": ["文本片段1", "文本片段2"]
}
```

#### 查询知识图谱

```http
POST http://127.0.0.1:9621/query
Content-Type: application/json

{
  "query": "查询问题",
  "mode": "hybrid"
}
```

### 5. RAG-Anything API

#### 解析文档

```http
POST http://127.0.0.1:8000/parse
Content-Type: application/json

{
  "file_path": "/path/to/document.pdf",
  "parser": "mineru"
}
```

#### 健康检查

```http
GET http://127.0.0.1:8000/health
```

---

## 安装与使用

### 安装步骤

#### 1. 克隆仓库

```bash
cd ~/.obsidian/plugins/
git clone <repository-url> smart-rag
cd smart-rag
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 构建插件

```bash
npm run build
```

#### 4. 启用插件

1. 打开 Obsidian 设置
2. 进入 第三方插件 → 已安装插件
3. 启用 Smart RAG

### 配置步骤

#### 1. Embedding 配置

进入设置 → Smart RAG → Embedding:
- **Provider**: dashscope (推荐)
- **Base URL**: https://dashscope.aliyuncs.com/v1
- **Model**: text-embedding-v3
- **Dimension**: 1024

#### 2. Chat LLM 配置

进入设置 → Smart RAG → Chat LLM:
- **Base URL**: https://api.longcat.chat/openai/v1
- **Model**: LongCat-Flash-Lite
- **Max Tokens**: 4096

#### 3. 启动外部服务

在设置页签中:
1. Qdrant → 点击 Start
2. LightRAG → 点击 Start (可选)
3. RAG-Anything → 点击 Start (可选)

#### 4. 索引 Vault

1. 右键文件夹 → "Ingest entire folder"
2. 或命令面板 → "Index Raw Folder"

### 使用方法

#### 打开聊天面板

- 点击 Ribbon 图标 (🧠 Brain)
- 或命令面板 → "Open Chat Panel"

#### 提问

1. 在聊天输入框输入问题
2. 按 Enter 发送
3. 等待回答生成
4. 查看引用来源和相关图像

---

## 故障排除

### 常见问题

#### 1. Qdrant 启动失败

**症状**: 状态显示红色圆点

**排查**:
```bash
# 检查端口占用
lsof -i :6333

# 检查二进制
ls ~/.openclaw/smart-rag/qdrant-bin/

# 查看配置
cat ~/.openclaw/smart-rag/qdrant-data/config/storage.yaml
```

#### 2. LightRAG 启动失败

**症状**: 点击 Start 无反应

**排查**:
```bash
# 检查 LightRAG 是否安装
which lightrag-server

# 检查端口
lsof -i :9621

# 查看日志
openclaw logs --follow
```

#### 3. Embedding 失败

**症状**: "No embedding data received"

**排查**:
```bash
# 测试 Embedding API
curl -X POST {baseUrl}/v1/embeddings \
  -H "Authorization: Bearer {apiKey}" \
  -d '{"model":"{model}","input":["test"]}'
```

#### 4. 索引慢

**优化建议**:
- 增加 `Embedding Concurrency` (默认 3 → 6)
- 使用更快的 Embedding 服务
- 减少语义分块的最大 chunk 大小

#### 5. 进程残留

**症状**: Stop 后进程仍在运行

**解决方案**:
```bash
# 手动清理端口
lsof -i :6333 -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs kill -9
lsof -i :9621 -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs kill -9
lsof -i :8000 -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs kill -9
```

---

## 版本历史

### v1.1.0 (2026-04-11)

- 修复 Stop 进程残留 bug
- 修复 INFO 日志显示为 ERROR
- 配置增强: Vector Storage 选择、并发数分离

### v1.0.0 (2026-04-10)

- 初始版本
- Qdrant 向量数据库集成
- LightRAG 知识图谱支持
- RAG-Anything 文档解析
- 语义搜索和问答

---

## 服务配置详解（Agent 阅读指南）

> 本章节专为 AI Agent 设计，说明 Smart RAG 如何将用户配置传递给外部服务。

### 配置文件位置

| 服务 | 配置文件 | 数据目录 |
|------|----------|----------|
| **Smart RAG 插件** | `{Vault}/.obsidian/plugins/smart-rag/data.json` | — |
| **LightRAG** | 环境变量传递 | `~/.openclaw/lightrag-data/smart-rag/` |
| **Qdrant** | `~/.openclaw/smart-rag/qdrant-config/config.yaml` | `~/.openclaw/smart-rag/qdrant-data/` |
| **RAG-Anything** | 命令行参数传递 | `~/.openclaw/rag-anything-data/` |

---

### LightRAG 服务配置

#### 配置传递流程

```
data.json (用户填写)
    |
    v
LightRagManager.ts
    |
    v
buildEnvVars() 方法
    |
    v
环境变量字典
    |
    v
spawn(lightrag-server, { env: envVars })
    |
    v
LightRAG Python 进程
    |
    v
os.getenv('LLM_BINDING_HOST', '') 等读取配置
```

#### data.json 配置字段

```json
{
  "lightRAG": {
    "enabled": true,
    "serverUrl": "http://127.0.0.1:9621",
    "command": "lightrag-server",
    "workingDir": "~/.openclaw/lightrag-data/smart-rag",
    
    // LLM 配置（用户填写）
    "llmBinding": "openai",
    "llmModel": "LongCat-Flash-Lite",
    "llmBaseUrl": "https://api.longcat.chat/openai/v1",
    "llmApiKey": "ak_xxxxx",
    
    // Embedding 配置（用户填写）
    "embeddingBinding": "openai",
    "embeddingModel": "text-embedding-bge-m3",
    "embeddingBaseUrl": "http://127.0.0.1:1234/v1",
    "embeddingApiKey": "lmstudio",
    "embeddingDim": 1024,
    
    // 向量存储配置
    "vectorStorage": "QdrantVectorDBStorage",
    "qdrantUrl": "http://127.0.0.1:6333",
    
    // 其他配置...
    "llmConcurrency": 20,
    "embeddingConcurrency": 2,
    "chunkOverlapSize": 300,
    "maxGleaning": 3,
    "entityTypes": ["Industry", "Domain", ...],
    "summaryLanguage": "Chinese",
    "cosineThreshold": 0.2,
    "forceLLMSummaryOnMerge": 8,
    "relatedChunkNumber": 10,
    "maxGraphNodes": 30000,
    "chunkingStrategy": "fixed",
    "logLevel": "INFO"
  }
}
```

#### 环境变量映射表（LightRagManager.ts → buildEnvVars()）

| data.json 字段 | 环境变量名 | 用途 | 示例值 |
|---------------|-----------|------|--------|
| `llmBinding` | `LLM_BINDING` | LLM 提供者类型 | `openai` |
| `llmModel` | `LLM_MODEL` | LLM 模型名称 | `LongCat-Flash-Lite` |
| `llmBaseUrl` | `LLM_BINDING_HOST` | LLM API 地址 | `https://api.longcat.chat/openai/v1` |
| `llmBaseUrl` | `OPENAI_API_BASE` | Python LightRAG 使用 ⭐ | 同上 |
| `llmApiKey` | `LLM_BINDING_API_KEY` | LLM API 密钥 | `ak_xxxxx` |
| `llmApiKey` | `OPENAI_API_KEY` | Python LightRAG 使用 ⭐ | 同上 |
| `embeddingBinding` | `EMBEDDING_BINDING` | Embedding 提供者 | `openai` |
| `embeddingModel` | `EMBEDDING_MODEL` | Embedding 模型 | `text-embedding-bge-m3` |
| `embeddingBaseUrl` | `EMBEDDING_BINDING_HOST` | Embedding API 地址 | `http://127.0.0.1:1234/v1` |
| `embeddingBaseUrl` | `OPENAI_EMBEDDING_API_BASE` | Python LightRAG 使用 | 同上 |
| `embeddingApiKey` | `EMBEDDING_BINDING_API_KEY` | Embedding API 密钥 | `lmstudio` |
| `embeddingDim` | `EMBEDDING_DIM` | 向量维度 | `1024` |
| `vectorStorage` | `LIGHTRAG_VECTOR_STORAGE` | 向量存储类型 | `QdrantVectorDBStorage` |
| `qdrantUrl` | `QDRANT_URL` | Qdrant 地址 | `http://127.0.0.1:6333` |
| `chunkOverlapSize` | `CHUNK_OVERLAP_SIZE` | 分块重叠大小 | `300` |
| `maxGleaning` | `MAX_GLEANING` | 最大提取次数 | `3` |
| `entityTypes` | `ENTITY_TYPES` | 实体类型 JSON | `["Industry",...]` |
| `summaryLanguage` | `SUMMARY_LANGUAGE` | 摘要语言 | `Chinese` |
| `cosineThreshold` | `COSINE_THRESHOLD` | 相似度阈值 | `0.2` |
| `forceLLMSummaryOnMerge` | `FORCE_LLM_SUMMARY_ON_MERGE` | 强制摘要阈值 | `8` |
| `relatedChunkNumber` | `RELATED_CHUNK_NUMBER` | 相关块数量 | `10` |
| `llmConcurrency` | `MAX_ASYNC` | 最大并发数 | `20` |
| `embeddingConcurrency` | `EMBEDDING_FUNC_MAX_ASYNC` | Embedding 并发 | `2` |
| `llmConcurrency` | `MAX_PARALLEL_INSERT` | 并行插入数 | `20` |
| `maxGraphNodes` | `MAX_GRAPH_NODES` | 最大图节点 | `30000` |
| `chunkingStrategy` | `LIGHTRAG_CHUNKING_STRATEGY` | 分块策略 | `fixed` |
| — | `LLM_TIMEOUT` | LLM 超时（固定） | `600` (10分钟) |

⭐ **关键注意**: Python LightRAG 代码使用 `OPENAI_API_BASE` 和 `OPENAI_API_KEY`，不是 `LLM_BINDING_HOST`。`buildEnvVars()` 同时设置两者以确保兼容。

#### CLI 启动参数（LightRagManager.ts → start()）

```bash
lightrag-server \
  --host 127.0.0.1 \
  --port 9621 \
  --working-dir ~/.openclaw/lightrag-data/smart-rag \
  --llm-binding openai \
  --embedding-binding openai \
  --max-async 20 \
  --log-level INFO
```

**注意**: LLM/Embedding 的 host/model/apiKey 通过**环境变量**传递，不是 CLI 参数。

#### 手动启动 LightRAG（Agent 可执行）

```bash
# 设置环境变量
export LLM_BINDING=openai
export LLM_MODEL=LongCat-Flash-Lite
export LLM_BINDING_HOST=https://api.longcat.chat/openai/v1
export OPENAI_API_KEY=ak_xxxxx
export OPENAI_API_BASE=https://api.longcat.chat/openai/v1
export EMBEDDING_BINDING=openai
export EMBEDDING_MODEL=text-embedding-bge-m3
export EMBEDDING_BINDING_HOST=http://127.0.0.1:1234/v1
export EMBEDDING_DIM=1024
export LIGHTRAG_VECTOR_STORAGE=QdrantVectorDBStorage
export QDRANT_URL=http://127.0.0.1:6333
export LLM_TIMEOUT=600

# 启动服务
~/.openclaw/workspace/venv/bin/lightrag-server \
  --host 127.0.0.1 \
  --port 9621 \
  --working-dir ~/.openclaw/lightrag-data/smart-rag \
  --llm-binding openai \
  --embedding-binding openai \
  --max-async 20 \
  --log-level INFO
```

#### API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/documents/texts` | POST | 索引文本 |
| `/documents/upload` | POST | 上传文档 |
| `/documents/status_counts` | GET | 文档状态统计 |
| `/documents/reprocess_failed` | POST | 重试失败文档 |
| `/query` | POST | 查询知识图谱 |

---

### Qdrant 服务配置

#### 配置传递流程

```
data.json (qdrant 字段)
    |
    v
QdrantManager.ts
    |
    v
ensureConfig() 方法
    |
    v
生成 config.yaml
    |
    v
spawn(qdrant, [--config-path, config.yaml])
    |
    v
Qdrant 进程
```

#### data.json 配置字段

```json
{
  "qdrant": {
    "httpPort": 6333,
    "dataDir": "~/.openclaw/smart-rag/qdrant-data",
    "autoStart": true
  }
}
```

#### config.yaml 生成内容（~/.openclaw/smart-rag/qdrant-config/config.yaml）

```yaml
# Auto-generated config for Smart RAG
storage:
  storage_path: ~/.openclaw/smart-rag/qdrant-data

service:
  host: 127.0.0.1
  http_port: 6333
  grpc_port: 6334

log_level: info

telemetry_disabled: true
```

#### 手动启动 Qdrant（Agent 可执行）

```bash
# 使用生成的配置启动
~/.openclaw/smart-rag/qdrant-bin/qdrant \
  --config-path ~/.openclaw/smart-rag/qdrant-config/config.yaml
```

#### API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/collections` | GET | 列出集合 |
| `/collections/{name}` | PUT | 创建集合 |
| `/collections/{name}/points/search` | POST | 搜索向量 |
| `/collections/{name}/points` | PUT | 插入向量 |

---

### RAG-Anything 服务配置

#### 配置传递流程

```
data.json (ragAnything 字段)
    |
    v
RAGAnythingManager.ts
    |
    v
构建 CLI 参数数组
    |
    v
spawn(python, [server.py, --llm-base-url, ..., --embedding-model, ...])
    |
    v
RAG-Anything HTTP 服务
```

#### data.json 配置字段

```json
{
  "ragAnything": {
    "enabled": true,
    "httpPort": 8000,
    "workingDir": "~/.openclaw/rag-anything-data",
    "parser": "mineru",
    
    // LLM 配置
    "llmBaseUrl": "https://api.longcat.chat/openai/v1",
    "llmApiKey": "ak_xxxxx",
    "llmModel": "LongCat-Flash-Lite",
    
    // Embedding 配置
    "embeddingBaseUrl": "http://127.0.0.1:1234/v1",
    "embeddingApiKey": "lmstudio",
    "embeddingModel": "text-embedding-bge-m3",
    "embeddingDimension": 1024,
    
    // 并发控制
    "llmConcurrency": 4,
    "embeddingConcurrency": 8,
    
    // MinerU 远程 API
    "mineruApiEnabled": true,
    "mineruApiUrl": "https://mineru.api.url",
    "maxConcurrentFiles": 4
  }
}
```

#### CLI 启动参数（RAGAnythingManager.ts → start()）

```bash
python ~/.openclaw/skills/rag-anything/rag_anything_server.py \
  --host 127.0.0.1 \
  --port 8000 \
  --working-dir ~/.openclaw/rag-anything-data \
  --parser mineru \
  --llm-base-url https://api.longcat.chat/openai/v1 \
  --llm-api-key ak_xxxxx \
  --llm-model LongCat-Flash-Lite \
  --embedding-base-url http://127.0.0.1:1234/v1 \
  --embedding-api-key lmstudio \
  --embedding-model text-embedding-bge-m3 \
  --embedding-dimension 1024 \
  --llm-concurrency 4 \
  --embedding-concurrency 8 \
  --mineru-api-url https://mineru.api.url \
  --max-concurrent-files 4
```

**注意**: RAG-Anything 通过**命令行参数**传递配置，不使用环境变量。

#### 手动启动 RAG-Anything（Agent 可执行）

```bash
~/.openclaw/workspace/venv/bin/python \
  ~/.openclaw/skills/rag-anything/rag_anything_server.py \
  --host 127.0.0.1 \
  --port 8000 \
  --parser mineru \
  --llm-base-url https://api.longcat.chat/openai/v1 \
  --llm-api-key ak_xxxxx \
  --llm-model LongCat-Flash-Lite \
  --embedding-base-url http://127.0.0.1:1234/v1 \
  --embedding-model text-embedding-bge-m3
```

#### API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/parse` | POST | 解析文档 |
| `/query` | POST | 查询文档库 |

---

### 跨系统部署指南（远程访问）

#### 问题场景

手机端 Obsidian 无法访问 Mac Mini 的本地服务（`127.0.0.1`），需要配置远程访问。

#### 解决方案：Tailscale

**步骤 1: Mac Mini 启动 Tailscale**

```bash
tailscale up
```

**步骤 2: 获取 Tailscale IP**

```bash
tailscale ip
# 输出: 100.x.y.z
```

**步骤 3: 修改 data.json 配置**

```json
{
  "lightRAG": {
    "serverUrl": "http://100.x.y.z:9621",
    "qdrantUrl": "http://100.x.y.z:6333"
  }
}
```

**步骤 4: 手机端安装 Tailscale App**

- iOS: App Store 搜索 "Tailscale"
- 登录同一 Tailscale 账号
- 连接后可访问 `100.x.y.z` 网络

#### 解决方案：局域网

**前提**: Mac Mini WiFi 连接，手机在同一 WiFi 网络。

**步骤 1: 获取 Mac Mini 局域网 IP**

```bash
ipconfig getifaddr en0
# 输出: 192.168.3.x
```

**步骤 2: 修改 data.json 配置**

```json
{
  "lightRAG": {
    "serverUrl": "http://192.168.3.x:9621",
    "qdrantUrl": "http://192.168.3.x:6333"
  }
}
```

#### 注意事项

⚠️ **LightRAG Server 需要绑定可访问的 host**:

```bash
# 默认绑定 127.0.0.1（仅本地）
--host 127.0.0.1

# 远程访问需要绑定 0.0.0.0（所有接口）或 Tailscale IP
--host 0.0.0.0
```

⚠️ **防火墙**: 确保 macOS 防火墙允许端口 9621、6333、8000。

---

### 配置读取示例（Agent 操作）

#### 读取当前配置

```bash
# Smart RAG data.json
cat ~/Library/CloudStorage/OneDrive-个人/应用/remotely-save/OneDrive-Vault/.obsidian/plugins/smart-rag/data.json | jq '.lightRAG'

# 输出示例
{
  "serverUrl": "http://127.0.0.1:9621",
  "llmModel": "LongCat-Flash-Lite",
  "llmBaseUrl": "https://api.longcat.chat/openai/v1",
  "llmApiKey": "ak_xxxxx",
  ...
}
```

#### 修改配置（切换 LLM）

```bash
# 修改 LightRAG LLM 为 LongCat
jq '.lightRAG.llmModel = "LongCat-Flash-Lite" | 
    .lightRAG.llmBaseUrl = "https://api.longcat.chat/openai/v1" | 
    .lightRAG.llmApiKey = "ak_xxxxx"' \
  data.json > data.json.tmp && mv data.json.tmp data.json
```

#### 重启服务

```bash
# 1. 停止现有进程
lsof -ti :9621 | xargs kill -9
lsof -ti :6333 | xargs kill -9

# 2. 重新启动（使用新配置）
# LightRAG: 见上文 "手动启动 LightRAG"
# Qdrant: 见上文 "手动启动 Qdrant"
```

---

### 常见配置问题

#### 1. LightRAG SSL 错误

**症状**: `SSL: RECORD_LAYER_FAILURE`

**原因**: `OPENAI_API_BASE` 未设置，LightRAG 默认连接 `https://api.openai.com/v1`

**解决**: 确保 `buildEnvVars()` 设置了 `OPENAI_API_BASE`。

#### 2. Rate Limit 错误

**症状**: `RateLimitError` 导致文档处理失败

**原因**: 云端 API（如百炼）速率限制

**解决**: 切换到 LongCat 或本地 LM Studio，或降低 `llmConcurrency`。

#### 3. Qdrant 连接失败

**症状**: `Failed to connect to Qdrant`

**原因**: `qdrantUrl` 配置错误或 Qdrant 未启动

**解决**: 检查 `http://127.0.0.1:6333/health`。

#### 4. 远程访问失败

**症状**: 手机端无法连接 Mac Mini 服务

**原因**: `serverUrl` 使用 `127.0.0.1`（本地地址）

**解决**: 配置 Tailscale 或局域网 IP，并修改 host 绑定。

---

## Windows 本地部署指南

> 适用于 Windows 用户在本地安装 Smart RAG 的完整步骤。

### 1. 系统要求

| 项目 | 要求 |
|------|------|
| **操作系统** | Windows 10/11 |
| **Obsidian** | v1.0.0+ |
| **Python** | v3.11+ |
| **内存** | ≥ 16GB（推荐） |
| **硬盘** | ≥ 10GB 可用空间 |

---

### 2. Python 环境安装

#### 方式 A：官方 Python

**下载**: https://www.python.org/downloads/

**安装步骤**:
1. 下载 Python 3.11+ Windows installer
2. 运行安装程序
3. ✅勾选「Add Python to PATH」
4. 安装完成后验证:
   ```cmd
   python --version
   pip --version
   ```

#### 方式 B：Miniconda（推荐）

**下载**: https://docs.conda.io/en/latest/miniconda.html

**安装步骤**:
1. 下载 Miniconda Windows installer
2. 运行安装程序
3. 创建虚拟环境:
   ```cmd
   conda create -n smart-rag python=3.11
   conda activate smart-rag
   ```

---

### 3. 外部服务安装

#### 3.1 Qdrant（向量数据库）

**Windows 安装**: Smart RAG 插件会自动下载 Qdrant Windows 二进制文件

**手动安装（可选）**:
```cmd
# 下载 Qdrant Windows 版本
# https://github.com/qdrant/qdrant/releases/download/v1.17.1/qdrant-x86_64-pc-windows-msvc.tar.gz

# 解压到
C:\Users\<用户名>\.openclaw\smart-rag\qdrant-bin\qdrant.exe
```

**启动命令**:
```cmd
C:\Users\<用户名>\.openclaw\smart-rag\qdrant-bin\qdrant.exe --config-path C:\Users\<用户名>\.openclaw\smart-rag\qdrant-config\config.yaml
```

#### 3.2 LightRAG（知识图谱）

**安装命令**:
```cmd
pip install lightrag
```

**验证安装**:
```cmd
lightrag-server --help
```

**启动命令**:
```cmd
# 设置环境变量（PowerShell）
$env:LLM_BINDING="openai"
$env:LLM_MODEL="LongCat-Flash-Lite"
$env:LLM_BINDING_HOST="https://api.longcat.chat/openai/v1"
$env:OPENAI_API_KEY="ak_xxxxx"
$env:OPENAI_API_BASE="https://api.longcat.chat/openai/v1"
$env:EMBEDDING_BINDING="openai"
$env:EMBEDDING_MODEL="text-embedding-bge-m3"
$env:EMBEDDING_BINDING_HOST="http://127.0.0.1:1234/v1"
$env:EMBEDDING_DIM="1024"
$env:LIGHTRAG_VECTOR_STORAGE="NanoVectorDBStorage"
$env:LLM_TIMEOUT="600"

# 启动 LightRAG
lightrag-server --host 127.0.0.1 --port 9621 --working-dir C:\Users\<用户名>\.openclaw\lightrag-data\smart-rag --llm-binding openai --embedding-binding openai --max-async 20 --log-level INFO
```

**CMD 环境变量格式**:
```cmd
set LLM_BINDING=openai
set LLM_MODEL=LongCat-Flash-Lite
set LLM_BINDING_HOST=https://api.longcat.chat/openai/v1
set OPENAI_API_KEY=ak_xxxxx
...
```

#### 3.3 RAG-Anything（文档解析）

**安装命令**:
```cmd
pip install rag-anything
```

**额外依赖（MinerU）**:
```cmd
pip install magic-pdf
```

**启动命令**:
```cmd
python C:\Users\<用户名>\.openclaw\skills\rag-anything\rag_anything_server.py --host 127.0.0.1 --port 8000 --parser mineru --llm-base-url https://api.longcat.chat/openai/v1 --llm-api-key ak_xxxxx --llm-model LongCat-Flash-Lite --embedding-base-url http://127.0.0.1:1234/v1 --embedding-model text-embedding-bge-m3
```

---

### 4. LM Studio（本地 Embedding）

**下载**: https://lmstudio.ai/

**安装步骤**:
1. 下载 LM Studio Windows 版本
2. 安装并启动 LM Studio
3. 下载 Embedding 模型：`BGE-M3`
4. 启动本地服务器（端口 1234）

**配置 Smart RAG**:
```json
{
  "lightRAG": {
    "embeddingBaseUrl": "http://127.0.0.1:1234/v1",
    "embeddingModel": "text-embedding-bge-m3"
  }
}
```

---

### 5. Obsidian 插件安装

**步骤**:
1. 打开 Obsidian 设置 → 第三方插件
2. 关闭「安全模式」
3. 点击「浏览」→ 搜索「Smart RAG」
4. 安装并启用

**手动安装**（从 GitHub）:
1. 下载 `main.js`, `manifest.json`, `styles.css`
2. 复制到 `{Vault}\.obsidian\plugins\smart-rag\`
3. 重启 Obsidian
4. 启用插件

---

### 6. 配置文件路径差异

| 项目 | macOS | Windows |
|------|-------|----------|
| 插件配置 | `{Vault}/.obsidian/plugins/smart-rag/data.json` | `{Vault}\\.obsidian\plugins\smart-rag\data.json` |
| Qdrant 数据 | `~/.openclaw/smart-rag/qdrant-data/` | `C:\Users\<用户名>\.openclaw\smart-rag\qdrant-data\` |
| LightRAG 数据 | `~/.openclaw/lightrag-data/smart-rag/` | `C:\Users\<用户名>\.openclaw\lightrag-data\smart-rag\` |
| Python 虚拟环境 | `~/.openclaw/workspace/venv/` | `C:\Users\<用户名>\.openclaw\workspace\venv\` |

---

### 7. Windows 特有注意事项

#### 7.1 防火墙配置

**问题**: Windows 防火墙可能阻止端口 6333/9621/8000

**解决方案**:
```cmd
# PowerShell（管理员权限）
New-NetFirewallRule -DisplayName "Smart RAG Qdrant" -Direction Inbound -LocalPort 6333 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Smart RAG LightRAG" -Direction Inbound -LocalPort 9621 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Smart RAG RAG-Anything" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

#### 7.2 杀毒软件

**问题**: 杀毒软件可能拦截 Qdrant/LightRAG 进程

**解决方案**: 添加排除目录:
- `C:\Users\<用户名>\.openclaw\`

#### 7.3 路径分隔符

**问题**: Windows 使用 `\`，macOS 使用 `/`

**影响**: Python 代码通常兼容，但 JSON 配置需注意

**建议**: Smart RAG 插件内部已处理路径差异

#### 7.4 权限问题

**问题**: `C:\Users` 下创建 `.openclaw` 目录可能需要权限

**解决方案**:
```cmd
# 手动创建目录
mkdir C:\Users\<用户名>\.openclaw
mkdir C:\Users\<用户名>\.openclaw\smart-rag
mkdir C:\Users\<用户名>\.openclaw\lightrag-data
```

#### 7.5 进程管理

**问题**: Windows 没有 `lsof` 命令

**替代命令**:
```cmd
# 查看端口占用
netstat -ano | findstr :9621

# 杀死进程（PID 从 netstat 获取）
taskkill /PID <PID> /F
```

---

### 8. 简化部署脚本

**创建启动脚本** `start-smart-rag.bat`:

```cmd
@echo off
echo Starting Smart RAG Services...

:: 启动 Qdrant
start "Qdrant" C:\Users\%USERNAME%\.openclaw\smart-rag\qdrant-bin\qdrant.exe --config-path C:\Users\%USERNAME%\.openclaw\smart-rag\qdrant-config\config.yaml

:: 等待 Qdrant 启动
timeout /t 5 /nobreak

:: 设置 LightRAG 环境变量
set LLM_BINDING=openai
set LLM_MODEL=LongCat-Flash-Lite
set LLM_BINDING_HOST=https://api.longcat.chat/openai/v1
set OPENAI_API_KEY=ak_xxxxx
set OPENAI_API_BASE=https://api.longcat.chat/openai/v1
set EMBEDDING_BINDING=openai
set EMBEDDING_MODEL=text-embedding-bge-m3
set EMBEDDING_BINDING_HOST=http://127.0.0.1:1234/v1
set EMBEDDING_DIM=1024
set LIGHTRAG_VECTOR_STORAGE=NanoVectorDBStorage
set LLM_TIMEOUT=600

:: 启动 LightRAG
start "LightRAG" lightrag-server --host 127.0.0.1 --port 9621 --working-dir C:\Users\%USERNAME%\.openclaw\lightrag-data\smart-rag --llm-binding openai --embedding-binding openai --max-async 20 --log-level INFO

echo Smart RAG Services Started!
echo Qdrant: http://127.0.0.1:6333
echo LightRAG: http://127.0.0.1:9621
pause
```

---

### 9. 验证安装

**检查服务状态**:
```cmd
:: Qdrant
curl http://127.0.0.1:6333/health

:: LightRAG
curl http://127.0.0.1:9621/health
```

**如果没有 curl**:
```cmd
:: PowerShell
Invoke-WebRequest -Uri http://127.0.0.1:6333/health
Invoke-WebRequest -Uri http://127.0.0.1:9621/health
```

---

### 10. 远程访问配置

**Windows 局域网 IP**:
```cmd
ipconfig
:: 找到 IPv4 地址，如 192.168.3.x
```

**修改配置**:
```json
{
  "lightRAG": {
    "serverUrl": "http://192.168.3.x:9621",
    "qdrantUrl": "http://192.168.3.x:6333"
  }
}
```

**绑定所有接口**:
```cmd
:: LightRAG
lightrag-server --host 0.0.0.0 --port 9621 ...
```

---

## 版本信息

- **版本**: 1.1.0
- **作者**: Frank Zhang
- **许可证**: MIT
- **最后更新**: 2026-04-14

---

## 致谢

- **Obsidian**: 知识管理平台
- **Qdrant**: 向量数据库
- **LightRAG**: 知识图谱引擎
- **RAG-Anything**: 文档解析工具