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
			
			// Generate config file (Qdrant v1.17+ no longer supports CLI args for storage/port)
			const configPath = await this.ensureConfig();
			
			// Start Qdrant process
			this.process = spawn(this.binaryPath, [
				"--config-path", configPath
			], {
				detached: false,
				stdio: ["ignore", "pipe", "pipe"],
				cwd: this.config.dataDir
			});

			// Log output
			this.process.stdout?.on("data", (data) => {
				console.log(`[Qdrant] ${data.toString().trim()}`);
			});

			this.process.stderr?.on("data", (data) => {
				const msg = data.toString().trim();
				// Qdrant logs INFO/DEBUG to stderr - only show actual errors
				const isError = msg.includes('ERROR') || msg.includes('error') || 
				               msg.includes('panic') || msg.includes('fatal') ||
				               msg.includes('failed') || msg.includes('Failed');
				if (isError) {
					console.error(`[Qdrant Error] ${msg}`);
				} else {
					console.log(`[Qdrant] ${msg}`);
				}
			});

			// Wait for healthy (90s timeout - Qdrant can be slow on first start)
			const healthy = await this.waitForHealthy(90000);
			
			if (healthy) {
				console.log(`[Smart RAG] Qdrant started on port ${this.config.httpPort}`);
				new Notice(`Smart RAG: Qdrant started on port ${this.config.httpPort}`);
				return true;
			} else {
				throw new Error("Qdrant failed to start within timeout");
			}
		} catch (error: unknown) {
			console.error("[Smart RAG] Failed to start Qdrant:", error);
			new Notice(`Smart RAG: Failed to start Qdrant - ${(error as Error).message}`);
			return false;
		}
	}

	/**
	 * Stop Qdrant server - wait for process to fully exit before returning
	 */
	async stop(): Promise<void> {
		if (this.process) {
			// Send SIGTERM
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
		
		console.log(`[Smart RAG] Qdrant stopped on port ${this.config.httpPort}`);
		new Notice(`Smart RAG: Qdrant stopped`);
	}

	/**
	 * Check if Qdrant is running by checking if port is listening
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
	 * Wait for Qdrant to become healthy
	 */
	private async waitForHealthy(timeoutMs: number): Promise<boolean> {
		const startTime = Date.now();
		let checkCount = 0;
		
		while (Date.now() - startTime < timeoutMs) {
			checkCount++;
			const running = await this.isRunning();
			if (running) {
				console.log(`[Smart RAG] Qdrant healthy after ${checkCount} checks (${Date.now() - startTime}ms)`);
				return true;
			}
			// Log every 10 checks to avoid noise
			if (checkCount % 10 === 0) {
				console.log(`[Smart RAG] Qdrant still waiting... (${checkCount} checks, ${Date.now() - startTime}ms)`);
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		
		console.error(`[Smart RAG] Qdrant health check timed out after ${checkCount} checks (${timeoutMs}ms)`);
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
		// Map to Qdrant release asset naming convention
		let filename: string;
		if (platform === "darwin" && arch === "arm64") {
			filename = "qdrant-aarch64-apple-darwin";
		} else if (platform === "darwin" && arch === "x64") {
			filename = "qdrant-x86_64-apple-darwin";
		} else if (platform === "linux" && arch === "x64") {
			filename = "qdrant-x86_64-unknown-linux-gnu";
		} else if (platform === "linux" && arch === "arm64") {
			filename = "qdrant-aarch64-unknown-linux-musl";
		} else if (platform === "win32") {
			filename = "qdrant-x86_64-pc-windows-msvc";
		} else {
			filename = `qdrant-${platform}-${arch}`;
		}
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
		} catch (error: unknown) {
			throw new Error(`Failed to download Qdrant: ${(error as Error).message}`);
		} finally {
			// Cleanup
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {}
		}
	}

	/**
	 * Generate Qdrant config file (v1.17+ requires config instead of CLI args)
	 */
	private async ensureConfig(): Promise<string> {
		const fs = require("fs");
		const path = require("path");
		
		const configDir = path.join(require("os").homedir(), ".openclaw", "smart-rag", "qdrant-config");
		fs.mkdirSync(configDir, { recursive: true });
		
		const configPath = path.join(configDir, "config.yaml");
		
		// Generate config YAML for Qdrant v1.17.1
		// Escape dataDir for YAML safety
		const safeDataDir = this.config.dataDir.includes(' ') 
			? `"${this.config.dataDir}"`
			: this.config.dataDir;
		const configContent = `# Auto-generated config for Smart RAG
storage:
  storage_path: ${safeDataDir}

service:
  host: 127.0.0.1
  http_port: ${this.config.httpPort}
  grpc_port: 6334

log_level: info

telemetry_disabled: true
`
		
		fs.writeFileSync(configPath, configContent, "utf8");
		console.log(`[Smart RAG] Qdrant config generated at ${configPath}`);
		return configPath;
	}

	/**
	 * Get Qdrant HTTP URL
	 */
	getHttpUrl(): string {
		return `http://127.0.0.1:${this.config.httpPort}`;
	}
}
