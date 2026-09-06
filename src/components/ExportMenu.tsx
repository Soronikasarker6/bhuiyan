import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The Export control — a small dropdown offering CSV and PDF, the two
 * formats a printed register in this app can leave as. PDF goes through the
 * same `usePrint`/`window.print()` path as every other document here —
 * "Save as PDF" in the browser's print dialog — so there's no separate
 * PDF-generation dependency to keep in sync with the on-screen table.
 */
export function ExportMenu({
  onCsv,
  onPdf,
  disabled = false,
  iconOnly = false,
  label = 'Export',
}: {
  onCsv: () => void
  onPdf: () => void
  disabled?: boolean
  /** A bare icon trigger for a dense row of per-item actions, instead of the labelled button. */
  iconOnly?: boolean
  /** Accessible name for the icon-only trigger. */
  label?: string
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {iconOnly ? (
          <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={label}>
            <Download />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={disabled}>
            <Download />
            {label}
          </Button>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-48 rounded-lg border border-border bg-popover p-1 shadow-pop animate-in fade-in-0 zoom-in-95"
        >
          <DropdownMenu.Item
            onSelect={onCsv}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] outline-none focus:bg-accent"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
            Download CSV
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={onPdf}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] outline-none focus:bg-accent"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Download PDF
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
