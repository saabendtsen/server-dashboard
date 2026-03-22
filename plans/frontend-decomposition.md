# Plan: Frontend Monolith Decomposition

> Source: [Refactor: deepen frontend monolith into Dashboard module](https://github.com/saabendtsen/server-dashboard/issues/2)

## Architectural decisions

Durable decisions that apply across all phases:

- **API contract**: Single `GET /server-dashboard/api/status` returns `StatusResponse` with fields `system`, `services`, `scheduler`, `github_actions`, `last_updated`. `POST /server-dashboard/api/refresh` triggers re-collection and returns the same shape.
- **Tab IDs**: `overview | services | scheduler | github` — used in `data-testid` attributes and E2E selectors. Must not change.
- **Tab state**: Local `useState` — no URL routing, no React Router.
- **Type contract**: All shared types live in `src/types.ts`. Tab components receive only their typed slice, never `StatusResponse`.
- **Dependency direction**: `types.ts` and `utils/formatters.ts` are leaves (import nothing). Tab components import from types and shared components only. `Dashboard.tsx` imports tabs and the data hook. No circular dependencies.
- **Testing**: Existing E2E tests (`dashboard.spec.ts`, `feedback.spec.ts`) remain untouched throughout. New component tests use Vitest + React Testing Library.

---

## Phase 1: Extract shared leaves (types + formatters)

**User stories**: Reduce edit radius; enable unit-testing of pure formatting logic

### What to build

Move all TypeScript interfaces (`SystemData`, `ServiceData`, `SchedulerRun`, `SchedulerData`, `GitHubRun`, `HealthcheckResult`, `StatusResponse`, `TabId`) from `App.tsx` into a new `src/types.ts`. Move all pure formatting functions (`formatBytes`, `formatUptime`, `formatContainerUptime`, `formatTimestamp`, `formatRelativeTime`, `repoShortName`) into a new `src/utils/formatters.ts`. Update `App.tsx` to import from both files. No behavioral changes — the app renders identically.

### Acceptance criteria

- [ ] All interfaces live in `src/types.ts` and are exported
- [ ] All pure formatting functions live in `src/utils/formatters.ts` and are exported
- [ ] `App.tsx` imports types and formatters — no type or function definitions remain inline
- [ ] Existing E2E tests pass unchanged
- [ ] App builds without TypeScript errors

---

## Phase 2: Extract data hook

**User stories**: Decouple fetch lifecycle from rendering; make data fetching independently testable

### What to build

Create `src/hooks/useDashboardData.ts` containing the fetch-on-mount, refresh handler, and all associated state (`data`, `error`, `refreshing`). The hook exposes `{ data, error, refreshing, refresh }`. Update `App.tsx` to call `useDashboardData()` instead of managing state inline. The `useEffect` fetch and `handleRefresh` function move entirely into the hook.

### Acceptance criteria

- [ ] `useDashboardData` hook exists and manages all fetch state
- [ ] `App.tsx` no longer contains `useState` for data/error/refreshing or `useEffect` for fetching
- [ ] `App.tsx` calls `useDashboardData()` and destructures the result
- [ ] Refresh button still works (POST to `/server-dashboard/api/refresh`)
- [ ] Existing E2E tests pass unchanged

---

## Phase 3: Extract first tab (Overview) — tracer bullet

**User stories**: Prove the tab extraction pattern end-to-end before applying to all tabs

### What to build

Move `ServerOverview` and `DiskGauge` into `src/components/tabs/OverviewTab.tsx`. The exported component receives `SystemData` as its only prop. It imports formatters from `utils/formatters.ts` and types from `types.ts`. Update `App.tsx` to import and render `OverviewTab` where `ServerOverview` was used. All `data-testid` attributes are preserved inside the extracted component.

### Acceptance criteria

- [ ] `OverviewTab` is a standalone exported component receiving `SystemData`
- [ ] `DiskGauge` lives inside the same file (internal to the tab module)
- [ ] `App.tsx` imports `OverviewTab` and passes `data.system`
- [ ] All `data-testid` attributes on overview elements are preserved
- [ ] Existing E2E tests pass unchanged

---

## Phase 4: Extract remaining tabs + shared components

**User stories**: Complete the decomposition of all rendering logic out of `App.tsx`

### What to build

Extract the remaining three tabs and shared presentational components:

- `src/components/tabs/ServicesTab.tsx` — receives `ServiceData[]`, contains service card rendering
- `src/components/tabs/SchedulerTab.tsx` — receives `SchedulerData`, contains run list and health badge
- `src/components/tabs/GitHubTab.tsx` — receives `GitHubRun[]`, contains workflow run rendering
- `src/components/shared/StatusBadge.tsx` — reusable status badge (used by Services)
- `src/components/shared/HealthIndicator.tsx` — reusable health dot (used by Services)
- `src/components/shared/OutcomeBadge.tsx` — reusable outcome badge (used by Scheduler)
- `src/components/shared/SchedulerHealthBadge.tsx` — scheduler health indicator

Helper functions like `getStatusColor` move into the tab that uses them. Update `App.tsx` to import all tabs. After this phase, `App.tsx` contains only the shell: hook call, tab routing, header, and layout chrome.

### Acceptance criteria

- [ ] Each tab is an exported component receiving only its typed data slice
- [ ] Shared badge/indicator components are in `src/components/shared/`
- [ ] `App.tsx` contains no presentational component definitions
- [ ] All `data-testid` attributes are preserved in their respective components
- [ ] Existing E2E tests pass unchanged

---

## Phase 5: Introduce Dashboard shell

**User stories**: Zero-config entry point; re-export escape hatches

### What to build

Create `src/components/Dashboard.tsx` that owns the complete dashboard rendering: calls `useDashboardData`, manages tab state, renders header with refresh button, renders tab navigation, renders the active tab component, and renders the `FeedbackButton`. `App.tsx` becomes a one-line default export rendering `<Dashboard />`.

`Dashboard.tsx` re-exports individual tab components and `useDashboardData` as named exports for the escape-hatch use case (embedding a single tab elsewhere).

### Acceptance criteria

- [ ] `Dashboard` component renders the full dashboard with no required props
- [ ] `App.tsx` is reduced to importing and rendering `<Dashboard />`
- [ ] Individual tabs and `useDashboardData` are available as named exports from `Dashboard`
- [ ] Tab routing, refresh button, error display, and last-updated indicator all work
- [ ] Existing E2E tests pass unchanged

---

## Phase 6: Add component-level tests

**User stories**: Enable unit testing of all extracted modules

### What to build

Set up Vitest + React Testing Library (if not already configured). Write boundary tests:

- `formatters.test.ts` — unit tests for all pure formatting functions
- `OverviewTab.test.tsx` — render with fixture `SystemData`, assert gauges, CPU, memory, temp, load, uptime
- `ServicesTab.test.tsx` — render with fixture `ServiceData[]`, assert names, badges, health indicators
- `SchedulerTab.test.tsx` — render with fixture `SchedulerData`, assert health badge, runs, outcomes, links
- `GitHubTab.test.tsx` — render with fixture `GitHubRun[]`, assert workflow names, status dots, times
- `useDashboardData.test.ts` — test fetch lifecycle, error handling, refresh trigger (mock `fetch`)
- `Dashboard.test.tsx` — integration test: renders with mock data, tab switching works

### Acceptance criteria

- [ ] Vitest + React Testing Library are configured and runnable via `npm test` or equivalent
- [ ] Formatter tests cover edge cases (0 bytes, null temperature, very large uptimes)
- [ ] Each tab has at least one render test with fixture data
- [ ] `useDashboardData` tests verify initial fetch, error state, and refresh
- [ ] `Dashboard` integration test verifies tab switching renders correct content
- [ ] All new tests pass; existing E2E tests still pass
