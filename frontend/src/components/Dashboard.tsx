import { useState } from 'react'
import { FeedbackButton } from './FeedbackButton'
import { useDashboardData } from '../hooks/useDashboardData'
import { OverviewTab } from './tabs/OverviewTab'
import { ServicesTab } from './tabs/ServicesTab'
import { SchedulerTab } from './tabs/SchedulerTab'
import { GitHubTab } from './tabs/GitHubTab'
import type { TabId } from '../types'
import { formatRelativeTime } from '../utils/formatters'

export { OverviewTab } from './tabs/OverviewTab'
export { ServicesTab } from './tabs/ServicesTab'
export { SchedulerTab } from './tabs/SchedulerTab'
export { GitHubTab } from './tabs/GitHubTab'
export { useDashboardData } from '../hooks/useDashboardData'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Server Overview' },
  { id: 'scheduler', label: 'AI Scheduler' },
  { id: 'github', label: 'GitHub Actions' },
  { id: 'services', label: 'Services' },
]

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const { data, error, refreshing, refresh } = useDashboardData()

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Server Dashboard</h1>
          <div className="flex items-center gap-3">
            {data?.last_updated && (
              <span data-testid="last-updated" className="text-xs text-gray-500 dark:text-gray-400">
                {formatRelativeTime(data.last_updated)}
              </span>
            )}
            <button
              data-testid="refresh-button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {refreshing ? (
                <>
                  <svg data-testid="refresh-spinner" className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Refreshing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex gap-1 mb-6 overflow-x-auto" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-center text-sm mb-4">
            {error}
          </div>
        )}

        {activeTab === 'overview' && data?.system && (
          <OverviewTab data={data.system} />
        )}

        {activeTab === 'services' && data?.services && (
          <ServicesTab services={data.services} />
        )}

        {activeTab === 'scheduler' && data?.scheduler && (
          <SchedulerTab scheduler={data.scheduler} />
        )}

        {activeTab === 'github' && data?.github_actions && (
          <GitHubTab runs={data.github_actions} />
        )}
      </div>
      <FeedbackButton
        repo="saabendtsen/server-dashboard"
        apiUrl="https://wibholmsolutions.com/api/feedback"
      />
    </div>
  )
}
