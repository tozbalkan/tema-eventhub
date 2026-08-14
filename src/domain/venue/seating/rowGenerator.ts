import { VenueRow, VenueSeat } from '../hierarchy/types';
import { RowConfig } from './types';
import { generateSeatsForRow } from './seatGenerator';

export function generateRowsAndSeats(
  rowConfigs: RowConfig[],
  blockId: string,
  areaId: string,
  originX: number,
  originY: number
): { rows: VenueRow[]; seats: VenueSeat[] } {
  const rows: VenueRow[] = [];
  const seats: VenueSeat[] = [];

  let currentY = originY;

  rowConfigs.forEach((cfg) => {
    const rowId = `row_${blockId}_${cfg.rowName}`;

    const generatedSeats = generateSeatsForRow(
      cfg,
      rowId,
      blockId,
      areaId,
      originX,
      currentY
    );

    const rowWidth = generatedSeats.length > 0
      ? Math.max(...generatedSeats.map((s) => s.x + s.width)) - Math.min(...generatedSeats.map((s) => s.x))
      : cfg.seatCount * (cfg.seatWidth + cfg.seatSpacing);

    rows.push({
      id: rowId,
      name: `Row ${cfg.rowName}`,
      type: 'row',
      rowName: cfg.rowName,
      blockId,
      areaId,
      parentId: blockId,
      seatCount: generatedSeats.length,
      seatSpacing: cfg.seatSpacing,
      x: originX,
      y: currentY,
      width: Math.round(rowWidth),
      height: cfg.seatHeight,
    });

    seats.push(...generatedSeats);
    currentY += cfg.seatHeight + (cfg.rowSpacing ?? 10);
  });

  return { rows, seats };
}
