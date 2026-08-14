import { describe, it, expect } from 'vitest';
import {
  VenueArea,
  VenueBlock,
  VenueRow,
  VenueSeat,
  getChildren,
  getParent,
  getAncestors,
  collectLeafSeats,
  calculateHierarchyCapacity,
  parseSeatPattern,
  generateSeatsForRow,
  generateRowsAndSeats,
  generateBlockHierarchy,
  duplicateBlockHierarchy,
  calculateLodVisibility,
} from '../../src/domain/venue/geometry';

describe('Venue Hierarchy & Seating Engine (Designer 4.0)', () => {
  it('constructs hierarchy tree (Area -> Block -> Row -> Seat) and traverses correctly', () => {
    const area: VenueArea = {
      id: 'area_1',
      name: 'Main Hall',
      type: 'area',
      areaName: 'Main Hall',
      blockCount: 1,
      totalCapacity: 2,
      x: 0, y: 0, width: 500, height: 400,
    };

    const block: VenueBlock = {
      id: 'block_1',
      name: 'VIP A',
      type: 'block',
      blockName: 'VIP A',
      areaId: 'area_1',
      parentId: 'area_1',
      rowCount: 1,
      totalCapacity: 2,
      x: 20, y: 20, width: 200, height: 100,
    };

    const row: VenueRow = {
      id: 'row_1',
      name: 'Row A',
      type: 'row',
      rowName: 'A',
      blockId: 'block_1',
      areaId: 'area_1',
      parentId: 'block_1',
      seatCount: 2,
      seatSpacing: 10,
      x: 30, y: 50, width: 100, height: 20,
    };

    const seat1: VenueSeat = {
      id: 'seat_1',
      name: 'A-01',
      type: 'seat',
      seatLabel: 'A-01',
      rowId: 'row_1',
      blockId: 'block_1',
      areaId: 'area_1',
      parentId: 'row_1',
      status: 'Available',
      x: 30, y: 50, width: 20, height: 20,
    };

    const seat2: VenueSeat = {
      id: 'seat_2',
      name: 'A-02',
      type: 'seat',
      seatLabel: 'A-02',
      rowId: 'row_1',
      blockId: 'block_1',
      areaId: 'area_1',
      parentId: 'row_1',
      status: 'Available',
      x: 60, y: 50, width: 20, height: 20,
    };

    const nodes = [area, block, row, seat1, seat2];

    expect(getChildren(nodes, 'area_1')).toHaveLength(1);
    expect(getChildren(nodes, 'block_1')).toHaveLength(1);
    expect(getChildren(nodes, 'row_1')).toHaveLength(2);

    expect(getParent(nodes, 'seat_1')?.id).toBe('row_1');
    expect(getAncestors(nodes, 'seat_1').map((a) => a.id)).toEqual(['row_1', 'block_1', 'area_1']);

    expect(collectLeafSeats(nodes, 'area_1')).toHaveLength(2);
    expect(calculateHierarchyCapacity(nodes, 'area_1')).toBe(2);
  });

  it('parses "Seat / Gap / Seat" pattern strings correctly', () => {
    const symbolicItems = parseSeatPattern({
      pattern: '● ● _ ● ● ● _ ● ●',
      seatWidth: 20,
      seatHeight: 20,
      seatSpacing: 5,
    });

    // 2 seats + 1 gap + 3 seats + 1 gap + 2 seats = 7 seats total
    expect(symbolicItems.filter((i) => i.type === 'seat')).toHaveLength(7);
    expect(symbolicItems.filter((i) => i.type === 'gap')).toHaveLength(2);

    const tokenizedItems = parseSeatPattern({
      pattern: 'Seat x2, Gap, Seat x3, Gap, Seat x2',
      seatWidth: 20,
      seatHeight: 20,
      seatSpacing: 5,
    });

    expect(tokenizedItems.filter((i) => i.type === 'seat')).toHaveLength(7);
    expect(tokenizedItems.filter((i) => i.type === 'gap')).toHaveLength(2);
  });

  it('generates individual seats along a row with labels and coordinates', () => {
    const seats = generateSeatsForRow(
      {
        rowName: 'B',
        seatCount: 5,
        seatSpacing: 10,
        seatWidth: 20,
        seatHeight: 20,
        startNumber: 1,
      },
      'row_b',
      'block_1',
      'area_1',
      100,
      200
    );

    expect(seats).toHaveLength(5);
    expect(seats[0]!.seatLabel).toBe('B-01');
    expect(seats[0]!.x).toBe(100);
    expect(seats[1]!.seatLabel).toBe('B-02');
    expect(seats[1]!.x).toBe(130); // 100 + 1 * (20 + 10)
  });

  it('generates multi-row layouts (Row A, Row B...) with row spacing', () => {
    const { rows, seats } = generateRowsAndSeats(
      [
        { rowName: 'A', seatCount: 4, seatSpacing: 10, seatWidth: 20, seatHeight: 20, rowSpacing: 15 },
        { rowName: 'B', seatCount: 4, seatSpacing: 10, seatWidth: 20, seatHeight: 20, rowSpacing: 15 },
      ],
      'block_1',
      'area_1',
      50,
      50
    );

    expect(rows).toHaveLength(2);
    expect(seats).toHaveLength(8);
    expect(rows[0]!.y).toBe(50);
    expect(rows[1]!.y).toBe(85); // 50 + 20 + 15
  });

  it('generates complete Block hierarchy (8 rows x 20 seats = 160 total capacity)', () => {
    const { block, rows, seats } = generateBlockHierarchy({
      blockName: 'VIP Stand A',
      areaId: 'area_main',
      rowCount: 8,
      seatsPerRow: 20,
      seatSpacing: 5,
      rowSpacing: 10,
      seatWidth: 15,
      seatHeight: 15,
      startingRow: 'A',
      startingSeat: 1,
      originX: 100,
      originY: 100,
    });

    expect(block.totalCapacity).toBe(160);
    expect(rows).toHaveLength(8);
    expect(seats).toHaveLength(160);
    expect(block.blockName).toBe('VIP Stand A');
  });

  it('duplicates Block hierarchy remapping IDs and regenerating labels (VIP A -> VIP B)', () => {
    const { block, rows, seats } = generateBlockHierarchy({
      blockName: 'VIP A',
      areaId: 'area_main',
      rowCount: 2,
      seatsPerRow: 5,
      seatSpacing: 5,
      rowSpacing: 10,
      seatWidth: 15,
      seatHeight: 15,
      originX: 100,
      originY: 100,
    });

    const origNodes = [block, ...rows, ...seats];
    const duplicatedNodes = duplicateBlockHierarchy(origNodes, block.id, 'VIP B', 50, 50);

    expect(duplicatedNodes.length).toBe(origNodes.length);

    const dupBlock = duplicatedNodes.find((n) => n.type === 'block') as VenueBlock;
    expect(dupBlock.name).toBe('VIP B');
    expect(dupBlock.id).not.toBe(block.id);

    const dupSeats = duplicatedNodes.filter((n) => n.type === 'seat') as VenueSeat[];
    expect(dupSeats[0]!.seatLabel).toBe('A-01');
    expect(dupSeats[0]!.blockId).toBe(dupBlock.id);
  });

  it('calculates Level-of-Detail (LOD) visibility levels correctly based on zoom', () => {
    // Zoom out (< 40% zoom -> defaultWidth 640 / viewBox 2000 = 32% zoom)
    const lodOut = calculateLodVisibility(2000, 640);
    expect(lodOut.level).toBe('overview');
    expect(lodOut.showBlocks).toBe(true);
    expect(lodOut.showSeats).toBe(false);

    // Medium zoom (50% zoom -> 640 / 1280 = 50%)
    const lodMed = calculateLodVisibility(1280, 640);
    expect(lodMed.level).toBe('medium');
    expect(lodMed.showRows).toBe(true);
    expect(lodMed.showSeats).toBe(false);

    // High zoom (100% zoom -> 640 / 640 = 100%)
    const lodHigh = calculateLodVisibility(640, 640);
    expect(lodHigh.level).toBe('detailed');
    expect(lodHigh.showSeats).toBe(true);
    expect(lodHigh.showSeatLabels).toBe(false);

    // Micro zoom (> 150% zoom -> 640 / 300 = 213%)
    const lodMicro = calculateLodVisibility(300, 640);
    expect(lodMicro.level).toBe('micro');
    expect(lodMicro.showSeatLabels).toBe(true);
  });
});
