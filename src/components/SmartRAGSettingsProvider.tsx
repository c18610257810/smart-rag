import React, { useEffect, useMemo, useState } from 'react'

import { NeuralComposerSettings } from '../settings/schema/setting.types'
import SmartRAGPlugin from '../main'
import { adaptToNeuralComposerSettings } from '../utils/smartRAGSettingsAdapter'
import { SettingsProvider } from '../contexts/settings-context'

type SmartRAGSettingsProviderProps = {
	plugin: SmartRAGPlugin
	children: React.ReactNode
}

/**
 * SmartRAGSettingsProvider - Wrapper to handle settings adaptation
 *
 * This component:
 * 1. Adapts SmartRAGSettings to NeuralComposerSettings
 * 2. Re-adapts when SmartRAGSettings changes
 * 3. Provides adapted settings to SettingsProvider
 */
export const SmartRAGSettingsProvider: React.FC<SmartRAGSettingsProviderProps> = ({
	plugin,
	children,
}) => {
	// Store adapted settings in state
	const [adaptedSettings, setAdaptedSettings] = useState<NeuralComposerSettings>(
		() => adaptToNeuralComposerSettings(plugin.settings)
	)

	// Wrapper for addSettingsChangeListener
	// When plugin settings change, re-adapt and update state
	const wrappedAddSettingsChangeListener = useMemo(() => {
		return (listener: (newSettings: NeuralComposerSettings) => void) => {
			// Create a wrapper listener that re-adapts settings before calling the original listener
			const wrapperListener = () => {
				const newAdaptedSettings = adaptToNeuralComposerSettings(plugin.settings)
				setAdaptedSettings(newAdaptedSettings)
				listener(newAdaptedSettings)
			}

			return plugin.addSettingsChangeListener(wrapperListener)
		}
	}, [plugin])

	// setSettings is a no-op since SmartRAGSettings is the source of truth
	const setSettings = (newSettings: NeuralComposerSettings) => {
		console.log('SettingsProvider setSettings called, but SmartRAG uses its own settings structure')
	}

	return (
		<SettingsProvider
			settings={adaptedSettings}
			setSettings={setSettings}
			addSettingsChangeListener={wrappedAddSettingsChangeListener}
		>
			{children}
		</SettingsProvider>
	)
}

export default SmartRAGSettingsProvider