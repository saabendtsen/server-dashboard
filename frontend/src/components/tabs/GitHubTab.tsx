import type { GitHubRun } from '../../types'
import { formatRelativeTime } from '../../utils/formatters'

function getStatusColor(run: GitHubRun): { dot: string; text: string; conclusion: string; status: string } {
  if (run.conclusion === 'success') return { dot: 'bg-success', text: 'text-green-600 dark:text-green-400', conclusion: 'success', status: run.status }
  if (run.conclusion === 'failure') return { dot: 'bg-danger', text: 'text-red-600 dark:text-red-400', conclusion: 'failure', status: run.status }
  if (run.status === 'in_progress') return { dot: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', conclusion: run.conclusion, status: 'in_progress' }
  return { dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400', conclusion: run.conclusion, status: run.status }
}

export function GitHubTab({ runs }: { runs: GitHubRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">No workflow runs found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run, i) => {
        const color = getStatusColor(run)
        const repoShort = run.repo.includes('/') ? run.repo.split('/')[1] : run.repo
        const label = run.conclusion || run.status
        return (
          <div
            key={`${run.repo}-${run.created_at}-${i}`}
            data-testid="github-run"
            className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {repoShort}
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{run.workflow_name}</span>
              </div>
              <div
                data-testid="github-status"
                data-conclusion={color.conclusion}
                data-status={color.status}
                className="flex items-center gap-1.5"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                <span className={`text-xs font-medium ${color.text}`}>{label}</span>
              </div>
            </div>
            <div className="flex justify-end">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatRelativeTime(run.created_at)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
