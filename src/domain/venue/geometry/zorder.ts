/**
 * Pure Z-order reordering utility for scene objects.
 * Supports: 'front' | 'forward' | 'backward' | 'back'
 */
export function reorderZIndex<T extends { id: string }>(
  items: T[],
  targetIds: string[],
  action: 'front' | 'forward' | 'backward' | 'back'
): T[] {
  if (!items || items.length < 2 || !targetIds || targetIds.length === 0) return items;

  const targetSet = new Set(targetIds);
  const result = [...items];

  if (action === 'front') {
    const selected = result.filter((item) => targetSet.has(item.id));
    const remaining = result.filter((item) => !targetSet.has(item.id));
    return [...remaining, ...selected];
  }

  if (action === 'back') {
    const selected = result.filter((item) => targetSet.has(item.id));
    const remaining = result.filter((item) => !targetSet.has(item.id));
    return [...selected, ...remaining];
  }

  if (action === 'forward') {
    for (let i = result.length - 2; i >= 0; i--) {
      if (targetSet.has(result[i]!.id) && !targetSet.has(result[i + 1]!.id)) {
        const temp = result[i]!;
        result[i] = result[i + 1]!;
        result[i + 1] = temp;
      }
    }
    return result;
  }

  if (action === 'backward') {
    for (let i = 1; i < result.length; i++) {
      if (targetSet.has(result[i]!.id) && !targetSet.has(result[i - 1]!.id)) {
        const temp = result[i]!;
        result[i] = result[i - 1]!;
        result[i - 1] = temp;
      }
    }
    return result;
  }

  return items;
}
