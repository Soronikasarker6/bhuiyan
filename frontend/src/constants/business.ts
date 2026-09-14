/**
 * Who the business is, for anything that carries its identity outward.
 *
 * Kept here rather than typed into each place it appears so that a change of
 * owner, or a change of wording, is one edit and cannot leave one document
 * disagreeing with another. Printed reports and invoices are the reason it
 * exists: those leave the building, get filed, and are read by customers,
 * suppliers and auditors, so the name on them has to be right and identical
 * every time.
 */
export const BUSINESS = {
  /** Trading name, as it heads every printed document. */
  name: 'BHUIYAN INDUSTRY',
  /** What the business actually does — agro and limestone, not software. */
  tagline: 'Agro & Limestone Management System',
  /** The person answerable for the business, named on every document. */
  owner: 'Apon Bhuiyan',
  /** Credited in the footer, so a reader knows what produced the page. */
  system: 'Bhuiyan Industry Management System',
} as const
