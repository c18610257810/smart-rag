/**
 * SmartRAG Settings Adapter
 * 
 * Converts SmartRAGSettings (simple single-config) to NeuralComposerSettings (array-based multi-provider/model).
 * This adapter allows Smart RAG to use Neural Composer's Chat components without modifying the settings structure.
 */

import { NeuralComposerSettings } from '../settings/schema/setting.types'
import { ChatModel } from '../types/chat-model.types'
import { EmbeddingModel } from '../types/embedding-model.types'
import { LLMProvider } from '../types/provider.types'
import { SETTINGS_SCHEMA_VERSION } from '../settings/schema/migrations'

interface LLMConfig {
	baseUrl: string;
	apiKey: string;
	modelName: string;
	maxTokens?: number;
	temperature?: number;
}

interface EmbeddingConfig {
	baseUrl: string;
	modelName: string;
	dimension?: number;
}

interface SmartRAGSettings {
	chatLLM: LLMConfig;
	lightRAGLLM: LLMConfig;
	semanticChunkLLM: LLMConfig;
	lightRAGEmbedding: EmbeddingConfig;
	lightRAGWorkingDir: string;
}

/**
 * Convert SmartRAG LLMConfig to Neural Composer LLMProvider
 */
function createProviderFromLLMConfig(
	config: LLMConfig,
	id: string,
	name: string
): LLMProvider {
	return {
		id,
		name,
		type: 'openai-compatible',
		baseUrl: config.baseUrl,
		apiKey: config.apiKey,
		enabled: true,
		additionalSettings: {
			noStainless: true, // Remove x-stainless headers for compatibility
		},
	}
}

/**
 * Convert SmartRAG LLMConfig to Neural Composer ChatModel
 */
function createChatModelFromLLMConfig(
	config: LLMConfig,
	id: string,
	providerId: string,
	enable: boolean = true
): ChatModel {
	return {
		id,
		providerId,
		providerType: 'openai-compatible',
		model: config.modelName,
		enable,
		// Note: maxTokens and temperature are not in ChatModel schema
	}
}

/**
 * Convert SmartRAG EmbeddingConfig to Neural Composer EmbeddingModel
 */
function createEmbeddingModelFromConfig(
	config: EmbeddingConfig,
	id: string,
	providerId: string
): EmbeddingModel {
	return {
		id,
		providerId,
		providerType: 'lm-studio',
		model: config.modelName,
		dimension: config.dimension || 1024,
	}
}

/**
 * Adapt SmartRAGSettings to NeuralComposerSettings
 * 
 * Mapping:
 * - chatLLM → provider 'chat-llm' + chatModel 'chat-model' (selected as chatModelId)
 * - lightRAGLLM → provider 'lightrag-llm' + chatModel 'lightrag-model'
 * - semanticChunkLLM → provider 'semantic-llm' + chatModel 'semantic-model'
 * - lightRAGEmbedding → provider 'embedding' + embeddingModel 'embedding-model'
 */
export function adaptToNeuralComposerSettings(
	smartRAGSettings: SmartRAGSettings
): NeuralComposerSettings {
	// Create providers
	const chatProvider = createProviderFromLLMConfig(
		smartRAGSettings.chatLLM,
		'chat-llm-provider',
		'Chat LLM Provider'
	)
	
	const lightRAGProvider = createProviderFromLLMConfig(
		smartRAGSettings.lightRAGLLM,
		'lightrag-llm-provider',
		'LightRAG LLM Provider'
	)
	
	const semanticProvider = createProviderFromLLMConfig(
		smartRAGSettings.semanticChunkLLM,
		'semantic-llm-provider',
		'Semantic Chunk LLM Provider'
	)
	
	const embeddingProvider: LLMProvider = {
		id: 'embedding-provider',
		name: 'Embedding Provider',
		type: 'lm-studio', // Use lm-studio type for local embedding
		baseUrl: smartRAGSettings.lightRAGEmbedding.baseUrl,
		apiKey: '', // Local embedding usually doesn't need API key
		enabled: true,
	}

	// Create chat models
	const chatModel = createChatModelFromLLMConfig(
		smartRAGSettings.chatLLM,
		'chat-model',
		'chat-llm-provider',
		true
	)
	
	const lightRAGModel = createChatModelFromLLMConfig(
		smartRAGSettings.lightRAGLLM,
		'lightrag-model',
		'lightrag-llm-provider',
		false // Not used for chat, just stored for LightRAG
	)
	
	const semanticModel = createChatModelFromLLMConfig(
		smartRAGSettings.semanticChunkLLM,
		'semantic-model',
		'semantic-llm-provider',
		false // Not used for chat, just stored for semantic chunking
	)

	// Create embedding model
	const embeddingModel = createEmbeddingModelFromConfig(
		smartRAGSettings.lightRAGEmbedding,
		'embedding-model',
		'embedding-provider'
	)

	// Build NeuralComposerSettings
	return {
		version: SETTINGS_SCHEMA_VERSION,
		
		// Providers array
		providers: [chatProvider, lightRAGProvider, semanticProvider, embeddingProvider],
		
		// Models arrays
		chatModels: [chatModel, lightRAGModel, semanticModel],
		embeddingModels: [embeddingModel],
		
		// Selected model IDs
		chatModelId: 'chat-model',
		applyModelId: 'chat-model', // Use chat model for apply as well
		embeddingModelId: 'embedding-model',
		
		// Chat options (defaults)
		chatOptions: {
			includeCurrentFileContent: true,
			enableTools: false, // Disable tools for simplicity
			maxAutoIterations: 1,
		},
		
		// System prompt (empty, user can configure)
		systemPrompt: '',
		
		// RAG options (defaults)
		ragOptions: {
			chunkSize: 1000,
			thresholdTokens: 8192,
			minSimilarity: 0.0,
			limit: 10,
			excludePatterns: [],
			includePatterns: [],
		},
		
		// MCP (disabled)
		mcp: {
			servers: [],
		},
		
		// LightRAG settings (from SmartRAGSettings)
		enableAutoStartServer: false,
		lightRagCommand: 'lightrag-server',
		lightRagWorkDir: smartRAGSettings.lightRAGWorkingDir,
		lightRagModelId: 'lightrag-model',
		lightRagSummaryLanguage: 'English',
		lightRagShowCitations: true,
		lightRagQueryMode: 'mix',
		lightRagEmbeddingModelId: 'embedding-model',
		
		// Reranking (disabled)
		lightRagRerankBinding: '',
		lightRagRerankModel: '',
		lightRagRerankApiKey: '',
		lightRagRerankHost: '',
		lightRagRerankBindingType: '',
		
		// Ontology (disabled)
		lightRagEntityTypes: '',
		lightRagOntologyFolder: '',
		useCustomEntityTypes: false,
		graphViewMode: '2d',
		
		// Performance tuning (defaults)
		lightRagMaxAsync: 4,
		lightRagMaxParallelInsert: 1,
		lightRagChunkSize: 1200,
		lightRagChunkOverlap: 100,
		
		// Custom env (empty)
		lightRagCustomEnv: '',
	}
}

/**
 * Type guard to check if settings is SmartRAGSettings
 */
export function isSmartRAGSettings(settings: unknown): settings is SmartRAGSettings {
	if (typeof settings !== 'object' || settings === null) return false
	const s = settings as Record<string, unknown>
	return (
		'chatLLM' in s &&
		'lightRAGLLM' in s &&
		'semanticChunkLLM' in s &&
		'lightRAGEmbedding' in s
	)
}