import { WorldPoint } from '../geometry/types';
import { VenueNode } from '../hierarchy/types';

export type VenueShapeType =
  | 'rectangle'
  | 'roundedRectangle'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'path'
  | 'line'
  | 'text';

export interface VenueShapeNode extends VenueNode {
  shapeType: VenueShapeType;
  cornerRadius?: number;
  points?: WorldPoint[]; // For polygon & path
  text?: string; // For text labels
  fontSize?: number;
  fontWeight?: string;
  lineStart?: WorldPoint; // For line
  lineEnd?: WorldPoint; // For line
}
