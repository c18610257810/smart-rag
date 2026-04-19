import { spawn, ChildProcess } from 'child_process';
import { Notice } from 'obsidian';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface LightRagConfig {
	serverUrl: string;
	enabled: boolean;
	command: string;
	workingDir: string;
	// LLM config
	llmBinding: string;
	llmModel: string;
	llmBaseUrl: string;
	llmApiKey: string;
	// Embedding config
	embeddingBinding: string;
	embeddingModel: string;
	embeddingBaseUrl: string;
	embeddingApiKey: string;
	embeddingDim: number;
	// Vector storage config
	vectorStorage: 'NanoVectorDBStorage' | 'QdrantVectorDBStorage';
	qdrantUrl: string;
	// Chunking config
	chunkOverlapSize: number;
	maxGleaning: number;
	entityTypes: string[];
	// Retrieval config
	summaryLanguage: string;
	cosineThreshold: number;
	forceLLMSummaryOnMerge: number;
	relatedChunkNumber: number;
	// Options
	llmConcurrency: number;
	embeddingConcurrency: number;
	maxGraphNodes: number;
	chunkingStrategy: string;
	logLevel: string;
}

export class LightRagManager {
	private config: LightRagConfig;
	private process: ChildProcess | null = null;

	constructor(config: LightRagConfig) {
		this.config = config;
	}

	updateConfig(config: Partial<LightRagConfig>) {
		Object.assign(this.config, config);
	}

	private getPort(): number {
		try {
			const url = new URL(this.config.serverUrl);
			return parseInt(url.port) || 9621;
		} catch {
			return 9621;
		}
	}

	private getHost(): string {
		try {
			const url = new URL(this.config.serverUrl);
			return url.hostname || '0.0.0.0';
		} catch {
			return '0.0.0.0';
		}
	}

	async isRunning(): Promise<boolean> {
		const { execSync } = require("child_process");
		try {
			const port = this.getPort();
			const result = execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { encoding: "utf8" }).trim();
			return result.length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Resolve the actual API key from config.
	 * The config's api_key_env field may contain either an env var name OR a raw key.
	 */
	private resolveApiKey(envVarName: string): string {
		if (!envVarName) return '';
		// First try as env var name
		const fromEnv = process.env[envVarName];
		if (fromEnv) return fromEnv;
		// If it looks like a raw key (not a typical env var name pattern), use it directly
		return envVarName;
	}

	/**
	 * Build environment variables for lightrag-server
	 */
	private buildEnvVars(): NodeJS.ProcessEnv {
		const llmApiKey = this.config.llmApiKey || '';
		const embedApiKey = this.config.embeddingApiKey || 'EMPTY';

	return {
			...process.env,
			// LLM
			LLM_BINDING: this.config.llmBinding || 'openai',
			LLM_MODEL: this.config.llmModel || '',
			LLM_BINDING_HOST: this.config.llmBaseUrl || '',
			LLM_BINDING_API_KEY: llmApiKey,
			OPENAI_API_KEY: llmApiKey,
			OPENAI_API_BASE: this.config.llmBaseUrl || '', // Critical: used by LightRAG Python code
			LLM_TIMEOUT: '600', // Increase timeout to 10 minutes (default 180s)
			// Embedding
			EMBEDDING_BINDING: this.config.embeddingBinding || 'openai',
			EMBEDDING_MODEL: this.config.embeddingModel || '',
			EMBEDDING_BINDING_HOST: this.config.embeddingBaseUrl || '',
			EMBEDDING_BINDING_API_KEY: embedApiKey,
			OPENAI_EMBEDDING_API_BASE: this.config.embeddingBaseUrl || '', // For embedding if needed
			EMBEDDING_DIM: String(this.config.embeddingDim || 1024),
			// Vector storage
			LIGHTRAG_VECTOR_STORAGE: this.config.vectorStorage || 'NanoVectorDBStorage',
			QDRANT_URL: this.config.qdrantUrl || 'http://127.0.0.1:6333',
			// Chunking config
			CHUNK_OVERLAP_SIZE: String(this.config.chunkOverlapSize || 200),
			MAX_GLEANING: String(this.config.maxGleaning || 2),
			// Entity types for extraction
			ENTITY_TYPES: JSON.stringify(this.config.entityTypes || [
				"Industry",
				"Domain",
				"Technology",
				"Scenario",
				"PersonType",
				"Feature",
				"Project",
				"Company",
				"Module",
				"Process"
			]),
			// Retrieval config
			SUMMARY_LANGUAGE: this.config.summaryLanguage || 'Chinese',
			COSINE_THRESHOLD: String(this.config.cosineThreshold || 0.2),
			FORCE_LLM_SUMMARY_ON_MERGE: String(this.config.forceLLMSummaryOnMerge || 8),
			RELATED_CHUNK_NUMBER: String(this.config.relatedChunkNumber || 10),
			// Options - all concurrency set to same value
			MAX_ASYNC: String(this.config.llmConcurrency || 4),
			EMBEDDING_FUNC_MAX_ASYNC: String(this.config.embeddingConcurrency || 8),
			MAX_PARALLEL_INSERT: String(this.config.llmConcurrency || 4), // Same as LLM concurrency
			MAX_GRAPH_NODES: String(this.config.maxGraphNodes || 30000),
			LIGHTRAG_CHUNKING_STRATEGY: this.config.chunkingStrategy || 'fixed',
		};
	}

	/**
	 * Create semantic chunking wrapper script if needed
	 */
	private createSemanticWrapper(): string | null {
		if (this.config.chunkingStrategy !== 'semantic') {
			return null;
		}

		const wrapperPath = path.join(os.tmpdir(), 'lightrag-semantic-wrapper.py');
		const llmApiKey = this.config.llmApiKey || '';

		const wrapper = `import sys
import asyncio
import json
import os
import requests
from typing import List, Dict, Any

os.environ['OPENAI_API_KEY'] = os.getenv('LLM_BINDING_API_KEY', 'test-key')

async def llm_semantic_chunking_function(tokenizer, content, *args, **kwargs):
    llm_base_url = os.getenv('LLM_BINDING_HOST', '')
    llm_model = os.getenv('LLM_MODEL', '')
    api_key = os.getenv('OPENAI_API_KEY', 'test-key')

    prompt = f'''请将以下文本按主题进行语义切分，用 [SPLIT] 标记分隔各个主题段落。
不要修改原文内容，在主题转换的地方插入 [SPLIT]。
原文：
{content}'''

    try:
        response = requests.post(
            f"{llm_base_url}/chat/completions",
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'model': llm_model, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': 0.1, 'max_tokens': 4096},
            timeout=60
        )
        if response.status_code == 200:
            result_text = response.json()['choices'][0]['message']['content']
            chunks = result_text.split('[SPLIT]')
            cleaned = []
            for i, chunk in enumerate(chunks):
                c = chunk.strip()
                if c:
                    cleaned.append({'tokens': len(c), 'content': c, 'chunk_order_index': i})
            if cleaned:
                return cleaned
    except Exception as e:
        print(f"Semantic chunking error: {e}")

    return [{'tokens': len(content), 'content': content, 'chunk_order_index': 0}]

def patched_init(self, *args, **kwargs):
    if 'chunking_func' not in kwargs:
        kwargs['chunking_func'] = llm_semantic_chunking_function
    original = self.__class__.__bases__[0].__init__
    return original(self, *args, **kwargs)

import lightrag.lightrag as lm
if not hasattr(lm.LightRAG, '_patched'):
    lm.LightRAG._orig_init = lm.LightRAG.__init__
    lm.LightRAG.__init__ = patched_init
    lm.LightRAG._patched = True
`;

		try {
			fs.writeFileSync(wrapperPath, wrapper, { mode: 0o600 });
			return wrapperPath;
		} catch (err) {
			console.error('[Smart RAG] Failed to create semantic wrapper:', err);
			return null;
		}
	}

	async start(): Promise<boolean> {
		// Always kill existing process to ensure new config is applied
		const port = this.getPort();
		console.log(`[Smart RAG] Starting LightRAG with llmConcurrency=${this.config.llmConcurrency}, embeddingConcurrency=${this.config.embeddingConcurrency}`);
		try {
			const { execSync } = require('child_process');
			const pids = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
			if (pids) {
				console.log(`[Smart RAG] Killing existing LightRAG on port ${port} to apply new config`);
				pids.split('\n').forEach(pid => {
					try { process.kill(parseInt(pid), 'SIGTERM'); } catch {}
				});
				await new Promise(r => setTimeout(r, 1500));
			}
		} catch {}

		try {
			const host = this.getHost();
			const workingDir = this.config.workingDir || path.join(os.homedir(), '.openclaw', 'lightrag-data');

			// Ensure working dir exists
			fs.mkdirSync(workingDir, { recursive: true });

			// Resolve command path
			let cmd = this.config.command || 'lightrag-server';
			if (!cmd.includes('/') && !cmd.includes('\\')) {
				const workspaceVenv = path.join(os.homedir(), '.openclaw', 'workspace', 'venv', 'bin', 'lightrag-server');
				if (fs.existsSync(workspaceVenv)) {
					cmd = workspaceVenv;
				}
			}

			// Build CLI args (embedding host/model passed via env vars only)
			const args = [
				'--host', host,
				'--port', String(port),
				'--working-dir', workingDir,
				'--llm-binding', this.config.llmBinding || 'openai',
				'--embedding-binding', this.config.embeddingBinding || 'openai',
				'--max-async', String(this.config.llmConcurrency || 4),
				'--log-level', this.config.logLevel || 'INFO',
			];

			console.log(`[Smart RAG] Starting LightRAG: ${cmd} ${args.join(' ')}`);

			// Create semantic wrapper if needed
			const wrapperPath = this.createSemanticWrapper();
			const envVars = this.buildEnvVars();

			// If semantic chunking, run wrapper instead
			const finalCmd = wrapperPath ? `${os.homedir()}/.openclaw/workspace/venv/bin/python3` : cmd;
			const finalArgs = wrapperPath ? [wrapperPath] : args;

			this.process = spawn(finalCmd, finalArgs, {
				detached: false,
				stdio: ['ignore', 'pipe', 'pipe'],
				cwd: os.tmpdir(), // Use /tmp to avoid permission issues
				env: envVars
			});

			this.process.stdout?.on('data', (data) => {
				console.log(`[LightRAG] ${data.toString().trim()}`);
			});

			this.process.stderr?.on('data', (data) => {
				const msg = data.toString().trim();
				// Python logs INFO/DEBUG to stderr - only show actual errors
				const isError = msg.includes('ERROR') || msg.includes('CRITICAL') || 
				               msg.includes('Traceback') || msg.includes('Exception') ||
				               msg.includes('Failed') || msg.includes('failed');
				if (isError) {
					console.error(`[LightRAG Error] ${msg}`);
				} else {
					// INFO/DEBUG/WARNING - log normally
					console.log(`[LightRAG] ${msg}`);
				}
			});

			this.process.on('exit', (code) => {
				console.log(`[Smart RAG] LightRAG exited with code ${code}`);
				this.process = null;
			});

			// Wait for healthy
			const startTime = Date.now();
			while (Date.now() - startTime < 60000) {
				if (await this.isRunning()) {
					console.log(`[Smart RAG] LightRAG started on port ${port}`);
					new Notice(`Smart RAG: LightRAG started on port ${port}`);
					return true;
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			throw new Error('LightRAG failed to start within timeout');
		} catch (error: unknown) {
			console.error('[Smart RAG] Failed to start LightRAG:', error);
			new Notice(`Smart RAG: Failed to start LightRAG - ${(error as Error).message}`);
			return false;
		}
	}

	/**
	 * Stop LightRAG server - wait for process to fully exit before returning
	 */
	async stop(): Promise<void> {
		const port = this.getPort();
		
		if (this.process) {
			// Send SIGTERM to process group
			try {
				process.kill(-this.process.pid!, 'SIGTERM');
			} catch {
				this.process.kill('SIGTERM');
			}
			
			// Wait for process to exit (max 5 seconds)
			const startTime = Date.now();
			while (Date.now() - startTime < 5000) {
				if (!this.process || this.process.killed) {
					break;
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			
			// Force kill if still running
			if (this.process && !this.process.killed) {
				try {
					process.kill(-this.process.pid!, 'SIGKILL');
				} catch {
					this.process.kill('SIGKILL');
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			
			this.process = null;
		}
		
		// Final cleanup: ensure port is completely free
		const { execSync } = require("child_process");
		try {
			execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, { encoding: "utf8" });
		} catch {}
		
		console.log(`[Smart RAG] LightRAG stopped on port ${port}`);
		new Notice('Smart RAG: LightRAG stopped');
	}
}