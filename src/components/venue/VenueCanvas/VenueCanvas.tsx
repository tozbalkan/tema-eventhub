'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Grid3X3 } from 'lucide-react';
import { DesignerAsset, DesignerGroup, SnapGridOption, DesignerAssetType } from '@/types/designer';
import { VenueAssetReadModel } from '@/operations/projections/VenueAssetProjection';
import { CurrencyCode } from '@/types/money';
import { formatCurrency, formatMultiCurrencyTotals } from '@/utils/formatCurrency';
import {
  screenToWorld,
  worldToScreen,
  zoomAroundPoint,
  fitBoundsToViewBox,
  calculateResize,
  calculateRotation,
  snapRectToObjects,
  intersectsRect,
  getBoundingBox,
  normalizeDrawingRect,
  WorldPoint,
  WorldRect,
  ResizeHandle,
  calculateLodVisibility,
} from '@/domain/venue/geometry';
import { VenueRulers } from './VenueRulers';
import { VenueContextMenu, ContextMenuPosition } from '../VenueContextMenu/VenueContextMenu';
import { vars } from '@/styles/tokens.css';
import * as s from './VenueCanvas.css';

/* ─── Constants ──────────────────────────────────────────── */
const STORAGE_KEY = 'stageops_venue_viewbox';
const DEFAULT_VB = { x: -20, y: -10, w: 640, h: 340 };
const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 0.15;
const MIN_W = 120;
const MAX_W = 2400;

interface ViewBox { x: number; y: number; w: number; h: number; }

/* ─── Props ──────────────────────────────────────────────── */
export interface VenueCanvasProps {
  assets: DesignerAsset[];
  projections: VenueAssetReadModel[];
  groups: DesignerGroup[];
  selectedAssetIds: Set<string>;
  onSelectAsset: (id: string, multi: boolean) => void;
  onDeselectAll: () => void;
  onAssetsMove: (ids: string[], dx: number, dy: number) => void;
  onAssetResize?: (id: string, newWidth: number, newHeight: number, newX: number, newY: number) => void;
  onAssetRotate?: (id: string, newRotation: number) => void;
  hoveredAssetId: string | null;
  onHoverAsset: (id: string | null) => void;
  mode?: 'select' | 'pan';
  gridSnap?: SnapGridOption;
  isPreviewMode?: boolean;
  activeDrawTool?: DesignerAssetType | null;
  onAddAssetAtLocation?: (type: DesignerAssetType, x: number, y: number, width: number, height: number) => void;
  showRulers?: boolean;
  onReorderZIndex?: (action: 'front' | 'forward' | 'backward' | 'back') => void;
  onToggleLock?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onDuplicateSelected?: () => void;
  onDeleteSelected?: () => void;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  onCursorMove?: (worldPt: WorldPoint) => void;
}

/* ─── Helper: screen → SVG coordinate conversion ─────── */
function screenToSvg(svg: SVGSVGElement, sx: number, sy: number) {
  const pt = svg.createSVGPoint();
  pt.x = sx;
  pt.y = sy;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  const svgPt = pt.matrixTransform(inv);
  return { x: svgPt.x, y: svgPt.y };
}

/* ─── Status Colors ──────────────────────────────────────── */
const STATUS_COLORS: Record<string, { fill: string; stroke: string; glow: string }> = {
  Available:  { fill: vars.color.availableBg, stroke: vars.color.available, glow: vars.shadow.glowAvailableStrong },
  Reserved:   { fill: vars.color.reservedBg, stroke: vars.color.reserved, glow: vars.shadow.glowReservedStrong },
  Sold:       { fill: vars.color.soldBg, stroke: vars.color.sold, glow: vars.shadow.glowSoldStrong },
  Blocked:    { fill: vars.color.blockedBg, stroke: vars.color.blocked, glow: vars.shadow.glowBlockedStrong },
};

const LEGEND: { label: string; dotClass: string }[] = [
  { label: 'Müsait', dotClass: s.legendDotAvailable },
  { label: 'Opsiyonda', dotClass: s.legendDotReserved },
  { label: 'Satıldı', dotClass: s.legendDotSold },
  { label: 'Bloke', dotClass: s.legendDotBlocked },
];

/* ─── Interaction state ── */
type InteractionMode = 'idle' | 'pot-drag' | 'pot-pan' | 'dragging' | 'panning' | 'resizing' | 'rotating' | 'box-selecting' | 'drawing';
interface Interaction {
  mode: InteractionMode;
  startScreen: { x: number; y: number };
  startSvg: { x: number; y: number };
  targetAssetId: string | null;
  resizeHandle?: ResizeHandle;
  shiftKey: boolean;
  startVB: ViewBox;
  initialAssetBounds?: { x: number; y: number; width: number; height: number; rotation: number };
}

const IDLE_INTERACTION: Interaction = {
  mode: 'idle', startScreen: { x: 0, y: 0 }, startSvg: { x: 0, y: 0 },
  targetAssetId: null, shiftKey: false, startVB: DEFAULT_VB,
};

export function VenueCanvas({
  assets, projections, groups, selectedAssetIds, onSelectAsset,
  onDeselectAll, onAssetsMove, onAssetResize, onAssetRotate,
  hoveredAssetId, onHoverAsset, mode = 'select', gridSnap = 20, isPreviewMode = false,
  activeDrawTool = null, onAddAssetAtLocation, showRulers = true,
  onReorderZIndex, onToggleLock, onToggleVisibility, onDuplicateSelected,
  onDeleteSelected, onGroupSelected, onUngroupSelected, onCursorMove,
}: VenueCanvasProps) {
  /* ── viewBox state (persisted to localStorage) ── */
  const [viewBox, setViewBox] = useState<ViewBox>(DEFAULT_VB);
  const isLoadedRef = useRef(false);

  /* ── Marquee box selection & drawing preview state ── */
  const [marqueeBox, setMarqueeBox] = useState<WorldRect | null>(null);
  const [drawPreview, setDrawPreview] = useState<WorldRect | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setViewBox(JSON.parse(stored) as ViewBox);
      }
    } catch { /* ignore */ }
    isLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(viewBox)); } catch { /* ignore */ }
  }, [viewBox]);

  /* ── drag offset (visual during move) ── */
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  /* ── alignment guides state (during drag) ── */
  const [activeGuides, setActiveGuides] = useState<{ x?: number; y?: number }>({});

  /* ── refs ── */
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Interaction>({ ...IDLE_INTERACTION });

  /* ── tooltip position ── */
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, visible: false });

  /* ── derived: zoom percentage ── */
  const zoomPct = useMemo(() => Math.round((DEFAULT_VB.w / viewBox.w) * 100), [viewBox.w]);

  /* ─── Zoom helpers ─────────────────────────────────────── */
  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const svg = svgRef.current;
    if (svg && cx !== undefined && cy !== undefined) {
      const screenPt = worldToScreen(svg, cx, cy);
      const newVb = zoomAroundPoint(viewBox, screenPt, svg, factor, MIN_W, MAX_W);
      setViewBox(newVb);
    } else {
      setViewBox(prev => {
        const newW = Math.max(MIN_W, Math.min(MAX_W, prev.w * factor));
        const newH = newW * (DEFAULT_VB.h / DEFAULT_VB.w);
        const newX = prev.x + (prev.w - newW) / 2;
        const newY = prev.y + (prev.h - newH) / 2;
        return { x: Math.round(newX), y: Math.round(newY), w: Math.round(newW), h: Math.round(newH) };
      });
    }
  }, [viewBox]);

  const fitToScreen = useCallback(() => {
    if (assets.length === 0) { setViewBox(DEFAULT_VB); return; }
    const bbox = getBoundingBox(assets);
    const newVb = fitBoundsToViewBox(bbox, 60);
    setViewBox(newVb);
  }, [assets]);

  /* ─── Wheel zoom (smoothed for trackpad & mouse) ───────── */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const svgPt = screenToSvg(svg, e.clientX, e.clientY);

      // Dampen wheel delta to prevent aggressive zooming on trackpads
      const rawDelta = e.ctrlKey ? e.deltaY * 2 : e.deltaY;
      const clampedDelta = Math.max(-60, Math.min(60, rawDelta));
      const factor = Math.exp(clampedDelta * 0.0015);

      zoomAt(factor, svgPt.x, svgPt.y);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoomAt]);

  /* ─── Hit-test: is point on an asset? ──────────────────── */
  const hitTest = useCallback((svgX: number, svgY: number): string | null => {
    for (let i = assets.length - 1; i >= 0; i--) {
      const a = assets[i]!;
      if (a.type === 'stage' || a.type === 'bar') continue;
      if (a.type === 'bistro') {
        const cx = a.x + a.width / 2, cy = a.y + a.height / 2, r = a.width / 2;
        if (Math.hypot(svgX - cx, svgY - cy) <= r) return a.id;
      } else {
        if (svgX >= a.x && svgX <= a.x + a.width && svgY >= a.y && svgY <= a.y + a.height) return a.id;
      }
    }
    return null;
  }, [assets]);

  /* ─── Pointer Events ───────────────────────────────────── */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (contextMenuPos) setContextMenuPos(null);
    const svg = svgRef.current;
    if (!svg) return;

    // Middle mouse button (button 1) or pan mode
    if (e.button === 1 || mode === 'pan') {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const svgPt = screenToSvg(svg, e.clientX, e.clientY);
      interRef.current = {
        mode: 'pot-pan',
        startScreen: { x: e.clientX, y: e.clientY },
        startSvg: svgPt,
        targetAssetId: null,
        shiftKey: e.shiftKey,
        startVB: { ...viewBox },
      };
      return;
    }

    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const svgPt = screenToSvg(svg, e.clientX, e.clientY);

    if (activeDrawTool) {
      interRef.current = {
        mode: 'drawing',
        startScreen: { x: e.clientX, y: e.clientY },
        startSvg: svgPt,
        targetAssetId: null,
        shiftKey: e.shiftKey,
        startVB: { ...viewBox },
      };
      return;
    }

    const assetId = hitTest(svgPt.x, svgPt.y);

    interRef.current = {
      mode: assetId ? 'pot-drag' : 'box-selecting',
      startScreen: { x: e.clientX, y: e.clientY },
      startSvg: svgPt,
      targetAssetId: assetId,
      shiftKey: e.shiftKey,
      startVB: { ...viewBox },
    };
  }, [hitTest, viewBox, mode, activeDrawTool, contextMenuPos]);

  /* ── Handles pointer down for Resize & Rotate ── */
  const onStartResize = useCallback((e: React.PointerEvent, handle: ResizeHandle, asset: DesignerAsset) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg || asset.locked) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const svgPt = screenToSvg(svg, e.clientX, e.clientY);
    interRef.current = {
      mode: 'resizing',
      startScreen: { x: e.clientX, y: e.clientY },
      startSvg: svgPt,
      targetAssetId: asset.id,
      resizeHandle: handle,
      shiftKey: e.shiftKey,
      startVB: { ...viewBox },
      initialAssetBounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height, rotation: asset.rotation },
    };
  }, [viewBox]);

  const onStartRotate = useCallback((e: React.PointerEvent, asset: DesignerAsset) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg || asset.locked) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const svgPt = screenToSvg(svg, e.clientX, e.clientY);
    interRef.current = {
      mode: 'rotating',
      startScreen: { x: e.clientX, y: e.clientY },
      startSvg: svgPt,
      targetAssetId: asset.id,
      shiftKey: e.shiftKey,
      startVB: { ...viewBox },
      initialAssetBounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height, rotation: asset.rotation },
    };
  }, [viewBox]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const inter = interRef.current;
    const svgPt = screenToSvg(svg, e.clientX, e.clientY);

    // Update cursor position readout for status bar
    onCursorMove?.(svgPt);

    // Tooltip tracking
    if (inter.mode === 'idle' || inter.mode === 'pot-drag' || inter.mode === 'pot-pan') {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, visible: !!hoveredAssetId });
      }
      const hit = hitTest(svgPt.x, svgPt.y);
      if (hit !== hoveredAssetId) onHoverAsset(hit);
    }

    if (inter.mode === 'idle') return;

    if (inter.mode === 'drawing') {
      const rect = normalizeDrawingRect(inter.startSvg, svgPt, 20);
      setDrawPreview(rect);
      return;
    }

    const dx = e.clientX - inter.startScreen.x;
    const dy = e.clientY - inter.startScreen.y;
    const dist = Math.hypot(dx, dy);

    if (inter.mode === 'pot-drag' && dist > DRAG_THRESHOLD) {
      inter.mode = 'dragging';
      if (inter.targetAssetId && !selectedAssetIds.has(inter.targetAssetId)) {
        onSelectAsset(inter.targetAssetId, inter.shiftKey);
      }
    }

    if (inter.mode === 'pot-pan' && dist > DRAG_THRESHOLD) {
      inter.mode = 'panning';
    }

    if (inter.mode === 'box-selecting') {
      const minX = Math.min(inter.startSvg.x, svgPt.x);
      const minY = Math.min(inter.startSvg.y, svgPt.y);
      const w = Math.abs(svgPt.x - inter.startSvg.x);
      const h = Math.abs(svgPt.y - inter.startSvg.y);
      setMarqueeBox({ x: minX, y: minY, width: w, height: h });
    }

    if (inter.mode === 'dragging') {
      let sdx = svgPt.x - inter.startSvg.x;
      let sdy = svgPt.y - inter.startSvg.y;

      const effectiveSnap = gridSnap > 0 ? gridSnap : (e.shiftKey ? 20 : 0);
      if (effectiveSnap > 0) {
        sdx = Math.round(sdx / effectiveSnap) * effectiveSnap;
        sdy = Math.round(sdy / effectiveSnap) * effectiveSnap;
      }
      setDragOffset({ x: sdx, y: sdy });

      // Alignment guide calculation using snapping module
      if (inter.targetAssetId) {
        const draggedAsset = assets.find(a => a.id === inter.targetAssetId);
        if (draggedAsset) {
          const targetRect = {
            x: draggedAsset.x + sdx,
            y: draggedAsset.y + sdy,
            width: draggedAsset.width,
            height: draggedAsset.height,
          };
          const otherRects = assets
            .filter(a => a.id !== draggedAsset.id && !selectedAssetIds.has(a.id))
            .map(a => ({ x: a.x, y: a.y, width: a.width, height: a.height }));

          const snapRes = snapRectToObjects(targetRect, otherRects, 6);
          let guideX: number | undefined;
          let guideY: number | undefined;

          for (const g of snapRes.guides) {
            if (g.type === 'vertical') guideX = g.position;
            if (g.type === 'horizontal') guideY = g.position;
          }
          setActiveGuides({ x: guideX, y: guideY });
        }
      }
    }

    if (inter.mode === 'resizing' && inter.targetAssetId && inter.initialAssetBounds && onAssetResize && inter.resizeHandle) {
      const deltaSvg = { x: svgPt.x - inter.startSvg.x, y: svgPt.y - inter.startSvg.y };
      const b = inter.initialAssetBounds;

      const resized = calculateResize(inter.resizeHandle, b, deltaSvg, e.shiftKey, 20);
      onAssetResize(inter.targetAssetId, resized.width, resized.height, resized.x, resized.y);
    }

    if (inter.mode === 'rotating' && inter.targetAssetId && inter.initialAssetBounds && onAssetRotate) {
      const b = inter.initialAssetBounds;
      const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

      const angleDeg = calculateRotation(center, svgPt, e.shiftKey);
      onAssetRotate(inter.targetAssetId, angleDeg);
    }

    if (inter.mode === 'panning') {
      const panDx = inter.startSvg.x - svgPt.x;
      const panDy = inter.startSvg.y - svgPt.y;
      setViewBox({
        x: inter.startVB.x + panDx,
        y: inter.startVB.y + panDy,
        w: inter.startVB.w,
        h: inter.startVB.h,
      });
    }
  }, [hoveredAssetId, hitTest, onHoverAsset, selectedAssetIds, onSelectAsset, gridSnap, assets, onAssetResize, onAssetRotate, onCursorMove]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const inter = interRef.current;

    if (inter.mode === 'drawing' && drawPreview && activeDrawTool) {
      onAddAssetAtLocation?.(activeDrawTool, drawPreview.x, drawPreview.y, drawPreview.width, drawPreview.height);
      setDrawPreview(null);
    } else if (inter.mode === 'box-selecting' && marqueeBox) {
      const intersectingIds = assets
        .filter(a => intersectsRect(marqueeBox, { x: a.x, y: a.y, width: a.width, height: a.height }))
        .map(a => a.id);

      if (intersectingIds.length > 0) {
        intersectingIds.forEach(id => onSelectAsset(id, true));
      } else if (!e.shiftKey) {
        onDeselectAll();
      }
      setMarqueeBox(null);
    } else if (inter.mode === 'pot-drag' || inter.mode === 'pot-pan') {
      if (inter.targetAssetId) {
        onSelectAsset(inter.targetAssetId, e.shiftKey);
      } else {
        onDeselectAll();
      }
    }

    if (inter.mode === 'dragging') {
      const ids = inter.targetAssetId
        ? (selectedAssetIds.has(inter.targetAssetId)
          ? Array.from(selectedAssetIds)
          : [inter.targetAssetId])
        : [];
      if (ids.length > 0 && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
        onAssetsMove(ids, dragOffset.x, dragOffset.y);
      }
      setDragOffset({ x: 0, y: 0 });
      setActiveGuides({});
    }

    interRef.current = { ...IDLE_INTERACTION };
  }, [drawPreview, activeDrawTool, onAddAssetAtLocation, marqueeBox, assets, selectedAssetIds, onSelectAsset, onDeselectAll, dragOffset, onAssetsMove]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const onPointerLeave = useCallback(() => {
    onHoverAsset(null);
    setTooltipPos(prev => ({ ...prev, visible: false }));
  }, [onHoverAsset]);

  /* ─── Render helpers ───────────────────────────────────── */
  const getProjection = useCallback((id: string) => projections.find(p => p.assetId === id), [projections]);

  const hoveredProj = useMemo(() => {
    if (!hoveredAssetId) return null;
    return projections.find(p => p.assetId === hoveredAssetId) || null;
  }, [hoveredAssetId, projections]);

  /* ── Bounding box calculation for selected asset(s) ── */
  const selectedBounds = useMemo(() => {
    if (selectedAssetIds.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let singleAsset: DesignerAsset | null = null;

    for (const id of Array.from(selectedAssetIds)) {
      const a = assets.find(item => item.id === id);
      if (a) {
        if (selectedAssetIds.size === 1) singleAsset = a;
        minX = Math.min(minX, a.x);
        minY = Math.min(minY, a.y);
        maxX = Math.max(maxX, a.x + a.width);
        maxY = Math.max(maxY, a.y + a.height);
      }
    }
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, singleAsset };
  }, [selectedAssetIds, assets]);

  /* ─── Level of Detail calculation ─── */
  const lod = useMemo(() => calculateLodVisibility(viewBox.w, 640), [viewBox.w]);

  /* ─── Render single asset ──────────────────────────────── */
  const renderAsset = useCallback((a: DesignerAsset) => {
    // Level-of-detail filtering
    const isSelected = selectedAssetIds.has(a.id);
    if (a.type === 'seat' && !lod.showSeats && !isSelected) {
      return null;
    }
    if (a.type === 'row' && !lod.showRows && !isSelected) {
      return null;
    }

    const proj = getProjection(a.id);
    const status = proj?.status || a.status;
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS['Blocked']!;
    const isHovered = hoveredAssetId === a.id;
    const isDragged = isSelected && (interRef.current.mode === 'dragging');
    const isStageOrBar = a.type === 'stage' || a.type === 'bar';

    const ox = isDragged ? dragOffset.x : 0;
    const oy = isDragged ? dragOffset.y : 0;

    const strokeW = isSelected ? 2.5 : isHovered ? 2 : 1.2;
    const fillOpacity = isHovered && !isStageOrBar ? 0.3 : 1;

    const cx = a.x + a.width / 2 + ox;
    const cy = a.y + a.height / 2 + oy;

    const transform = a.rotation ? `rotate(${a.rotation} ${cx} ${cy})` : undefined;

    return (
      <g key={a.id} transform={transform} opacity={isDragged ? 0.85 : (a.locked ? 0.7 : 1)}>
        {/* Selection glow ring */}
        {isSelected && !isPreviewMode && (
          a.type === 'bistro' ? (
            <circle
              cx={cx} cy={cy} r={a.width / 2 + 4}
              fill="none" stroke={colors.glow} className={s.selectionRing}
            />
          ) : (
            <rect
              x={a.x + ox - 4} y={a.y + oy - 4}
              width={a.width + 8} height={a.height + 8}
              rx={10} fill="none" stroke={colors.glow} className={s.selectionRing}
            />
          )
        )}

        {/* Main shape */}
        {a.type === 'bistro' ? (
          <circle
            cx={cx} cy={cy} r={a.width / 2}
            fill={a.appearance?.fill || colors.fill}
            stroke={a.appearance?.border || colors.stroke} strokeWidth={strokeW}
            opacity={a.appearance?.opacity ?? fillOpacity}
          />
        ) : (
          <rect
            x={a.x + ox} y={a.y + oy}
            width={a.width} height={a.height} rx={6}
            fill={a.appearance?.fill || colors.fill}
            stroke={a.appearance?.border || colors.stroke} strokeWidth={strokeW}
            opacity={a.appearance?.opacity ?? fillOpacity}
          />
        )}

        {/* Lock icon indicator */}
        {a.locked && !isPreviewMode && (
          <text x={cx} y={cy - a.height / 2 + 10} textAnchor="middle" className={s.svgTextSub}>
            🔒
          </text>
        )}

        {/* Label */}
        <text
          x={cx} y={cy + 4}
          textAnchor="middle"
          className={isStageOrBar ? s.svgTextStage : s.svgTextLabel}
        >
          {proj?.name || a.name}
        </text>

        {/* Capacity indicator */}
        {!isStageOrBar && a.paxCapacity > 0 && (
          <text
            x={cx} y={cy + 16}
            textAnchor="middle"
            className={s.svgTextSub}
          >
            {a.paxCapacity} PAX
          </text>
        )}
      </g>
    );
  }, [selectedAssetIds, hoveredAssetId, dragOffset, getProjection, isPreviewMode]);

  /* ════════════════════════════════════════════════════════ */
  return (
    <div
      ref={wrapperRef}
      className={s.canvasWrapper}
      data-panning={interRef.current.mode === 'panning' || mode === 'pan' ? 'true' : undefined}
      data-dragging={interRef.current.mode === 'dragging' ? 'true' : undefined}
    >
      {/* Canvas Rulers Overlay */}
      {showRulers && !isPreviewMode && <VenueRulers viewBox={viewBox} />}

      <svg
        ref={svgRef}
        className={s.svgCanvas}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={onContextMenu}
      >
        {/* Grid pattern (Hidden in Preview Mode) */}
        {!isPreviewMode && (
          <defs>
            <pattern id="venue-grid-v2" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" className={s.gridPatternPath} />
            </pattern>
          </defs>
        )}
        {!isPreviewMode && (
          <rect x={viewBox.x - 200} y={viewBox.y - 200} width={viewBox.w + 400} height={viewBox.h + 400} fill="url(#venue-grid-v2)" />
        )}

        {/* Group Boundaries & Summary Tags */}
        {(() => {
          const groupMap = new Map<string, DesignerAsset[]>();
          for (const a of assets) {
            if (a.groupName) {
              const list = groupMap.get(a.groupName) || [];
              list.push(a);
              groupMap.set(a.groupName, list);
            }
          }
          return Array.from(groupMap.entries()).map(([name, items]) => {
            let gx = Infinity, gy = Infinity, gx2 = -Infinity, gy2 = -Infinity;
            let totalPax = 0;
            const priceByCurrency: Partial<Record<CurrencyCode, number>> = {};

            for (const a of items) {
              gx = Math.min(gx, a.x);
              gy = Math.min(gy, a.y);
              gx2 = Math.max(gx2, a.x + a.width);
              gy2 = Math.max(gy2, a.y + a.height);
              totalPax += a.paxCapacity;

              const curr = a.pricing.currency || 'TRY';
              priceByCurrency[curr] = (priceByCurrency[curr] || 0) + (a.pricing.basePrice || 0);
            }
            const pad = 12;
            const priceSummary = formatMultiCurrencyTotals(priceByCurrency);

            return (
              <g key={name}>
                <rect
                  x={gx - pad} y={gy - pad}
                  width={gx2 - gx + pad * 2} height={gy2 - gy + pad * 2}
                  rx={10}
                  className={s.groupBoundaryRect}
                />
                <text
                  x={gx - pad + 6} y={gy - pad - 6}
                  className={s.svgGroupTag}
                >
                  {name.toUpperCase()} · {items.length} Masa · {totalPax} PAX · {priceSummary}
                </text>
              </g>
            );
          });
        })()}

        {/* Render Assets */}
        {assets.map(a => renderAsset(a))}

        {/* Marquee Box Selection Overlay */}
        {!isPreviewMode && marqueeBox && (
          <rect
            x={marqueeBox.x}
            y={marqueeBox.y}
            width={marqueeBox.width}
            height={marqueeBox.height}
            className={s.marqueeSelectionBox}
          />
        )}

        {/* Live Drawing Preview & Dimension Readout */}
        {!isPreviewMode && drawPreview && (
          <g>
            <rect
              x={drawPreview.x}
              y={drawPreview.y}
              width={drawPreview.width}
              height={drawPreview.height}
              className={s.marqueeSelectionBox}
            />
            <text
              x={drawPreview.x + drawPreview.width / 2}
              y={drawPreview.y - 8}
              textAnchor="middle"
              className={s.svgGroupTag}
            >
              W {drawPreview.width} × H {drawPreview.height}
            </text>
          </g>
        )}

        {/* Alignment Guide Lines */}
        {!isPreviewMode && activeGuides.x !== undefined && (
          <line x1={activeGuides.x} y1={viewBox.y - 100} x2={activeGuides.x} y2={viewBox.y + viewBox.h + 100} className={s.alignGuide} />
        )}
        {!isPreviewMode && activeGuides.y !== undefined && (
          <line x1={viewBox.x - 100} y1={activeGuides.y} x2={viewBox.x + viewBox.w + 100} y2={activeGuides.y} className={s.alignGuide} />
        )}

        {/* Bounding Box & Corner Handles (Single / Multi-Selection) */}
        {!isPreviewMode && selectedBounds && (
          <g>
            <rect
              x={selectedBounds.minX - 5}
              y={selectedBounds.minY - 5}
              width={selectedBounds.width + 10}
              height={selectedBounds.height + 10}
              rx={4}
              className={s.selectionBoundingBox}
            />

            {/* Corner Resize Handles for Single Unlocked Selection */}
            {selectedBounds.singleAsset && !selectedBounds.singleAsset.locked && (
              <>
                <circle
                  cx={selectedBounds.minX - 5} cy={selectedBounds.minY - 5} r={4}
                  className={`${s.handleNW} ${s.handleCircle}`}
                  onPointerDown={e => onStartResize(e, 'nw', selectedBounds.singleAsset!)}
                />
                <circle
                  cx={selectedBounds.maxX + 5} cy={selectedBounds.minY - 5} r={4}
                  className={`${s.handleNE} ${s.handleCircle}`}
                  onPointerDown={e => onStartResize(e, 'ne', selectedBounds.singleAsset!)}
                />
                <circle
                  cx={selectedBounds.maxX + 5} cy={selectedBounds.maxY + 5} r={4}
                  className={`${s.handleSE} ${s.handleCircle}`}
                  onPointerDown={e => onStartResize(e, 'se', selectedBounds.singleAsset!)}
                />
                <circle
                  cx={selectedBounds.minX - 5} cy={selectedBounds.maxY + 5} r={4}
                  className={`${s.handleSW} ${s.handleCircle}`}
                  onPointerDown={e => onStartResize(e, 'sw', selectedBounds.singleAsset!)}
                />

                {/* Top Rotation Handle */}
                <line
                  x1={selectedBounds.minX + selectedBounds.width / 2}
                  y1={selectedBounds.minY - 5}
                  x2={selectedBounds.minX + selectedBounds.width / 2}
                  y2={selectedBounds.minY - 20}
                  className={s.rotateHandleLine}
                />
                <circle
                  cx={selectedBounds.minX + selectedBounds.width / 2}
                  cy={selectedBounds.minY - 20}
                  r={5}
                  className={`${s.handleRotate} ${s.rotateHandleCircle}`}
                  onPointerDown={e => onStartRotate(e, selectedBounds.singleAsset!)}
                />
              </>
            )}
          </g>
        )}
      </svg>

      {/* ─── Hover Tooltip (Hidden in Preview Mode) ─── */}
      {!isPreviewMode && hoveredAssetId && hoveredProj && tooltipPos.visible && (
        <div
          className={s.tooltipPositioned}
          style={{
            '--tooltip-left': `${tooltipPos.x}px`,
            '--tooltip-top': `${tooltipPos.y}px`,
          } as React.CSSProperties}
        >
          <div className={s.tooltipName}>{hoveredProj.name}</div>
          <div className={s.tooltipRow}>
            <span>Durum</span>
            <span className={s.tooltipValue}>{hoveredProj.status === 'Available' ? 'Müsait' : hoveredProj.status === 'Reserved' ? 'Opsiyonda' : hoveredProj.status === 'Sold' ? 'Satıldı' : 'Bloke'}</span>
          </div>
          <div className={s.tooltipRow}>
            <span>Kapasite</span>
            <span className={s.tooltipValue}>{hoveredProj.paxCapacity} PAX</span>
          </div>
          <div className={s.tooltipRow}>
            <span>Fiyat</span>
            <span className={s.tooltipValue}>
              {(() => {
                const hoveredAsset = assets.find(a => a.id === hoveredAssetId);
                const curr = hoveredAsset?.pricing?.currency || 'TRY';
                return formatCurrency(hoveredProj.basePrice, curr);
              })()}
            </span>
          </div>
          {(() => {
            const hoveredAsset = assets.find(a => a.id === hoveredAssetId);
            return hoveredAsset?.groupName ? (
              <div className={s.tooltipRow}>
                <span>Grup</span>
                <span className={s.tooltipValue}>{hoveredAsset.groupName}</span>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* ─── Canvas Toolbar (Hidden in Preview Mode) ─── */}
      {!isPreviewMode && (
        <div className={s.toolbar}>
          <button className={s.toolbarBtn} title="Yakınlaştır" onClick={() => zoomAt(1 - ZOOM_STEP)}>
            <ZoomIn size={15} />
          </button>
          <span className={s.zoomLabel}>{zoomPct}%</span>
          <button className={s.toolbarBtn} title="Uzaklaştır" onClick={() => zoomAt(1 + ZOOM_STEP)}>
            <ZoomOut size={15} />
          </button>
          <button className={s.toolbarBtn} title="Sığdır" onClick={fitToScreen}>
            <Maximize2 size={15} />
          </button>
          <button className={s.toolbarBtn} title="Izgarayı Sıfırla" onClick={() => setViewBox(DEFAULT_VB)}>
            <Grid3X3 size={15} />
          </button>

          <div className={s.toolbarDivider} />

          {LEGEND.map(l => (
            <span key={l.label} className={s.legendItem}>
              <span className={l.dotClass} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {/* ─── Right-Click Context Menu ─── */}
      {contextMenuPos && (
        <VenueContextMenu
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
          selectedAssetIds={selectedAssetIds}
          onDuplicate={onDuplicateSelected || (() => {})}
          onDelete={onDeleteSelected || (() => {})}
          onGroup={onGroupSelected || (() => {})}
          onUngroup={onUngroupSelected || (() => {})}
          onToggleLock={() => {
            const id = Array.from(selectedAssetIds)[0];
            if (id && onToggleLock) onToggleLock(id);
          }}
          onToggleVisibility={() => {
            const id = Array.from(selectedAssetIds)[0];
            if (id && onToggleVisibility) onToggleVisibility(id);
          }}
          onReorderZIndex={onReorderZIndex || (() => {})}
        />
      )}
    </div>
  );
}
