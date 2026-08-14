import { WorldPoint, WorldRect } from './types';

/**
 * Normalizes a click-and-drag drawing rectangle so that width and height are strictly positive,
 * supporting negative drag directions and enforcing minimum object size.
 */
export function normalizeDrawingRect(
  origin: WorldPoint,
  current: WorldPoint,
  minSize: number = 10
): WorldRect {
  let x = Math.min(origin.x, current.x);
  let y = Math.min(origin.y, current.y);
  let width = Math.abs(current.x - origin.x);
  let height = Math.abs(current.y - origin.y);

  if (width < minSize) width = minSize;
  if (height < minSize) height = minSize;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}
