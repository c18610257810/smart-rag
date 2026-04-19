import { Notice } from 'obsidian';
import { spawn } from 'child_process';
import * as fs from 'fs';

/**
 * Draw.io Generator Service
 * Uses curl to handle SSE streaming response
 */

export interface DrawIoGenerationResult {
  success: boolean;
  xml: string | null;
  error?: string;
}

export class DrawIoGenerator {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:6002') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate draw.io diagram via next-ai-draw-io API
   * Uses curl to properly handle SSE streaming response
   */
  async generate(
    prompt: string,
    sessionId?: string
  ): Promise<DrawIoGenerationResult> {
    try {
      console.log('[DrawIoGenerator] Starting generation for prompt:', prompt.substring(0, 50));
      
      // Build request JSON
      const requestBody = JSON.stringify({
        messages: [
          { role: 'user', parts: [{ type: 'text', text: prompt }] }
        ],
        xml: null,
        previousXml: null,
        sessionId: sessionId || `smart-rag-${Date.now()}`
      });
      
      // Write request body to temp file to avoid shell escaping issues
      const tempFile = `/tmp/drawio-request-${Date.now()}.json`;
      fs.writeFileSync(tempFile, requestBody);
      
      // Use curl with file input and longer timeout
      const curlCommand = `curl -s --max-time 60 -X POST '${this.baseUrl}/api/chat' -H 'Content-Type: application/json' -d @${tempFile}`;
      
      console.log('[DrawIoGenerator] Executing curl command...');
      console.log('[DrawIoGenerator] Request body length:', requestBody.length);
      
      // Execute curl and get full response
      const fullResponse = await this.execCommand(curlCommand);
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
      
      console.log('[DrawIoGenerator] Full response length:', fullResponse.length);
      console.log('[DrawIoGenerator] Response preview:', fullResponse.substring(0, 200));

      // Parse streaming response to extract XML
      const xml = this.parseStreamResponse(fullResponse);
      
      if (!xml) {
        return {
          success: false,
          xml: null,
          error: 'Failed to extract XML from response'
        };
      }

      return {
        success: true,
        xml
      };

    } catch (error) {
      console.error('[DrawIoGenerator] Generation failed:', error);
      return {
        success: false,
        xml: null,
        error: `Failed to call next-ai-draw-io: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Execute shell command and return output
   * Uses spawn for better Electron compatibility
   */
  private execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Parse command for spawn
      const args = command.split(' ');
      const cmd = args[0];
      const cmdArgs = args.slice(1);
      
      console.log('[DrawIoGenerator] spawn command:', cmd, 'args:', cmdArgs.slice(0, 5).join(' '));
      
      const child = spawn(cmd, cmdArgs, { timeout: 60000 });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      child.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          const errorMsg = stderr || `Command exited with code ${code}`;
          console.error('[DrawIoGenerator] spawn error:', errorMsg);
          reject(new Error(errorMsg));
        }
      });
      
      child.on('error', (err: Error) => {
        console.error('[DrawIoGenerator] spawn error:', err);
        reject(err);
      });
    });
  }

  /**
   * Parse streaming SSE response to extract XML
   * Uses regex fallback to handle JSON parsing issues
   */
  private parseStreamResponse(responseText: string): string | null {
    try {
      console.log('[DrawIoGenerator] Parsing response, length:', responseText.length);

      // Method 1: Find the start marker and extract until the end marker
      const startMarker = '"input":{"xml":"';
      const startPos = responseText.indexOf(startMarker);

      if (startPos >= 0) {
        console.log('[DrawIoGenerator] Found input.xml start marker');
        let xmlContent = responseText.substring(startPos + startMarker.length);

        // Find the end marker - look for "} patterns
        // The XML ends with </mxCell> followed by " and then }
        const endPatterns = ['"}}', '"}\n}', '"}'];
        for (const endPattern of endPatterns) {
          const endPos = xmlContent.indexOf(endPattern);
          if (endPos >= 0) {
            xmlContent = xmlContent.substring(0, endPos);
            console.log('[DrawIoGenerator] Found end marker:', endPattern);
            break;
          }
        }

        // Decode escaped characters
        xmlContent = this.decodeXml(xmlContent);
        console.log('[DrawIoGenerator] Extracted xml:', xmlContent.substring(0, 100));

        return this.wrapInMxGraphModel(xmlContent);
      }

      // Method 2: Find mxCell elements directly in the response
      const mxCellPattern = /<mxCell[^>]*>[\s\S]*?<\/mxCell>/g;
      const mxCellMatches = responseText.match(mxCellPattern);
      if (mxCellMatches && mxCellMatches.length > 0) {
        console.log('[DrawIoGenerator] Found mxCell matches:', mxCellMatches.length);
        return this.wrapInMxGraphModel(mxCellMatches.join('\n'));
      }

      console.log('[DrawIoGenerator] No XML found in response');
      return null;
    } catch (e) {
      console.error('[DrawIoGenerator] Parse failed:', e);
      return null;
    }
  }

  /**
   * Extract XML from collected input string
   * Format: {"xml": "<mxCell...>"} or just <mxCell...>
   */
  private extractXmlFromInput(input: string): string | null {
    // Remove incomplete JSON artifacts
    let cleanInput = input.trim();

    // The input should be something like: {"xml": "<mxCell...>"}
    // Let's find all mxCell content

    // Method 1: Extract from JSON format
    if (cleanInput.includes('"xml":')) {
      // Find everything that looks like mxCell content
      // The format is: {"xml": "<mxCell...>"}
      // We need to extract the mxCell part

      // Remove JSON wrapper markers
      let xmlContent = cleanInput;

      // Remove leading {"xml": "
      xmlContent = xmlContent.replace(/^\{"xml":\s*"/, '');

      // Remove trailing "}
      xmlContent = xmlContent.replace(/"\}$/, '');

      // Decode escaped characters
      xmlContent = this.decodeXml(xmlContent);

      // Now xmlContent should be <mxCell...> or multiple mxCells
      // Wrap in mxGraphModel
      return this.wrapInMxGraphModel(xmlContent);
    }

    // Method 2: Find mxCell elements directly
    const mxCellMatches = cleanInput.match(/<mxCell[^>]*>[\s\S]*?<\/mxCell>/g);
    if (mxCellMatches && mxCellMatches.length > 0) {
      return this.wrapInMxGraphModel(mxCellMatches.join('\n'));
    }

    // Method 3: Find incomplete mxCell (without closing tag)
    const partialMxCellMatch = cleanInput.match(/<mxCell[^>]*>/);
    if (partialMxCellMatch) {
      // Try to find all mxCell starts
      const allMxCellStarts = cleanInput.match(/<mxCell[^>]*>/g);
      if (allMxCellStarts) {
        // Extract and wrap each one
        let cells = '';
        for (const start of allMxCellStarts) {
          cells += start + '</mxCell>\n';
        }
        return this.wrapInMxGraphModel(cells);
      }
    }

    return null;
  }

  /**
   * Wrap content in mxGraphModel structure
   */
  private wrapInMxGraphModel(content: string): string {
    // Ensure content is not empty
    if (!content.trim()) {
      return null;
    }

    // Draw.io requires mxGraphModel structure
    return `<mxGraphModel dx="1000" dy="1000" grid="1" gridSize="10" guides="1" snap="1" background="#ffffff">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
${content}
  </root>
</mxGraphModel>`;
  }

  /**
   * Decode escaped XML characters
   */
  private decodeXml(xml: string): string {
    return xml
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Check if next-ai-draw-io service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/api/config`,
        method: 'GET'
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{ available: boolean; model?: string }> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/api/config`,
        method: 'GET'
      });

      if (response.status === 200) {
        const config = response.json;
        return {
          available: true,
          model: config?.model || 'unknown'
        };
      }

      return { available: false };
    } catch {
      return { available: false };
    }
  }
}