# Smart RAG UI Design

**Version**: 0.3.0
**Date**: 2026-04-08
**Reference**: Neural Composer

## UI Layout

### Main Interface (Right Sidebar)

```
┌─────────────────────────────────────┐
│  Smart RAG                    [X]   │
├─────────────────────────────────────┤
│  [Chat] [Logs] [Status]             │  ← Tab Bar
├─────────────────────────────────────┤
│                                     │
│  📝 Chat Tab                        │
│  ┌─────────────────────────────┐   │
│  │ 🤖 Assistant                │   │
│  │ Hello! How can I help you?  │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 👤 You                      │   │
│  │ What is machine learning?   │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 🤖 Assistant                │   │
│  │ Based on your vault [1]...  │   │  ← Citation style
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  [Normal Chat] [@Vault] [Clear]    │  ← Action Buttons
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │ Type your message...        │   │  ← Input Box
│  │                             │   │
│  └─────────────────────────────┘   │
│  [Send]  [Stop]                     │
└─────────────────────────────────────┘
```

### Logs Tab

```
┌─────────────────────────────────────┐
│  📊 Semantic Chunking Progress      │
├─────────────────────────────────────┤
│  ✅ File 1: document.md             │
│     - Chunked into 12 segments      │
│     - Time: 2.3s                    │
│                                     │
│  ⏳ File 2: notes.md                │
│     - Processing chunk 5/15...      │
│                                     │
│  ❌ File 3: error.md                │
│     - Error: API timeout            │
│     - [Retry] [Skip]                │
└─────────────────────────────────────┘
```

### Status Tab

```
┌─────────────────────────────────────┐
│  ⚙️ System Status                   │
├─────────────────────────────────────┤
│  LightRAG Server: ● Running        │
│  PGlite Database: ● Ready          │
│  Embedding Service: ● Ready        │
│                                     │
│  📊 Statistics                      │
│  - Documents: 156                   │
│  - Chunks: 1,234                    │
│  - Vector Dimension: 1024           │
│                                     │
│  🔄 Operations                      │
│  [Rebuild Index] [Clear Database]  │
└─────────────────────────────────────┘
```

---

## Key Features

### 1. Chat Tab

**Normal Chat Button**:
- 直接与 Chat LLM 对话
- 不使用向量搜索
- 用于日常问答

**@Vault Button**:
- 触发向量搜索
- 查询 PGlite 数据库
- 基于 context 生成回答
- 显示引用来源 [1], [2]

**Error Handling**:
- API 错误 → 弹窗显示详细日志
- 网络错误 → 显示重试按钮
- 配置错误 → 跳转到设置页

**Citation Style**:
```
Based on your notes about machine learning:

"Machine learning is a subset of AI..." [1]

The key concepts include:
- Supervised learning [2]
- Unsupervised learning [3]

Sources:
[1] ml-basics.md#L15
[2] ml-types.md#L8
[3] ml-types.md#L23
```

### 2. Logs Tab

**Semantic Chunking Log**:
- 实时显示切分进度
- 每个文件的处理状态
- 错误日志和重试选项

**LightRAG Chunking Log**:
- LightRAG Server 处理状态
- 文档索引进度
- Graph 构建状态

**Log Levels**:
- ✅ Success (green)
- ⏳ Processing (yellow)
- ⚠️ Warning (orange)
- ❌ Error (red)

### 3. Status Tab

**Service Status**:
- LightRAG Server (Running/Stopped)
- PGlite Database (Ready/Error)
- Embedding Service (Ready/Error)

**Statistics**:
- Documents count
- Chunks count
- Vector dimension
- Last indexed time

**Operations**:
- Rebuild Index (重新构建向量索引)
- Clear Database (清空数据库)
- Export Logs (导出日志)

---

## Reserved Features

### Excalidraw Integration

**UI Location**: 在 @Vault 按钮旁边添加 [Excalidraw] 按钮

**功能**:
- 基于 vault 内容生成图表
- 调用 Excalidraw API 创建 drawing
- 支持流程图、思维导图等

**预留接口**:
```typescript
interface ExcalidrawService {
  generateDiagram(content: string): Promise<ExcalidrawDrawing>;
  insertToVault(drawing: ExcalidrawDrawing): void;
}
```

### Mermaid Integration

**UI Location**: 在 @Vault 按钮旁边添加 [Mermaid] 按钮

**功能**:
- 生成 Mermaid 代码
- 渲染为图表
- 支持多种图表类型

**预留接口**:
```typescript
interface MermaidService {
  generateMermaidCode(content: string, type: 'flowchart' | 'sequence' | 'mindmap'): Promise<string>;
  renderToMarkdown(code: string): string;
}
```

---

## Error Display

### Error Modal

```
┌─────────────────────────────────────┐
│  ❌ Error                          │
├─────────────────────────────────────┤
│  Failed to process document.md     │
│                                     │
│  Error Details:                     │
│  - API returned 429: Rate limit    │
│  - Request ID: req_abc123          │
│  - Timestamp: 2026-04-08 00:20:15  │
│                                     │
│  Stack Trace:                       │
│  at LLMService.chatCompletion()    │
│  at ChatPanel.sendMessage()        │
│                                     │
│  [Copy Log] [Retry] [Dismiss]      │
└─────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1: Core Chat (Current)
- ✅ Chat Tab 基础布局
- ✅ Normal Chat 按钮
- ✅ @Vault 按钮
- ✅ 错误弹窗

### Phase 2: Logs & Status
- ⏳ Logs Tab
- ⏳ Status Tab
- ⏳ 实时进度显示

### Phase 3: Advanced Features
- ⏳ Excalidraw 集成
- ⏳ Mermaid 集成
- ⏳ 流式输出

---

**Last Updated**: 2026-04-08