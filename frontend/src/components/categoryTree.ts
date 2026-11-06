export type CategoryNode = { id: number; name: string; slug?: string; parent_id?: number | null }

/** Flattens the category tree in display order, indenting each level for a native select. */
export function categoryTreeOptions<T extends CategoryNode>(categories: T[]): Array<T & { label: string }> {
  const walk = (parentId: number | null, depth: number): Array<T & { label: string }> => categories
    .filter((category) => (category.parent_id ?? null) === parentId)
    .flatMap((category) => [{ ...category, label: `${'\u00A0\u00A0\u00A0'.repeat(depth)}${category.name}` }, ...walk(category.id, depth + 1)])
  return walk(null, 0)
}

/** Path from the top-level category down to the given one. */
export function categoryPath<T extends CategoryNode>(categories: T[], id: number): T[] {
  const path: T[] = []
  let current = categories.find((category) => category.id === id)
  while (current) {
    path.unshift(current)
    const parentId = current.parent_id ?? null
    current = parentId === null ? undefined : categories.find((category) => category.id === parentId)
  }
  return path
}
