import { DesignerAsset, DesignerGroup, DesignerDraft, SnapGridOption } from '@/types/designer';

const DRAFT_KEY = 'stageops_designer_draft_v2';

export class DesignerStorageService {
  public static saveDraft(
    assets: DesignerAsset[],
    groups: DesignerGroup[],
    viewport?: { x: number; y: number; w: number; h: number },
    gridSnap?: SnapGridOption
  ): string {
    if (typeof window === 'undefined') return new Date().toISOString();

    const timestamp = new Date().toISOString();
    const draft: DesignerDraft = {
      version: 2,
      timestamp,
      assets,
      groups,
      viewport,
      gridSnap,
    };

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (err) {
      console.warn('Failed to save designer draft to localStorage', err);
    }

    return timestamp;
  }

  public static loadDraft(): DesignerDraft | null {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as DesignerDraft;
      if (parsed && parsed.version === 2 && Array.isArray(parsed.assets)) {
        return parsed;
      }
    } catch (err) {
      console.warn('Failed to parse stored designer draft', err);
    }
    return null;
  }

  public static clearDraft(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  public static getLastSavedTimestamp(): string | null {
    const draft = this.loadDraft();
    return draft ? draft.timestamp : null;
  }
}
