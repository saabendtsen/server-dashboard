export type TabId = 'overview' | 'scheduler' | 'github' | 'services'

export interface SystemData {
  disks: Array<{
    mount: string
    total_bytes: number
    used_bytes: number
    percent: number
  }>
  cpu_percent: number
  temperature: number | null
  load_average: number[]
  memory: {
    total_bytes: number
    used_bytes: number
    percent: number
  }
  uptime_seconds: number
}

export interface HealthcheckResult {
  status_code: number | null
  latency_ms: number | null
  error: string | null
}

export interface ServiceData {
  name: string
  status: string
  image: string
  started_at: string
  healthcheck: HealthcheckResult | null
}

export interface RunEvent {
  id: number
  timestamp: string
  event_type: string
  detail: string | null
}

export interface AgentMessage {
  role: string
  content: string
}

export interface SchedulerRun {
  id: number
  repo: string
  issue_number: number
  session_type: string
  started_at: string
  ended_at: string
  outcome: string
  pr_number: number | null
  notes: string | null
  validation_reason: string | null
  events: RunEvent[]
}

export interface SchedulerData {
  health: string
  runs: SchedulerRun[]
}

export interface GitHubRun {
  repo: string
  workflow_name: string
  status: string
  conclusion: string
  created_at: string
}

export interface StatusResponse {
  system: SystemData
  services: ServiceData[]
  scheduler: SchedulerData
  github_actions: GitHubRun[]
  last_updated: string
}
