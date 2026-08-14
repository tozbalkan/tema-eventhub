export type NumberingDirection = 'ltr' | 'rtl';

export interface SeatItem {
  type: 'seat' | 'gap';
  seatNumber?: number;
  seatLabel?: string;
  xOffset: number;
}

export interface PatternConfig {
  pattern: string; // e.g. "● ● _ ● ● ●" or "Seat x2, Gap, Seat x3"
  seatWidth: number;
  seatHeight: number;
  seatSpacing: number;
}

export interface RowConfig {
  rowName: string;
  seatCount: number;
  seatSpacing: number;
  seatWidth: number;
  seatHeight: number;
  rowSpacing?: number;
  startNumber?: number;
  direction?: NumberingDirection;
  pattern?: string;
}

export interface BlockConfig {
  blockName: string;
  areaId: string;
  rowCount: number;
  seatsPerRow: number;
  seatSpacing: number;
  rowSpacing: number;
  seatWidth: number;
  seatHeight: number;
  startingRow?: string;
  startingSeat?: number;
  direction?: NumberingDirection;
  originX: number;
  originY: number;
}
