import { VenueNode, VenueSeat, VenueRow, VenueBlock } from '../hierarchy/types';
import { getChildren } from '../hierarchy/hierarchy';

export function duplicateBlockHierarchy(
  nodes: VenueNode[],
  blockId: string,
  newBlockName: string,
  offsetX: number = 40,
  offsetY: number = 40
): VenueNode[] {
  const block = nodes.find((n) => n.id === blockId && n.type === 'block') as VenueBlock | undefined;
  if (!block) return [];

  const timestamp = Date.now();
  const newBlockId = `block_${block.areaId}_${newBlockName.replace(/\s+/g, '_')}_${timestamp}`;

  const clonedBlock: VenueBlock = {
    ...block,
    id: newBlockId,
    name: newBlockName,
    blockName: newBlockName,
    x: block.x + offsetX,
    y: block.y + offsetY,
  };

  const newNodes: VenueNode[] = [clonedBlock];
  const rowChildren = getChildren(nodes, blockId) as VenueRow[];

  for (const row of rowChildren) {
    if (row.type !== 'row') continue;
    const newRowId = `row_${newBlockId}_${row.rowName}_${timestamp}`;

    const clonedRow: VenueRow = {
      ...row,
      id: newRowId,
      blockId: newBlockId,
      parentId: newBlockId,
      x: row.x + offsetX,
      y: row.y + offsetY,
    };
    newNodes.push(clonedRow);

    const seatChildren = getChildren(nodes, row.id) as VenueSeat[];
    for (const seat of seatChildren) {
      if (seat.type !== 'seat') continue;
      const seatNumMatch = seat.seatLabel.match(/(\d+)$/);
      const seatNum = seatNumMatch ? seatNumMatch[1] : '01';
      const newSeatLabel = `${row.rowName}-${seatNum}`;
      const newSeatId = `seat_${newBlockId}_${row.rowName}_${seatNum}_${timestamp}`;

      const clonedSeat: VenueSeat = {
        ...seat,
        id: newSeatId,
        name: newSeatLabel,
        seatLabel: newSeatLabel,
        rowId: newRowId,
        blockId: newBlockId,
        parentId: newRowId,
        x: seat.x + offsetX,
        y: seat.y + offsetY,
      };
      newNodes.push(clonedSeat);
    }
  }

  return newNodes;
}

export function duplicateHierarchySubtree(
  nodes: VenueNode[],
  targetId: string,
  offsetX: number = 30,
  offsetY: number = 30
): VenueNode[] {
  const target = nodes.find((n) => n.id === targetId);
  if (!target) return [];

  const idMap = new Map<string, string>();
  const timestamp = Date.now();

  // Helper to map IDs recursively
  function buildIdMap(nodeId: string) {
    const newId = `${nodeId}_copy_${timestamp}_${Math.floor(Math.random() * 1000)}`;
    idMap.set(nodeId, newId);
    const children = getChildren(nodes, nodeId);
    children.forEach((c) => buildIdMap(c.id));
  }

  buildIdMap(targetId);

  // Helper to clone nodes recursively
  function cloneNode(node: VenueNode): VenueNode {
    const newId = idMap.get(node.id)!;
    const newParentId = node.parentId ? idMap.get(node.parentId) || node.parentId : undefined;

    return {
      ...node,
      id: newId,
      name: `${node.name} (Kopya)`,
      parentId: newParentId,
      x: node.x + offsetX,
      y: node.y + offsetY,
    };
  }

  const result: VenueNode[] = [];
  idMap.forEach((_, oldId) => {
    const origNode = nodes.find((n) => n.id === oldId);
    if (origNode) {
      result.push(cloneNode(origNode));
    }
  });

  return result;
}
