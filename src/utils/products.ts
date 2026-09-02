import type { ID, MeshSize, Product } from '@/types'

/**
 * Products and mesh sizes.
 *
 * Both are plain configurable lists — nothing downstream hard-codes a product
 * name or a mesh size. Retiring one (`active: false`) removes it from entry
 * forms while every past record that references its id keeps showing its
 * name, exactly like the cash ledger's accounts and categories.
 */

export function activeProducts(products: Product[]): Product[] {
  return products.filter((p) => p.active)
}

export function activeMeshSizes(meshSizes: MeshSize[]): MeshSize[] {
  return meshSizes.filter((m) => m.active)
}

export function productNameOf(products: Product[], productId: ID): string {
  return products.find((p) => p.id === productId)?.name ?? 'Unknown product'
}

export function productOf(products: Product[], productId: ID): Product | undefined {
  return products.find((p) => p.id === productId)
}

export function meshSizeNameOf(meshSizes: MeshSize[], meshSizeId: ID): string {
  return meshSizes.find((m) => m.id === meshSizeId)?.name ?? 'Unknown mesh'
}

export function meshSizeOf(meshSizes: MeshSize[], meshSizeId: ID): MeshSize | undefined {
  return meshSizes.find((m) => m.id === meshSizeId)
}

/** kg per bag for a mesh size — the one fact Production and Sales both convert through. */
export function bagKgOf(meshSizes: MeshSize[], meshSizeId: ID): number {
  return meshSizes.find((m) => m.id === meshSizeId)?.bagKg ?? 0
}

export function usageCountByProduct<T extends { productId: ID }>(
  rows: T[],
  productId: ID,
): number {
  return rows.filter((r) => r.productId === productId).length
}
