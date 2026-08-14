import { WorldPoint, WorldRect, SnapResult, AlignmentGuide } from './types';

/**
 * Snaps a scalar value to grid increments.
 */
export function snapToGrid(val: number, gridSize: number): number {
  if (gridSize <= 0) return val;
  return Math.round(val / gridSize) * gridSize;
}

/**
 * Snaps a 2D world point to grid increments.
 */
export function snapPointToGrid(pt: WorldPoint, gridSize: number): WorldPoint {
  if (gridSize <= 0) return pt;
  return {
    x: snapToGrid(pt.x, gridSize),
    y: snapToGrid(pt.y, gridSize),
  };
}

/**
 * Smart Object-to-Object snapping:
 * Checks edges and center alignment of target rect against all static reference objects.
 * Returns snapped coordinates and temporary alignment guides for rendering.
 */
export function snapRectToObjects(
  target: WorldRect,
  otherObjects: WorldRect[],
  threshold: number = 8
): SnapResult {
  let bestX = target.x;
  let bestY = target.y;
  let snappedX = false;
  let snappedY = false;
  let minDiffX = threshold;
  let minDiffY = threshold;
  const guides: AlignmentGuide[] = [];

  const targetCenterX = target.x + target.width / 2;
  const targetRightX = target.x + target.width;

  const targetCenterY = target.y + target.height / 2;
  const targetBottomY = target.y + target.height;

  for (const other of otherObjects) {
    const otherCenterX = other.x + other.width / 2;
    const otherRightX = other.x + other.width;

    const otherCenterY = other.y + other.height / 2;
    const otherBottomY = other.y + other.height;

    // --- Horizontal (X) Snap Checks ---
    const xPairs = [
      { targetVal: target.x, otherVal: other.x, newTargetX: other.x, pos: other.x },
      { targetVal: target.x, otherVal: otherRightX, newTargetX: otherRightX, pos: otherRightX },
      { targetVal: targetRightX, otherVal: other.x, newTargetX: other.x - target.width, pos: other.x },
      { targetVal: targetRightX, otherVal: otherRightX, newTargetX: otherRightX - target.width, pos: otherRightX },
      { targetVal: targetCenterX, otherVal: otherCenterX, newTargetX: otherCenterX - target.width / 2, pos: otherCenterX },
    ];

    for (const p of xPairs) {
      const diff = Math.abs(p.targetVal - p.otherVal);
      if (diff < minDiffX) {
        minDiffX = diff;
        bestX = p.newTargetX;
        snappedX = true;
        guides.push({ type: 'vertical', position: p.pos });
      }
    }

    // --- Vertical (Y) Snap Checks ---
    const yPairs = [
      { targetVal: target.y, otherVal: other.y, newTargetY: other.y, pos: other.y },
      { targetVal: target.y, otherVal: otherBottomY, newTargetY: otherBottomY, pos: otherBottomY },
      { targetVal: targetBottomY, otherVal: other.y, newTargetY: other.y - target.height, pos: other.y },
      { targetVal: targetBottomY, otherVal: otherBottomY, newTargetY: otherBottomY - target.height, pos: otherBottomY },
      { targetVal: targetCenterY, otherVal: otherCenterY, newTargetY: otherCenterY - target.height / 2, pos: otherCenterY },
    ];

    for (const p of yPairs) {
      const diff = Math.abs(p.targetVal - p.otherVal);
      if (diff < minDiffY) {
        minDiffY = diff;
        bestY = p.newTargetY;
        snappedY = true;
        guides.push({ type: 'horizontal', position: p.pos });
      }
    }
  }

  return {
    x: Math.round(bestX),
    y: Math.round(bestY),
    snappedX,
    snappedY,
    guides,
  };
}
