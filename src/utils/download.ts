/**
 * Triggers a browser download of in-memory text — the Blob + temporary
 * `<a download>` idiom every CSV/backup export in this app uses, pulled out
 * once so a new export doesn't have to repeat the object-URL bookkeeping.
 */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
