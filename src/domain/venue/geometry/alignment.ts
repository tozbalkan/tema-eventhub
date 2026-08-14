import { VenueGeometry, WorldRect, AlignmentType } from './types';

/**
 * Calculates outer bounding box surrounding a list of venue geometries.
 */
export function getBoundingBox(objects: { x: number; y: number; width: number; height: number }[]): WorldRect {
  if (!objects || objects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    if (obj.x < minX) minX = obj.x;
    if (obj.y < minY) minY = obj.y;
    if (obj.x + obj.width > maxX) maxX = obj.x + obj.width;
    if (obj.y + obj.height > maxY) maxY = obj.y + obj.height;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Tests whether rectangle A intersects with rectangle B.
 * Used for marquee / box drag selection in world coordinates.
 */
export function intersectsRect(rectA: WorldRect, rectB: WorldRect): boolean {
  return !(
    rectA.x + rectA.width < rectB.x ||
    rectB.x + rectB.width < rectA.x ||
    rectA.y + rectA.height < rectB.y ||
    rectB.y + rectB.height < rectA.y
  );
}

/**
 * Aligns or distributes a set of venue geometries in world coordinates.
 */
export function alignGeometries<T extends VenueGeometry>(
  selectedObjects: T[],
  allObjects: T[],
  alignment: AlignmentType
): T[] {
  if (selectedObjects.length < 2) return allObjects;

  const bounds = getBoundingBox(selectedObjects);
  const selectedIds = new Set(selectedObjects.map((o) => (o as any).id));

  const avgWidth = Math.round(selectedObjects.reduce((s, o) => s + o.width, 0) / selectedObjects.length);
  const avgHeight = Math.round(selectedObjects.reduce((s, o) => s + o.height, 0) / selectedObjects.length);

  let updatedMap = new Map<string, VenueGeometry>();

  for (const obj of selectedObjects) {
    let next: VenueGeometry = { ...obj };

    switch (alignment) {
      case 'left':
        next.x = bounds.x;
        break;
      case 'center':
        next.x = Math.round(bounds.x + bounds.width / 2 - obj.width / 2);
        break;
      case 'right':
        next.x = Math.round(bounds.x + bounds.width - obj.width);
        break;
      case 'top':
        next.y = bounds.y;
        break;
      case 'middle':
        next.y = Math.round(bounds.y + bounds.height / 2 - obj.height / 2);
        break;
      case 'bottom':
        next.y = Math.round(bounds.y + bounds.height - obj.height);
        break;
      case 'matchWidth':
        next.width = avgWidth;
        break;
      case 'matchHeight':
        next.height = avgHeight;
        break;
      case 'matchSize':
        next.width = avgWidth;
        next.height = avgHeight;
        break;
    }

    updatedMap.set((obj as any).id, next);
  }

  // Distribution logic
  if (alignment === 'distHorizontal' && selectedObjects.length >= 3) {
    const sorted = [...selectedObjects].sort((a, b) => a.x - b.x);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const totalDist = last.x + last.width - first.x - sorted.reduce((s, o) => s + o.width, 0);
    const step = totalDist / (sorted.length - 1);
    let currX = first.x;

    for (const item of sorted) {
      const existing = updatedMap.get((item as any).id) || { ...item };
      existing.x = Math.round(currX);
      updatedMap.set((item as any).id, existing);
      currX += item.width + step;
    }
  }

  if (alignment === 'distVertical' && selectedObjects.length >= 3) {
    const sorted = [...selectedObjects].sort((a, b) => a.y - b.y);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const totalDist = last.y + last.height - first.y - sorted.reduce((s, o) => s + o.height, 0);
    const step = totalDist / (sorted.length - 1);
    let currY = first.y;

    for (const item of sorted) {
      const existing = updatedMap.get((item as any).id) || { ...item };
      existing.y = Math.round(currY);
      updatedMap.set((item as any).id, existing);
      currY += item.height + step;
    }
  }

  return allObjects.map((obj) => {
    const id = (obj as any).id;
    if (selectedIds.has(id) && updatedMap.has(id)) {
      return { ...obj, ...updatedMap.get(id)! };
    }
    return obj;
  });
}
