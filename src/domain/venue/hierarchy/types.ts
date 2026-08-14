export type VenueNodeType = 'area' | 'block' | 'row' | 'seat';

export interface VenueNode {
  id: string;
  name: string;
  type: VenueNodeType;
  parentId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  locked?: boolean;
  visible?: boolean;
  metadata?: Record<string, any>;
}

export interface VenueSeat extends VenueNode {
  type: 'seat';
  seatLabel: string;
  rowId: string;
  blockId: string;
  areaId: string;
  status: 'Available' | 'Reserved' | 'Sold' | 'Blocked';
  price?: number;
}

export interface VenueRow extends VenueNode {
  type: 'row';
  rowName: string;
  blockId: string;
  areaId: string;
  seatCount: number;
  seatSpacing: number;
}

export interface VenueBlock extends VenueNode {
  type: 'block';
  blockName: string;
  areaId: string;
  rowCount: number;
  totalCapacity: number;
}

export interface VenueArea extends VenueNode {
  type: 'area';
  areaName: string;
  blockCount: number;
  totalCapacity: number;
}
