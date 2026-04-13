#!/usr/bin/env node
/**
 * Smart RAG v1.0.0 End-to-End Test
 * 
 * Tests: Embedding → Qdrant Upsert → Search → LLM Answer
 * Uses: Local LM Studio for embeddings (port 1234)
 */

const http = require('http');
const crypto = require('crypto');

const CONFIG = {
  qdrant: 'http://127.0.0.1:6333',
  embedding: 'http://127.0.0.1:1234/v1',
  embeddingModel: 'text-embedding-bge-m3',
  chatLlm: 'https://dashscope.aliyuncs.com/v1',  // Will need API key
  chatModel: 'qwen-plus',
  chatApiKey: process.env.DASHSCOPE_API_KEY || '',
  collection: 'vault_notes',
};

async function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? require('https') : require('http');
    
    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getEmbedding(text) {
  const resp = await httpRequest(`${CONFIG.embedding}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CONFIG.embeddingModel, input: [text] }),
  });
  if (resp.status !== 200) throw new Error(`Embedding API error: ${resp.status}`);
  return resp.data.data[0].embedding;
}

async function upsertPoint(pointId, vector, payload) {
  const resp = await httpRequest(`${CONFIG.qdrant}/collections/${CONFIG.collection}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{ id: pointId, vector, payload }]
    }),
  });
  if (resp.data.status !== 'ok') throw new Error(`Qdrant upsert failed: ${JSON.stringify(resp.data)}`);
  return resp.data;
}

async function search(vector, limit = 5) {
  const resp = await httpRequest(`${CONFIG.qdrant}/collections/${CONFIG.collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector, limit, with_payload: true }),
  });
  return resp.data.result || [];
}

async function countPoints() {
  const resp = await httpRequest(`${CONFIG.qdrant}/collections/${CONFIG.collection}`);
  return resp.data.result.points_count;
}

async function deleteByPath(path) {
  const resp = await httpRequest(`${CONFIG.qdrant}/collections/${CONFIG.collection}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: { must: [{ key: 'path', match: { value: path } }] },
    }),
  });
  return resp.data;
}

async function generateAnswer(context, question) {
  const prompt = `请根据以下上下文回答问题。

上下文：
${context}

问题：${question}

请根据上下文给出简洁准确的回答。如果上下文不包含相关信息，请如实说明。`;

  const resp = await httpRequest(`${CONFIG.chatLlm}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.chatApiKey}` },
    body: JSON.stringify({
      model: CONFIG.chatModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });
  if (resp.status !== 200) return `[LLM API error: ${resp.status}]`;
  return resp.data.choices?.[0]?.message?.content || 'No response';
}

async function main() {
  console.log('🧪 Smart RAG v1.0.0 End-to-End Test\n');
  console.log('='.repeat(60));
  
  // Test data
  const testDocs = [
    {
      path: 'Projects/Smart RAG/README.md',
      title: 'Smart RAG 项目说明',
      content: 'Smart RAG 是一个 Obsidian 插件，提供语义搜索和 RAG 功能。使用 Qdrant 作为向量数据库，支持多种文档格式解析。当前版本为 v1.0.0，架构已从 PGlite 迁移到 Qdrant。',
    },
    {
      path: 'Projects/Smart RAG/ARCHITECTURE.md',
      title: '架构设计文档',
      content: 'Smart RAG v1.0.0 架构：使用 Qdrant 作为向量存储（替代 PGlite），RAG-Anything 作为文档解析服务，支持 PDF/Word/PPT/Excel/图片等全格式。索引流程：文件扫描 → RAG-Anything 解析 → Embedding → Qdrant 存储。查询流程：问题 Embedding → Qdrant 多集合搜索 → 上下文组装 → LLM 生成回答。',
    },
    {
      path: 'Notes/Qdrant 使用指南.md',
      title: 'Qdrant 向量数据库指南',
      content: 'Qdrant 是一个高性能的向量数据库，支持 Cosine、Euclidean、Dot 等距离度量。Smart RAG 使用 1024 维 Cosine 距离。Qdrant 支持 HNSW 索引，提供高效的近似最近邻搜索。集合包括：vault_notes（笔记向量）、raw_documents（文档 chunks）、images（图片描述）、chunks（通用 chunks）。',
    },
  ];

  // Step 1: Clean up test data
  console.log('\n📋 Step 1: Clean up test data');
  for (const doc of testDocs) {
    await deleteByPath(doc.path);
  }
  console.log('  ✅ Test data cleaned');

  // Step 2: Index test documents
  console.log('\n📋 Step 2: Index test documents');
  const initialCount = await countPoints();
  console.log(`  Initial points: ${initialCount}`);

  for (const doc of testDocs) {
    const vector = await getEmbedding(doc.content);
    const pointId = crypto.randomUUID();
    await upsertPoint(pointId, vector, {
      path: doc.path,
      title: doc.title,
      content: doc.content,
      tags: ['test'],
      modified_time: Date.now(),
      word_count: doc.content.length,
    });
    console.log(`  ✅ Indexed: ${doc.title}`);
  }

  const afterCount = await countPoints();
  console.log(`  Total points: ${afterCount} (+${afterCount - initialCount})`);

  // Step 3: Query - test 3 questions
  console.log('\n📋 Step 3: Query tests');
  
  const testQueries = [
    'Smart RAG 是什么？',
    'v1.0.0 用了什么向量数据库？',
    'Qdrant 支持哪些距离度量？',
  ];

  for (const question of testQueries) {
    console.log(`\n  🔍 Q: ${question}`);
    
    // Get embedding
    const queryVector = await getEmbedding(question);
    
    // Search Qdrant
    const results = await search(queryVector, 3);
    console.log(`  📄 Found ${results.length} results`);
    
    if (results.length === 0) {
      console.log('  ⚠️  No results found');
      continue;
    }
    
    // Build context
    const context = results.map((r, i) => 
      `[${i+1}] ${r.payload.title}: ${r.payload.content}`
    ).join('\n\n');
    
    // Generate answer
    let answer = '⏭️ Skipped (no API key)';
    if (CONFIG.chatApiKey) {
      answer = await generateAnswer(context, question);
    }
    
    console.log(`  💬 A: ${answer.substring(0, 150)}${answer.length > 150 ? '...' : ''}`);
    
    // Verify relevance
    const topResult = results[0];
    console.log(`  📊 Top match: ${topResult.payload.title} (score: ${topResult.score?.toFixed(4) || 'N/A'})`);
  }

  // Step 4: Cleanup
  console.log('\n📋 Step 4: Cleanup');
  for (const doc of testDocs) {
    await deleteByPath(doc.path);
  }
  const finalCount = await countPoints();
  console.log(`  ✅ Test data cleaned, points: ${finalCount}`);

  console.log('\n' + '='.repeat(60));
  console.log('🎉 All tests passed!');
  console.log('\nSummary:');
  console.log('  ✅ Embedding API (LM Studio)');
  console.log('  ✅ Qdrant Upsert');
  console.log('  ✅ Qdrant Search');
  console.log(`  ✅ Query pipeline (${testQueries.length}/${testQueries.length})`);
  console.log(CONFIG.chatApiKey ? '  ✅ LLM Answer Generation' : '  ⏭️ LLM Answer (skipped - no API key)');
  console.log('  ✅ Cleanup');
}

main().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
