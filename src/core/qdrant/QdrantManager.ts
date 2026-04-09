import { ChildProcess, spawn } from "child_process";
import { PlatformManager } from "../../utils/PlatformManager";
import { Notice } from "obsidian";

export interface QdrantConfig {
	httpPort: number;
	dataDir: string;
	autoStart: boolean;
}

export class QdrantManager {
	private process: ChildProcess | null = null;
	private config: QdrantConfig;
	private binaryPath: string | null = null;

	constructor(config: QdrantConfig) {
		this.config = config;
	}

	/**
	 * Start Qdrant server
	 */
	async start(): Promise<boolean> {
		if (await this.isRunning()) {
			console.log("[Smart RAG] Qdrant already running");
			return true;
		}

		try {
			// Ensure binary exists
			this.binaryPath = await this.ensureBinary();
			
			// Start Qdrant process
			this.process = spawn(this.binaryPath, [
				"--storage-path", this.config.dataDir,
				"--http-port", this.config.httpPort.toString(),
				"--log-level", "info"
			], {
				detached: false,
				stdio: ["ignore", "pipe", "pipe"]
			});

			// Log output
			this.process.stdout?.on("data", (data) => {
				console.log(`[Qdrant] ${data.toString().trim()}`);
			});

			this.process.stderr?.on("data", (data) => {
				console.error(`[Qdrant Error] ${data.toString().trim()}`);
			});

			// Wait for healthy
			const healthy = await this.waitForHealthy(30000);
			
			if (healthy) {
				console.log(`[Smart RAG] Qdrant started on port ${this.config.httpPort}`);
				new Notice(`Smart RAG: Qdrant started on port ${this.config.httpPort}`);
				return true;
			} else {
				throw new Error("Qdrant failed to start within timeout");
			}
		} catch (error) {
			console.error("[Smart RAG] Failed to start Qdrant:", error);
			new Notice(`Smart RAG: Failed to start Qdrant - ${error.message}`);
			return false;
		}
	}

	/**
	 * Stop Qdrant server
	 */
	stop(): void {
		if (this.process) {
			this.process.kill("SIGTERM");
			this.process = null;
			console.log("[Smart RAG] Qdrant stopped");
		}
	}

	/**
	 * Check if Qdrant is running
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
	 * Wait for Qdrant to become healthy
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
	 * Ensure Qdrant binary exists, download if needed
	 */
	private async ensureBinary(): Promise<string> {
		const binaryPath = PlatformManager.getQdrantBinaryPath();
		
		// Check if binary exists
		const fs = require("fs");
		if (fs.existsSync(binaryPath)) {
			return binaryPath;
		}

		// Download binary
		new Notice("Smart RAG: Downloading Qdrant binary...");
		await this.downloadBinary(binaryPath);
		
		return binaryPath;
	}

	/**
	 * Download Qdrant binary for current platform
	 */
	private async downloadBinary(targetPath: string): Promise<void> {
		const platform = PlatformManager.getPlatform();
		const arch = PlatformManager.getArch();
		
		const version = "v1.17.1";
		const filename = `qdrant-${platform}-${arch}`;
		const url = `https://github.com/qdrant/qdrant/releases/download/${version}/${filename}.tar.gz`;
		
		console.log(`[Smart RAG] Downloading Qdrant from ${url}`);
		
		// Download and extract
		const { exec } = require("child_process");
		const util = require("util");
		const execAsync = util.promisify(exec);
		const fs = require("fs");
		const path = require("path");
		
		const tempDir = path.join(require("os").tmpdir(), "smart-rag-qdrant-download");
		fs.mkdirSync(tempDir, { recursive: true });
		
		const tarPath = path.join(tempDir, "qdrant.tar.gz");
		
		try {
			// Download
			await execAsync(`curl -L -o "${tarPath}" "${url}"`);
			
			// Extract
			await execAsync(`tar -xzf "${tarPath}" -C "${tempDir}"`);
			
			// Move binary to target
			const extractedBinary = path.join(tempDir, "qdrant");
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.copyFileSync(extractedBinary, targetPath);
			fs.chmodSync(targetPath, 0o755);
			
			console.log(`[Smart RAG] Qdrant binary downloaded to ${targetPath}`);
		} catch (error) {
			throw new Error(`Failed to download Qdrant: ${error.message}`);
		} finally {
			// Cleanup
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {}
		}
	}

	/**
	 * Get Qdrant HTTP URL
	 */
	getHttpUrl(): string {
		return `http://127.0.0.1:${this.config.httpPort}`;
	}
}
