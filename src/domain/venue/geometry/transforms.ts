import { WorldPoint, WorldRect, ViewBox } from './types';

/**
 * Converts screen pixel coordinates to SVG world coordinates.
 */
export function screenToWorld(svg: SVGSVGElement, screenX: number, screenY: number): WorldPoint {
  const pt = svg.createSVGPoint();
  pt.x = screenX;
  pt.y = screenY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  const svgPt = pt.matrixTransform(inv);
  return { x: svgPt.x, y: svgPt.y };
}

/**
 * Converts SVG world coordinates to screen pixel coordinates.
 */
export function worldToScreen(svg: SVGSVGElement, worldX: number, worldY: number): WorldPoint {
  const pt = svg.createSVGPoint();
  pt.x = worldX;
  pt.y = worldY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const screenPt = pt.matrixTransform(ctm);
  return { x: screenPt.x, y: screenPt.y };
}

/**
 * Computes a new ViewBox zoomed around a specific cursor position.
 * Keeps the world point under the cursor visually fixed.
 */
export function zoomAroundPoint(
  currentViewBox: ViewBox,
  cursorScreenPt: WorldPoint,
  svg: SVGSVGElement,
  zoomFactor: number, // < 1 to zoom in, > 1 to zoom out
  minWidth: number = 100,
  maxWidth: number = 4000
): ViewBox {
  const cursorWorld = screenToWorld(svg, cursorScreenPt.x, cursorScreenPt.y);

  let newW = currentViewBox.w * zoomFactor;
  let newH = currentViewBox.h * zoomFactor;

  if (newW < minWidth) {
    newW = minWidth;
    newH = minWidth * (currentViewBox.h / currentViewBox.w);
  } else if (newW > maxWidth) {
    newW = maxWidth;
    newH = maxWidth * (currentViewBox.h / currentViewBox.w);
  }

  // Calculate new origin (x, y) so cursorWorld stays at the same relative viewport position
  const ctm = svg.getScreenCTM();
  const rect = svg.getBoundingClientRect();
  const relX = rect.width > 0 ? (cursorScreenPt.x - rect.left) / rect.width : 0.5;
  const relY = rect.height > 0 ? (cursorScreenPt.y - rect.top) / rect.height : 0.5;

  const newX = cursorWorld.x - relX * newW;
  const newY = cursorWorld.y - relY * newH;

  return {
    x: Math.round(newX * 100) / 100,
    y: Math.round(newY * 100) / 100,
    w: Math.round(newW * 100) / 100,
    h: Math.round(newH * 100) / 100,
  };
}

/**
 * Calculates a ViewBox that tightly fits all target objects with padding.
 */
export function fitBoundsToViewBox(bounds: WorldRect, padding: number = 40): ViewBox {
  const w = Math.max(bounds.width + padding * 2, 200);
  const h = Math.max(bounds.height + padding * 2, 120);
  const x = bounds.x - padding;
  const y = bounds.y - padding;

  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/**
 * Centers ViewBox on a world coordinate.
 */
export function centerViewBoxOnPoint(point: WorldPoint, currentW: number, currentH: number): ViewBox {
  return {
    x: Math.round(point.x - currentW / 2),
    y: Math.round(point.y - currentH / 2),
    w: currentW,
    h: currentH,
  };
}
