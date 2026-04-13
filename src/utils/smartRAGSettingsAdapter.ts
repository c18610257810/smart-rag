/**
 * SmartRAG Settings Adapter
 * 
 * Converts SmartRAGSettings (simple single-config) to NeuralComposerSettings (array-based multi-provider/model).
 * This adapter allows Smart RAG to use Neural Composer's Chat components without modifying the settings structure.
 * 
 * Updated: 2026-04-09 — aligned with new no-hardcode settings structure
 */

import { NeuralComposerSettings } from '../settings/schema/setting.types'
import { ChatModel } from '../types/chat-model.types'
import { EmbeddingModel } from '../types/embedding-model.types'
import { LLMProvider } from '../types/provider.types'
// Settings schema version (migrations deleted, using latest)
const SETTINGS_SCHEMA_VERSION = 12;

// Must match SmartRAGSettings in main.ts
interface ChatLLMConfig {
	baseUrl: string;
	apiKey: string;
	modelName: string;
	maxTokens?: number;
	temperature?: number;
}

interface EmbeddingConfig {
	provider: 'openai' | 'dashscope' | 'ollama';
	baseUrl: string;
	apiKey: string;
	model: string;
	dimension: number;
}

interface RAGAnythingConfig {
	enabled: boolean;
	httpPort: number;
	workingDir: string;
	parser: string;
	llmBaseUrl: string;
	llmApiKey: string;
	llmModel: string;
	embeddingBaseUrl: string;
	embeddingApiKey: string;
	embeddingModel: string;
	embeddingDimension: number;
	llmConcurrency: number;
	embeddingConcurrency: number;
}

interface SmartRAGSettings {
	chatLLM: ChatLLMConfig;
	embedding: EmbeddingConfig;
	lightRAG: { serverUrl: string; llmConcurrency: number; embeddingConcurrency: number };
	qdrant: { httpPort: number; dataDir: string };
	ragAnything: RAGAnythingConfig;
	rawFolderPath: string;
}

/**
 * Create LLMProvider from LLM config
 */
function createProvider(
	baseUrl: string,
	apiKey: string,
	id: string
): LLMProvider {
	return {
		id,
		type: 'openai-compatible',
		baseUrl,
		apiKey,
		additionalSettings: {
			noStainless: true,
		},
	}
}

/**
 * Create ChatModel from LLM config
 */
function createChatModel(
	modelName: string,
	id: string,
	providerId: string,
	enable: boolean = true
): ChatModel {
	return {
		id,
		providerId,
		providerType: 'openai-compatible',
		model: modelName,
		enable,
	}
}

/**
 * Create EmbeddingModel from embedding config
 */
function createEmbeddingModel(
	modelName: string,
	dimension: number,
	id: string,
	providerId: string
): EmbeddingModel {
	return {
		id,
		providerId,
		providerType: 'openai-compatible',
		model: modelName,
		dimension: dimension || 1024,
	}
}

/**
 * Adapt SmartRAGSettings to NeuralComposerSettings
 */
export function adaptToNeuralComposerSettings(
	smartRAGSettings: SmartRAGSettings
): NeuralComposerSettings {
	const chat = smartRAGSettings.chatLLM;
	const emb = smartRAGSettings.embedding;
	const rag = smartRAGSettings.ragAnything;

	// Providers
	const chatProvider = createProvider(chat.baseUrl, chat.apiKey, 'chat-provider');
	const embeddingProvider = createProvider(emb.baseUrl, emb.apiKey, 'embedding-provider');
	const ragLLMProvider = createProvider(rag.llmBaseUrl, rag.llmApiKey, 'rag-llm-provider');

	// Models
	const chatModel = createChatModel(chat.modelName, 'chat-model', 'chat-provider', true);
	const embeddingModel = createEmbeddingModel(emb.model, emb.dimension, 'embedding-model', 'embedding-provider');

	return {
		version: SETTINGS_SCHEMA_VERSION,
		providers: [chatProvider, embeddingProvider, ragLLMProvider],
		chatModels: [chatModel],
		embeddingModels: [embeddingModel],
		chatModelId: 'chat-model',
		applyModelId: 'chat-model',
		embeddingModelId: 'embedding-model',
		chatOptions: {
			includeCurrentFileContent: true,
			enableTools: false,
			maxAutoIterations: 1,
		},
		systemPrompt: '',
		ragOptions: {
			chunkSize: 1000,
			thresholdTokens: 8192,
			minSimilarity: 0.0,
			limit: 10,
			excludePatterns: [],
			includePatterns: [],
		},
		mcp: { servers: [] },
		enableAutoStartServer: false,
		lightRagCommand: 'lightrag-server',
		lightRagWorkDir: rag.workingDir,
		lightRagModelId: '',
		lightRagSummaryLanguage: 'English',
		lightRagShowCitations: true,
		lightRagQueryMode: 'mix',
		lightRagEmbeddingModelId: 'embedding-model',
		lightRagRerankBinding: '',
		lightRagRerankModel: '',
		lightRagRerankApiKey: '',
		lightRagRerankHost: '',
		lightRagRerankBindingType: '',
		lightRagEntityTypes: '',
		lightRagOntologyFolder: '',
		useCustomEntityTypes: false,
		graphViewMode: '2d',
		lightRagMaxAsync: rag.llmConcurrency,
		lightRagMaxParallelInsert: rag.embeddingConcurrency,
		lightRagChunkSize: 1200,
		lightRagChunkOverlap: 100,
		lightRagCustomEnv: '',
	}
}

/**
 * Type guard
 */
export function isSmartRAGSettings(settings: unknown): settings is SmartRAGSettings {
	if (typeof settings !== 'object' || settings === null) return false;
	const s = settings as Record<string, unknown>;
	return 'chatLLM' in s && 'embedding' in s && 'lightRAG' in s && 'ragAnything' in s;
}
