import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { useSettings } from '../../contexts/settings-context'

export function ModelSelect() {
  const { settings, setSettings } = useSettings()
  const [isOpen, setIsOpen] = useState(false)
  
  // Find the selected model to display its name
  const selectedModel = settings.chatModels.find(m => m.id === settings.chatModelId)
  const displayModelName = selectedModel?.model || settings.chatModelId
  
  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger className="smart-rag-chat-input-model-select">
        <div className="smart-rag-chat-input-model-select__model-name">
          {displayModelName}
        </div>
        <div className="smart-rag-chat-input-model-select__icon">
          {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="smart-rag-popover">
          <ul>
            {settings.chatModels
              .filter(({ enable }) => enable ?? true)
              .map((chatModelOption) => (
                <DropdownMenu.Item
                  key={chatModelOption.id}
                  onSelect={() => {
                    // FIX: Handle floating promise from setSettings
                    void setSettings({
                      ...settings,
                      chatModelId: chatModelOption.id,
                    })
                  }}
                  asChild
                >
                  <li>{chatModelOption.model}</li>
                </DropdownMenu.Item>
              ))}
          </ul>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}