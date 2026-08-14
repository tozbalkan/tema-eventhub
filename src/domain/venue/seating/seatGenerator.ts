import { VenueSeat } from '../hierarchy/types';
import { RowConfig } from './types';
import { parseSeatPattern } from './patterns';

export function generateSeatsForRow(
  config: RowConfig,
  rowId: string,
  blockId: string,
  areaId: string,
  originX: number,
  originY: number
): VenueSeat[] {
  const {
    rowName,
    seatCount,
    seatSpacing,
    seatWidth,
    seatHeight,
    startNumber = 1,
    direction = 'ltr',
    pattern,
  } = config;

  const seats: VenueSeat[] = [];

  if (pattern) {
    const items = parseSeatPattern(
      { pattern, seatWidth, seatHeight, seatSpacing },
      startNumber
    );

    items.forEach((item, idx) => {
      if (item.type === 'seat') {
        const num = item.seatNumber!;
        const seatLabel = `${rowName}-${num.toString().padStart(2, '0')}`;
        const seatId = `seat_${blockId}_${rowName}_${num}_${idx}`;

        const xPos = direction === 'ltr' ? originX + item.xOffset : originX - item.xOffset;

        seats.push({
          id: seatId,
          name: seatLabel,
          type: 'seat',
          seatLabel,
          rowId,
          blockId,
          areaId,
          parentId: rowId,
          x: Math.round(xPos),
          y: Math.round(originY),
          width: seatWidth,
          height: seatHeight,
          rotation: 0,
          status: 'Available',
        });
      }
    });
  } else {
    for (let i = 0; i < seatCount; i++) {
      const num = direction === 'ltr' ? startNumber + i : startNumber + seatCount - 1 - i;
      const seatLabel = `${rowName}-${num.toString().padStart(2, '0')}`;
      const seatId = `seat_${blockId}_${rowName}_${num}_${i}`;

      const xPos = originX + i * (seatWidth + seatSpacing);

      seats.push({
        id: seatId,
        name: seatLabel,
        type: 'seat',
        seatLabel,
        rowId,
        blockId,
        areaId,
        parentId: rowId,
        x: Math.round(xPos),
        y: Math.round(originY),
        width: seatWidth,
        height: seatHeight,
        rotation: 0,
        status: 'Available',
      });
    }
  }

  return seats;
}
