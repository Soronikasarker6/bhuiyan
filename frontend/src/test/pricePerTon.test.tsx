import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PricePerTonField } from '@/features/imports/PricePerTonField'

/**
 * The Price per Ton picker, now shared by the create form and the edit
 * dialog.
 *
 * Two things matter enough to pin down: that a price already saved against a
 * record is still *selected* when the dialog opens (the bug this replaced was
 * a bare number box, and a Select whose value matches no item renders blank),
 * and that a custom figure typed per KG leaves here as one canonical per-ton
 * number — the whole reason the unit toggle can exist without anything
 * downstream knowing about it.
 *
 * The UI5 `Select` renders as a custom element in jsdom, so these drive the
 * component through its own props rather than through the popup: the parts
 * worth testing are the value mapping and the option list, not UI5's
 * rendering.
 */

afterEach(cleanup)

function setup(props: Partial<React.ComponentProps<typeof PricePerTonField>> = {}) {
  const onChange = vi.fn()
  const view = render(
    <PricePerTonField
      idPrefix="test"
      value={undefined}
      previousPrices={[2900, 3200]}
      seedKey="row-1"
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange, view }
}

describe('PricePerTonField', () => {
  it('offers the previously used prices alongside the two fixed choices', () => {
    setup()

    expect(screen.getByText('Not priced yet')).toBeTruthy()
    expect(screen.getByText('৳ 2,900 / Ton (previously used)')).toBeTruthy()
    expect(screen.getByText('৳ 3,200 / Ton (previously used)')).toBeTruthy()
    expect(screen.getByText('Custom price…')).toBeTruthy()
  })

  it('keeps a saved price in the list even when it is not one this product has used', () => {
    // The case an edit dialog hits: the entry was priced at 4,100 but this
    // product's prior prices are 2,900 and 3,200. Dropping it would blank the
    // field and quietly lose what was actually paid.
    setup({ value: 4100 })

    expect(screen.getByText('৳ 4,100 / Ton (previously used)')).toBeTruthy()
  })

  it('does not duplicate a saved price that is already in the list', () => {
    setup({ value: 2900 })

    expect(screen.getAllByText('৳ 2,900 / Ton (previously used)')).toHaveLength(1)
  })

  it('shows no custom inputs until a custom price is asked for', () => {
    setup({ value: 2900 })

    expect(screen.queryByLabelText(/Price \(৳/)).toBeNull()
  })
})

describe('PricePerTonField ids', () => {
  it('exposes stable ids so the create form and the edit dialog never collide', () => {
    cleanup()
    render(
      <PricePerTonField
        idPrefix="imp"
        value={undefined}
        previousPrices={[]}
        seedKey="a"
        onChange={vi.fn()}
      />,
    )
    expect(document.getElementById('imp-price-choice')).toBeTruthy()

    cleanup()
    render(
      <PricePerTonField
        idPrefix="edit-imp"
        value={undefined}
        previousPrices={[]}
        seedKey="b"
        onChange={vi.fn()}
      />,
    )
    expect(document.getElementById('edit-imp-price-choice')).toBeTruthy()
    expect(document.getElementById('imp-price-choice')).toBeNull()
  })
})
