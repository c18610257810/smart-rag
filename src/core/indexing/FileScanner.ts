/**
 * FileScanner - Scan and detect changes in raw folder
 * 
 * Recursively scans a directory, computes file hashes,
 * and detects new, modified, and deleted files.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface FileInfo {
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  modifiedTime: number;
}

export interface ScanResult {
  newFiles: FileInfo[];
  modifiedFiles: FileInfo[];
  deletedFiles: string[]; // file paths
  unchangedFiles: FileInfo[];
}

// Supported file types
const SUPPORTED_EXTENSIONS = new Set([
  ".md", ".txt",           // Text
  ".pdf",                  // PDF
  ".docx", ".doc",         // Word
  ".pptx", ".ppt",         // PowerPoint
  ".xlsx", ".xls",         // Excel
  ".png", ".jpg", ".jpeg", // Images
  ".gif", ".bmp", ".webp", // More images
]);

// Files to exclude
const EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  ".DS_Store",
  "Thumbs.db",
];

export class FileScanner {
  private rawFolderPath: string;
  private knownFiles: Map<string, { hash: string; modifiedTime: number }> = new Map();

  constructor(rawFolderPath: string) {
    this.rawFolderPath = rawFolderPath;
  }

  /**
   * Load known files from a map (e.g., from Qdrant metadata)
   */
  loadKnownFiles(knownFiles: Map<string, { hash: string; modifiedTime: number }>): void {
    this.knownFiles = knownFiles;
  }

  /**
   * Scan the raw folder and detect changes
   */
  async scan(): Promise<ScanResult> {
    const result: ScanResult = {
      newFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
      unchangedFiles: [],
    };

    if (!fs.existsSync(this.rawFolderPath)) {
      console.warn(`[Smart RAG] Raw folder not found: ${this.rawFolderPath}`);
      return result;
    }

    // Get all files in folder
    const allFiles = this.getAllFiles(this.rawFolderPath);
    const currentPaths = new Set<string>();

    for (const filePath of allFiles) {
      currentPaths.add(filePath);

      try {
        const stats = fs.statSync(filePath);
        const fileInfo: FileInfo = {
          filePath,
          fileName: path.basename(filePath),
          fileType: path.extname(filePath).toLowerCase().slice(1),
          fileSize: stats.size,
          fileHash: "", // Will be computed if needed
          modifiedTime: stats.mtimeMs,
        };

        const known = this.knownFiles.get(filePath);

        if (!known) {
          // New file
          fileInfo.fileHash = this.computeHash(filePath);
          result.newFiles.push(fileInfo);
        } else if (known.modifiedTime !== stats.mtimeMs) {
          // File modified - compute hash to confirm
          const newHash = this.computeHash(filePath);
          if (newHash !== known.hash) {
            fileInfo.fileHash = newHash;
            result.modifiedFiles.push(fileInfo);
          } else {
            // Hash same, treat as unchanged
            fileInfo.fileHash = known.hash;
            result.unchangedFiles.push(fileInfo);
          }
        } else {
          // Unchanged
          fileInfo.fileHash = known.hash;
          result.unchangedFiles.push(fileInfo);
        }
      } catch (err) {
        console.warn(`[Smart RAG] Error reading file ${filePath}:`, err);
      }
    }

    // Detect deleted files
    for (const [knownPath] of this.knownFiles) {
      if (!currentPaths.has(knownPath)) {
        result.deletedFiles.push(knownPath);
      }
    }

    console.log(`[Smart RAG] Scan complete: ${result.newFiles.length} new, ${result.modifiedFiles.length} modified, ${result.deletedFiles.length} deleted, ${result.unchangedFiles.length} unchanged`);

    return result;
  }

  /**
   * Recursively get all files in directory
   */
  private getAllFiles(dirPath: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dirPath)) return files;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip excluded patterns
      if (EXCLUDE_PATTERNS.some(pattern => entry.name.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Compute SHA256 hash of a file
   */
  private computeHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  }
}
