'use client';

import React, { useEffect, useRef } from 'react';
import { Copy, Trash2, Group, Ungroup, Lock, Unlock, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import * as s from './VenueContextMenu.css';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface VenueContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  selectedAssetIds: Set<string>;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
  onReorderZIndex: (action: 'front' | 'forward' | 'backward' | 'back') => void;
}

export function VenueContextMenu({
  position,
  onClose,
  selectedAssetIds,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
  onToggleLock,
  onToggleVisibility,
  onReorderZIndex,
}: VenueContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className={s.contextMenuPositioned}
      style={{
        '--menu-left': `${position.x}px`,
        '--menu-top': `${position.y}px`,
      } as React.CSSProperties}
    >
      <button className={s.contextMenuItem} onClick={() => { onDuplicate(); onClose(); }}>
        <span className={s.itemLabelGroup}><Copy size={12} /> Çoğalt</span>
        <span className={s.shortcutBadge}>Cmd+D</span>
      </button>

      {selectedAssetIds.size > 1 && (
        <button className={s.contextMenuItem} onClick={() => { onGroup(); onClose(); }}>
          <span className={s.itemLabelGroup}><Group size={12} /> Gruba Al</span>
          <span className={s.shortcutBadge}>Cmd+G</span>
        </button>
      )}

      <button className={s.contextMenuItem} onClick={() => { onToggleLock(); onClose(); }}>
        <span className={s.itemLabelGroup}><Lock size={12} /> Kilitle / Aç</span>
      </button>

      <button className={s.contextMenuItem} onClick={() => { onToggleVisibility(); onClose(); }}>
        <span className={s.itemLabelGroup}><Eye size={12} /> Göster / Gizle</span>
      </button>

      <div className={s.contextMenuDivider} />

      <button className={s.contextMenuItem} onClick={() => { onReorderZIndex('front'); onClose(); }}>
        <span className={s.itemLabelGroup}><ArrowUp size={12} /> En Öne Bring</span>
      </button>
      <button className={s.contextMenuItem} onClick={() => { onReorderZIndex('back'); onClose(); }}>
        <span className={s.itemLabelGroup}><ArrowDown size={12} /> En Arkaya Send</span>
      </button>

      <div className={s.contextMenuDivider} />

      <button className={`${s.contextMenuItem} ${s.dangerItem}`} onClick={() => { onDelete(); onClose(); }}>
        <span className={s.itemLabelGroup}><Trash2 size={12} /> Sil</span>
        <span className={s.shortcutBadge}>Del</span>
      </button>
    </div>
  );
}
