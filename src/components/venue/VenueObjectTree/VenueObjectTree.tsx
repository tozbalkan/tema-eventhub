'use client';

import React, { useState } from 'react';
import { Layers, Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, ChevronRight, ChevronDown, Square, Circle, Tv, Wine, Grid3X3, Folder, User } from 'lucide-react';
import { DesignerAsset } from '@/types/designer';
import { vars } from '@/styles/tokens.css';
import * as s from './VenueObjectTree.css';

export interface VenueObjectTreeProps {
  assets: DesignerAsset[];
  selectedAssetIds: Set<string>;
  onSelectAsset: (id: string, multi: boolean) => void;
  onToggleLock: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onReorderZIndex?: (action: 'front' | 'forward' | 'backward' | 'back') => void;
}

export function VenueObjectTree({
  assets,
  selectedAssetIds,
  onSelectAsset,
  onToggleLock,
  onToggleVisibility,
  onReorderZIndex,
}: VenueObjectTreeProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'area':
        return <Folder size={14} color={vars.color.primary} />;
      case 'block':
        return <Grid3X3 size={14} color={vars.color.available} />;
      case 'row':
        return <Square size={14} color={vars.color.reserved} />;
      case 'seat':
        return <User size={12} color={vars.color.available} />;
      case 'bistro':
        return <Circle size={14} color={vars.color.primary} />;
      case 'stage':
        return <Tv size={14} color={vars.color.textMed} />;
      case 'bar':
        return <Wine size={14} color={vars.color.reserved} />;
      default:
        return <Square size={14} color={vars.color.primary} />;
    }
  };

  // Build root nodes and child map
  const roots: DesignerAsset[] = [];
  const childrenMap = new Map<string, DesignerAsset[]>();

  assets.forEach((asset) => {
    const parentId = (asset as any).parentId;
    if (!parentId) {
      roots.push(asset);
    } else {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(asset);
    }
  });

  const renderNode = (node: DesignerAsset, depth: number = 0) => {
    const isSelected = selectedAssetIds.has(node.id);
    const isVisible = node.visible !== false;
    const children = childrenMap.get(node.id) || [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedIds.has(node.id);

    const indentClass =
      depth === 0 ? s.treeIndent0 : depth === 1 ? s.treeIndent1 : depth === 2 ? s.treeIndent2 : s.treeIndent3;

    return (
      <React.Fragment key={node.id}>
        <div
          className={`${s.treeItem} ${indentClass}`}
          data-selected={isSelected}
          data-hidden={!isVisible}
          onClick={(e) => onSelectAsset(node.id, e.shiftKey)}
        >
          <div className={s.treeItemContent}>
            {hasChildren ? (
              <span onClick={(e) => toggleCollapse(node.id, e)} className={s.treeActionBtn}>
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </span>
            ) : (
              <span className={s.treeIconSpacer} />
            )}
            {getIcon(node.type)}
            <span className={s.treeItemName}>{node.name}</span>
          </div>

          <div className={s.treeItemActions}>
            <button
              className={s.treeActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(node.id);
              }}
              title={isVisible ? 'Gizle' : 'Göster'}
            >
              {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>

            <button
              className={s.treeActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(node.id);
              }}
              title={node.locked ? 'Kilidi Aç' : 'Kilitle'}
            >
              {node.locked ? <Lock size={12} color={vars.color.reserved} /> : <Unlock size={12} />}
            </button>
          </div>
        </div>

        {hasChildren && !isCollapsed && children.map((c) => renderNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className={s.treePanel}>
      <div className={s.treeHeader}>
        <span className={s.treeHeaderTitleGroup}>
          <Layers size={16} color={vars.color.primary} /> Sahne Ağacı ({assets.length})
        </span>
        {onReorderZIndex && selectedAssetIds.size > 0 && (
          <div className={s.treeHeaderActionGroup}>
            <button className={s.treeActionBtn} onClick={() => onReorderZIndex('front')} title="En Öne Getir">
              <ArrowUp size={12} />
            </button>
            <button className={s.treeActionBtn} onClick={() => onReorderZIndex('back')} title="En Arkaya Götür">
              <ArrowDown size={12} />
            </button>
          </div>
        )}
      </div>

      <div className={s.treeList}>
        {roots.length === 0 ? assets.map((a) => renderNode(a, 0)) : roots.map((r) => renderNode(r, 0))}
      </div>
    </div>
  );
}
