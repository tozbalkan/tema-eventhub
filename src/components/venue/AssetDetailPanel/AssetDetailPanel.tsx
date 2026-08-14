'use client';

import React from 'react';
import { Layers, ChevronUp, ChevronDown, ShieldCheck, Copy, Lock, Unlock, Trash2, AlignLeft, AlignCenter, AlignRight, Group } from 'lucide-react';
import { DesignerAsset, DesignerGroup } from '@/types/designer';
import { VenueAssetReadModel } from '@/operations/projections/VenueAssetProjection';
import { Reservation } from '@/types/reservation';
import { Sale } from '@/types/sale';
import { CurrencyCode } from '@/types/money';
import { formatCurrency, formatMultiCurrencyTotals, formatPriceNumber } from '@/utils/formatCurrency';
import { Button } from '@/components/ui/Button/Button';
import { Badge } from '@/components/ui/Badge/Badge';
import { vars } from '@/styles/tokens.css';
import * as s from './AssetDetailPanel.css';

export interface AssetDetailPanelProps {
  selectedAssetIds: Set<string>;
  assets: DesignerAsset[];
  projections: VenueAssetReadModel[];
  groups: DesignerGroup[];
  reservations: Reservation[];
  sales: Sale[];
  onAssetChange: (id: string, updates: Partial<DesignerAsset>) => void;
  onGroupNameChange: (assetId: string, newGroupName: string) => void;
  onDuplicateAsset: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDeleteAssets: (ids: string[]) => void;
  onGroup: () => void;
  onAlign: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distHorizontal' | 'distVertical' | 'matchWidth' | 'matchHeight' | 'matchSize') => void;
  onReserve: () => void;
  onSale: () => void;
  onCheckIn: () => void;
  onCancelReservation: () => void;
  onOpenCrm?: (query?: string) => void;
  onSelectAsset?: (id: string, multi: boolean) => void;
}

const statusVariant: Record<string, 'Available' | 'Reserved' | 'Sold' | 'Blocked' | 'Neutral'> = {
  Available: 'Available',
  Reserved: 'Reserved',
  Sold: 'Sold',
  Blocked: 'Blocked',
};

const statusLabel: Record<string, string> = {
  Available: '● Müsait',
  Reserved: '● Opsiyonda',
  Sold: '● Satıldı',
  Blocked: '● Bloke',
};

export function AssetDetailPanel({
  selectedAssetIds, assets, projections, groups, reservations, sales,
  onAssetChange, onGroupNameChange, onDuplicateAsset, onToggleLock, onDeleteAssets,
  onGroup, onAlign, onReserve, onSale,
  onCheckIn, onCancelReservation, onOpenCrm, onSelectAsset,
}: AssetDetailPanelProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  if (selectedAssetIds.size === 0) {
    return (
      <div className={s.panel}>
        <div className={s.card}>
          <div className={s.emptyState}>Sahneden bir nesne veya koltuk seçin.</div>
        </div>
      </div>
    );
  }

  const selectedIds = Array.from(selectedAssetIds);
  const selectedAssets = selectedIds.map(id => assets.find(a => a.id === id)).filter(Boolean) as DesignerAsset[];
  const selectedProjections = selectedIds.map(id => projections.find(p => p.assetId === id)).filter(Boolean) as VenueAssetReadModel[];

  const firstAsset = selectedAssets[0];
  const breadcrumbs: { id: string; name: string }[] = [{ id: 'venue_root', name: 'Venue' }];
  if (selectedIds.length === 1 && firstAsset) {
    const parentMap = new Map(assets.map((a) => [a.id, a]));
    let curr: DesignerAsset | undefined = firstAsset;
    const chain: DesignerAsset[] = [];
    while (curr) {
      chain.unshift(curr);
      const pId: string | undefined = curr.parentId;
      curr = pId ? parentMap.get(pId) : undefined;
    }
    chain.forEach((item) => breadcrumbs.push({ id: item.id, name: item.name }));
  }

  /* ─── Multi-select mode ────────────────────────────────── */
  if (selectedIds.length > 1) {
    const totalPax = selectedAssets.reduce((sum, a) => sum + a.paxCapacity, 0);

    // Multi-currency calculation
    const listValueByCurrency: Partial<Record<CurrencyCode, number>> = {};
    for (const a of selectedAssets) {
      const curr = a.pricing.currency || 'TRY';
      listValueByCurrency[curr] = (listValueByCurrency[curr] || 0) + (a.pricing.basePrice || 0);
    }

    const multiCurrencyFormatted = formatMultiCurrencyTotals(listValueByCurrency);

    const statusCounts: Record<string, number> = {};
    for (const a of selectedAssets) {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    }

    return (
      <div className={s.panel}>
        <div className={s.card}>
          <div className={s.cardHeader} onClick={() => setIsOpen(!isOpen)}>
            <span className={s.cardHeaderGroup}>
              <Layers size={16} color={vars.color.primary} /> Toplu Seçim ({selectedIds.length} Alan)
            </span>
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>

          {isOpen && (
            <div className={s.multiSummary}>
              <div className={s.multiKpiRow}>
                <div className={s.multiKpiBox}>
                  <span className={s.multiKpiValuePax}>{totalPax}</span>
                  <span className={s.multiKpiLabel}>Toplam PAX</span>
                </div>
                <div className={s.multiKpiBox}>
                  <span className={s.multiKpiValuePrice}>{multiCurrencyFormatted}</span>
                  <span className={s.multiKpiLabel}>Toplam Liste Değeri</span>
                </div>
              </div>

              <div className={s.detailGrid}>
                {Object.entries(statusCounts).map(([st, count]) => (
                  <div key={st} className={s.detailRow}>
                    <span className={s.detailLabel}>{statusLabel[st] || st}</span>
                    <span className={s.detailValue}>{count} Alan</span>
                  </div>
                ))}
              </div>

              {/* Bulk Precision Sizing & Pricing Inputs */}
              <div className={s.sectionTitle}>Toplu Boyut & Fiyat Güncelleme</div>
              <div className={s.propRow}>
                <div className={s.propInputGroup}>
                  <span className={s.detailLabel}>Genişlik (W)</span>
                  <input
                    type="number"
                    className={s.fieldInput}
                    placeholder="Genişlik..."
                    onChange={e => {
                      const val = Number(e.target.value);
                      if (val > 0) selectedIds.forEach(id => onAssetChange(id, { width: val }));
                    }}
                  />
                </div>
                <div className={s.propInputGroup}>
                  <span className={s.detailLabel}>Yükseklik (H)</span>
                  <input
                    type="number"
                    className={s.fieldInput}
                    placeholder="Yükseklik..."
                    onChange={e => {
                      const val = Number(e.target.value);
                      if (val > 0) selectedIds.forEach(id => onAssetChange(id, { height: val }));
                    }}
                  />
                </div>
              </div>

              {/* Bulk Quick Actions */}
              <div className={s.sectionTitle}>Hızlı Hizalama & Gruplama</div>
              <div className={s.actionRow}>
                <button className={s.actionBtn} onClick={() => onAlign('left')} title="Sola Hizala">
                  <AlignLeft size={12} /> Sol
                </button>
                <button className={s.actionBtn} onClick={() => onAlign('center')} title="Yatay Ortala">
                  <AlignCenter size={12} /> Orta
                </button>
                <button className={s.actionBtn} onClick={() => onAlign('right')} title="Sağa Hizala">
                  <AlignRight size={12} /> Sağ
                </button>
              </div>

              <div className={s.actionRow}>
                <button className={s.actionBtn} onClick={onGroup} title="Gruba Al (Cmd+G)">
                  <Group size={12} /> Gruba Al
                </button>
                <button className={s.actionBtn} onClick={() => onAlign('matchSize')} title="Boyut Eşitle">
                  Eşitle
                </button>
                <button className={s.dangerActionBtn} onClick={() => onDeleteAssets(selectedIds)}>
                  <Trash2 size={12} /> Sil
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Single-select mode ───────────────────────────────── */
  const asset = selectedAssets[0];

  if (!asset) {
    return (
      <div className={s.panel}>
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardHeaderGroup}>
              <Layers size={16} color={vars.color.primary} /> Property Inspector
            </span>
          </div>
          <div className={s.emptyState}>Bir alan seçmek veya düzenlemek için haritada tıklayın</div>
        </div>
      </div>
    );
  }

  const activeReservation = reservations.find(
    r => r.assetId === asset.id && r.status === 'Confirmed'
  );
  const activeSale = sales.find(
    sl => sl.lines.some(l => l.venueAssetId === asset.id) && sl.status === 'Completed'
  );

  const currentCurrency = asset.pricing.currency || 'TRY';

  return (
    <div className={s.panel}>
      <div className={s.card}>
        <div className={s.cardHeader} onClick={() => setIsOpen(!isOpen)}>
          <span className={s.cardHeaderGroup}>
            <Layers size={16} color={vars.color.primary} /> Inspector
          </span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>

        {isOpen && (
          <>
            {/* Breadcrumb Navigation */}
            {breadcrumbs.length > 1 && (
              <div className={s.breadcrumbContainer}>
                {breadcrumbs.map((b, idx) => (
                  <React.Fragment key={b.id}>
                    {idx > 0 && <span>/</span>}
                    <span
                      className={s.breadcrumbItem}
                      onClick={() => b.id !== 'venue_root' && onSelectAsset && onSelectAsset(b.id, false)}
                    >
                      {b.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
            {/* Header Title & Status Badge */}
            <div className={s.detailRow}>
              <input
                className={s.fieldTitleInput}
                value={asset.name}
                onChange={e => onAssetChange(asset.id, { name: e.target.value })}
              />
              <Badge variant={statusVariant[asset.status] || 'Neutral'}>{statusLabel[asset.status]}</Badge>
            </div>

            {/* General Section */}
            <div className={s.sectionTitle}>Genel</div>
            <div className={s.propRow}>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Tip</span>
                <span className={`${s.detailValue} ${s.capitalizeText}`}>{asset.type}</span>
              </div>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Grup Adı</span>
                <input
                  className={s.fieldInput}
                  value={asset.groupName || ''}
                  placeholder="Grup ismi..."
                  onChange={e => onGroupNameChange(asset.id, e.target.value)}
                />
              </div>
            </div>

            {/* Position & Dimensions */}
            <div className={s.sectionTitle}>Pozisyon & Boyut</div>
            <div className={s.propRow}>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Pozisyon X</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={Math.round(asset.x)}
                  disabled={asset.locked}
                  onChange={e => onAssetChange(asset.id, { x: Number(e.target.value) })}
                />
              </div>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Pozisyon Y</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={Math.round(asset.y)}
                  disabled={asset.locked}
                  onChange={e => onAssetChange(asset.id, { y: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className={s.propRow}>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Genişlik (W)</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={Math.round(asset.width)}
                  disabled={asset.locked}
                  onChange={e => onAssetChange(asset.id, { width: Number(e.target.value) })}
                />
              </div>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Yükseklik (H)</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={Math.round(asset.height)}
                  disabled={asset.locked}
                  onChange={e => onAssetChange(asset.id, { height: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className={s.propRow}>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Açı (Rotation °)</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={asset.rotation || 0}
                  disabled={asset.locked}
                  onChange={e => onAssetChange(asset.id, { rotation: Number(e.target.value) % 360 })}
                />
              </div>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>PAX Kapasite</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={asset.paxCapacity}
                  onChange={e => onAssetChange(asset.id, { paxCapacity: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Multi-tier Pricing Section */}
            <div className={s.sectionTitle}>Fiyatlandırma (Ticari Modeller)</div>
            <div className={s.propRow}>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Para Birimi</span>
                <select
                  className={s.fieldSelect}
                  value={currentCurrency}
                  onChange={e => onAssetChange(asset.id, { pricing: { ...asset.pricing, currency: e.target.value as CurrencyCode } })}
                >
                  <option value="TRY">TRY (₺)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Taban Fiyat ({formatCurrency(asset.pricing.basePrice, currentCurrency)})</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={asset.pricing.basePrice}
                  onChange={e => onAssetChange(asset.id, { pricing: { ...asset.pricing, basePrice: Number(e.target.value) } })}
                />
              </div>
            </div>

            <div className={s.propRow}>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Hafta Sonu ({formatCurrency(asset.pricing.weekendPrice || asset.pricing.basePrice * 1.1, currentCurrency)})</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={asset.pricing.weekendPrice || Math.round(asset.pricing.basePrice * 1.1)}
                  onChange={e => onAssetChange(asset.id, { pricing: { ...asset.pricing, weekendPrice: Number(e.target.value) } })}
                />
              </div>
              <div className={s.propInputGroup}>
                <span className={s.detailLabel}>Erken Rezervasyon ({formatCurrency(asset.pricing.earlyBirdPrice || asset.pricing.basePrice * 0.9, currentCurrency)})</span>
                <input
                  type="number"
                  className={s.fieldInput}
                  value={asset.pricing.earlyBirdPrice || Math.round(asset.pricing.basePrice * 0.9)}
                  onChange={e => onAssetChange(asset.id, { pricing: { ...asset.pricing, earlyBirdPrice: Number(e.target.value) } })}
                />
              </div>
            </div>

            {/* Status Section */}
            <div className={s.sectionTitle}>Operasyonel Statü</div>
            <select
              className={s.fieldSelect}
              value={asset.status}
              onChange={e => onAssetChange(asset.id, { status: e.target.value as any })}
            >
              <option value="Available">Müsait (Available)</option>
              <option value="Reserved">Opsiyonda (Reserved)</option>
              <option value="Sold">Satıldı (Sold)</option>
              <option value="Blocked">Bloke (Blocked)</option>
            </select>

            {/* Designer Action Buttons: Duplicate, Lock, Delete */}
            <div className={s.actionRow}>
              <button className={s.actionBtn} onClick={() => onDuplicateAsset(asset.id)} title="Çoğalt (Cmd+D)">
                <Copy size={12} /> Çoğalt
              </button>
              <button className={s.actionBtn} onClick={() => onToggleLock(asset.id)} title="Kilitle/Aç">
                {asset.locked ? <Unlock size={12} /> : <Lock size={12} />}
                {asset.locked ? 'Aç' : 'Kilitle'}
              </button>
              <button className={s.dangerActionBtn} onClick={() => onDeleteAssets([asset.id])} title="Sil (Delete)">
                <Trash2 size={12} /> Sil
              </button>
            </div>

            {/* Existing Active Operational Details */}
            {activeReservation && (
              <>
                <div className={s.sectionTitle}>Aktif Opsiyon Detayı</div>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Müşteri</span>
                  <span className={s.detailValue}>{activeReservation.customerName}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Telefon</span>
                  <span className={s.detailValue}>{activeReservation.customerPhone}</span>
                </div>
                {onOpenCrm && (
                  <Button
                    variant="secondary"
                    onClick={() => onOpenCrm(activeReservation.customerPhone || activeReservation.customerName)}
                    className={s.buttonTopMargin}
                  >
                    Müşteri CRM Profilini Gör
                  </Button>
                )}
              </>
            )}

            {activeSale && (
              <>
                <div className={s.sectionTitle}>Aktif Satış Detayı</div>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Alıcı</span>
                  <span className={s.detailValue}>{activeSale.purchaserSnapshot?.fullName || '—'}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Kanal</span>
                  <span className={s.detailValue}>{activeSale.channel?.name || '—'} (%{(activeSale.commissionRate * 100).toFixed(1)} Komisyon)</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Net Hakediş</span>
                  <span className={`${s.detailValue} ${s.netRevenueColor}`}>₺{activeSale.netRevenue.toLocaleString('tr-TR')}</span>
                </div>
                {onOpenCrm && (
                  <Button
                    variant="secondary"
                    onClick={() => onOpenCrm(activeSale.purchaserSnapshot?.phone || activeSale.purchaserSnapshot?.fullName)}
                    className={s.buttonTopMargin}
                  >
                    Müşteri CRM Profilini Gör
                  </Button>
                )}
              </>
            )}

            {/* Operational Actions */}
            <div className={s.actions}>
              {asset.status === 'Available' && (
                <>
                  <Button variant="secondary" onClick={onReserve}>Opsiyonla & Rezerve Et</Button>
                  <Button variant="primary" onClick={onSale}>Dış Satış Bildirimini Kaydet</Button>
                </>
              )}
              {asset.status === 'Reserved' && (
                <>
                  <Button variant="primary" onClick={onSale}>Satışı Sisteme İşle</Button>
                  <Button variant="danger" onClick={onCancelReservation}>Opsiyonu İptal Et</Button>
                </>
              )}
              {asset.status === 'Sold' && (
                <Button variant="secondary" icon={<ShieldCheck size={14} />} onClick={onCheckIn}>
                  Kapı Giriş Doğrulaması Yap
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
