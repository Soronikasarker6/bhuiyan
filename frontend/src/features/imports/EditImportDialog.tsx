import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Scale } from 'lucide-react'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import { MessageStrip } from '@ui5/webcomponents-react/MessageStrip'
import type { ImportRow, Product } from '@/types'
import type { ShipmentInput } from '@/services/api/shipmentService'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { ReusableValueField } from '@/features/imports/ReusableValueField'
import { netWeightKg, kgToTons } from '@/utils/imports'
import { formatNumber, formatTons, todayISO } from '@/utils/format'

const schema = z
  .object({
    date: z.string().min(1, 'Pick the date.'),
    productId: z.string().min(1, 'Choose a product.'),
    shipName: z.string().max(120).optional(),
    serialNo: z.string().max(60).optional(),
    truckNo: z.string().max(40).optional(),
    grossWeightKg: z.coerce
      .number({ invalid_type_error: 'Enter the gross weight.' })
      .positive('Gross weight must be more than zero.'),
    tareWeightKg: z.coerce
      .number({ invalid_type_error: 'Enter the tare weight.' })
      .min(0, 'Tare weight cannot be negative.'),
    pricePerTon: z.coerce.number().nonnegative().optional(),
    notes: z.string().max(300).optional(),
  })
  .refine((values) => values.tareWeightKg < values.grossWeightKg, {
    message: 'Tare weight must be less than gross weight — net weight cannot be zero or negative.',
    path: ['tareWeightKg'],
  })

type FormValues = z.input<typeof schema>

/**
 * Editing an already-recorded raw material import.
 *
 * Net weight/ton are never fields here — same as the create form, they are
 * always `gross − tare`, worked out live as those two are typed, never typed
 * in directly. Saving re-validates against current stock server-side (an
 * edit that would leave production/wastage already recorded against this
 * shipment exceeding its new weight is rejected with a clear error, and
 * nothing partial is written).
 */
export function EditImportDialog({
  row,
  products,
  shipNames,
  truckNos,
  onOpenChange,
  onSubmit,
}: {
  row: ImportRow | null
  products: Product[]
  shipNames: string[]
  truckNos: string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ShipmentInput) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayISO(),
      productId: '',
      shipName: '',
      serialNo: '',
      truckNo: '',
      grossWeightKg: '' as unknown as number,
      tareWeightKg: '' as unknown as number,
      pricePerTon: undefined,
      notes: '',
    },
  })

  // Re-seed every time a different row is opened for editing.
  useEffect(() => {
    if (row) {
      reset({
        date: row.date,
        productId: row.productId,
        shipName: row.shipName ?? '',
        serialNo: row.serialNo ?? '',
        truckNo: row.truckNo ?? '',
        grossWeightKg: row.grossWeightKg,
        tareWeightKg: row.tareWeightKg,
        pricePerTon: row.pricePerTon,
        notes: row.notes ?? '',
      })
    }
  }, [row, reset])

  const gross = Number(watch('grossWeightKg')) || 0
  const tare = Number(watch('tareWeightKg')) || 0
  const net = netWeightKg(gross, tare)
  const oversized = tare > 0 && gross > 0 && tare >= gross

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      date: values.date,
      productId: values.productId,
      shipName: values.shipName?.trim() || undefined,
      serialNo: values.serialNo?.trim() || undefined,
      truckNo: values.truckNo?.trim() || undefined,
      grossWeightKg: values.grossWeightKg,
      tareWeightKg: values.tareWeightKg,
      pricePerTon: values.pricePerTon || undefined,
      notes: values.notes?.trim() || undefined,
    })
  })

  return (
    <Dialog
      open={row !== null}
      headerText={row ? `Edit import · ${row.productName}` : 'Edit import'}
      onClose={() => !isSubmitting && onOpenChange(false)}
      className="w-[calc(100vw-2rem)] max-w-xl"
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="success" loading={isSubmitting} onClick={submit}>
                Save changes
              </Button>
            </>
          }
        />
      }
    >
      {row && (
        <form onSubmit={submit} noValidate className="space-y-4 p-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" error={errors.date?.message} htmlFor="edit-imp-date">
              <DatePicker id="edit-imp-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
            </Field>

            <Field label="Limestone / Product" error={errors.productId?.message} htmlFor="edit-imp-product">
              <Select value={watch('productId')} onValueChange={(value) => setValue('productId', value)}>
                <SelectTrigger id="edit-imp-product">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <ReusableValueField
              id="edit-imp-ship"
              label="Ship name (optional)"
              value={watch('shipName') ?? ''}
              options={shipNames}
              placeholder="Select or add a ship"
              onChange={(v) => setValue('shipName', v)}
            />
            <Field label="Serial / SL No. (optional)" htmlFor="edit-imp-serial">
              <Input id="edit-imp-serial" {...register('serialNo')} />
            </Field>
            <ReusableValueField
              id="edit-imp-truck"
              label="Truck No. (optional)"
              value={watch('truckNo') ?? ''}
              options={truckNos}
              placeholder="Select or add a truck"
              onChange={(v) => setValue('truckNo', v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gross weight (kg)" error={errors.grossWeightKg?.message} htmlFor="edit-imp-gross">
              <Input id="edit-imp-gross" type="number" min={0} step="0.001" inputMode="decimal" {...register('grossWeightKg')} />
            </Field>
            <Field label="Tare weight (kg)" error={errors.tareWeightKg?.message} htmlFor="edit-imp-tare">
              <Input id="edit-imp-tare" type="number" min={0} step="0.001" inputMode="decimal" {...register('tareWeightKg')} />
            </Field>
          </div>

          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-success-200 bg-success-100/60 px-4 py-3"
            aria-live="polite"
          >
            <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-success-800">
              <Scale className="h-4 w-4" aria-hidden />
              Net weight
            </span>
            <span className="text-right">
              <span className="block font-mono tabular text-lg font-bold text-success-800">{formatNumber(net)} kg</span>
              <span className="block font-mono tabular text-2xs text-success-700">{formatTons(kgToTons(net))} Ton</span>
            </span>
          </div>

          {oversized && !errors.tareWeightKg && (
            <MessageStrip design="Negative" hideCloseButton>
              Tare weight looks too high for this gross weight — double check the weighbridge slip.
            </MessageStrip>
          )}

          <Field label="Price per Ton (optional)" htmlFor="edit-imp-price">
            <Input id="edit-imp-price" type="number" min={0} step="0.01" inputMode="decimal" {...register('pricePerTon')} />
          </Field>

          <Field label="Notes (optional)" htmlFor="edit-imp-notes">
            <Textarea id="edit-imp-notes" rows={2} {...register('notes')} />
          </Field>
        </form>
      )}
    </Dialog>
  )
}
