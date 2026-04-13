import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import Chat from './components/chat-view/Chat'
import { CHAT_VIEW_TYPE } from './constants'
import { AppProvider } from './contexts/app-context'
import { ChatViewProvider } from './contexts/chat-view-context'
import { DarkModeProvider } from './contexts/dark-mode-context'
import { DatabaseProvider } from './contexts/database-context'
import { McpProvider } from './contexts/mcp-context'
import { PluginProvider } from './contexts/plugin-context'
import { RAGProvider } from './contexts/rag-context'
import { SettingsProvider } from './contexts/settings-context'
import SmartRAGSettingsProvider from './components/SmartRAGSettingsProvider'
import SmartRAGPlugin from './main'
import { adaptToNeuralComposerSettings } from './utils/smartRAGSettingsAdapter'
import { NullMcpManager } from './core/mcp/nullMcpManager'
import { McpManager } from './core/mcp/mcpManager'
import { MentionableBlockData } from './types/mentionable'
import { RAGEngine } from './core/rag/ragEngine'

export const PLUGIN_NAME = "Smart RAG";

/**
 * ChatView - ItemView for right sidebar
 * Provides persistent chat interface without blocking note editing
 */
export class ChatView extends ItemView {
	private root: Root | null = null
	private chatRef: React.RefObject<ChatRef | null> = React.createRef()

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: SmartRAGPlugin,
	) {
		super(leaf)
	}

	getViewType() {
		return CHAT_VIEW_TYPE
	}

	getIcon() {
		return 'brain-circuit'
	}

	getDisplayText() {
		return `${PLUGIN_NAME} chat`
	}

	async onOpen() {
		this.render()
		await super.onOpen()
	}

	async onClose() {
		this.root?.unmount()
		await super.onClose()
	}

	render() {
		if (!this.root) {
			this.root = createRoot(this.containerEl.children[1])
		}

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: 0, // Immediately garbage collect queries to prevent memory leak
				},
				mutations: {
					gcTime: 0,
				},
			},
		})

		// Create RAG engine getter
		const getRAGEngine = async () => {
			// Create RAGEngine with LightRAG server URL
			const currentAdaptedSettings = adaptToNeuralComposerSettings(this.plugin.settings)
			return new RAGEngine(
				this.app,
				currentAdaptedSettings,
				null as any,  // VectorManager not needed for LightRAG
				this.plugin.settings.lightRAG.serverUrl
			)
		}

		this.root.render(
			<PluginProvider plugin={this.plugin}>
				<AppProvider app={this.app}>
					<ChatViewProvider chatView={this}>
						<DarkModeProvider>
							<SmartRAGSettingsProvider plugin={this.plugin}>
								<DatabaseProvider
									getDatabaseManager={() => Promise.reject(new Error('Database not available in Smart RAG mode'))}
								>
									<RAGProvider getRAGEngine={getRAGEngine}>
										<McpProvider getMcpManager={async () => new NullMcpManager({
											settings: adaptToNeuralComposerSettings(this.plugin.settings),
											registerSettingsListener: () => () => {},
										}) as unknown as McpManager}>
											<QueryClientProvider client={queryClient}>
												<React.StrictMode>
													<Chat ref={this.chatRef} />
												</React.StrictMode>
											</QueryClientProvider>
										</McpProvider>
									</RAGProvider>
								</DatabaseProvider>
							</SmartRAGSettingsProvider>
						</DarkModeProvider>
					</ChatViewProvider>
				</AppProvider>
			</PluginProvider>,
		)
	}

	/**
	 * Open a new chat conversation
	 */
	openNewChat(selectedBlock?: MentionableBlockData) {
		this.chatRef.current?.openNewChat(selectedBlock)
	}

	/**
	 * Add selected block to current chat
	 */
	addSelectionToChat(selectedBlock: MentionableBlockData) {
		this.chatRef.current?.addSelectionToChat(selectedBlock)
	}

	/**
	 * Focus the message input
	 */
	focusMessage() {
		this.chatRef.current?.focusMessage()
	}
}

/**
 * Chat ref interface for external control
 */
export type ChatRef = {
	openNewChat: (selectedBlock?: MentionableBlockData) => void
	addSelectionToChat: (selectedBlock: MentionableBlockData) => void
	focusMessage: () => void
}

/**
 * Chat props interface
 */
export type ChatProps = {
	selectedBlock?: MentionableBlockData
}