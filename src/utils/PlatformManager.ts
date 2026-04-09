import * as os from "os";
import * as path from "path";

/**
 * Platform-specific path and binary management
 */
export class PlatformManager {
	/**
	 * Get current platform identifier
	 */
	static getPlatform(): string {
		const platform = os.platform();
		switch (platform) {
			case "darwin":
				return "apple-darwin";
			case "linux":
				return "unknown-linux-gnu";
			case "win32":
				return "pc-windows-msvc";
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}
	}

	/**
	 * Get current architecture
	 */
	static getArch(): string {
		const arch = os.arch();
		switch (arch) {
			case "arm64":
				return "aarch64";
			case "x64":
				return "x86_64";
			default:
				throw new Error(`Unsupported architecture: ${arch}`);
		}
	}

	/**
	 * Get home directory
	 */
	static getHomeDir(): string {
		return os.homedir();
	}

	/**
	 * Get Qdrant binary path
	 */
	static getQdrantBinaryPath(): string {
		const home = this.getHomeDir();
		const platform = os.platform();
		const arch = os.arch();
		
		const binaryName = platform === "win32" ? "qdrant.exe" : "qdrant";
		return path.join(home, ".openclaw", "smart-rag", "bin", `qdrant-${platform}-${arch}`, binaryName);
	}

	/**
	 * Get RAG-Anything Python path
	 */
	static getRAGAnythingPythonPath(): string {
		const home = this.getHomeDir();
		const platform = os.platform();
		
		if (platform === "win32") {
			return path.join(home, ".openclaw", "skills", "rag-anything", "venv", "Scripts", "python.exe");
		} else {
			return path.join(home, ".openclaw", "skills", "rag-anything", "venv", "bin", "python");
		}
	}

	/**
	 * Get RAG-Anything site-packages path
	 */
	static getRAGAnythingSitePackages(): string {
		const home = this.getHomeDir();
		const platform = os.platform();
		
		if (platform === "win32") {
			return path.join(home, ".openclaw", "skills", "rag-anything", "venv", "Lib", "site-packages");
		} else {
			return path.join(home, ".openclaw", "skills", "rag-anything", "venv", "lib", "python3.12", "site-packages");
		}
	}

	/**
	 * Get default Qdrant data directory
	 */
	static getDefaultQdrantDataDir(): string {
		return path.join(this.getHomeDir(), ".openclaw", "smart-rag", "qdrant-data");
	}

	/**
	 * Get default raw folder path
	 */
	static getDefaultRawFolderPath(): string {
		return path.join(this.getHomeDir(), "Documents", "SmartRAG-Library");
	}
}
