import { VenueNode } from './types';
import { getChildren, getParent, collectLeafSeats } from './hierarchy';

export function selectChildren(nodes: VenueNode[], rootId: string): string[] {
  const children = getChildren(nodes, rootId);
  return children.map((c) => c.id);
}

export function selectParent(nodes: VenueNode[], childId: string): string | undefined {
  const parent = getParent(nodes, childId);
  return parent?.id;
}

export function selectBlockSeats(nodes: VenueNode[], blockId: string): string[] {
  return collectLeafSeats(nodes, blockId).map((s) => s.id);
}

export function selectAreaSeats(nodes: VenueNode[], areaId: string): string[] {
  return collectLeafSeats(nodes, areaId).map((s) => s.id);
}
