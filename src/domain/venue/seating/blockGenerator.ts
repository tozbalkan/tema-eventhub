import { VenueBlock, VenueRow, VenueSeat } from '../hierarchy/types';
import { BlockConfig, RowConfig } from './types';
import { generateRowsAndSeats } from './rowGenerator';

export function generateBlockHierarchy(config: BlockConfig): {
  block: VenueBlock;
  rows: VenueRow[];
  seats: VenueSeat[];
} {
  const {
    blockName,
    areaId,
    rowCount,
    seatsPerRow,
    seatSpacing,
    rowSpacing,
    seatWidth,
    seatHeight,
    startingRow = 'A',
    startingSeat = 1,
    direction = 'ltr',
    originX,
    originY,
  } = config;

  const blockId = `block_${areaId}_${blockName.replace(/\s+/g, '_')}_${Date.now()}`;

  const rowConfigs: RowConfig[] = [];
  const startCharCode = startingRow.charCodeAt(0);

  for (let i = 0; i < rowCount; i++) {
    const rName = String.fromCharCode(startCharCode + i);
    rowConfigs.push({
      rowName: rName,
      seatCount: seatsPerRow,
      seatSpacing,
      seatWidth,
      seatHeight,
      startNumber: startingSeat,
      rowSpacing,
      direction,
    });
  }

  const { rows, seats } = generateRowsAndSeats(
    rowConfigs,
    blockId,
    areaId,
    originX,
    originY + 30 // 30 units below block label
  );

  const blockWidth = Math.max(
    200,
    seatsPerRow * (seatWidth + seatSpacing) + 40
  );
  const blockHeight = Math.max(
    100,
    rowCount * (seatHeight + rowSpacing) + 50
  );

  const block: VenueBlock = {
    id: blockId,
    name: blockName,
    type: 'block',
    blockName,
    areaId,
    parentId: areaId,
    rowCount,
    totalCapacity: seats.length,
    x: originX - 20,
    y: originY,
    width: Math.round(blockWidth),
    height: Math.round(blockHeight),
  };

  return { block, rows, seats };
}
