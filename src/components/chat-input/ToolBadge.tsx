import clsx from 'clsx'
import { Eye, EyeOff, Wrench } from 'lucide-react'
import { useCallback, useState } from 'react'

import { useSettings } from '../../contexts/settings-context'

export default function ToolBadge() {
  const { settings, setSettings } = useSettings()
  const [toolCount] = useState(0)

  const handleToolToggle = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      void setSettings({
        ...settings,
        chatOptions: {
          ...settings.chatOptions,
          enableTools: !settings.chatOptions.enableTools,
        },
      })
    },
    [settings, setSettings],
  )

  return (
    <div
      className="smart-rag-chat-user-input-file-badge"
    >
      <div className="smart-rag-chat-user-input-file-badge-name">
        <Wrench
          size={12}
          className="smart-rag-chat-user-input-file-badge-name-icon"
        />
        <span
          className={clsx(
            !settings.chatOptions?.enableTools && 'smart-rag-excluded-content',
          )}
        >
          Tools ({toolCount})
        </span>
      </div>
      <div
        className="smart-rag-chat-user-input-file-badge-eye"
        onClick={handleToolToggle}
      >
        {settings.chatOptions?.enableTools ? (
          <Eye size={12} />
        ) : (
          <EyeOff size={12} />
        )}
      </div>
    </div>
  )
}
