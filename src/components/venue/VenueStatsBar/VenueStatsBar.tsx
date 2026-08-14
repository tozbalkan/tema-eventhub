'use client';

import React, { useMemo } from 'react';
import { DesignerAsset } from '@/types/designer';
import { VenueAssetReadModel } from '@/operations/projections/VenueAssetProjection';
import { CurrencyCode } from '@/types/money';
import { formatMultiCurrencyTotals } from '@/utils/formatCurrency';
import * as s from './VenueStatsBar.css';

export interface VenueStatsBarProps {
  assets: DesignerAsset[];
  projections: VenueAssetReadModel[];
  fireCapacity: number;
}

export function VenueStatsBar({ assets, fireCapacity }: VenueStatsBarProps) {
  const stats = useMemo(() => {
    const sellableAssets = assets.filter(a => a.type !== 'stage' && a.type !== 'bar');
    const available = sellableAssets.filter(a => a.status === 'Available').length;
    const reserved = sellableAssets.filter(a => a.status === 'Reserved').length;
    const sold = sellableAssets.filter(a => a.status === 'Sold').length;
    const totalPax = sellableAssets.reduce((sum, a) => sum + a.paxCapacity, 0);

    // Multi-currency calculation
    const listValueByCurrency: Partial<Record<CurrencyCode, number>> = {};
    const revenueByCurrency: Partial<Record<CurrencyCode, number>> = {};

    for (const a of sellableAssets) {
      const curr = a.pricing.currency || 'TRY';
      const price = a.pricing.basePrice || 0;
      listValueByCurrency[curr] = (listValueByCurrency[curr] || 0) + price;

      if (a.status === 'Sold') {
        revenueByCurrency[curr] = (revenueByCurrency[curr] || 0) + price;
      }
    }

    return {
      total: sellableAssets.length,
      available,
      reserved,
      sold,
      totalPax,
      totalListValueFormatted: formatMultiCurrencyTotals(listValueByCurrency),
      actualRevenueFormatted: formatMultiCurrencyTotals(revenueByCurrency),
    };
  }, [assets]);

  const items = [
    { value: String(stats.total), label: 'Satılabilir Alan', className: s.statValuePrimary },
    { value: String(stats.available), label: 'Müsait', className: s.statValueAvailable },
    { value: String(stats.reserved), label: 'Opsiyonda', className: s.statValueReserved },
    { value: String(stats.sold), label: 'Satıldı', className: s.statValueSold },
    { value: `${stats.totalPax} / ${fireCapacity}`, label: 'PAX Kapasite', className: s.statValuePax },
    { value: stats.totalListValueFormatted, label: 'Toplam Liste Değeri', className: s.statValuePrimary },
    { value: stats.actualRevenueFormatted, label: 'Gerçekleşen Gelir', className: s.statValueAvailable },
  ];

  return (
    <div className={s.statsBar}>
      {items.map(item => (
        <div key={item.label} className={s.statCard}>
          <span className={item.className}>{item.value}</span>
          <span className={s.statLabel}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
