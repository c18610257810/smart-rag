import { requestUrl } from 'obsidian';

/**
 * Excalidraw Generator Service
 * Generates Excalidraw JSON from LLM based on content
 */

export type ChartType = 'mindmap' | 'flowchart' | 'concept-map' | 'architecture' | 'auto';

export interface ExcalidrawElement {
  type: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  id: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  angle?: number;
  x: number;
  y: number;
  strokeColor?: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
  seed?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  points?: number[][];
  startBinding?: string;
  endBinding?: string;
  startArrowhead?: string;
  endArrowhead?: string;
  roundness?: any;
  groupId?: string;
}

export interface ExcalidrawClipboard {
  type: 'excalidraw/clipboard';
  elements: ExcalidrawElement[];
}

export interface ExcalidrawGenerationResult {
  chartType: ChartType;
  textSummary: string;
  excalidrawJson: ExcalidrawClipboard | null;
}

export class ExcalidrawGenerator {
  /**
   * Generate Excalidraw JSON from LLM
   */
  async generate(
    baseUrl: string,
    apiKey: string,
    modelName: string,
    queryResults: string,
    userPrompt: string,
    chartTypeHint?: ChartType
  ): Promise<ExcalidrawGenerationResult> {
    // Build prompt
    const systemPrompt = this.buildSystemPrompt(chartTypeHint);
    const userMessage = this.buildUserMessage(queryResults, userPrompt, chartTypeHint);

    // Normalize URL
    let normalizedUrl = baseUrl.replace(/\/+$/, '');
    if (!normalizedUrl.endsWith('/v1')) {
      normalizedUrl += '/v1';
    }

    try {
      const response = await requestUrl({
        url: `${normalizedUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 4000
        })
      });

      if (response.status !== 200) {
        throw new Error(`API returned ${response.status}: ${response.text}`);
      }

      const content = response.json.choices?.[0]?.message?.content || '';
      return this.parseLLMResponse(content);

    } catch (error) {
      console.error('Excalidraw generation failed:', error);
      return {
        chartType: 'auto',
        textSummary: '',
        excalidrawJson: null
      };
    }
  }

  /**
   * Build system prompt
   */
  private buildSystemPrompt(chartTypeHint?: ChartType): string {
    const chartTypeGuidance = chartTypeHint && chartTypeHint !== 'auto'
      ? `The user has requested a ${chartTypeHint} chart type.`
      : `Analyze the content and choose the most appropriate chart type.`;

    return `You are a professional knowledge visualization assistant. You generate visual diagrams from text content.

${chartTypeGuidance}

## Chart Types
- **mindmap**: For hierarchical concepts with a central topic and branches
- **flowchart**: For sequential processes, steps, or workflows
- **concept-map**: For interconnected concepts with relationships
- **architecture**: For system components and their connections

## Output Format
You MUST respond with valid JSON in this exact format:
\`\`\`json
{
  "chart_type": "mindmap|flowchart|concept-map|architecture",
  "text_summary": "Brief text summary of the content",
  "excalidraw_json": {
    "type": "excalidraw/clipboard",
    "elements": [
      {
        "type": "rectangle",
        "version": 1,
        "versionNonce": 1,
        "isDeleted": false,
        "id": "unique-id",
        "fillStyle": "hachure",
        "strokeWidth": 1,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "angle": 0,
        "x": 100,
        "y": 100,
        "strokeColor": "#000000",
        "backgroundColor": "transparent",
        "width": 200,
        "height": 100,
        "seed": 1
      },
      {
        "type": "text",
        "version": 1,
        "versionNonce": 1,
        "isDeleted": false,
        "id": "unique-text-id",
        "fillStyle": "hachure",
        "strokeWidth": 1,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "angle": 0,
        "x": 120,
        "y": 130,
        "strokeColor": "#000000",
        "backgroundColor": "transparent",
        "width": 160,
        "height": 40,
        "seed": 1,
        "text": "Concept Name",
        "fontSize": 16,
        "fontFamily": 1,
        "textAlign": "center",
        "verticalAlign": "middle"
      },
      {
        "type": "arrow",
        "version": 1,
        "versionNonce": 1,
        "isDeleted": false,
        "id": "unique-arrow-id",
        "fillStyle": "hachure",
        "strokeWidth": 1,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "angle": 0,
        "x": 300,
        "y": 150,
        "strokeColor": "#000000",
        "backgroundColor": "transparent",
        "width": 100,
        "height": 0,
        "seed": 1,
        "points": [[0, 0], [100, 0]],
        "startArrowhead": null,
        "endArrowhead": "arrow"
      }
    ]
  }
}
\`\`\`

## Guidelines
1. Create 3-10 nodes maximum for clarity
2. Use arrows to show relationships
3. Position elements with proper spacing (100-200px between elements)
4. Use consistent font sizes (16-20px for text, 24-28px for titles)
5. Keep the layout organized and readable
6. Generate unique IDs for each element`;
  }

  /**
   * Build user message
   */
  private buildUserMessage(queryResults: string, userPrompt: string, chartTypeHint?: ChartType): string {
    return `Based on the following content, create a visual diagram.

## Content
${queryResults}

## User Request
${userPrompt}

Generate the diagram now. Remember to respond ONLY with valid JSON.`;
  }

  /**
   * Parse LLM response
   */
  private parseLLMResponse(content: string): ExcalidrawGenerationResult {
    try {
      // Try to extract JSON from markdown code block (greedy match)
      const jsonMatch = content.match(/```json\s*([\s\S]*)\s*```/);
      let jsonStr = jsonMatch ? jsonMatch[1].trim() : content;
      // Also try to find any JSON object if no code block
      if (!jsonMatch) {
        const jsonObjMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          jsonStr = jsonObjMatch[0];
        }
      }
      // 去除可能残留的代码块标记
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      
      const parsed = JSON.parse(jsonStr);
      
      return {
        chartType: parsed.chart_type || 'auto',
        textSummary: parsed.text_summary || '',
        excalidrawJson: parsed.excalidraw_json || null
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return {
        chartType: 'auto',
        textSummary: content,
        excalidrawJson: null
      };
    }
  }

  /**
   * Detect chart type from user prompt
   */
  static detectChartType(prompt: string): ChartType {
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('思维导图') || promptLower.includes('脑图') || promptLower.includes('mindmap')) {
      return 'mindmap';
    }
    if (promptLower.includes('流程') || promptLower.includes('步骤') || promptLower.includes('flowchart')) {
      return 'flowchart';
    }
    if (promptLower.includes('关系') || promptLower.includes('概念') || promptLower.includes('concept')) {
      return 'concept-map';
    }
    if (promptLower.includes('架构') || promptLower.includes('系统') || promptLower.includes('architecture')) {
      return 'architecture';
    }
    
    return 'auto';
  }
}