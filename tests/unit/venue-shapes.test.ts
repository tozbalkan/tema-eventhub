import { describe, it, expect } from 'vitest';
import { calculatePointsBoundingBox, constrainLineAngle } from '../../src/domain/venue/geometry';

describe('Venue Vector Shapes System (Designer 4.0)', () => {
  it('calculates polygon/path bounding box from points correctly', () => {
    const points = [
      { x: 10, y: 20 },
      { x: 150, y: 30 },
      { x: 120, y: 200 },
      { x: 5, y: 180 },
    ];

    const bbox = calculatePointsBoundingBox(points);
    expect(bbox.x).toBe(5);
    expect(bbox.y).toBe(20);
    expect(bbox.width).toBe(145); // 150 - 5
    expect(bbox.height).toBe(180); // 200 - 20
  });

  it('constrains line angle to 45 degree increments when shift key is held', () => {
    const start = { x: 0, y: 0 };
    
    // Near 45 degrees
    const pt45 = constrainLineAngle(start, { x: 100, y: 95 });
    expect(Math.abs(pt45.x - pt45.y)).toBeLessThan(2);

    // Near horizontal (0 degrees)
    const ptHoriz = constrainLineAngle(start, { x: 100, y: 10 });
    expect(ptHoriz.y).toBe(0);

    // Near vertical (90 degrees)
    const ptVert = constrainLineAngle(start, { x: 5, y: 100 });
    expect(ptVert.x).toBe(0);
  });
});
