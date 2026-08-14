export interface WorldPoint {
  x: number;
  y: number;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VenueGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AlignmentType =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distHorizontal'
  | 'distVertical'
  | 'matchWidth'
  | 'matchHeight'
  | 'matchSize';

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
  guides: AlignmentGuide[];
}
