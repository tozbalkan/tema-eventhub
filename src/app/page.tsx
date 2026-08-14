'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserCheck,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { Badge } from '@/components/ui/Badge/Badge';
import { Modal } from '@/components/ui/Modal/Modal';
import { Input } from '@/components/ui/Input/Input';

import { VenueService } from '@/services/VenueService';
import { ReservationService } from '@/services/ReservationService';
import { processExternalSaleConfirmationAction } from '@/app/actions/sales';
import { VenueAssetProjection, VenueAssetReadModel } from '@/operations/projections/VenueAssetProjection';
import { AdmissionPolicy, AdmissionDecision } from '@/operations/domain/services/AdmissionPolicy';
import { MockDataStore } from '@/repositories/mock/MockRepositories';

import { DesignerAsset, DesignerGroup, DesignerAssetType, SnapGridOption } from '@/types/designer';
import { DesignerStorageService } from '@/services/DesignerStorageService';
import { useDesignerHistory } from '@/hooks/useDesignerHistory';

import { Users, MailCheck, Percent } from 'lucide-react';
import { CommissionEngineService } from '@/services/CommissionEngineService';
import { CustomerCrmService } from '@/services/CustomerCrmService';
import { NotificationService } from '@/services/NotificationService';
import { CustomerCrmDrawer } from '@/components/venue/CustomerCrmDrawer/CustomerCrmDrawer';
import { DesignerToolbar } from '@/components/venue/DesignerToolbar/DesignerToolbar';
import { VenueCanvas } from '@/components/venue/VenueCanvas/VenueCanvas';
import { AssetDetailPanel } from '@/components/venue/AssetDetailPanel/AssetDetailPanel';
import { VenueStatsBar } from '@/components/venue/VenueStatsBar/VenueStatsBar';
import { VenueObjectTree } from '@/components/venue/VenueObjectTree/VenueObjectTree';
import { VenueStatusBar } from '@/components/venue/VenueStatusBar/VenueStatusBar';
import { SeatingGeneratorModal } from '@/components/venue/SeatingGeneratorModal/SeatingGeneratorModal';
import { generateBlockHierarchy, generateSeatsForRow, BlockConfig } from '@/domain/venue/geometry';
import { reorderZIndex, WorldPoint } from '@/domain/venue/geometry';

import {
  pageContainer,
  header,
  logoGroup,
  logoBadge,
  headerTitle,
  headerSubtitle,
  headerBadgeGroup,
  mainGrid,
  floorPlanPanel,
  floorPlanHeader,
  floorPlanTitle,
  floorPlanSubTitle,
  sidebarPanel,
  card,
  cardTitle,
  cardTitleGroup,
  accordionContent,
  kpiGrid,
  kpiBox,
  kpiValue,
  kpiLabel,
  textSubtleSm,
  selectField,
  canvasFlexWorkspace,
  modalNoticeBox,
  modalReservedText,
  modalTextMarginBottom,
  timelineStream,
  timelineItem,
  timelineTime,
  timelineContent,
  modalForm,
  modalStack,
  modalPriceSummaryBox,
  modalTextBase,
  modalTextMuted,
  modalTextSuccess,
  modalTicketTokenBox,
  textBold,
  modalTokenCode,
  statsSection,
} from './page.css';

import { vars } from '@/styles/tokens.css';

import { AssetCategory, AssetShape, VenueAsset } from '@/types/venue-asset';

/* ─── Helper: Convert VenueAsset → DesignerAsset ──────────────── */
function toDesignerAsset(a: any): DesignerAsset {
  return {
    id: a.id,
    name: a.name,
    type: a.category === 'Stage' ? 'stage' : a.category === 'Food' ? 'bar' : a.shape === 'Circle' ? 'bistro' : 'table',
    x: a.x,
    y: a.y,
    width: a.width,
    height: a.height,
    rotation: a.rotation || 0,
    paxCapacity: a.paxCapacity || 0,
    status: a.status || 'Available',
    groupName: a.groupName,
    pricing: {
      basePrice: a.pricing?.basePrice || 0,
      weekendPrice: a.pricing?.basePrice ? Math.round(a.pricing.basePrice * 1.1) : 0,
      earlyBirdPrice: a.pricing?.basePrice ? Math.round(a.pricing.basePrice * 0.9) : 0,
    },
    locked: false,
  };
}

/* ─── Helper: Convert DesignerAsset → VenueAsset ──────────────── */
function toVenueAsset(da: DesignerAsset): VenueAsset {
  const category: AssetCategory = da.type === 'stage' ? 'Stage' : da.type === 'bar' ? 'Food' : da.type === 'bistro' ? 'Lounge' : 'VIP';
  const shape: AssetShape = da.type === 'bistro' ? 'Circle' : 'Rectangle';

  return {
    id: da.id,
    svgNodeId: da.id,
    floorPlanId: 'fp_gala_2026',
    name: da.name,
    groupName: da.groupName,
    category,
    shape,
    status: da.status,
    isVisible: true,
    paxCapacity: da.paxCapacity,
    pricing: { basePrice: da.pricing.basePrice, currency: 'TRY' as const },
    x: da.x,
    y: da.y,
    width: da.width,
    height: da.height,
    version: 1,
    isArchived: false,
  };
}

interface TimelineLog {
  time: string;
  title: string;
  sub: string;
}

export default function VenueDesignerWorkspace() {
  /* ── 1. Designer State Initialization ── */
  const [designerAssets, setDesignerAssets] = useState<DesignerAsset[]>([]);
  const [designerGroups, setDesignerGroups] = useState<DesignerGroup[]>([]);
  const [projections, setProjections] = useState<VenueAssetReadModel[]>([]);

  /* ── Canvas Mode & Tooling State ── */
  const [toolMode, setToolMode] = useState<'select' | 'pan'>('select');
  const [gridSnap, setGridSnap] = useState<SnapGridOption>(20);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);

  /* ── Draft Save Status State ── */
  const [isSaved, setIsSaved] = useState(true);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  /* ── Authoring State (Designer 4.0) ── */
  const [activeDrawTool, setActiveDrawTool] = useState<DesignerAssetType | null>(null);
  const [showRulers, setShowRulers] = useState(true);
  const [showTreePanel, setShowTreePanel] = useState(false);
  const [cursorWorld, setCursorWorld] = useState<WorldPoint>({ x: 0, y: 0 });

  /* ── Selection State ── */
  const [accordionState, setAccordionState] = useState({
    tasks: true,
    timeline: true,
  });

  /* ── Modal State ── */
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [isSeatingModalOpen, setIsSeatingModalOpen] = useState(false);
  const [admissionDecision, setAdmissionDecision] = useState<AdmissionDecision | null>(null);

  /* ── Clipboard State for Copy/Paste ── */
  const [clipboardBuffer, setClipboardBuffer] = useState<DesignerAsset[]>([]);

  /* ── CRM & Sale State ── */
  const [isCrmDrawerOpen, setIsCrmDrawerOpen] = useState(false);
  const [crmSearchQuery, setCrmSearchQuery] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('biletix');
  const [externalRefInput, setExternalRefInput] = useState('BTX-20260807-18291');

  /* ── Form State ── */
  const [custName, setCustName] = useState('Emre Kaya');
  const [custPhone, setCustPhone] = useState('+905351234567');
  const [custEmail, setCustEmail] = useState('emre@vip.com');

  /* ── Timeline Logs ── */
  const [timeline, setTimeline] = useState<TimelineLog[]>([
    { time: '17:42', title: '✓ SaleRecorded Domain Event (v1) Yayınlandı', sub: 'Biletix (Ref: BTX-20260807-18291) - Net: ₺23.500' },
    { time: '17:40', title: '✓ VenueAssetProjection Handler Güncellendi', sub: 'Masa Statüsü: Satıldı | Satış Kanalı: Biletix' },
    { time: '17:38', title: '✓ Opsiyon Tanımlandı', sub: 'Selin Yılmaz (VIP Masa A2)' },
    { time: '17:30', title: '✓ Kapı Girişi Doğrulandı', sub: 'VIP Kuzey Kapısı (Tarık Özbalkan)' },
  ]);

  /* ── Undo / Redo History Hook ── */
  const { canUndo, canRedo, pushState, undo, redo } = useDesignerHistory(designerAssets, designerGroups);

  /* ── Sync MockDataStore and Projections whenever assets change ── */
  const syncProjections = useCallback((assets: DesignerAsset[]) => {
    const venueAssets = assets.map(toVenueAsset);
    MockDataStore.assets = venueAssets;
    VenueAssetProjection.initialize(venueAssets);
    setProjections([...VenueAssetProjection.getAll()]);
  }, []);

  /* ── Load initial draft or mock data ── */
  useEffect(() => {
    const draft = DesignerStorageService.loadDraft();
    if (draft && draft.assets.length > 0) {
      setDesignerAssets(draft.assets);
      setDesignerGroups(draft.groups || []);
      if (draft.gridSnap !== undefined) setGridSnap(draft.gridSnap);
      setLastSavedTime(draft.timestamp);
      syncProjections(draft.assets);
    } else {
      const initial = MockDataStore.assets.map(toDesignerAsset);
      setDesignerAssets(initial);
      syncProjections(initial);
    }
  }, [syncProjections]);

  /* ── Auto-save Draft to localStorage ── */
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSave = useCallback((assets: DesignerAsset[], groups: DesignerGroup[]) => {
    setIsSaved(false);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const ts = DesignerStorageService.saveDraft(assets, groups, undefined, gridSnap);
      setIsSaved(true);
      setLastSavedTime(ts);
    }, 800);
  }, [gridSnap]);

  const updateStateAndHistory = useCallback((newAssets: DesignerAsset[], newGroups?: DesignerGroup[]) => {
    const g = newGroups ?? designerGroups;
    setDesignerAssets(newAssets);
    if (newGroups) setDesignerGroups(newGroups);
    pushState(newAssets, g);
    syncProjections(newAssets);
    triggerSave(newAssets, g);
  }, [designerGroups, pushState, syncProjections, triggerSave]);

  /* ── Timeline Helper ── */
  const addTimeline = (title: string, sub: string) => {
    const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setTimeline(prev => [{ time: nowStr, title, sub }, ...prev]);
  };

  const toggleAccordion = (key: keyof typeof accordionState) => {
    setAccordionState(prev => ({ ...prev, [key]: !prev[key] }));
  };

  /* ── First selected projection for operational actions ── */
  const firstSelectedId = Array.from(selectedAssetIds)[0] || null;
  const firstSelectedProj = firstSelectedId ? projections.find(p => p.assetId === firstSelectedId) : null;

  /* ─── Designer Authoring Actions ───────────────────────── */

  const handleAddAsset = useCallback((type: DesignerAssetType) => {
    const id = `asset_${type}_${Date.now()}`;
    let name = 'Yeni Alan';
    let width = 70;
    let height = 50;
    let paxCapacity = 6;
    let basePrice = 25000;
    let status: any = 'Available';

    if (type === 'table') {
      name = `VIP Masa A${designerAssets.length + 1}`;
    } else if (type === 'bistro') {
      name = `Bistro B${designerAssets.length + 1}`;
      width = 45;
      height = 45;
      paxCapacity = 4;
      basePrice = 12000;
    } else if (type === 'stage') {
      name = 'Ek Sahne';
      width = 250;
      height = 60;
      paxCapacity = 0;
      basePrice = 0;
      status = 'Blocked';
    } else if (type === 'bar') {
      name = 'Yan Kokteyl Bar';
      width = 80;
      height = 100;
      paxCapacity = 0;
      basePrice = 0;
      status = 'Blocked';
    } else if (type === 'custom') {
      name = 'Özel VIP Bölgesi';
      width = 100;
      height = 70;
      paxCapacity = 8;
      basePrice = 30000;
    }

    const newAsset: DesignerAsset = {
      id,
      name,
      type,
      x: 280 + Math.random() * 40,
      y: 140 + Math.random() * 40,
      width,
      height,
      rotation: 0,
      paxCapacity,
      status,
      pricing: {
        basePrice,
        weekendPrice: Math.round(basePrice * 1.1),
        earlyBirdPrice: Math.round(basePrice * 0.9),
      },
      locked: false,
    };

    const nextAssets = [...designerAssets, newAsset];
    setSelectedAssetIds(new Set([id]));
    updateStateAndHistory(nextAssets);
    addTimeline('✓ Yeni Asset Eklendi', `${name} (${type.toUpperCase()}) tuvalin ortasına yerleştirildi.`);
  }, [designerAssets, updateStateAndHistory]);

  const handleAddAssetAtLocation = useCallback((type: DesignerAssetType, x: number, y: number, width: number, height: number) => {
    const id = `asset_${type}_${Date.now()}`;
    let name = 'Çizilen Alan';
    let paxCapacity = 6;
    let basePrice = 25000;
    let status: any = 'Available';

    if (type === 'table') name = `VIP Masa A${designerAssets.length + 1}`;
    else if (type === 'bistro') { name = `Bistro B${designerAssets.length + 1}`; paxCapacity = 4; basePrice = 12000; }
    else if (type === 'stage') { name = 'Sahne'; paxCapacity = 0; basePrice = 0; status = 'Blocked'; }
    else if (type === 'bar') { name = 'Kokteyl Bar'; paxCapacity = 0; basePrice = 0; status = 'Blocked'; }
    else if (type === 'custom') { name = 'Özel Alan'; paxCapacity = 8; basePrice = 30000; }

    const newAsset: DesignerAsset = {
      id,
      name,
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      rotation: 0,
      paxCapacity,
      status,
      pricing: { basePrice, weekendPrice: Math.round(basePrice * 1.1), earlyBirdPrice: Math.round(basePrice * 0.9) },
      locked: false,
      visible: true,
    };

    const nextAssets = [...designerAssets, newAsset];
    setSelectedAssetIds(new Set([id]));
    setActiveDrawTool(null);
    updateStateAndHistory(nextAssets);
    addTimeline('✓ Çizim Tamamlandı', `${name} (${width}x${height}) tuvale yerleştirildi.`);
  }, [designerAssets, updateStateAndHistory]);

  const handleToggleVisibility = useCallback((id: string) => {
    const nextAssets = designerAssets.map(a => {
      if (a.id === id) return { ...a, visible: a.visible === false ? true : false };
      return a;
    });
    updateStateAndHistory(nextAssets);
  }, [designerAssets, updateStateAndHistory]);

  const handleReorderZIndex = useCallback((action: 'front' | 'forward' | 'backward' | 'back') => {
    if (selectedAssetIds.size === 0) return;
    const reordered = reorderZIndex(designerAssets, Array.from(selectedAssetIds), action);
    updateStateAndHistory(reordered);
    addTimeline('✓ Katman Sırası Değiştirildi', `${selectedAssetIds.size} nesnenin z-index sırası güncellendi.`);
  }, [designerAssets, selectedAssetIds, updateStateAndHistory]);

  const handleAssetChange = useCallback((id: string, updates: Partial<DesignerAsset>) => {
    const nextAssets = designerAssets.map(a => {
      if (a.id === id) {
        return { ...a, ...updates, pricing: updates.pricing ? { ...a.pricing, ...updates.pricing } : a.pricing };
      }
      return a;
    });
    updateStateAndHistory(nextAssets);
  }, [designerAssets, updateStateAndHistory]);

  const handleAssetsMove = useCallback((ids: string[], dx: number, dy: number) => {
    const nextAssets = designerAssets.map(a => {
      if (ids.includes(a.id) && !a.locked) {
        return { ...a, x: a.x + dx, y: a.y + dy };
      }
      return a;
    });
    updateStateAndHistory(nextAssets);
  }, [designerAssets, updateStateAndHistory]);

  const handleAssetResize = useCallback((id: string, newWidth: number, newHeight: number, newX: number, newY: number) => {
    const nextAssets = designerAssets.map(a => {
      if (a.id === id && !a.locked) {
        return { ...a, width: newWidth, height: newHeight, x: newX, y: newY };
      }
      return a;
    });
    updateStateAndHistory(nextAssets);
  }, [designerAssets, updateStateAndHistory]);

  const handleAssetRotate = useCallback((id: string, newRotation: number) => {
    const nextAssets = designerAssets.map(a => {
      if (a.id === id && !a.locked) {
        return { ...a, rotation: newRotation };
      }
      return a;
    });
    updateStateAndHistory(nextAssets);
  }, [designerAssets, updateStateAndHistory]);

  const handleDuplicateAsset = useCallback((id: string) => {
    const original = designerAssets.find(a => a.id === id);
    if (!original) return;

    const dupId = `asset_${original.type}_${Date.now()}`;
    const duplicate: DesignerAsset = {
      ...original,
      id: dupId,
      name: `${original.name} Kopya`,
      x: original.x + 20,
      y: original.y + 20,
      pricing: { ...original.pricing },
      locked: false,
    };

    const nextAssets = [...designerAssets, duplicate];
    setSelectedAssetIds(new Set([dupId]));
    updateStateAndHistory(nextAssets);
    addTimeline('✓ Asset Çoğaltıldı', `${original.name} → ${duplicate.name}`);
  }, [designerAssets, updateStateAndHistory]);

  const handleToggleLock = useCallback((id: string) => {
    const nextAssets = designerAssets.map(a => {
      if (a.id === id) return { ...a, locked: !a.locked };
      return a;
    });
    updateStateAndHistory(nextAssets);
  }, [designerAssets, updateStateAndHistory]);

  const handleDeleteAssets = useCallback((ids: string[]) => {
    const nextAssets = designerAssets.filter(a => !ids.includes(a.id) || a.locked);
    setSelectedAssetIds(new Set());
    updateStateAndHistory(nextAssets);
    addTimeline('✓ Asset(ler) Silindi', `${ids.length} alan haritadan kaldırıldı.`);
  }, [designerAssets, updateStateAndHistory]);

  const handleGroupNameChange = useCallback((assetId: string, newGroupName: string) => {
    const nextAssets = designerAssets.map(a => {
      if (a.id === assetId) return { ...a, groupName: newGroupName || undefined };
      return a;
    });
    updateStateAndHistory(nextAssets);
  }, [designerAssets, updateStateAndHistory]);

  /* ── Group & Ungroup Selected Assets ── */
  const handleGroupSelected = useCallback(() => {
    if (selectedAssetIds.size < 2) return;
    const ids = Array.from(selectedAssetIds);
    const groupName = `VIP GRUP ${designerGroups.length + 1}`;
    const groupId = `grp_${Date.now()}`;

    const newGroup: DesignerGroup = { id: groupId, name: groupName, assetIds: ids };
    const nextGroups = [...designerGroups, newGroup];

    const nextAssets = designerAssets.map(a => {
      if (ids.includes(a.id)) {
        return { ...a, groupId, groupName };
      }
      return a;
    });

    updateStateAndHistory(nextAssets, nextGroups);
    addTimeline('✓ Gruplama Oluşturuldu', `${ids.length} alan "${groupName}" adı altında gruplandı.`);
  }, [selectedAssetIds, designerGroups, designerAssets, updateStateAndHistory]);

  const handleUngroupSelected = useCallback(() => {
    if (selectedAssetIds.size === 0) return;
    const ids = Array.from(selectedAssetIds);

    const nextAssets = designerAssets.map(a => {
      if (ids.includes(a.id)) {
        return { ...a, groupId: undefined, groupName: undefined };
      }
      return a;
    });

    const remainingGroups = designerGroups.filter(g => !g.assetIds.some(id => ids.includes(id)));

    updateStateAndHistory(nextAssets, remainingGroups);
    addTimeline('✓ Grup Çözüldü', `${ids.length} alan gruptan çıkarıldı.`);
  }, [selectedAssetIds, designerAssets, designerGroups, updateStateAndHistory]);

  /* ── Bulk Alignment Operations ── */
  const handleAlign = useCallback((type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distHorizontal' | 'distVertical' | 'matchWidth' | 'matchHeight' | 'matchSize') => {
    const selected = designerAssets.filter(a => selectedAssetIds.has(a.id) && !a.locked);
    if (selected.length < 2) return;

    let minX = Math.min(...selected.map(a => a.x));
    let maxX = Math.max(...selected.map(a => a.x + a.width));
    let minY = Math.min(...selected.map(a => a.y));
    let maxY = Math.max(...selected.map(a => a.y + a.height));
    let avgW = Math.round(selected.reduce((s, a) => s + a.width, 0) / selected.length);
    let avgH = Math.round(selected.reduce((s, a) => s + a.height, 0) / selected.length);

    const nextAssets = designerAssets.map(a => {
      if (!selectedAssetIds.has(a.id) || a.locked) return a;

      if (type === 'left') return { ...a, x: minX };
      if (type === 'center') return { ...a, x: (minX + maxX) / 2 - a.width / 2 };
      if (type === 'right') return { ...a, x: maxX - a.width };
      if (type === 'top') return { ...a, y: minY };
      if (type === 'middle') return { ...a, y: (minY + maxY) / 2 - a.height / 2 };
      if (type === 'bottom') return { ...a, y: maxY - a.height };
      if (type === 'matchWidth') return { ...a, width: avgW };
      if (type === 'matchHeight') return { ...a, height: avgH };
      if (type === 'matchSize') return { ...a, width: avgW, height: avgH };
      return a;
    });

    // Horizontal / Vertical Distribution
    if (type === 'distHorizontal' && selected.length >= 3) {
      const sorted = [...selected].sort((a, b) => a.x - b.x);
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const totalDist = (last.x + last.width) - first.x - sorted.reduce((s, a) => s + a.width, 0);
      const step = totalDist / (sorted.length - 1);
      let currX = first.x;

      for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i]!;
        const idx = nextAssets.findIndex(a => a.id === item.id);
        if (idx !== -1) {
          nextAssets[idx] = { ...nextAssets[idx]!, x: currX };
        }
        currX += item.width + step;
      }
    }

    if (type === 'distVertical' && selected.length >= 3) {
      const sorted = [...selected].sort((a, b) => a.y - b.y);
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const totalDist = (last.y + last.height) - first.y - sorted.reduce((s, a) => s + a.height, 0);
      const step = totalDist / (sorted.length - 1);
      let currY = first.y;

      for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i]!;
        const idx = nextAssets.findIndex(a => a.id === item.id);
        if (idx !== -1) {
          nextAssets[idx] = { ...nextAssets[idx]!, y: currY };
        }
        currY += item.height + step;
      }
    }

    updateStateAndHistory(nextAssets);
    addTimeline('✓ Hizalama Uygulandı', `${selected.length} alan hizalandı (${type}).`);
  }, [designerAssets, selectedAssetIds, updateStateAndHistory]);

  /* ─── Global Keyboard Shortcuts System ──────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toUpperCase();
      const isEditable = document.activeElement?.getAttribute('contenteditable') === 'true';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || isEditable) {
        return; // Suppress shortcuts inside input fields
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo(snap => { setDesignerAssets(snap.assets); setDesignerGroups(snap.groups); syncProjections(snap.assets); });
        } else {
          if (canUndo) undo(snap => { setDesignerAssets(snap.assets); setDesignerGroups(snap.groups); syncProjections(snap.assets); });
        }
        return;
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedAssetIds(new Set(designerAssets.map((a) => a.id)));
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedAssetIds.size > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        handleAssetsMove(Array.from(selectedAssetIds), dx, dy);
        return;
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const selectedId = Array.from(selectedAssetIds)[0];
        if (selectedId) handleDuplicateAsset(selectedId);
        return;
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) handleUngroupSelected();
        else handleGroupSelected();
        return;
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const selectedList = designerAssets.filter((a) => selectedAssetIds.has(a.id));
        if (selectedList.length > 0) setClipboardBuffer(selectedList);
        return;
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (clipboardBuffer.length > 0) {
          const timestamp = Date.now();
          const idMap = new Map<string, string>();
          const offset = e.shiftKey ? 60 : 30;

          const pasted = clipboardBuffer.map((item) => {
            const newId = `${item.id}_copy_${timestamp}_${Math.floor(Math.random() * 1000)}`;
            idMap.set(item.id, newId);
            return {
              ...item,
              id: newId,
              name: `${item.name} (Kopya)`,
              x: item.x + offset,
              y: item.y + offset,
            };
          }).map((item) => ({
            ...item,
            parentId: item.parentId ? idMap.get(item.parentId) || item.parentId : undefined,
          }));

          setDesignerAssets((prev) => {
            const updated = [...prev, ...pasted];
            pushState(updated, designerGroups);
            syncProjections(updated);
            return updated;
          });
          setSelectedAssetIds(new Set(pasted.map((p) => p.id)));
          setIsSaved(false);
        }
        return;
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const ts = DesignerStorageService.saveDraft(designerAssets, designerGroups, undefined, gridSnap);
        setIsSaved(true);
        setLastSavedTime(ts);
        addTimeline('✓ Taslak Kaydedildi', `Manuel kayıt başarılı (${new Date(ts).toLocaleTimeString('tr-TR')}).`);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAssetIds.size > 0) {
          e.preventDefault();
          handleDeleteAssets(Array.from(selectedAssetIds));
        }
        return;
      }

      if (e.key === 'Escape') {
        setSelectedAssetIds(new Set());
        if (isPreviewMode) setIsPreviewMode(false);
        return;
      }

      if (e.key.toLowerCase() === 'v') setToolMode('select');
      if (e.key.toLowerCase() === 'h') setToolMode('pan');
      if (e.key.toLowerCase() === 't') handleAddAsset('table');
      if (e.key.toLowerCase() === 'b') handleAddAsset('bistro');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canUndo, canRedo, undo, redo, selectedAssetIds, handleDuplicateAsset,
    handleGroupSelected, handleUngroupSelected, designerAssets, designerGroups,
    gridSnap, isPreviewMode, handleDeleteAssets, handleAddAsset, syncProjections, handleAssetsMove,
  ]);

  /* ─── Operational Event Handlers (Preserved) ─────────────── */

  const handleReserve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstSelectedProj) return;

    try {
      ReservationService.createReservation({
        eventId: MockDataStore.event.id,
        assetId: firstSelectedProj.assetId,
        customerName: custName,
        customerPhone: custPhone,
        customerEmail: custEmail,
        guestCountPax: firstSelectedProj.paxCapacity,
      });

      // Update local status
      handleAssetChange(firstSelectedProj.assetId, { status: 'Reserved' });
      addTimeline(`✓ Opsiyon Tanımlandı: ${firstSelectedProj.name}`, `${custName} (${custPhone}) - 24 Saat Süreli Opsiyon`);
      setIsReserveModalOpen(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleProcessExternalSaleConfirmation = async () => {
    if (!firstSelectedProj) return;

    try {
      const ref = externalRefInput || `REF-20260807-${Math.floor(10000 + Math.random() * 90000)}`;
      const result = await processExternalSaleConfirmationAction({
        eventId: MockDataStore.event.id,
        assetId: firstSelectedProj.assetId,
        salesChannelId: selectedChannelId,
        externalSaleReference: ref,
        purchaserName: custName,
        purchaserPhone: custPhone,
        purchaserEmail: custEmail,
      });

      if (result.isDuplicateRecord) {
        addTimeline(`⚠️ Idempotency Engeli: Mükerrer Satış Bildirimi`, `Ref: ${ref} sistemi koruyarak tekrar işlenmedi.`);
      } else {
        handleAssetChange(firstSelectedProj.assetId, { status: 'Sold' });
        const commResult = CommissionEngineService.calculate(firstSelectedProj.basePrice, selectedChannelId);
        addTimeline(
          `✓ SaleRecorded Domain Event (v1) Yayınlandı: ${firstSelectedProj.name}`,
          `Kanal: ${commResult.salesChannelName} (%${commResult.commissionPercentage.toFixed(1)} Komisyon) | Ref: ${ref} | Net Hakediş: ₺${result.sale.netRevenue.toLocaleString('tr-TR')}`
        );
      }

      setIsSaleModalOpen(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleGenerateBlock = useCallback(
    (config: BlockConfig, pattern?: string) => {
      const { block, rows, seats } = generateBlockHierarchy(config);
      if (pattern) {
        rows.forEach((r) => {
          const rowSeats = generateSeatsForRow(
            {
              rowName: r.rowName,
              seatCount: config.seatsPerRow,
              seatSpacing: config.seatSpacing,
              seatWidth: config.seatWidth,
              seatHeight: config.seatHeight,
              pattern,
            },
            r.id,
            block.id,
            config.areaId,
            r.x,
            r.y
          );
          r.seatCount = rowSeats.length;
        });
      }

      const newAssets: DesignerAsset[] = [block, ...rows, ...seats].map((node: any) => ({
        id: node.id,
        name: node.name,
        type: node.type as DesignerAssetType,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rotation: node.rotation || 0,
        status: node.status || 'Available',
        paxCapacity: node.type === 'seat' ? 1 : node.type === 'block' ? node.totalCapacity : 0,
        pricing: { basePrice: node.type === 'seat' ? 500 : 0, currency: 'TRY' as const },
        parentId: node.parentId,
      }));

      setDesignerAssets((prev) => {
        const updated = [...prev, ...newAssets];
        pushState(updated, designerGroups);
        syncProjections(updated);
        return updated;
      });

      setIsSaved(false);
    },
    [designerGroups, pushState, syncProjections]
  );

  const handleCancelReservation = () => {
    if (!firstSelectedProj) return;
    const res = MockDataStore.reservations.find(r => r.assetId === firstSelectedProj.assetId && r.status === 'Confirmed');
    if (res) ReservationService.cancelReservation(res.id, 'ORGANIZER');
    handleAssetChange(firstSelectedProj.assetId, { status: 'Available' });
    addTimeline(`✓ Opsiyon İptal Edildi: ${firstSelectedProj.name}`, `Masa tekrar müsait statüsüne çekildi.`);
  };

  const openCheckInModal = () => {
    if (!firstSelectedProj) return;
    const decision = AdmissionPolicy.evaluate(firstSelectedProj.assetId);
    setAdmissionDecision(decision);
    setIsCheckInModalOpen(true);
  };

  const handleCheckIn = () => {
    if (!firstSelectedProj || !admissionDecision) return;

    if (admissionDecision.outcome === 'Granted') {
      MockDataStore.checkIns.push({
        id: `chk_${Date.now()}`,
        organizationId: MockDataStore.organizationId,
        eventId: MockDataStore.event.id,
        venueAssetId: firstSelectedProj.assetId,
        saleId: firstSelectedProj.saleId,
        gateId: MockDataStore.gates[0]?.id || 'gate_vip_north',
        guestName: custName,
        checkedInAt: new Date().toISOString(),
        checkedInBy: 'VIP Kapı Görevlisi',
        status: 'Completed',
      });
      addTimeline(`✓ Kapı Girişi Onaylandı (${admissionDecision.code})`, `${firstSelectedProj.name} VIP Kuzey Kapısından Giriş Yaptı`);
    } else {
      addTimeline(`❌ Kapı Girişi Reddedildi (${admissionDecision.code})`, admissionDecision.message);
    }

    setIsCheckInModalOpen(false);
  };

  /* ═════════════════════════════════════════════════════════ */
  return (
    <div className={pageContainer}>
      {/* ─── Header ─── */}
      <header className={header}>
        <div className={logoGroup}>
          <div className={logoBadge}>STAGEOPS VENUE DESIGNER 2.0</div>
          <div>
            <h1 className={headerTitle}>
              <Sparkles size={18} color={vars.color.primary} /> {MockDataStore.event.name}
            </h1>
            <p className={headerSubtitle}>
              20 Ağustos 2026 | 19:30 - 04:00 | {MockDataStore.venue.name}
            </p>
          </div>
        </div>

        <div className={headerBadgeGroup}>
          <Badge variant="Available">Satışta</Badge>
          <Badge variant="Neutral">Yayında</Badge>
          <Button variant="secondary" icon={<Users size={14} />} onClick={() => { setCrmSearchQuery(''); setIsCrmDrawerOpen(true); }}>
            Müşteri CRM & Geçmiş
          </Button>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => {
            const initial = MockDataStore.assets.map(toDesignerAsset);
            setDesignerAssets(initial);
            syncProjections(initial);
          }}>
            Yenile
          </Button>
        </div>
      </header>

      {/* ─── KPI Stats Bar ─── */}
      <div className={statsSection}>
        <VenueStatsBar assets={designerAssets} projections={projections} fireCapacity={MockDataStore.venue.fireCapacity} />
      </div>

      {/* ─── Main Grid ─── */}
      <div className={mainGrid}>
        {/* ─── Floor Plan & Designer Canvas Panel ─── */}
        <div className={floorPlanPanel}>
          {/* Professional Designer Toolbar */}
          {!isPreviewMode && (
            <DesignerToolbar
              mode={toolMode}
              onModeChange={setToolMode}
              onAddAsset={handleAddAsset}
              selectedCount={selectedAssetIds.size}
              canGroup={selectedAssetIds.size >= 2}
              canUngroup={Array.from(selectedAssetIds).some(id => !!designerAssets.find(a => a.id === id)?.groupName)}
              onGroup={handleGroupSelected}
              onUngroup={handleUngroupSelected}
              onAlign={handleAlign}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => undo(snap => { setDesignerAssets(snap.assets); setDesignerGroups(snap.groups); syncProjections(snap.assets); })}
              onRedo={() => redo(snap => { setDesignerAssets(snap.assets); setDesignerGroups(snap.groups); syncProjections(snap.assets); })}
              gridSnap={gridSnap}
              onGridSnapChange={setGridSnap}
              isSaved={isSaved}
              lastSavedTime={lastSavedTime}
              isPreviewMode={isPreviewMode}
              onTogglePreviewMode={() => setIsPreviewMode(!isPreviewMode)}
              activeDrawTool={activeDrawTool}
              onSelectDrawTool={setActiveDrawTool}
              showRulers={showRulers}
              onToggleRulers={() => setShowRulers(!showRulers)}
              showTreePanel={showTreePanel}
              onToggleTreePanel={() => setShowTreePanel(!showTreePanel)}
              onOpenSeatingGenerator={() => setIsSeatingModalOpen(true)}
            />
          )}

          {isPreviewMode && (
            <div className={floorPlanHeader}>
              <div>
                <h2 className={floorPlanTitle}>Mekan Planı (Önizleme Modu)</h2>
                <p className={floorPlanSubTitle}>Sunum Görünümü — Müşteri ve organizatör paylaşımı için hazır.</p>
              </div>
              <Button variant="secondary" onClick={() => setIsPreviewMode(false)}>
                Tasarım Moduna Dön
              </Button>
            </div>
          )}

          {/* SVG Canvas Workspace & Scene Object Tree Panel */}
          <div className={canvasFlexWorkspace}>
            {showTreePanel && !isPreviewMode && (
              <VenueObjectTree
                assets={designerAssets}
                selectedAssetIds={selectedAssetIds}
                onSelectAsset={(id, multi) => {
                  setSelectedAssetIds(prev => {
                    const next = new Set(prev);
                    if (multi) {
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                    } else {
                      next.clear();
                      next.add(id);
                    }
                    return next;
                  });
                }}
                onToggleLock={handleToggleLock}
                onToggleVisibility={handleToggleVisibility}
                onReorderZIndex={handleReorderZIndex}
              />
            )}

            <VenueCanvas
              assets={designerAssets}
              projections={projections}
              groups={designerGroups}
              selectedAssetIds={selectedAssetIds}
              onSelectAsset={(id, multi) => {
                setSelectedAssetIds(prev => {
                  const next = new Set(prev);
                  if (multi) {
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                  } else {
                    next.clear();
                    next.add(id);
                  }
                  return next;
                });
              }}
              onDeselectAll={() => setSelectedAssetIds(new Set())}
              onAssetsMove={handleAssetsMove}
              onAssetResize={handleAssetResize}
              onAssetRotate={handleAssetRotate}
              hoveredAssetId={hoveredAssetId}
              onHoverAsset={setHoveredAssetId}
              mode={toolMode}
              gridSnap={gridSnap}
              isPreviewMode={isPreviewMode}
              activeDrawTool={activeDrawTool}
              onAddAssetAtLocation={handleAddAssetAtLocation}
              showRulers={showRulers}
              onReorderZIndex={handleReorderZIndex}
              onToggleLock={handleToggleLock}
              onToggleVisibility={handleToggleVisibility}
              onDuplicateSelected={() => {
                const firstId = Array.from(selectedAssetIds)[0];
                if (firstId) handleDuplicateAsset(firstId);
              }}
              onDeleteSelected={() => handleDeleteAssets(Array.from(selectedAssetIds))}
              onGroupSelected={handleGroupSelected}
              onUngroupSelected={handleUngroupSelected}
              onCursorMove={setCursorWorld}
            />
          </div>

          {/* Bottom Status Bar */}
          {!isPreviewMode && (
            <VenueStatusBar
              zoomPct={100}
              cursorWorld={cursorWorld}
              selectedCount={selectedAssetIds.size}
              gridSnap={gridSnap}
              showRulers={showRulers}
            />
          )}
        </div>

        {/* ─── Sidebar (Hidden in Preview Mode for Full Floor Plan Showcase) ─── */}
        {!isPreviewMode && (
          <div className={sidebarPanel}>
            {/* Property Inspector */}
            <AssetDetailPanel
              selectedAssetIds={selectedAssetIds}
              assets={designerAssets}
              projections={projections}
              groups={designerGroups}
              reservations={MockDataStore.reservations}
              sales={MockDataStore.sales}
              onAssetChange={handleAssetChange}
              onGroupNameChange={handleGroupNameChange}
              onDuplicateAsset={handleDuplicateAsset}
              onToggleLock={handleToggleLock}
              onDeleteAssets={handleDeleteAssets}
              onGroup={handleGroupSelected}
              onAlign={handleAlign}
              onReserve={() => setIsReserveModalOpen(true)}
              onSale={() => setIsSaleModalOpen(true)}
              onCheckIn={openCheckInModal}
              onCancelReservation={handleCancelReservation}
              onOpenCrm={(q) => { setCrmSearchQuery(q || ''); setIsCrmDrawerOpen(true); }}
            />

            {/* Operational Task Queue */}
            <div className={card}>
              <div className={cardTitle} onClick={() => toggleAccordion('tasks')}>
                <span className={cardTitleGroup}>
                  <Clock size={16} color={vars.color.reserved} /> Bekleyen Operasyon İşleri
                </span>
                {accordionState.tasks ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>

              {accordionState.tasks && (
                <div className={accordionContent}>
                  <div className={kpiGrid}>
                    <div className={kpiBox}>
                      <span className={kpiValue}>3</span>
                      <span className={kpiLabel}>Bekleyen Opsiyonlar</span>
                    </div>
                    <div className={kpiBox}>
                      <span className={kpiValue}>2</span>
                      <span className={kpiLabel}>Bekleyen Dış Satışlar</span>
                    </div>
                    <div className={kpiBox}>
                      <span className={kpiValue}>5</span>
                      <span className={kpiLabel}>Kapıda Bekleyenler</span>
                    </div>
                    <div className={kpiBox}>
                      <span className={kpiValue}>1</span>
                      <span className={kpiLabel}>Süre Aşımı Opsiyon</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className={card}>
              <div className={cardTitle} onClick={() => toggleAccordion('timeline')}>
                <span className={cardTitleGroup}>
                  <CheckCircle2 size={16} color={vars.color.available} /> Canlı İşlem Zaman Çizelgesi
                </span>
                {accordionState.timeline ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>

              {accordionState.timeline && (
                <div className={accordionContent}>
                  <div className={timelineStream}>
                    {timeline.map((item, i) => (
                      <div key={i} className={timelineItem}>
                        <span className={timelineTime}>{item.time}</span>
                        <div className={timelineContent}>
                          <strong className={textBold}>{item.title}</strong>
                          <span>{item.sub}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Opsiyon Modal ─── */}
      <Modal
        isOpen={isReserveModalOpen}
        onClose={() => setIsReserveModalOpen(false)}
        title={`${firstSelectedProj?.name || 'Alan'} için Opsiyon Tanımla`}
      >
        <form onSubmit={handleReserve} className={modalForm}>
          <Input label="Müşteri Ad Soyad" value={custName} onChange={e => setCustName(e.target.value)} required />
          <Input label="Cep Telefonu" value={custPhone} onChange={e => setCustPhone(e.target.value)} required />
          <Input label="E-posta Adresi" value={custEmail} onChange={e => setCustEmail(e.target.value)} required />
          <Button type="submit" variant="primary">
            24 Saatlik Rezervasyon Opsiyonunu Onayla
          </Button>
        </form>
      </Modal>

      {/* ─── Satış Modal ─── */}
      <Modal
        isOpen={isSaleModalOpen}
        onClose={() => setIsSaleModalOpen(false)}
        title={`${firstSelectedProj?.name || 'Alan'} - Bilet Platformu Satış Kaydı`}
      >
        <div className={modalStack}>
          {/* Customer Lookup & Inputs */}
          <div>
            <p className={`${modalTextMuted} ${modalTextMarginBottom}`}>
              Alıcı Müşteri Bilgileri (Telefon → E-posta İle CRM Otomatik Eşleşir)
            </p>
            <Input label="Müşteri Adı" value={custName} onChange={(e) => setCustName(e.target.value)} required />
            <Input
              label="Cep Telefonu"
              value={custPhone}
              onChange={(e) => {
                const p = e.target.value;
                setCustPhone(p);
                const found = CustomerCrmService.lookupCustomer(p);
                if (found) {
                  setCustName(found.fullName);
                  setCustEmail(found.email);
                }
              }}
              required
            />
            <Input label="E-posta Adresi" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} required />
          </div>

          {/* Ticket Platform & Reference */}
          <div>
            <label className={textSubtleSm}>
              Bilet Platformu Seçin
            </label>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className={selectField}
            >
              <option value="biletix">Biletix (%6.0 Komisyon)</option>
              <option value="passo">Passo (%5.0 Komisyon)</option>
              <option value="bugece">Bugece (%3.5 Komisyon)</option>
              <option value="desk">Organizasyon Masası (%0.0 Komisyon)</option>
              <option value="corporate">Kurumsal Acente (%2.0 Komisyon)</option>
            </select>
          </div>

          <Input
            label="Dış Sistem Referans No"
            value={externalRefInput}
            onChange={(e) => setExternalRefInput(e.target.value)}
          />

          {/* Deterministic Commission Calculation Breakdown */}
          {(() => {
            const gross = firstSelectedProj?.basePrice || 0;
            const comm = CommissionEngineService.calculate(gross, selectedChannelId);
            return (
              <div className={modalPriceSummaryBox}>
                <p className={modalTextBase}>
                  Satış Kanalı: <strong className={textBold}>{comm.salesChannelName}</strong> (%{comm.commissionPercentage.toFixed(1)})
                </p>
                <p className={modalTextBase}>Brüt Satış Tutarı: ₺{comm.grossPrice.toLocaleString('tr-TR')}</p>
                <p className={modalReservedText}>
                  Bilet Platformu Komisyonu: -₺{comm.commissionAmount.toLocaleString('tr-TR')}
                </p>
                <p className={modalTextSuccess}>
                  Net Organizatör Hakedişi: ₺{comm.netRevenue.toLocaleString('tr-TR')}
                </p>
              </div>
            );
          })()}

          <div className={modalNoticeBox}>
            <MailCheck size={14} /> Resend Transactional E-posta & Outbox Defter Bildirimi Otomatik Kuyruğa Alınacaktır.
          </div>

          <Button variant="primary" onClick={handleProcessExternalSaleConfirmation}>
            Satış Kaydını Oluştur & Event Yayınla
          </Button>
        </div>
      </Modal>

      {/* ─── Kapı Giriş Modal ─── */}
      <Modal
        isOpen={isCheckInModalOpen}
        onClose={() => setIsCheckInModalOpen(false)}
        title={`${firstSelectedProj?.name || 'Alan'} VIP Kapı Giriş Doğrulaması`}
      >
        <div className={modalStack}>
          <p className={modalTextMuted}>
            VIP Kuzey Kapısında AdmissionPolicy.evaluate() çalıştırılır. Karar nesnesi döner.
          </p>

          {admissionDecision && (
            <div className={modalTicketTokenBox}>
              <p className={textBold}>Karar Sonucu: {admissionDecision.outcome}</p>
              <p className={modalTokenCode}>
                Kod: {admissionDecision.code} | Mesaj: {admissionDecision.message}
              </p>
            </div>
          )}

          <Button
            variant="primary"
            icon={<UserCheck size={16} />}
            onClick={handleCheckIn}
          >
            Kapı Giriş Kararını İşle
          </Button>
        </div>
      </Modal>

      {/* ─── Seating Generator Modal ─── */}
      <SeatingGeneratorModal
        isOpen={isSeatingModalOpen}
        onClose={() => setIsSeatingModalOpen(false)}
        onGenerateBlock={handleGenerateBlock}
      />

      {/* ─── Customer CRM & History Drawer ─── */}
      <CustomerCrmDrawer
        isOpen={isCrmDrawerOpen}
        onClose={() => setIsCrmDrawerOpen(false)}
        initialSearchQuery={crmSearchQuery}
      />
    </div>
  );
}
