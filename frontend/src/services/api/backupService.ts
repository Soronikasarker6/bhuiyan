import { http } from './httpClient'

export const backupService = {
  async exportBackup(): Promise<string> {
    const data = await http.get('/backup/export')
    return JSON.stringify(data, null, 2)
  },
  reset(): Promise<unknown> {
    return http.post('/backup/reset')
  },
  clearTransactionalData(): Promise<unknown> {
    return http.post('/backup/clear-transactional')
  },
}
