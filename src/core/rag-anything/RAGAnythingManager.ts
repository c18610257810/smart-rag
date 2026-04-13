import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import { PlatformManager } from "../../utils/PlatformManager";
import { Notice } from "obsidian";

export interface RAGAnythingConfig {
	enabled: boolean;
	httpPort: number;
	workingDir: string;
	parser: 'mineru' | 'docling' | 'paddleocr';
	llmBaseUrl: string;
	llmApiKey: string;
	llmModel: string;
	embeddingBaseUrl: string;
	embeddingApiKey: string;
	embeddingModel: string;
	embeddingDimension: number;
	llmConcurrency: number;
	embeddingConcurrency: number;
	// MinerU remote API configuration
	mineruApiUrl?: string;
	mineruApiEnabled?: boolean;
	maxConcurrentFiles?: number;
}

export class RAGAnythingManager {
	private process: ChildProcess | null = null;
	private config: RAGAnythingConfig;

	constructor(config: RAGAnythingConfig) {
		this.config = config;
	}

	/**
	 * Start RAG-Anything HTTP service
	 */
	async start(): Promise<boolean> {
		if (await this.isRunning()) {
			console.log("[Smart RAG] RAG-Anything already running");
			return true;
		}

		try {
			// Check if RAG-Anything is installed
			if (!await this.isInstalled()) {
				throw new Error("RAG-Anything not installed. Please install it first.");
			}

			const pythonPath = PlatformManager.getRAGAnythingPythonPath();
			const serverPath = this.getServerPath();

			// Build command-line args from user config
			const args = [
				serverPath,
				"--host", "127.0.0.1",
				"--port", this.config.httpPort.toString(),
				"--working-dir", this.config.workingDir,
				"--parser", this.config.parser,
				"--llm-base-url", this.config.llmBaseUrl,
				"--llm-api-key", this.config.llmApiKey,
				"--llm-model", this.config.llmModel,
				"--embedding-base-url", this.config.embeddingBaseUrl,
				"--embedding-api-key", this.config.embeddingApiKey,
				"--embedding-model", this.config.embeddingModel,
				"--embedding-dimension", this.config.embeddingDimension.toString(),
				"--llm-concurrency", this.config.llmConcurrency.toString(),
				"--embedding-concurrency", this.config.embeddingConcurrency.toString(),
			];

			// Add MinerU remote API parameters
			if (this.config.mineruApiEnabled && this.config.mineruApiUrl) {
				args.push("--mineru-api-url", this.config.mineruApiUrl);
			}
			args.push("--max-concurrent-files", String(this.config.maxConcurrentFiles || 4));

			// Ensure venv bin is in PATH so mineru CLI can be found
			const venvBin = path.dirname(pythonPath);
			const currentPath = process.env.PATH || "";
			const newPath = currentPath.includes(venvBin) ? currentPath : `${venvBin}:${currentPath}`;

			// Start RAG-Anything HTTP server
			this.process = spawn(pythonPath, args, {
				detached: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					PATH: newPath,
					PYTHONPATH: PlatformManager.getRAGAnythingSitePackages()
				}
			});

			// Log output
			this.process.stdout?.on("data", (data) => {
				console.log(`[RAG-Anything] ${data.toString().trim()}`);
			});

			this.process.stderr?.on("data", (data) => {
				const msg = data.toString().trim();
				// Python logs INFO/DEBUG to stderr - only show actual errors
				const isError = msg.includes('ERROR') || msg.includes('CRITICAL') || 
				               msg.includes('Traceback') || msg.includes('Exception') ||
				               msg.includes('Failed') || msg.includes('failed');
				if (isError) {
					console.error(`[RAG-Anything Error] ${msg}`);
				} else {
					console.log(`[RAG-Anything] ${msg}`);
				}
			});

			// Wait for healthy
			const healthy = await this.waitForHealthy(60000);
			
			if (healthy) {
				console.log(`[Smart RAG] RAG-Anything started on port ${this.config.httpPort}`);
				new Notice(`Smart RAG: RAG-Anything started on port ${this.config.httpPort}`);
				return true;
			} else {
				throw new Error("RAG-Anything failed to start within timeout");
			}
		} catch (error) {
			console.error("[Smart RAG] Failed to start RAG-Anything:", error);
			new Notice(`Smart RAG: Failed to start RAG-Anything - ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	/**
	 * Stop RAG-Anything service - wait for process to fully exit before returning
	 */
	async stop(): Promise<void> {
		if (this.process) {
			this.process.kill("SIGTERM");
			
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
					this.process.kill("SIGKILL");
					await new Promise(resolve => setTimeout(resolve, 500));
				} catch {}
			}
			
			this.process = null;
		}
		
		// Final cleanup: ensure port is completely free
		const { execSync } = require("child_process");
		try {
			execSync(`lsof -ti :${this.config.httpPort} | xargs kill -9 2>/dev/null || true`, { encoding: "utf8" });
		} catch {}
		
		console.log(`[Smart RAG] RAG-Anything stopped on port ${this.config.httpPort}`);
		new Notice(`Smart RAG: RAG-Anything stopped`);
	}

	/**
	 * Check if RAG-Anything is running by checking if port is listening
	 */
	async isRunning(): Promise<boolean> {
		const { execSync } = require("child_process");
		try {
			const result = execSync(`lsof -i :${this.config.httpPort} -sTCP:LISTEN -t`, { encoding: "utf8" }).trim();
			return result.length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Check if RAG-Anything is installed
	 */
	async isInstalled(): Promise<boolean> {
		const fs = require("fs");
		const pythonPath = PlatformManager.getRAGAnythingPythonPath();
		const serverPath = this.getServerPath();
		
		return fs.existsSync(pythonPath) && fs.existsSync(serverPath);
	}

	/**
	 * Wait for RAG-Anything to become healthy
	 */
	private async waitForHealthy(timeoutMs: number): Promise<boolean> {
		const startTime = Date.now();
		let checkCount = 0;
		
		while (Date.now() - startTime < timeoutMs) {
			checkCount++;
			const running = await this.isRunning();
			if (running) {
				console.log(`[Smart RAG] RAG-Anything healthy after ${checkCount} checks (${Date.now() - startTime}ms)`);
				return true;
			}
			// Log every 10 checks to avoid noise
			if (checkCount % 10 === 0) {
				console.log(`[Smart RAG] RAG-Anything still waiting... (${checkCount} checks, ${Date.now() - startTime}ms)`);
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		
		console.error(`[Smart RAG] RAG-Anything health check timed out after ${checkCount} checks (${timeoutMs}ms)`);
		return false;
	}

	/**
	 * Get RAG-Anything HTTP server path
	 */
	private getServerPath(): string {
		const path = require("path");
		const os = require("os");
		return path.join(os.homedir(), ".openclaw", "skills", "rag-anything", "rag_anything_server.py");
	}

	/**
	 * Get RAG-Anything HTTP URL
	 */
	getHttpUrl(): string {
		return `http://127.0.0.1:${this.config.httpPort}`;
	}
}

/**
 * RAG-Anything HTTP Client
 */
export class RAGAnythingClient {
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	/**
	 * Parse a document
	 */
	async parse(filePath: string, options: {
		extractImages?: boolean;
		extractTables?: boolean;
	} = {}): Promise<any> {
		const response = await fetch(`${this.baseUrl}/parse`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				file_path: filePath,
				extract_images: options.extractImages ?? true,
				extract_tables: options.extractTables ?? true
			})
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`RAG-Anything parse failed: ${response.status}`);
		}

		const text = await response.text();
		return JSON.parse(text);
	}

	/**
	 * Query the document library
	 */
	async query(question: string, options: {
		topK?: number;
		mode?: string;
	} = {}): Promise<any> {
		const response = await fetch(`${this.baseUrl}/query`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question,
				top_k: options.topK ?? 10,
				mode: options.mode ?? "hybrid"
			})
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`RAG-Anything query failed: ${response.status}`);
		}

		const text = await response.text();
		return JSON.parse(text);
	}

	/**
	 * Health check
	 */
	async health(): Promise<any> {
		const response = await fetch(`${this.baseUrl}/health`);
		const text = await response.text();
		return JSON.parse(text);
	}
}
