import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { requestUrl } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Draw.io Generator using AI SDK Tools
 * Implements next-ai-draw-io style architecture
 */

export interface DrawIoGenerationResult {
  success: boolean;
  xml: string | null;
  error?: string;
}

export interface DrawIoEditOperation {
  operation: 'update' | 'add' | 'delete';
  cell_id: string;
  new_xml?: string;
}

export interface DrawIoState {
  currentXml: string | null;
  previousXml: string | null;
}

export class DrawIoGeneratorAI {
  private modelId: string;
  private baseUrl: string;
  private apiKey: string;
  private state: DrawIoState;

  constructor(modelId: string = 'glm-5', baseUrl: string = '', apiKey: string = '') {
    this.modelId = modelId;
    this.baseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.state = { currentXml: null, previousXml: null };
  }

  /**
   * Update diagram state (for context)
   */
  setState(currentXml: string | null, previousXml: string | null = null) {
    this.state = { currentXml, previousXml };
  }

  /**
   * Get current state
   */
  getState(): DrawIoState {
    return this.state;
  }

  /**
   * Generate a new diagram
   */
  async generate(prompt: string): Promise<DrawIoGenerationResult> {
    try {
      console.log('[DrawIoGeneratorAI] Starting generation...');
      console.log('[DrawIoGeneratorAI] Prompt length:', prompt.length);

      const openai = createOpenAI({
        baseURL: this.baseUrl,
        apiKey: this.apiKey,
        fetch: async (url: string | URL, options: any) => {
          // Use Obsidian's requestUrl instead of fetch
          console.log('[DrawIoGeneratorAI] fetch called:', url.toString().substring(0, 50));
          
          let bodyData: string | undefined = undefined;
          if (options.body) {
            // body may be string or object
            if (typeof options.body === 'string') {
              bodyData = options.body;
            } else {
              bodyData = JSON.stringify(options.body);
            }
          }
          
          try {
            const response = await requestUrl({
              url: url.toString(),
              method: options.method || 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
              },
              body: bodyData,
              throw: false,
            });
            
            console.log('[DrawIoGeneratorAI] requestUrl status:', response.status);
            
            // 打印完整响应结构（用于调试 AI SDK 解析）
            const fullResponse = response.json;
            console.log('[DrawIoGeneratorAI] Full response structure:', JSON.stringify(fullResponse, null, 2).substring(0, 2000));
            
            // 检查是否有 tool_calls（DashScope/OpenAI 格式）
            if (fullResponse?.choices?.[0]?.message?.tool_calls) {
              const toolCalls = fullResponse.choices[0].message.tool_calls;
              console.log('[DrawIoGeneratorAI] Raw tool_calls from DashScope:', JSON.stringify(toolCalls, null, 2));
              
              // 检查 function.arguments 格式
              for (const tc of toolCalls) {
                console.log('[DrawIoGeneratorAI] Tool call structure:', {
                  id: tc.id,
                  type: tc.type,
                  functionName: tc.function?.name,
                  functionArguments: tc.function?.arguments,
                  argumentsType: typeof tc.function?.arguments,
                });
              }
            }
            
            // Return a fetch-like Response object
            const headersObj = new Headers();
            if (response.headers) {
              for (const [key, value] of Object.entries(response.headers)) {
                headersObj.set(key, value);
              }
            }
            
            return {
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              statusText: response.status.toString(),
              headers: headersObj,
              json: async () => response.json,
              text: async () => response.text,
              arrayBuffer: async () => {
                const encoder = new TextEncoder();
                return encoder.encode(response.text).buffer;
              },
            } as Response;
          } catch (err) {
            console.error('[DrawIoGeneratorAI] requestUrl error:', err);
            throw err;
          }
        },
      });

      const model = openai.chat(this.modelId);
      const systemPrompt = this.getSystemPrompt();
      const xmlContext = this.getXmlContext();

      const result = await generateText({
        model,
        system: `${systemPrompt}\n\n${xmlContext}`,
        prompt,
        tools: {
          display_diagram: {
            description: `Display a diagram on draw.io.

IMPORTANT: You MUST provide the 'xml' parameter with complete mxCell elements.

Example call:
{
  "xml": "<mxCell id="2" value="Start" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>"
}

**DIAGRAM TYPE SELECTION** (choose based on content):
- **Flowchart**: Sequential processes with clear steps (审批流程、招聘流程)
- **Mindmap**: Hierarchical concepts, categories (组织架构、知识分类)
- **Fishbone**: Root cause analysis, problem-solving (问题分析、因果分析)
- **Swimlane**: Cross-functional processes with roles (跨部门协作)
- **Timeline**: Chronological events (项目进度、历史事件)
- **Org Chart**: Hierarchical structure (公司架构、团队结构)

**LAYOUT: Horizontal (landscape)** - NOT vertical!
- Width: 800px, Height: 600px
- Flow left-to-right, not top-to-bottom
- Place main elements horizontally

**LAYOUT RULES** (strict visual requirements):
1. Horizontal layout - all shapes centered horizontally and vertically
2. Equal margins: left/right ~40px, top/bottom ~40px
3. Equal spacing between all shapes (horizontal and vertical)
4. Fill canvas evenly - not loose, not exceeding boundaries
5. All elements horizontally aligned, vertical centerlines aligned
6. Connectors: straight lines, orthogonal corners (90°), no crossing, equal spacing
7. Connectors do NOT overlay on other elements

XML RULES:
1. Generate ONLY mxCell elements - NO wrapper tags (<mxfile>, <mxGraphModel>, <root>)
2. Do NOT include root cells (id="0" or id="1") - they are added automatically
3. Each mxCell needs a unique id (start from "2")
4. Each mxCell needs a valid parent attribute (use "1" for top-level)
5. Escape special chars: &lt; &gt; &amp; &quot;
6. NEVER use Chinese quotes (""''等) - use ASCII quotes only
7. **LAYER ORDER: Edges FIRST, Vertices LAST** - connector lines on BOTTOM layer

Notes:
- For AWS diagrams, use AWS 2025 icons
- For animated connectors, add "flowAnimation=1" to edge style
- Generate edge mxCells BEFORE vertex mxCells

DO NOT call this tool without providing the 'xml' parameter!`,

            // 使用 inputSchema（AI SDK v4+ 标准格式，与 next-ai-draw-io 一致）
            inputSchema: z.object({
              xml: z.string().describe('XML string containing mxCell elements. REQUIRED - must not be empty.'),
            }),
          },
        },
        maxRetries: 3,
      });

      console.log('[DrawIoGeneratorAI] Result object:', {
        hasToolCalls: !!result.toolCalls,
        toolCallsCount: result.toolCalls?.length || 0,
        hasText: !!result.text,
        textLength: result.text?.length || 0,
      });

      // Check if tool was called
      const toolCalls = result.toolCalls;
      console.log('[DrawIoGeneratorAI] ToolCalls raw:', JSON.stringify(toolCalls, null, 2));
      
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          console.log('[DrawIoGeneratorAI] ToolCall full structure:', toolCall);
          console.log('[DrawIoGeneratorAI] ToolCall keys:', Object.keys(toolCall));
          console.log('[DrawIoGeneratorAI] toolCall.toolName:', toolCall.toolName);
          console.log('[DrawIoGeneratorAI] toolCall.args:', toolCall.args);
          console.log('[DrawIoGeneratorAI] toolCall.args type:', typeof toolCall.args);
          
          if (toolCall.toolName === 'display_diagram') {
            // 尝试多种方式获取 args（兼容不同平台格式）
            let xml: string | undefined;
            
            console.log('[DrawIoGeneratorAI] Trying to extract XML from toolCall...');
            console.log('[DrawIoGeneratorAI] toolCall.input:', JSON.stringify(toolCall.input));
            
            // 方式1: AI SDK 标准格式 toolCall.input (已解析的对象)
            if (toolCall.input && typeof toolCall.input === 'object' && 'xml' in toolCall.input) {
              console.log('[DrawIoGeneratorAI] Found xml in toolCall.input');
              xml = toolCall.input.xml;
            }
            
            // 方式2: 检查 input 是否为空对象（模型未填充 arguments）
            if (!xml && toolCall.input && typeof toolCall.input === 'object') {
              const inputKeys = Object.keys(toolCall.input);
              if (inputKeys.length === 0) {
                console.log('[DrawIoGeneratorAI] toolCall.input is empty object {} - model did not fill arguments');
              }
            }
            
            // 方式3: DashScope/OpenAI 格式 toolCall.function.arguments (JSON string)
            if (!xml && (toolCall as any).function && (toolCall as any).function.arguments) {
              console.log('[DrawIoGeneratorAI] Found in toolCall.function.arguments (string)');
              try {
                const parsed = JSON.parse((toolCall as any).function.arguments);
                xml = parsed.xml;
                console.log('[DrawIoGeneratorAI] Parsed arguments, xml length:', xml?.length);
              } catch (e) {
                console.log('[DrawIoGeneratorAI] Failed to parse function.arguments:', e);
              }
            }
            
            // 方式4: 有些平台用 args 而不是 input
            if (!xml && toolCall.args && toolCall.args.xml) {
              console.log('[DrawIoGeneratorAI] Found in toolCall.args.xml');
              xml = toolCall.args.xml;
            }
            
            // 方式5: 顶层 arguments 字符串
            if (!xml && (toolCall as any).arguments) {
              console.log('[DrawIoGeneratorAI] Found in toolCall.arguments (string)');
              try {
                const parsed = JSON.parse((toolCall as any).arguments);
                xml = parsed.xml;
              } catch (e) {
                console.log('[DrawIoGeneratorAI] Failed to parse arguments:', e);
              }
            }
            
            if (!xml) {
              console.log('[DrawIoGeneratorAI] Could not extract XML from toolCall');
              console.log('[DrawIoGeneratorAI] This may mean the model called the tool but did not fill the xml parameter');
              continue;
            }
            
            console.log('[DrawIoGeneratorAI] Got XML from display_diagram, length:', xml.length);
            
            // Update state
            this.state.previousXml = this.state.currentXml;
            this.state.currentXml = this.wrapInMxGraphModel(xml);
            
            return {
              success: true,
              xml: this.state.currentXml,
            };
          }
        }
      }

      // Fallback: Extract XML from text response (for models that don't support tools)
      const text = result.text;
      console.log('[DrawIoGeneratorAI] No tool called, trying to extract from text...');
      console.log('[DrawIoGeneratorAI] Response text length:', text?.length || 0);
      
      if (text) {
        const extractedXml = this.extractXmlFromText(text);
        if (extractedXml) {
          console.log('[DrawIoGeneratorAI] Extracted XML from text, length:', extractedXml.length);
          this.state.previousXml = this.state.currentXml;
          this.state.currentXml = extractedXml;
          return { success: true, xml: extractedXml };
        }
      }

      return {
        success: false,
        xml: null,
        error: 'No diagram generated. LLM response: ' + (text?.substring(0, 100) || 'empty'),
      };

    } catch (error) {
      console.error('[DrawIoGeneratorAI] Generation failed:', error);
      return {
        success: false,
        xml: null,
        error: `Failed to generate: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Edit existing diagram
   */
  async edit(prompt: string): Promise<DrawIoGenerationResult> {
    try {
      console.log('[DrawIoGeneratorAI] Starting edit...');
      
      if (!this.state.currentXml) {
        return { success: false, xml: null, error: 'No current diagram to edit' };
      }

      const openai = createOpenAI({
        baseURL: this.baseUrl,
        apiKey: this.apiKey,
        fetch: async (url: string | URL, options: any) => {
          console.log('[DrawIoGeneratorAI] edit fetch called:', url.toString().substring(0, 50));
          
          let bodyData: string | undefined = undefined;
          if (options.body) {
            if (typeof options.body === 'string') {
              bodyData = options.body;
            } else {
              bodyData = JSON.stringify(options.body);
            }
          }
          
          try {
            const response = await requestUrl({
              url: url.toString(),
              method: options.method || 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
              },
              body: bodyData,
              throw: false,
            });
            
            const headersObj = new Headers();
            if (response.headers) {
              for (const [key, value] of Object.entries(response.headers)) {
                headersObj.set(key, value);
              }
            }
            
            return {
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              statusText: response.status.toString(),
              headers: headersObj,
              json: async () => response.json,
              text: async () => response.text,
            } as Response;
          } catch (err) {
            console.error('[DrawIoGeneratorAI] edit requestUrl error:', err);
            throw err;
          }
        },
      });

      const model = openai.chat(this.modelId);
      const systemPrompt = this.getSystemPrompt();
      const xmlContext = this.getXmlContext();

      const result = await generateText({
        model,
        system: `${systemPrompt}\n\n${xmlContext}`,
        prompt,
        tools: {
          edit_diagram: {
            description: `Edit the current diagram by ID-based operations.

Operations:
- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.
- add: Add a new cell. Provide cell_id (new unique id) and new_xml.
- delete: Remove a cell. Cascade is automatic: children AND edges are auto-deleted.

For update/add, new_xml must be a complete mxCell element including mxGeometry.

⚠️ JSON ESCAPING: Every " inside new_xml MUST be escaped as \\". Example: id=\\"5\\" value=\\"Label\\"`,
            inputSchema: z.object({
              operations: z.array(z.object({
                operation: z.enum(['update', 'add', 'delete']),
                cell_id: z.string(),
                new_xml: z.string().optional(),
              })).describe('Array of operations to apply'),
            }),
          },
        },
      });

      const toolCalls = result.toolCalls;
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (toolCall.toolName === 'edit_diagram') {
            const operations = toolCall.args.operations as DrawIoEditOperation[];
            console.log('[DrawIoGeneratorAI] Got edit operations:', operations.length);
            
            const editedXml = this.applyEditOperations(this.state.currentXml, operations);
            this.state.previousXml = this.state.currentXml;
            this.state.currentXml = editedXml;
            
            return { success: true, xml: editedXml };
          }
        }
      }

      return { success: false, xml: null, error: 'No edit operations generated' };

    } catch (error) {
      console.error('[DrawIoGeneratorAI] Edit failed:', error);
      return {
        success: false,
        xml: null,
        error: `Failed to edit: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get shape library documentation
   */
  getShapeLibrary(library: string): string {
    const libraryPath = path.join(
      path.dirname(__dirname),
      'docs/shape-libraries',
      `${library}.md`
    );
    
    try {
      return fs.readFileSync(libraryPath, 'utf-8');
    } catch {
      return `Library "${library}" not found. Available: aws4, azure2, gcp2, kubernetes, flowchart, bpmn, basic, arrows2`;
    }
  }

  /**
   * Get system prompt
   */
  private getSystemPrompt(): string {
    return `You are an expert diagram creation assistant specializing in draw.io XML generation.
Your primary function is crafting clear, well-organized visual diagrams through precise XML specifications.

ALWAYS respond in the same language as the user's last message.

When asked to create a diagram, use the display_diagram tool to generate XML.

If you cannot use tools, respond with XML directly in this format:
<mxCell id="2" value="Start" style="..." vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>

Core capabilities:
- Generate valid, well-formed XML strings for draw.io diagrams
- Create professional flowcharts, mind maps, entity diagrams, and technical illustrations
- Convert user descriptions into visually appealing diagrams
- Apply proper spacing, alignment and visual hierarchy
- Optimize element positioning to prevent overlapping

IMPORTANT XML RULES:
- Focus on producing clean, professional diagrams
- NEVER include XML comments <!-- ... -->
- Each mxCell must have: id, style, vertex OR edge, parent, and mxGeometry
- Position elements within viewport: x: 0-800, y: 0-600
- NEVER use Chinese/Unicode quotes in value attributes (no ""'' etc.) - use standard ASCII quotes only
- Avoid putting quotes inside Chinese text values to prevent XML parsing errors`;
  }

  /**
   * Get XML context (current + previous)
   */
  private getXmlContext(): string {
    const previousContext = this.state.previousXml
      ? `Previous diagram XML (before user's last message):
"""xml
${this.state.previousXml}
"""

`
      : '';

    const currentContext = this.state.currentXml
      ? `Current diagram XML (AUTHORITATIVE - the source of truth):
"""xml
${this.state.currentXml}
"""

IMPORTANT: The "Current diagram XML" is the SINGLE SOURCE OF TRUTH. Always count and describe elements based on the CURRENT XML, not on what you previously generated.`
      : '';

    return previousContext + currentContext;
  }

  /**
   * Wrap XML in mxGraphModel
   */
  private wrapInMxGraphModel(xml: string): string {
    if (xml.includes('<mxGraphModel>')) {
      return xml;
    }
    
    // Clean problematic characters from LLM-generated XML
    // Replace Chinese full-width quotes with standard quotes
    xml = xml.replace(/[“”]/g, '"'); // " and " -> "
    xml = xml.replace(/[‘’]/g, "'"); // ' and ' -> '
    
    return `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="800" pageHeight="600" math="0" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
${xml}
  </root>
</mxGraphModel>`;
  }

  /**
   * Apply edit operations to XML
   */
  private applyEditOperations(xml: string, operations: DrawIoEditOperation[]): string {
    let result = xml;

    for (const op of operations) {
      if (op.operation === 'delete') {
        // Delete cell and its children/edges
        result = this.deleteCell(result, op.cell_id);
      } else if (op.operation === 'update' && op.new_xml) {
        // Replace existing cell
        result = this.updateCell(result, op.cell_id, op.new_xml);
      } else if (op.operation === 'add' && op.new_xml) {
        // Add new cell
        result = this.addCell(result, op.new_xml);
      }
    }

    return result;
  }

  /**
   * Delete a cell by ID
   */
  private deleteCell(xml: string, cellId: string): string {
    // Simple regex-based deletion
    // Delete the cell itself
    const cellPattern = new RegExp(
      `<mxCell[^>]*id="${cellId}"[^>]*>.*?</mxCell>|<mxCell[^>]*id="${cellId}"[^>]*/>`,
      'gs'
    );
    let result = xml.replace(cellPattern, '');

    // Delete children (cells with parent="${cellId}")
    const childPattern = new RegExp(
      `<mxCell[^>]*parent="${cellId}"[^>]*>.*?</mxCell>|<mxCell[^>]*parent="${cellId}"[^>]*/>`,
      'gs'
    );
    result = result.replace(childPattern, '');

    // Delete edges (source or target = ${cellId})
    const edgePattern = new RegExp(
      `<mxCell[^>]*source="${cellId}"[^>]*>.*?</mxCell>|<mxCell[^>]*source="${cellId}"[^>]*/>|<mxCell[^>]*target="${cellId}"[^>]*>.*?</mxCell>|<mxCell[^>]*target="${cellId}"[^>]*/>`,
      'gs'
    );
    result = result.replace(edgePattern, '');

    return result;
  }

  /**
   * Update a cell by ID
   */
  private updateCell(xml: string, cellId: string, newXml: string): string {
    const cellPattern = new RegExp(
      `<mxCell[^>]*id="${cellId}"[^>]*>.*?</mxCell>|<mxCell[^>]*id="${cellId}"[^>]*/>`,
      'gs'
    );
    return xml.replace(cellPattern, newXml);
  }

  /**
   * Add a new cell
   */
  private addCell(xml: string, newXml: string): string {
    // Insert before </root>
    const insertPos = xml.indexOf('</root>');
    if (insertPos > 0) {
      return xml.slice(0, insertPos) + newXml + '\n' + xml.slice(insertPos);
    }
    return xml;
  }

  /**
   * Extract XML from text response
   */
  private extractXmlFromText(text: string): string | null {
    // Try to find mxCell elements
    const mxCellPattern = /<mxCell[^>]*>(.*?)<\/mxCell>|<mxCell[^>]*\/>/gs;
    const matches = text.match(mxCellPattern);
    if (matches && matches.length > 0) {
      return this.wrapInMxGraphModel(matches.join('\n'));
    }
    return null;
  }
}