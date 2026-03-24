import { useEffect, useState } from 'react'
import type { AgentMessage } from '../../types'

interface Props {
  runId: number
  onClose: () => void
}

export function MessagesModal({ runId, onClose }: Props) {
  const [messages, setMessages] = useState<AgentMessage[] | null>(null)
  const [expired, setExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/server-dashboard/api/runs/${runId}/messages`)
      .then(res => {
        if (res.status === 204) {
          setExpired(true)
          return null
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data !== null) setMessages(data)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [runId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Messages — Run #{runId}</h3>
          <button data-testid="close-modal" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div data-testid="messages-loading" className="text-center text-gray-400 py-8">Loading messages...</div>
          )}

          {expired && (
            <div className="text-center text-gray-400 py-8">Messages expired (retention cleanup)</div>
          )}

          {error && (
            <div className="text-center text-red-400 py-8">Failed to load messages: {error}</div>
          )}

          {messages && messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm ${
                msg.role === 'assistant'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100'
                  : msg.role === 'user'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 text-gray-700 dark:text-gray-300 text-xs'
              }`}
            >
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">{msg.role}</span>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
