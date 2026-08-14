'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MousePointer,
  Hand,
  Plus,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ArrowUp,
  ArrowDown,
  Undo2,
  Redo2,
  Grid3X3,
  ChevronDown,
  Eye,
  Edit3,
  Layers,
  Square,
  Circle,
  Tv,
  Wine,
} from 'lucide-react';
import { DesignerAssetType, SnapGridOption } from '@/types/designer';
import * as s from './DesignerToolbar.css';

export interface DesignerToolbarProps {
  mode: 'select' | 'pan';
  onModeChange: (m: 'select' | 'pan') => void;
  onAddAsset: (type: DesignerAssetType) => void;
  selectedCount: number;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distHorizontal' | 'distVertical' | 'matchWidth' | 'matchHeight' | 'matchSize') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  gridSnap: SnapGridOption;
  onGridSnapChange: (snap: SnapGridOption) => void;
  isSaved: boolean;
  lastSavedTime: string | null;
  isPreviewMode: boolean;
  onTogglePreviewMode: () => void;
  activeDrawTool?: DesignerAssetType | null;
  onSelectDrawTool?: (tool: DesignerAssetType | null) => void;
  showRulers?: boolean;
  onToggleRulers?: () => void;
  showTreePanel?: boolean;
  onToggleTreePanel?: () => void;
  onOpenSeatingGenerator?: () => void;
}

export function DesignerToolbar({
  mode, onModeChange, onAddAsset, selectedCount,
  canGroup, canUngroup, onGroup, onUngroup, onAlign,
  canUndo, canRedo, onUndo, onRedo, gridSnap, onGridSnapChange,
  isSaved, lastSavedTime, isPreviewMode, onTogglePreviewMode,
  activeDrawTool = null, onSelectDrawTool, showRulers = true, onToggleRulers,
  showTreePanel = false, onToggleTreePanel, onOpenSeatingGenerator,
}: DesignerToolbarProps) {
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [alignMenuOpen, setAlignMenuOpen] = useState(false);
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);

  const assetMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const snapMenuRef = useRef<HTMLDivElement>(null);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (assetMenuRef.current && !assetMenuRef.current.contains(e.target as Node)) {
        setAssetMenuOpen(false);
      }
      if (alignMenuRef.current && !alignMenuRef.current.contains(e.target as Node)) {
        setAlignMenuOpen(false);
      }
      if (snapMenuRef.current && !snapMenuRef.current.contains(e.target as Node)) {
        setSnapMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={s.toolbarContainer}>
      {/* ── Left Group: Tools, Adding, Grouping, Alignment, History ── */}
      <div className={s.groupLeft}>
        {/* Mode Switcher */}
        <button
          className={s.btn}
          data-active={mode === 'select' && !activeDrawTool}
          onClick={() => {
            onModeChange('select');
            onSelectDrawTool?.(null);
          }}
          title="Seç (V)"
        >
          <MousePointer size={14} />
          <span>Seç</span>
        </button>

        <button
          className={s.btn}
          data-active={mode === 'pan'}
          onClick={() => {
            onModeChange('pan');
            onSelectDrawTool?.(null);
          }}
          title="Pan (H)"
        >
          <Hand size={14} />
          <span>Pan</span>
        </button>

        {onToggleTreePanel && (
          <button
            className={s.btn}
            data-active={showTreePanel}
            onClick={onToggleTreePanel}
            title="Sahne Ağacı"
          >
            <Layers size={14} />
            <span>Ağaç</span>
          </button>
        )}

        <div className={s.divider} />

        {/* + Asset Dropdown */}
        <div className={s.dropdownWrapper} ref={assetMenuRef}>
          <button
            className={`${s.btn} ${s.primaryBtn}`}
            onClick={() => setAssetMenuOpen(!assetMenuOpen)}
          >
            <Plus size={14} />
            <span>+ Asset</span>
            <ChevronDown size={12} />
          </button>

          {assetMenuOpen && (
            <div className={s.dropdownMenu}>
              <button
                className={s.dropdownItem}
                onClick={() => { onAddAsset('table'); setAssetMenuOpen(false); }}
              >
                <span className={s.dropdownLabelGroup}>
                  <Square size={14} />
                  <span>VIP Masa (6 PAX)</span>
                </span>
                <span className={s.shortcutBadge}>T</span>
              </button>

              <button
                className={s.dropdownItem}
                onClick={() => { onAddAsset('bistro'); setAssetMenuOpen(false); }}
              >
                <span className={s.dropdownLabelGroup}>
                  <Circle size={14} />
                  <span>Bistro (4 PAX)</span>
                </span>
                <span className={s.shortcutBadge}>B</span>
              </button>

              <button
                className={s.dropdownItem}
                onClick={() => { onAddAsset('stage'); setAssetMenuOpen(false); }}
              >
                <span className={s.dropdownLabelGroup}>
                  <Tv size={14} />
                  <span>Sahne</span>
                </span>
              </button>

              <button
                className={s.dropdownItem}
                onClick={() => { onAddAsset('bar'); setAssetMenuOpen(false); }}
              >
                <span className={s.dropdownLabelGroup}>
                  <Wine size={14} />
                  <span>Bar</span>
                </span>
              </button>

              <button
                className={s.dropdownItem}
                onClick={() => { onAddAsset('custom'); setAssetMenuOpen(false); }}
              >
                <span className={s.dropdownLabelGroup}>
                  <Layers size={14} />
                  <span>Özel Bölge</span>
                </span>
              </button>
            </div>
          )}
        </div>

        <div className={s.divider} />

        {/* Group / Ungroup */}
        <button
          className={s.btn}
          disabled={!canGroup}
          onClick={onGroup}
          title="Grupla (Cmd+G)"
        >
          <GroupIcon size={14} />
          <span>Grup ({selectedCount})</span>
        </button>

        {canUngroup && (
          <button
            className={s.btn}
            onClick={onUngroup}
            title="Grubu Çöz"
          >
            <UngroupIcon size={14} />
            <span>Çöz</span>
          </button>
        )}

        {/* Align Dropdown */}
        <div className={s.dropdownWrapper} ref={alignMenuRef}>
          <button
            className={s.btn}
            disabled={selectedCount < 2}
            onClick={() => setAlignMenuOpen(!alignMenuOpen)}
          >
            <AlignLeft size={14} />
            <span>Hizala</span>
            <ChevronDown size={12} />
          </button>

          {alignMenuOpen && (
            <div className={s.dropdownMenu}>
              <button className={s.dropdownItem} onClick={() => { onAlign('left'); setAlignMenuOpen(false); }}>
                <span className={s.dropdownLabelGroup}><AlignLeft size={14} /><span>Sola Hizala</span></span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onAlign('center'); setAlignMenuOpen(false); }}>
                <span className={s.dropdownLabelGroup}><AlignCenter size={14} /><span>Yatay Ortala</span></span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onAlign('right'); setAlignMenuOpen(false); }}>
                <span className={s.dropdownLabelGroup}><AlignRight size={14} /><span>Sağa Hizala</span></span>
              </button>
              <div className={s.menuDivider} />
              <button className={s.dropdownItem} onClick={() => { onAlign('top'); setAlignMenuOpen(false); }}>
                <span className={s.dropdownLabelGroup}><ArrowUp size={14} /><span>Üste Hizala</span></span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onAlign('middle'); setAlignMenuOpen(false); }}>
                <span className={s.dropdownLabelGroup}><AlignJustify size={14} /><span>Düşey Ortala</span></span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onAlign('bottom'); setAlignMenuOpen(false); }}>
                <span className={s.dropdownLabelGroup}><ArrowDown size={14} /><span>Alta Hizala</span></span>
              </button>
              <div className={s.menuDivider} />
              <button className={s.dropdownItem} onClick={() => { onAlign('distHorizontal'); setAlignMenuOpen(false); }}>
                <span>Yatay Eşit Dağıt</span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onAlign('distVertical'); setAlignMenuOpen(false); }}>
                <span>Düşey Eşit Dağıt</span>
              </button>
              <div className={s.menuDivider} />
              <button className={s.dropdownItem} onClick={() => { onAlign('matchSize'); setAlignMenuOpen(false); }}>
                <span>Boyut Eşitle</span>
              </button>
            </div>
          )}
        </div>

        <div className={s.divider} />

        {/* Undo / Redo */}
        <button
          className={s.btn}
          disabled={!canUndo}
          onClick={onUndo}
          title="Geri Al (Cmd+Z)"
        >
          <Undo2 size={14} />
        </button>

        <button
          className={s.btn}
          disabled={!canRedo}
          onClick={onRedo}
          title="İleri Al (Cmd+Shift+Z)"
        >
          <Redo2 size={14} />
        </button>

        {onOpenSeatingGenerator && (
          <button
            className={s.btn}
            onClick={onOpenSeatingGenerator}
            title="Otomatik Tribün / Koltuk Oluşturucu"
          >
            <Grid3X3 size={14} />
          </button>
        )}

        <div className={s.divider} />

        {/* Grid Snap Dropdown */}
        <div className={s.dropdownWrapper} ref={snapMenuRef}>
          <button
            className={s.btn}
            onClick={() => setSnapMenuOpen(!snapMenuOpen)}
          >
            <Grid3X3 size={14} />
            <span>Snap: {gridSnap === 0 ? 'Kapalı' : `${gridSnap}px`}</span>
            <ChevronDown size={12} />
          </button>

          {snapMenuOpen && (
            <div className={s.dropdownMenu}>
              <button className={s.dropdownItem} onClick={() => { onGridSnapChange(0); setSnapMenuOpen(false); }}>
                <span>Kapalı (Serbest)</span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onGridSnapChange(10); setSnapMenuOpen(false); }}>
                <span>10px Hizalama</span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onGridSnapChange(20); setSnapMenuOpen(false); }}>
                <span>20px Hizalama (Varsayılan)</span>
              </button>
              <button className={s.dropdownItem} onClick={() => { onGridSnapChange(50); setSnapMenuOpen(false); }}>
                <span>50px Hizalama</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Group: Save indicator & Preview mode toggle ── */}
      <div className={s.groupRight}>
        {/* Save Status Indicator */}
        <div className={s.saveIndicator}>
          <span className={isSaved ? s.saveDotSaved : s.saveDotUnsaved} />
          <span>
            {isSaved
              ? `Kaydedildi ${lastSavedTime ? new Date(lastSavedTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}`
              : 'Kaydedilmemiş değişiklikler'}
          </span>
        </div>

        <div className={s.divider} />

        {/* Mode Toggle Switch: DESIGN | PREVIEW */}
        <div className={s.modeToggle}>
          <button
            className={s.modeOption}
            data-active={!isPreviewMode}
            onClick={() => isPreviewMode && onTogglePreviewMode()}
          >
            <Edit3 size={12} className={s.modeIcon} />
            TASARIM
          </button>
          <button
            className={s.modeOption}
            data-active={isPreviewMode}
            onClick={() => !isPreviewMode && onTogglePreviewMode()}
          >
            <Eye size={12} className={s.modeIcon} />
            ÖNİZLEME
          </button>
        </div>
      </div>
    </div>
  );
}
