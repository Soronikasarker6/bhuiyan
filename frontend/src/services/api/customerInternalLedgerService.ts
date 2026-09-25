import type {
  InternalLedgerEntryInput,
  InternalLedgerOpening,
  InternalLedgerQuery,
  InternalLedgerResponse,
} from '@/types'
import { http } from './httpClient'
import { mapEntity, toQuery } from './mappers'

/**
 * The Admin-only private bookkeeping ledger API.
 *
 * Nothing here goes through `/app-data`: this ledger is not part of the
 * application's shared working data, so a Manager's browser never receives a
 * row of it. Nothing is cached in localStorage either — the rows live only as
 * long as the screen is open, the same way the Audit History's do.
 *
 * Every call is refused server-side for anyone without
 * CUSTOMER_INTERNAL_LEDGER_VIEW, which only Admin holds.
 */

const BASE = '/customer-internal-ledger'

function body(data: InternalLedgerEntryInput, expectedUpdatedAt?: string) {
  return {
    customer_id: data.customerId,
    date: data.date,
    details: data.details,
    reference: data.reference,
    // Sent as 0 rather than omitted so clearing one side of an edited entry
    // actually clears it, instead of the old amount being left in place.
    debit: data.debit ?? 0,
    credit: data.credit ?? 0,
    reason: data.reason,
    expected_updated_at: expectedUpdatedAt,
  }
}

export const customerInternalLedgerService = {
  async list(query: InternalLedgerQuery = {}): Promise<InternalLedgerResponse> {
    const qs = toQuery({
      customer_id: query.customerId,
      from: query.from,
      to: query.to,
      type: query.type,
      search: query.search,
    })

    return mapEntity<InternalLedgerResponse>(await http.get(`${BASE}${qs}`))
  },

  create(data: InternalLedgerEntryInput): Promise<unknown> {
    return http.post(BASE, body(data))
  },

  update(id: string, data: InternalLedgerEntryInput, expectedUpdatedAt?: string): Promise<unknown> {
    return http.put(`${BASE}/entries/${id}`, body(data, expectedUpdatedAt))
  },

  /** `reason` travels with the delete, so it lands on the one audit event rather than a second request. */
  remove(id: string, reason?: string): Promise<void> {
    return http.delete(`${BASE}/entries/${id}`, reason ? { reason } : undefined)
  },

  /** A party's opening balance — a starting position, not an entry. Signed: positive means they owe us. */
  async setOpening(
    customerId: string,
    data: { openingBalance: number; asOf?: string; notes?: string },
  ): Promise<InternalLedgerOpening> {
    return mapEntity<InternalLedgerOpening>(
      await http.put(`${BASE}/openings/${customerId}`, {
        opening_balance: data.openingBalance,
        as_of: data.asOf,
        notes: data.notes,
      }),
    )
  },
}
