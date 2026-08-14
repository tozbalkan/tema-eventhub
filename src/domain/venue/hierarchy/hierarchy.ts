import { VenueNode, VenueSeat } from './types';

export function getChildren(nodes: VenueNode[], parentId: string): VenueNode[] {
  return nodes.filter((node) => node.parentId === parentId);
}

export function getParent(nodes: VenueNode[], childId: string): VenueNode | undefined {
  const child = nodes.find((node) => node.id === childId);
  if (!child || !child.parentId) return undefined;
  return nodes.find((node) => node.id === child.parentId);
}

export function getAncestors(nodes: VenueNode[], childId: string): VenueNode[] {
  const ancestors: VenueNode[] = [];
  let current = getParent(nodes, childId);

  while (current) {
    ancestors.push(current);
    current = getParent(nodes, current.id);
  }

  return ancestors;
}

export function collectLeafSeats(nodes: VenueNode[], rootId: string): VenueSeat[] {
  const root = nodes.find((node) => node.id === rootId);
  if (!root) return [];

  if (root.type === 'seat') return [root as VenueSeat];

  const seats: VenueSeat[] = [];
  const stack = getChildren(nodes, rootId);

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.type === 'seat') {
      seats.push(current as VenueSeat);
    } else {
      const children = getChildren(nodes, current.id);
      stack.push(...children);
    }
  }

  return seats;
}

export function calculateHierarchyCapacity(nodes: VenueNode[], rootId: string): number {
  return collectLeafSeats(nodes, rootId).length;
}
