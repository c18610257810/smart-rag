import { requestUrl } from 'obsidian';

/**
 * Excalidraw Generator Service
 * Generates Excalidraw JSON from LLM based on content
 */

export type ChartType = 'mindmap' | 'flowchart' | 'architecture' | 'dfd' | 'swimlane' | 'class' | 'sequence' | 'er' | 'relationship' | 'auto';

export interface ExcalidrawElement {
  type: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  id: string;
  index?: string;
  frameId?: string | null;
  boundElements?: any;
  updated?: number;
  link?: string | null;
  locked?: boolean;
  groupIds?: string[];
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
  startBinding?: any;
  endBinding?: any;
  startArrowhead?: string | null;
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
          temperature: 0.3,
          max_tokens: 3000
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
   * Build system prompt - unified format for all chart types
   */
  private buildSystemPrompt(chartTypeHint?: ChartType): string {
    return `You are an intelligent diagram generator. Analyze the content and create the BEST diagram type automatically.

## CHART TYPE SELECTION RULES

Analyze content structure and choose:

1. **flowchart** - when content has:
   - Sequential steps (step 1 → step 2 → step 3)
   - Process descriptions with order
   - Decision points (if/then/else, yes/no branches)
   - Parallel paths that converge

2. **mindmap** - when content has:
   - Central topic with subtopics
   - Hierarchical knowledge structure
   - Category → items relationships
   - Topic expansion without strict order

3. **architecture** - when content has:
   - System components (modules, services, layers)
   - Technical dependencies
   - Data flow between systems
   - Infrastructure or software architecture

## OUTPUT FORMAT (IMPORTANT!)

Return ONLY a JSON object. NO markdown, NO explanation, NO code blocks.

### FLOWCHART FORMAT (with branches)
{
  "type": "flowchart",
  "summary": "Brief description",
  "nodes": [
    {"id": "start", "text": "开始", "nodeType": "start"},
    {"id": "step1", "text": "步骤1", "parent": "start"},
    {"id": "decision", "text": "是否审批?", "parent": "step1", "nodeType": "decision", "branches": {"yes": "approve", "no": "reject"}},
    {"id": "approve", "text": "审批通过", "parent": "decision", "branch": "yes"},
    {"id": "reject", "text": "审批拒绝", "parent": "decision", "branch": "no"},
    {"id": "merge", "text": "结束", "merge": ["approve", "reject"], "nodeType": "end"}
  ]
}

### MINDMAP FORMAT (center expansion)
{
  "type": "mindmap",
  "summary": "Brief description",
  "nodes": [
    {"id": "center", "text": "核心主题", "nodeType": "center"},
    {"id": "branch1", "text": "子主题1", "parent": "center"},
    {"id": "sub1a", "text": "细节1a", "parent": "branch1"},
    {"id": "sub1b", "text": "细节1b", "parent": "branch1"},
    {"id": "branch2", "text": "子主题2", "parent": "center"},
    {"id": "sub2a", "text": "细节2a", "parent": "branch2"}
  ]
}

### ARCHITECTURE FORMAT (layers)
{
  "type": "architecture",
  "summary": "Brief description",
  "nodes": [
    {"id": "frontend", "text": "前端", "layer": "top"},
    {"id": "api", "text": "API层", "layer": "middle", "parent": "frontend"},
    {"id": "backend", "text": "后端", "layer": "middle", "parent": "api"},
    {"id": "database", "text": "数据库", "layer": "bottom", "parent": "backend"},
    {"id": "cache", "text": "缓存", "layer": "bottom", "parent": "backend"}
  ]
}

## KEY RULES

1. **NO coordinates (x, y)** - I will calculate positions automatically
2. **NO markdown blocks** - Return plain JSON only
3. **5-15 nodes** - Keep diagrams readable
4. **Use nodeType**: start | decision | end | center (optional but helpful)
5. **Use branches for flowchart**: {"yes": "nodeId", "no": "nodeId"}
6. **Use merge for convergence**: {"merge": ["nodeId1", "nodeId2"]}
7. **Use layer for architecture**: top | middle | bottom

## EXAMPLE: Flowchart with parallel branches

Content: "员工入职流程：HR启动 → 信息采集 → 审批（经理审批或HR审批）→ 合同签署 → 入职完成"

Output:
{"type":"flowchart","summary":"员工入职流程","nodes":[{"id":"start","text":"HR启动","nodeType":"start"},{"id":"collect","text":"信息采集","parent":"start"},{"id":"decision","text":"审批","parent":"collect","nodeType":"decision","branches":{"branch1":"manager","branch2":"hr"}},{"id":"manager","text":"经理审批","parent":"decision","branch":"branch1"},{"id":"hr","text":"HR审批","parent":"decision","branch":"branch2"},{"id":"contract","text":"合同签署","merge":["manager","hr"]},{"id":"end","text":"入职完成","parent":"contract","nodeType":"end"}]}}`;
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
   * Parse LLM response - supports simplified format
   */
  private parseLLMResponse(content: string): ExcalidrawGenerationResult {
    console.log('[Diagram Parser] Raw content:', content.substring(0, 500))
    
    // Try to find any JSON object in the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Diagram Parser] No JSON found')
      return this.createMinimalDiagram('No diagram data received');
    }

    try {
      const data = JSON.parse(jsonMatch[0]);
      console.log('[Diagram Parser] Parsed JSON:', data)
      
      // Check if it's simplified format (nodes array)
      if (data.nodes && Array.isArray(data.nodes)) {
        return this.convertSimpleFormat(data);
      }
      
      // Check if it's full Excalidraw format
      if (data.excalidraw_json && data.excalidraw_json.elements) {
        return {
          chartType: data.chart_type || 'mindmap',
          textSummary: data.text_summary || '',
          excalidrawJson: data.excalidraw_json
        };
      }
      
      // Fallback
      return this.createMinimalDiagram(data.summary || 'Diagram');
    } catch (e) {
      return this.createMinimalDiagram('Invalid JSON');
    }
  }

  /**
   * Convert simplified format to Excalidraw JSON
   * Supports: flowchart (with branches), mindmap (center expansion), architecture (layers)
   */
  private convertSimpleFormat(data: any): ExcalidrawGenerationResult {
    const elements: any[] = []; const chartType = data.type || 'mindmap';
    const nodes = data.nodes || []; // Auto layout based on chart type
    const positions = this.calculateLayout(chartType, nodes); for (const node of nodes) {
      const pos = positions[node.id] || { x: 100, y: 100 }; const nodeType = node.nodeType || 'normal'; // Create box with color based on nodeType
      const boxStyle = this.getNodeStyle(chartType, nodeType, node.branch); elements.push({ type: 'rectangle', version: 1, versionNonce: this.generateId(), isDeleted: false, id: `box-${node.id}`, fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 0, opacity: 100, angle: 0, x: pos.x, y: pos.y, strokeColor: boxStyle.strokeColor, backgroundColor: boxStyle.backgroundColor, width: boxStyle.width, height: boxStyle.height, seed: this.generateId() }); // Create text
      const textX = pos.x + 10; const textY = pos.y + (boxStyle.height / 2) - 10; elements.push({ type: 'text', version: 1, versionNonce: this.generateId(), isDeleted: false, id: `text-${node.id}`, fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100, angle: 0, x: textX, y: textY, strokeColor: '#000000', backgroundColor: 'transparent', width: boxStyle.width - 20, height: 20, seed: this.generateId(), text: node.text || '', fontSize: boxStyle.fontSize, fontFamily: 5, textAlign: 'center', verticalAlign: 'middle' }); // Create connections
      if (node.parent) { const parentPos = positions[node.parent]; if (parentPos) { const arrow = this.createArrow(parentPos, pos, node.branch, chartType); elements.push(arrow); } } // Handle merge nodes (flowchart)
      if (node.merge && Array.isArray(node.merge)) { for (const mergeFromId of node.merge) { const mergeFromPos = positions[mergeFromId]; if (mergeFromPos) { const arrow = this.createArrow(mergeFromPos, pos, 'merge', chartType); elements.push(arrow); } } } } return { chartType, textSummary: data.summary || '', excalidrawJson: { type: 'excalidraw/clipboard', elements: elements } }; }
  /**
   * Calculate layout positions for different chart types
   */
  private calculateLayout(chartType: string, nodes: any[]): Record<string, { x: number, y: number }> {
    const positions: Record<string, { x: number, y: number }> = {}; if (chartType === 'flowchart') { // Flowchart: vertical flow with branches
      this.layoutFlowchart(nodes, positions); } else if (chartType === 'mindmap') { // Mindmap: center expansion
      this.layoutMindmap(nodes, positions); } else if (chartType === 'architecture') { // Architecture: layered
      this.layoutArchitecture(nodes, positions); } else { // Default: simple vertical
      this.layoutSimpleVertical(nodes, positions); } return positions; }
  /**
   * Flowchart layout - supports branches and merge
   */
  private layoutFlowchart(nodes: any[], positions: Record<string, { x: number, y: number }>) {
    const centerX = 400; const startY = 50; const stepY = 100; const branchOffsetX = 200; // Find decision nodes and branches
    let y = startY; const branchPositions: Record<string, { leftX: number, rightX: number }> = {}; for (const node of nodes) { if (node.nodeType === 'start') { positions[node.id] = { x: centerX, y: y }; y += stepY; } else if (node.nodeType === 'decision') { positions[node.id] = { x: centerX, y: y }; // Calculate branch positions
      if (node.branches) { const branchKeys = Object.keys(node.branches); const branchCount = branchKeys.length; if (branchCount === 2) { branchPositions[node.id] = { leftX: centerX - branchOffsetX, rightX: centerX + branchOffsetX }; } else if (branchCount > 2) { const offset = branchOffsetX * 1.5; branchPositions[node.id] = { leftX: centerX - offset, rightX: centerX + offset }; } } y += stepY * 1.5; } else if (node.branch) { // Branch node - position based on parent decision
      const parentNode = nodes.find(n => n.branches && Object.values(n.branches).includes(node.id)); if (parentNode && branchPositions[parentNode.id]) { const bp = branchPositions[parentNode.id]; const isLeft = node.branch.includes('1') || node.branch.includes('yes') || node.branch.includes('left'); positions[node.id] = { x: isLeft ? bp.leftX : bp.rightX, y: y }; } else { positions[node.id] = { x: centerX, y: y }; } y += stepY; } else if (node.merge) { // Merge node - center position
      positions[node.id] = { x: centerX, y: y }; y += stepY; } else if (node.nodeType === 'end') { positions[node.id] = { x: centerX, y: y }; y += stepY; } else { // Normal node - center position
      positions[node.id] = { x: centerX, y: y }; y += stepY; } } }
  /**
   * Mindmap layout - center expansion
   */
  private layoutMindmap(nodes: any[], positions: Record<string, { x: number, y: number }>) {
    const centerX = 400; const centerY = 300; const branchRadius = 150; const subBranchRadius = 80; // Find center node
    const centerNode = nodes.find(n => n.nodeType === 'center' || !n.parent); if (centerNode) { positions[centerNode.id] = { x: centerX, y: centerY }; } // Find direct branches (children of center)
    const branches = nodes.filter(n => n.parent === centerNode?.id); const branchCount = branches.length; const angleStep = (2 * Math.PI) / Math.max(branchCount, 1); // Position branches around center
    branches.forEach((branch, i) => { const angle = i * angleStep - Math.PI / 2; // Start from top
      const x = centerX + branchRadius * Math.cos(angle); const y = centerY + branchRadius * Math.sin(angle); positions[branch.id] = { x, y }; // Find sub-branches (children of this branch)
      const subBranches = nodes.filter(n => n.parent === branch.id); const subCount = subBranches.length; const subAngleStep = Math.PI / Math.max(subCount + 1, 2); // Fan out from branch
      subBranches.forEach((sub, j) => { const subAngle = angle + (j + 1) * subAngleStep - (subAngleStep * (subCount + 1) / 2); const subX = x + subBranchRadius * Math.cos(subAngle); const subY = y + subBranchRadius * Math.sin(subAngle); positions[sub.id] = { x: subX, y: subY }; }); }); // Handle remaining nodes
    for (const node of nodes) { if (!positions[node.id]) { if (node.parent && positions[node.parent]) { const parentPos = positions[node.parent]; positions[node.id] = { x: parentPos.x + 50, y: parentPos.y + 80 }; } else { positions[node.id] = { x: centerX, y: centerY + 200 }; } } } }
  /**
   * Architecture layout - layered structure
   */
  private layoutArchitecture(nodes: any[], positions: Record<string, { x: number, y: number }>) {
    const centerX = 400; const startY = 50; const layerHeight = 150; const componentGapX = 200; // Group nodes by layer
    const layers: Record<string, any[]> = { top: [], middle: [], bottom: [] }; for (const node of nodes) { const layer = node.layer || 'middle'; layers[layer].push(node); } // Position each layer
    let y = startY; ['top', 'middle', 'bottom'].forEach(layerName => { const layerNodes = layers[layerName]; if (layerNodes.length === 0) return; // Center single node, spread multiple
      const count = layerNodes.length; const totalWidth = count > 1 ? (count - 1) * componentGapX : 0; const startX = centerX - totalWidth / 2; layerNodes.forEach((node, i) => { positions[node.id] = { x: startX + i * componentGapX, y: y }; }); y += layerHeight; }); }
  /**
   * Simple vertical layout (fallback)
   */
  private layoutSimpleVertical(nodes: any[], positions: Record<string, { x: number, y: number }>) {
    const centerX = 400; const startY = 50; const stepY = 100; nodes.forEach((node, i) => { positions[node.id] = { x: centerX, y: startY + i * stepY }; }); }
  /**
   * Get node style based on type and chart type
   */
  private getNodeStyle(chartType: string, nodeType: string, branch?: string): { strokeColor: string; backgroundColor: string; width: number; height: number; fontSize: number } {
    if (chartType === 'flowchart') { if (nodeType === 'start') { return { strokeColor: '#16a34a', backgroundColor: '#dcfce7', width: 120, height: 50, fontSize: 16 }; } if (nodeType === 'end') { return { strokeColor: '#dc2626', backgroundColor: '#fee2e2', width: 120, height: 50, fontSize: 16 }; } if (nodeType === 'decision') { return { strokeColor: '#ea580c', backgroundColor: '#ffedd5', width: 160, height: 60, fontSize: 14 }; } if (branch) { return { strokeColor: '#2563eb', backgroundColor: '#dbeafe', width: 130, height: 55, fontSize: 14 }; } return { strokeColor: '#1e88e5', backgroundColor: '#e3f2fd', width: 140, height: 60, fontSize: 14 }; } if (chartType === 'mindmap') { if (nodeType === 'center') { return { strokeColor: '#7c3aed', backgroundColor: '#ede9fe', width: 200, height: 80, fontSize: 20 }; } return { strokeColor: '#64748b', backgroundColor: '#f1f5f9', width: 120, height: 50, fontSize: 14 }; } if (chartType === 'architecture') { return { strokeColor: '#0891b2', backgroundColor: '#cffafe', width: 150, height: 60, fontSize: 14 }; } // Default
    return { strokeColor: '#1e88e5', backgroundColor: '#e3f2fd', width: 140, height: 60, fontSize: 14 }; }
  /**
   * Create arrow between two positions
   */
  private createArrow(
    fromPos: { x: number, y: number },
    toPos: { x: number, y: number },
    branch?: string,
    chartType?: string
  ): any {
    const boxWidth = 140;
    let startX = fromPos.x + boxWidth / 2;
    let startY = fromPos.y + 60;
    let endX = toPos.x + boxWidth / 2;
    let endY = toPos.y;

    const arrowColor = branch === 'merge' ? '#16a34a' : (branch ? '#2563eb' : '#64748b');
    const id = this.generateUniqueId();
    
    return {
      type: 'arrow',
      version: 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      id: `arrow-${id}`,
      index: `a${id}`,
      frameId: null,
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      angle: 0,
      x: startX,
      y: startY,
      strokeColor: arrowColor,
      backgroundColor: 'transparent',
      width: endX - startX,
      height: endY - startY,
      points: [[0, 0], [endX - startX, endY - startY]],
      roundness: { type: 2 },
      seed: Math.floor(Math.random() * 2147483647),
      groupIds: [],
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: 'arrow'
    };
  }
  /**
   * Generate unique ID
   */
  private generateId(): number { return Math.floor(Math.random() * 1000000); }

  /**
   * Create minimal diagram when all parsing fails
   * Updated to use skill-compliant schema with fontFamily: 5 (Excalifont)
   */
  private createMinimalDiagram(content: string): ExcalidrawGenerationResult {
    // Extract a title from the content, avoiding markdown code blocks
    let title = 'Diagram';
    // Remove markdown code blocks first
    const cleanContent = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
    const titleMatch = cleanContent.match(/([\u4e00-\u9fa5a-zA-Z0-9]{2,20})/);
    if (titleMatch) title = titleMatch[1].trim();
    
    // Use the skill-compliant helper method
    const elements: ExcalidrawElement[] = [];
    
    // Create main rectangle with title
    const box = this.createRectangle(300, 200, 200, 80, {
      text: title,
      backgroundColor: '#ffd43b', // Important yellow from skill
      strokeColor: '#1e1e1e',
      fontSize: 20
    });
    elements.push(box);
    
    // Create title text separately
    const textEl = this.createText(350, 230, title, {
      fontSize: 24,
      textAlign: 'center',
      verticalAlign: 'middle',
      strokeColor: '#1e1e1e'
    });
    elements.push(textEl);
    
    return {
      chartType: 'mindmap',
      textSummary: title,
      excalidrawJson: {
        type: 'excalidraw/clipboard',
        elements
      }
    };
  }

  /**
   * Try to parse JSON from content
   */
  private tryParseJson(content: string): ExcalidrawGenerationResult | null {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*)\s*```/);
      let jsonStr = jsonMatch ? jsonMatch[1].trim() : content;
      
      if (!jsonMatch) {
        const jsonObjMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) jsonStr = jsonObjMatch[0];
      }
      
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonStr);
      
      return {
        chartType: parsed.chart_type || 'auto',
        textSummary: parsed.text_summary || '',
        excalidrawJson: parsed.excalidraw_json || null
      };
    } catch {
      return null;
    }
  }

  /**
   * Try to extract just the elements array if full JSON fails
   */
  private tryExtractElementsOnly(content: string): ExcalidrawGenerationResult | null {
    try {
      // Try to find elements array
      const elementsMatch = content.match(/"elements"\s*:\s*\[([\s\S]*)\]/);
      if (!elementsMatch) return null;
      
      // Try to fix common issues in elements array
      let elementsStr = elementsMatch[1];
      elementsStr = elementsStr.replace(/,\n\s*\]/g, ']').replace(/,\n\s*\}/g, '}');
      
      const elements = JSON.parse('[' + elementsStr + ']');
      
      if (!Array.isArray(elements) || elements.length === 0) return null;
      
      return {
        chartType: 'mindmap',
        textSummary: 'Diagram from content',
        excalidrawJson: {
          type: 'excalidraw/clipboard',
          elements: elements
        }
      };
    } catch {
      // Last resort: try to find any JSON array
      return this.tryFindAnyArray(content);
    }
  }

  /**
   * Last resort: find any valid JSON array
   */
  private tryFindAnyArray(content: string): ExcalidrawGenerationResult | null {
    try {
      const matches = content.match(/\[\s*\{[^{}]+\}\s*,\s*\{[^{}]+\}[\s\S]*\]/g);
      if (!matches) return null;
      for (const match of matches) {
        try {
          const arr = JSON.parse(match);
          if (Array.isArray(arr) && arr.length > 0) {
            return {
              chartType: 'mindmap',
              textSummary: 'Generated diagram',
              excalidrawJson: {
                type: 'excalidraw/clipboard',
                elements: arr
              }
            };
          }
        } catch { continue; }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fix common JSON errors in LLM output
   */
  private fixJsonErrors(jsonStr: string): string {
    try {
      // First try parsing directly
      JSON.parse(jsonStr);
      return jsonStr;
    } catch {
      // Fix common issues
      let fixed = jsonStr;
      
      // Fix: missing commas between array elements
      // Match patterns like: "id": "x" "id" -> "id": "x", "id"
      fixed = fixed.replace(/("[^"]+"):\s*(\{|\[|[^",\}]+)(?=\s*"[^"]+":)/g, '$1: $2,');
      
      // Fix: trailing commas in arrays/objects
      fixed = fixed.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
      
      // Fix: unquoted property names
      fixed = fixed.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*):/g, '"$1":');
      
      // Try parsing again after fixes
      try {
        JSON.parse(fixed);
        return fixed;
      } catch {
        // If still fails, return original and let the main parser handle it
        return jsonStr;
      }
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
      return 'relationship';
    }
    if (promptLower.includes('架构') || promptLower.includes('系统') || promptLower.includes('architecture')) {
      return 'architecture';
    }
    if (promptLower.includes('数据流') || promptLower.includes('dfd')) {
      return 'dfd';
    }
    if (promptLower.includes('泳道') || promptLower.includes('swimlane')) {
      return 'swimlane';
    }
    if (promptLower.includes('类图') || promptLower.includes('class')) {
      return 'class';
    }
    if (promptLower.includes('序列') || promptLower.includes('sequence')) {
      return 'sequence';
    }
    if (promptLower.includes('er') || promptLower.includes('数据库')) {
      return 'er';
    }
    
    return 'auto';
  }

  // ============================================
  // EXCALIDRAW SKILL-OPTIMIZED HELPER METHODS
  // Based on excalidraw-diagram-generator skill
  // ============================================

  /**
   * Create a complete Excalidraw rectangle element (following skill spec)
   * Key: fontFamily: 5 (Excalifont), all required fields
   */
  private createRectangle(x: number, y: number, width: number, height: number, options: {
    text?: string;
    backgroundColor?: string;
    strokeColor?: string;
    fontSize?: number;
    roundness?: number;
  }): ExcalidrawElement {
    const id = this.generateUniqueId();
    const seed = Math.floor(Math.random() * 2147483647);
    const text = options.text || '';
    const fontSize = options.fontSize || 16;
    
    return {
      id,
      type: 'rectangle',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: options.strokeColor || '#1e1e1e',
      backgroundColor: options.backgroundColor || '#a5d8ff',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: `r${id}`,
      roundness: { type: options.roundness || 3 },
      seed,
      version: 1,
      versionNonce: seed,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      // Text properties
      text,
      fontSize,
      fontFamily: 5, // Excalifont (required by skill)
      textAlign: 'center',
      verticalAlign: 'middle'
    };
  }

  /**
   * Create a complete Excalidraw ellipse element
   */
  private createEllipse(x: number, y: number, width: number, height: number, options: {
    text?: string;
    backgroundColor?: string;
    strokeColor?: string;
    fontSize?: number;
  }): ExcalidrawElement {
    const id = this.generateUniqueId();
    const seed = Math.floor(Math.random() * 2147483647);
    const text = options.text || '';
    const fontSize = options.fontSize || 16;
    
    return {
      id,
      type: 'ellipse',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: options.strokeColor || '#1e1e1e',
      backgroundColor: options.backgroundColor || '#d0f0c0',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: `e${id}`,
      roundness: null,
      seed,
      version: 1,
      versionNonce: seed,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text,
      fontSize,
      fontFamily: 5,
      textAlign: 'center',
      verticalAlign: 'middle'
    };
  }

  /**
   * Create a complete Excalidraw diamond (decision) element
   */
  private createDiamond(x: number, y: number, width: number, height: number, options: {
    text?: string;
    backgroundColor?: string;
    strokeColor?: string;
    fontSize?: number;
  }): ExcalidrawElement {
    const id = this.generateUniqueId();
    const seed = Math.floor(Math.random() * 2147483647);
    const text = options.text || '';
    const fontSize = options.fontSize || 14;
    
    return {
      id,
      type: 'diamond',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: options.strokeColor || '#ea580c',
      backgroundColor: options.backgroundColor || '#ffe4a3',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: `d${id}`,
      roundness: null,
      seed,
      version: 1,
      versionNonce: seed,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text,
      fontSize,
      fontFamily: 5,
      textAlign: 'center',
      verticalAlign: 'middle'
    };
  }

  /**
   * Create a complete Excalidraw arrow element
   */
  private createExcalidrawArrow(
    startX: number, startY: number,
    endX: number, endY: number,
    options?: {
      strokeColor?: string;
      strokeStyle?: string;
      strokeWidth?: number;
      label?: string;
    }
  ): ExcalidrawElement {
    const id = this.generateUniqueId();
    const seed = Math.floor(Math.random() * 2147483647);
    const width = endX - startX;
    const height = endY - startY;
    
    return {
      id,
      type: 'arrow',
      x: startX,
      y: startY,
      width: Math.abs(width),
      height: Math.abs(height),
      angle: 0,
      strokeColor: options?.strokeColor || '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: options?.strokeWidth || 2,
      strokeStyle: options?.strokeStyle || 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: `a${id}`,
      roundness: { type: 2 },
      seed,
      version: 1,
      versionNonce: seed,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      points: [[0, 0], [width, height]],
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: 'arrow'
    };
  }

  /**
   * Create a text element with Excalifont
   */
  private createText(x: number, y: number, text: string, options?: {
    fontSize?: number;
    textAlign?: string;
    verticalAlign?: string;
    strokeColor?: string;
  }): ExcalidrawElement {
    const id = this.generateUniqueId();
    const seed = Math.floor(Math.random() * 2147483647);
    const fontSize = options?.fontSize || 20;
    const width = text.length * fontSize * 0.6;
    const height = fontSize * 1.2;
    
    return {
      id,
      type: 'text',
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: options?.strokeColor || '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: `t${id}`,
      roundness: null,
      seed,
      version: 1,
      versionNonce: seed,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text,
      fontSize,
      fontFamily: 5, // Excalifont (required by skill)
      textAlign: options?.textAlign || 'left',
      verticalAlign: options?.verticalAlign || 'top'
    };
  }

  /**
   * Generate unique ID (timestamp + random)
   */
  private generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Skill-based color palette
   */
  private getSkillColors() {
    return {
      // Primary elements
      primary: '#a5d8ff',
      // Process steps
      process: '#b2f2bb',
      // Important/Central
      important: '#ffd43b',
      // Warnings/Errors
      warning: '#ffc9c9',
      // Secondary items
      secondary: '#96f2d7',
      // Start (green)
      start: '#dcfce7',
      // End (red)
      end: '#fee2e2',
      // Decision (orange)
      decision: '#ffedd5',
      // Store (gray)
      store: '#e2e8f0',
      // External Entity (yellow)
      external: '#fef3c7'
    };
  }

  /**
   * Layout constants based on skill guidelines
   * Horizontal: 200-300px, Vertical: 100-150px
   */
  private getLayoutConstants() {
    return {
      HORIZONTAL_GAP: 250,
      VERTICAL_GAP: 120,
      BOX_WIDTH: 180,
      BOX_HEIGHT: 70,
      DECISION_SIZE: 140,
      CENTER_X: 400,
      START_Y: 60,
      MARGIN: 50
    };
  }
}