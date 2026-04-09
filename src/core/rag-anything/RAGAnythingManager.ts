import { ChildProcess, spawn } from "child_process";
import { PlatformManager } from "../../utils/PlatformManager";
import { Notice } from "obsidian";

export interface RAGAnythingConfig {
	httpPort: number;
	autoStart: boolean;
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

			// Start RAG-Anything HTTP server
			this.process = spawn(pythonPath, [
				serverPath,
				"--host", "127.0.0.1",
				"--port", this.config.httpPort.toString()
			], {
				detached: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					PYTHONPATH: PlatformManager.getRAGAnythingSitePackages()
				}
			});

			// Log output
			this.process.stdout?.on("data", (data) => {
				console.log(`[RAG-Anything] ${data.toString().trim()}`);
			});

			this.process.stderr?.on("data", (data) => {
				console.error(`[RAG-Anything Error] ${data.toString().trim()}`);
			});

			// Wait for healthy
			const healthy = await this.waitForHealthy(30000);
			
			if (healthy) {
				console.log(`[Smart RAG] RAG-Anything started on port ${this.config.httpPort}`);
				new Notice(`Smart RAG: RAG-Anything started on port ${this.config.httpPort}`);
				return true;
			} else {
				throw new Error("RAG-Anything failed to start within timeout");
			}
		} catch (error) {
			console.error("[Smart RAG] Failed to start RAG-Anything:", error);
			new Notice(`Smart RAG: Failed to start RAG-Anything - ${error.message}`);
			return false;
		}
	}

	/**
	 * Stop RAG-Anything service
	 */
	stop(): void {
		if (this.process) {
			this.process.kill("SIGTERM");
			this.process = null;
			console.log("[Smart RAG] RAG-Anything stopped");
		}
	}

	/**
	 * Check if RAG-Anything is running
	 */
	async isRunning(): Promise<boolean> {
		try {
			const response = await fetch(`http://127.0.0.1:${this.config.httpPort}/health`);
			return response.ok;
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
		
		while (Date.now() - startTime < timeoutMs) {
			if (await this.isRunning()) {
				return true;
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		
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

		if (!response.ok) {
			throw new Error(`RAG-Anything parse failed: ${response.statusText}`);
		}

		return await response.json();
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

		if (!response.ok) {
			throw new Error(`RAG-Anything query failed: ${response.statusText}`);
		}

		return await response.json();
	}

	/**
	 * Health check
	 */
	async health(): Promise<any> {
		const response = await fetch(`${this.baseUrl}/health`);
		return await response.json();
	}
}
