import { http } from './httpClient'

/**
 * Wraps `/api/dashboard/summary` — computed entirely server-side. Not wired
 * into DashboardPage in this pass (it already reads backend-sourced data via
 * the bootstrap + existing dashboard utils), but available so the dashboard
 * can switch to one summary call later without a new endpoint.
 */
export const dashboardService = {
  summary: (): Promise<Record<string, unknown>> => http.get('/dashboard/summary'),
}
