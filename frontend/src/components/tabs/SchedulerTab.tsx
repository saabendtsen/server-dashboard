import type { SchedulerData } from '../../types'
import { formatTimestamp, repoShortName } from '../../utils/formatters'
import { OutcomeBadge } from '../shared/OutcomeBadge'
import { SchedulerHealthBadge } from '../shared/SchedulerHealthBadge'

export function SchedulerTab({ scheduler }: { scheduler: SchedulerData }) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <SchedulerHealthBadge health={scheduler.health} />
      </div>

      {scheduler.runs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">No runs recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scheduler.runs.map((run) => (
            <div
              key={run.id}
              data-testid="scheduler-run"
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{repoShortName(run.repo)}</span>
                  <a
                    href={`https://github.com/${run.repo}/issues/${run.issue_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    #{run.issue_number}
                  </a>
                  {run.pr_number && (
                    <a
                      href={`https://github.com/${run.repo}/pull/${run.pr_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      #{run.pr_number}
                    </a>
                  )}
                </div>
                <OutcomeBadge outcome={run.outcome} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">{run.session_type}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(run.started_at)}
                  {run.ended_at && ` - ${formatTimestamp(run.ended_at)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
