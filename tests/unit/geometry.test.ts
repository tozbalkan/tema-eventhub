import { describe, it, expect } from 'vitest';
import {
  snapToGrid,
  snapPointToGrid,
  snapRectToObjects,
  getBoundingBox,
  intersectsRect,
  alignGeometries,
  calculateResize,
  calculateRotation,
  fitBoundsToViewBox,
  centerViewBoxOnPoint,
  normalizeDrawingRect,
  reorderZIndex,
  generateRulerTicks,
} from '@/domain/venue/geometry';
import { VenueGeometry } from '@/domain/venue/geometry/types';

describe('Venue Designer 3.0 Geometry Layer (Unit Tests)', () => {
  describe('Grid & Point Snapping', () => {
    it('snaps scalar value to grid increments', () => {
      expect(snapToGrid(17, 20)).toBe(20);
      expect(snapToGrid(23, 20)).toBe(20);
      expect(snapToGrid(31, 20)).toBe(40);
      expect(snapToGrid(14, 10)).toBe(10);
    });

    it('snaps 2D point to grid', () => {
      const point = { x: 18, y: 44 };
      const snapped = snapPointToGrid(point, 20);
      expect(snapped).toEqual({ x: 20, y: 40 });
    });
  });

  describe('Object-to-Object Smart Snapping', () => {
    it('snaps moving rectangle edge to stationary object edge when within threshold', () => {
      const moving = { x: 97, y: 50, width: 70, height: 50 };
      const staticObj = [{ x: 100, y: 200, width: 70, height: 50 }];

      const result = snapRectToObjects(moving, staticObj, 8);
      expect(result.snappedX).toBe(true);
      expect(result.x).toBe(100);
    });
  });

  describe('Bounding Box & Marquee Intersection', () => {
    it('calculates accurate outer bounding box for multiple venue geometries', () => {
      const items = [
        { x: 100, y: 100, width: 50, height: 50 },
        { x: 300, y: 200, width: 40, height: 60 },
      ];

      const bbox = getBoundingBox(items);
      expect(bbox.x).toBe(100);
      expect(bbox.y).toBe(100);
      expect(bbox.width).toBe(240); // 340 - 100
      expect(bbox.height).toBe(160); // 260 - 100
    });

    it('correctly tests rectangle intersection for marquee selection', () => {
      const boxA = { x: 50, y: 50, width: 100, height: 100 };
      const boxB = { x: 120, y: 120, width: 50, height: 50 };
      const boxC = { x: 200, y: 200, width: 50, height: 50 };

      expect(intersectsRect(boxA, boxB)).toBe(true);
      expect(intersectsRect(boxA, boxC)).toBe(false);
    });
  });

  describe('Alignment & Distribution Engine', () => {
    const assets: (VenueGeometry & { id: string })[] = [
      { id: 'a1', x: 100, y: 100, width: 60, height: 40, rotation: 0 },
      { id: 'a2', x: 200, y: 150, width: 60, height: 40, rotation: 0 },
      { id: 'a3', x: 300, y: 80, width: 60, height: 40, rotation: 0 },
    ];

    it('aligns selected geometries to left edge', () => {
      const aligned = alignGeometries(assets, assets, 'left');
      expect(aligned.find((a) => a.id === 'a1')?.x).toBe(100);
      expect(aligned.find((a) => a.id === 'a2')?.x).toBe(100);
      expect(aligned.find((a) => a.id === 'a3')?.x).toBe(100);
    });

    it('aligns selected geometries to top edge', () => {
      const aligned = alignGeometries(assets, assets, 'top');
      expect(aligned.find((a) => a.id === 'a1')?.y).toBe(80);
      expect(aligned.find((a) => a.id === 'a2')?.y).toBe(80);
      expect(aligned.find((a) => a.id === 'a3')?.y).toBe(80);
    });

    it('distributes geometries horizontally with equal spacing', () => {
      const aligned = alignGeometries(assets, assets, 'distHorizontal');
      const x1 = aligned.find((a) => a.id === 'a1')!.x;
      const x2 = aligned.find((a) => a.id === 'a2')!.x;
      const x3 = aligned.find((a) => a.id === 'a3')!.x;
      expect(x2 - x1).toBe(x3 - x2);
    });
  });

  describe('Resize & Rotation Math', () => {
    const initial: VenueGeometry = { x: 100, y: 100, width: 80, height: 60, rotation: 0 };

    it('resizes from SE corner handle correctly', () => {
      const resized = calculateResize('se', initial, { x: 20, y: 15 });
      expect(resized.width).toBe(100);
      expect(resized.height).toBe(75);
      expect(resized.x).toBe(100);
      expect(resized.y).toBe(100);
    });

    it('resizes from NW handle adjusting origin coordinates', () => {
      const resized = calculateResize('nw', initial, { x: -10, y: -10 });
      expect(resized.width).toBe(90);
      expect(resized.height).toBe(70);
      expect(resized.x).toBe(90);
      expect(resized.y).toBe(90);
    });

    it('snaps rotation angle to 15-degree increments when requested', () => {
      const center = { x: 100, y: 100 };
      // 45 degrees relative to top
      const angleUnsnapped = calculateRotation(center, { x: 150, y: 50 }, false);
      const angleSnapped = calculateRotation(center, { x: 150, y: 50 }, true);

      expect(angleSnapped % 15).toBe(0);
    });
  });

  describe('ViewBox & Transforms', () => {
    it('fits bounding box with padding to ViewBox', () => {
      const bbox = { x: 100, y: 200, width: 400, height: 300 };
      const vb = fitBoundsToViewBox(bbox, 50);

      expect(vb.x).toBe(50);
      expect(vb.y).toBe(150);
      expect(vb.w).toBe(500);
      expect(vb.h).toBe(400);
    });

    it('centers ViewBox on point', () => {
      const point = { x: 500, y: 400 };
      const vb = centerViewBoxOnPoint(point, 640, 340);

      expect(vb.x).toBe(180); // 500 - 320
      expect(vb.y).toBe(230); // 400 - 170
      expect(vb.w).toBe(640);
      expect(vb.h).toBe(340);
    });
  });

  describe('Drawing & Negative Drag Normalization', () => {
    it('normalizes drag coordinates when dragging towards top-left', () => {
      const origin = { x: 300, y: 300 };
      const current = { x: 200, y: 150 };
      const rect = normalizeDrawingRect(origin, current, 10);

      expect(rect.x).toBe(200);
      expect(rect.y).toBe(150);
      expect(rect.width).toBe(100);
      expect(rect.height).toBe(150);
    });

    it('enforces minimum object dimensions when drawing tiny rectangles', () => {
      const origin = { x: 100, y: 100 };
      const current = { x: 102, y: 103 };
      const rect = normalizeDrawingRect(origin, current, 20);

      expect(rect.width).toBe(20);
      expect(rect.height).toBe(20);
    });
  });

  describe('Z-Order Scene Reordering', () => {
    const items = [
      { id: 'item_1' },
      { id: 'item_2' },
      { id: 'item_3' },
      { id: 'item_4' },
    ];

    it('brings selected object to front of rendering list', () => {
      const reordered = reorderZIndex(items, ['item_2'], 'front');
      expect(reordered.map((i) => i.id)).toEqual(['item_1', 'item_3', 'item_4', 'item_2']);
    });

    it('sends selected object to back of rendering list', () => {
      const reordered = reorderZIndex(items, ['item_3'], 'back');
      expect(reordered.map((i) => i.id)).toEqual(['item_3', 'item_1', 'item_2', 'item_4']);
    });

    it('moves selected object forward one step', () => {
      const reordered = reorderZIndex(items, ['item_2'], 'forward');
      expect(reordered.map((i) => i.id)).toEqual(['item_1', 'item_3', 'item_2', 'item_4']);
    });

    it('moves selected object backward one step', () => {
      const reordered = reorderZIndex(items, ['item_3'], 'backward');
      expect(reordered.map((i) => i.id)).toEqual(['item_1', 'item_3', 'item_2', 'item_4']);
    });
  });

  describe('Ruler Coordinate Tick Generation', () => {
    it('generates ticks at step increments across view bounds', () => {
      const ticks = generateRulerTicks(0, 300, 100);
      expect(ticks.length).toBe(4);
      expect(ticks.map((t) => t.position)).toEqual([0, 100, 200, 300]);
      expect(ticks[0]!.isMajor).toBe(true);
    });
  });
});
