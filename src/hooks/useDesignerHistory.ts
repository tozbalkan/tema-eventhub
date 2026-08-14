import { useState, useCallback, useRef } from 'react';
import { DesignerAsset, DesignerGroup, DesignerHistorySnapshot } from '@/types/designer';

const MAX_HISTORY = 30;

export function useDesignerHistory(
  initialAssets: DesignerAsset[],
  initialGroups: DesignerGroup[]
) {
  const [past, setPast] = useState<DesignerHistorySnapshot[]>([]);
  const [future, setFuture] = useState<DesignerHistorySnapshot[]>([]);

  // Current state held in ref for instant snapshot comparison
  const currentRef = useRef<DesignerHistorySnapshot>({
    assets: initialAssets,
    groups: initialGroups,
  });

  const pushState = useCallback((newAssets: DesignerAsset[], newGroups: DesignerGroup[]) => {
    // Deep clone / copy snapshots
    const snapshot: DesignerHistorySnapshot = {
      assets: newAssets.map(a => ({ ...a, pricing: { ...a.pricing }, appearance: a.appearance ? { ...a.appearance } : undefined })),
      groups: newGroups.map(g => ({ ...g, assetIds: [...g.assetIds] })),
    };

    setPast(prev => {
      const updated = [...prev, currentRef.current];
      if (updated.length > MAX_HISTORY) {
        return updated.slice(updated.length - MAX_HISTORY);
      }
      return updated;
    });

    currentRef.current = snapshot;
    setFuture([]);
  }, []);

  const undo = useCallback((
    onApply: (snapshot: DesignerHistorySnapshot) => void
  ) => {
    setPast(prev => {
      if (prev.length === 0) return prev;
      const previousSnapshot = prev[prev.length - 1]!;
      const remainingPast = prev.slice(0, prev.length - 1);

      setFuture(fut => [currentRef.current, ...fut]);
      currentRef.current = previousSnapshot;

      onApply(previousSnapshot);
      return remainingPast;
    });
  }, []);

  const redo = useCallback((
    onApply: (snapshot: DesignerHistorySnapshot) => void
  ) => {
    setFuture(prev => {
      if (prev.length === 0) return prev;
      const nextSnapshot = prev[0]!;
      const remainingFuture = prev.slice(1);

      setPast(pst => [...pst, currentRef.current]);
      currentRef.current = nextSnapshot;

      onApply(nextSnapshot);
      return remainingFuture;
    });
  }, []);

  const resetHistory = useCallback((assets: DesignerAsset[], groups: DesignerGroup[]) => {
    currentRef.current = {
      assets: assets.map(a => ({ ...a, pricing: { ...a.pricing } })),
      groups: groups.map(g => ({ ...g, assetIds: [...g.assetIds] })),
    };
    setPast([]);
    setFuture([]);
  }, []);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pushState,
    undo,
    redo,
    resetHistory,
  };
}
