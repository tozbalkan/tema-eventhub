import { WorldPoint, WorldRect } from '../geometry/types';

export function calculatePointsBoundingBox(points: WorldPoint[]): WorldRect {
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
}

export function constrainLineAngle(start: WorldPoint, current: WorldPoint): WorldPoint {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const angleRad = Math.atan2(dy, dx);
  let angleDeg = Math.round(angleRad * (180 / Math.PI));
  if (angleDeg < 0) angleDeg += 360;

  // Snap to nearest 45° increment (0, 45, 90, 135, 180, 225, 270, 315, 360)
  const snappedDeg = Math.round(angleDeg / 45) * 45;
  const dist = Math.hypot(dx, dy);

  const rad = (snappedDeg * Math.PI) / 180;
  return {
    x: Math.round(start.x + dist * Math.cos(rad)),
    y: Math.round(start.y + dist * Math.sin(rad)),
  };
}
