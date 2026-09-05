export interface ReportColumn<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  render: (row: T) => string
}
