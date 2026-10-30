import { Dialog } from '@ui5/webcomponents-react/Dialog'
import type { Account, Customer, MeshSize, Product, SaleSummary } from '@/types'
import { SaleForm, type SaleFormValues, type SaleSubmit } from '@/features/sales/SaleForm'

/**
 * Correcting an already-recorded invoice — the same form as recording one,
 * prefilled. The invoice number never changes. `availableBags` must already
 * count this invoice's own bags as available (they are being replaced, not
 * added to); the server re-checks stock independently.
 */
export function EditSaleDialog({
  sale,
  initialValues,
  customers,
  products,
  meshSizes,
  accounts,
  availableBags,
  onOpenChange,
  onSubmit,
}: {
  sale: SaleSummary | null
  initialValues: SaleFormValues | null
  customers: Customer[]
  products: Product[]
  meshSizes: MeshSize[]
  accounts: Account[]
  availableBags: (productId: string, meshSizeId: string) => number
  onOpenChange: (open: boolean) => void
  onSubmit: (values: SaleSubmit) => Promise<void>
}) {
  return (
    <Dialog
      open={sale !== null}
      headerText={sale ? `Edit ${sale.invoiceNo}` : 'Edit invoice'}
      onClose={() => onOpenChange(false)}
      className="w-[calc(100vw-2rem)] max-w-4xl"
    >
      {sale && initialValues && (
        <div className="p-1">
          <SaleForm
            // Remount per invoice so the form starts from that invoice's own values.
            key={sale.id}
            customers={customers}
            products={products}
            meshSizes={meshSizes}
            accounts={accounts}
            nextInvoiceNo={sale.invoiceNo}
            availableBags={availableBags}
            initialValues={initialValues}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        </div>
      )}
    </Dialog>
  )
}
