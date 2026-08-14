'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, UserCheck, Phone, Mail, Award, DollarSign, Calendar, MessageSquare, Plus } from 'lucide-react';
import { CustomerCrmService, CustomerHistorySummary } from '@/services/CustomerCrmService';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { vars } from '@/styles/tokens.css';
import * as s from './CustomerCrmDrawer.css';

export interface CustomerCrmDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialSearchQuery?: string;
}

export function CustomerCrmDrawer({ isOpen, onClose, initialSearchQuery = '' }: CustomerCrmDrawerProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [historySummary, setHistorySummary] = useState<CustomerHistorySummary | null>(null);
  const [noteContent, setNoteContent] = useState('');

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      const summary = CustomerCrmService.getCustomerProfileWithHistory(initialSearchQuery);
      setHistorySummary(summary);
    } else {
      // Default to first customer if no search query provided
      const summary = CustomerCrmService.getCustomerProfileWithHistory('cust_tarik_01');
      setHistorySummary(summary);
    }
  }, [initialSearchQuery, isOpen]);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const summary = CustomerCrmService.getCustomerProfileWithHistory(searchQuery);
    setHistorySummary(summary);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!historySummary || !noteContent.trim()) return;
    CustomerCrmService.addNoteToCustomer(historySummary.customer.id, noteContent);
    setNoteContent('');
    // Refresh summary
    const updated = CustomerCrmService.getCustomerProfileWithHistory(historySummary.customer.id);
    setHistorySummary(updated);
  };

  return (
    <div className={s.drawerOverlay} onClick={onClose}>
      <div className={s.drawerContainer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={s.drawerHeader}>
          <div className={s.drawerTitleGroup}>
            <UserCheck size={20} color={vars.color.primary} />
            <h2 className={s.drawerTitle}>Müşteri CRM & Geçmiş Defteri</h2>
          </div>
          <button className={s.closeBtn} onClick={onClose} title="Kapat">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={s.drawerContent}>
          {/* Search Box */}
          <form onSubmit={handleSearch} className={s.searchBox}>
            <Input
              label="Müşteri Ara (Telefon / E-posta / Ad Soyad)"
              placeholder="+90532... veya email@example.com"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button type="submit" variant="secondary" icon={<Search size={14} />}>
              CRM Sorgula (Telefon → E-posta Öncelikli)
            </Button>
          </form>

          {/* Profile Details */}
          {historySummary ? (
            <>
              <div className={s.profileCard}>
                <div className={s.profileHeader}>
                  <div>
                    <h3 className={s.profileName}>{historySummary.customer.fullName}</h3>
                    <div className={s.profileMeta}>
                      <span><Phone size={12} className={s.iconInline} /> {historySummary.customer.phone}</span>
                      <span><Mail size={12} className={s.iconInline} /> {historySummary.customer.email}</span>
                      {historySummary.customer.company && (
                        <span><Award size={12} className={s.iconInline} /> {historySummary.customer.company}</span>
                      )}
                    </div>
                  </div>
                  <div className={s.tagGroup}>
                    {historySummary.customer.tags.map((t) => (
                      <Badge key={t} variant={t === 'VIP' ? 'Available' : 'Neutral'}>
                        {t}
                      </Badge>
                    ))}
                    <Badge variant="Neutral">{historySummary.customer.source}</Badge>
                  </div>
                </div>

                {/* Lifetime KPI Stats */}
                <div className={s.kpiGrid}>
                  <div className={s.kpiBox}>
                    <span className={s.kpiVal}>₺{historySummary.lifetimeSpend.toLocaleString('tr-TR')}</span>
                    <span className={s.kpiLbl}>Toplam Harcama</span>
                  </div>
                  <div className={s.kpiBox}>
                    <span className={s.kpiVal}>{historySummary.completedSalesCount}</span>
                    <span className={s.kpiLbl}>Satın Alınan Masa</span>
                  </div>
                  <div className={s.kpiBox}>
                    <span className={s.kpiVal}>{historySummary.activeReservationsCount}</span>
                    <span className={s.kpiLbl}>Aktif Opsiyon</span>
                  </div>
                </div>
              </div>

              {/* Cross-Event Sales Timeline */}
              <div>
                <h4 className={s.sectionTitle}>
                  <DollarSign size={14} /> Etkinlik Satış & İşlem Geçmişi ({historySummary.salesHistory.length})
                </h4>
                {historySummary.salesHistory.length > 0 ? (
                  <div className={s.historyList}>
                    {historySummary.salesHistory.map((sale) => (
                      <div key={sale.id} className={s.historyItem}>
                        <div className={s.historyItemHeader}>
                          <span className={s.historyItemTitle}>{sale.eventName} — {sale.assetName}</span>
                          <Badge variant={sale.status === 'Completed' ? 'Available' : 'Reserved'}>
                            {sale.status === 'Completed' ? 'Satıldı' : sale.status}
                          </Badge>
                        </div>
                        <div className={s.historyItemSub}>
                          Kanal: <strong>{sale.channel?.name || sale.salesChannelId}</strong> | Ref: {sale.externalReference}
                        </div>
                        <div className={s.historyItemSub}>
                          Brüt: ₺{sale.grossPrice.toLocaleString('tr-TR')} | Komisyon: ₺{sale.commissionPaid.toLocaleString('tr-TR')} (%{(sale.commissionRate * 100).toFixed(1)}) | Net: <strong className={s.netRevenueHighlight}>₺{sale.netRevenue.toLocaleString('tr-TR')}</strong>
                        </div>
                        <div className={`${s.historyItemSub} ${s.textMutedSub}`}>
                          Tarih: {new Date(sale.saleDate).toLocaleString('tr-TR')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={s.emptyState}>Henüz kayıtlı bir dış satış işlemi bulunmuyor.</p>
                )}
              </div>

              {/* Reservations History */}
              <div>
                <h4 className={s.sectionTitle}>
                  <Calendar size={14} /> Opsiyon & Rezervasyon Geçmişi ({historySummary.reservationHistory.length})
                </h4>
                {historySummary.reservationHistory.length > 0 ? (
                  <div className={s.historyList}>
                    {historySummary.reservationHistory.map((res) => (
                      <div key={res.id} className={s.historyItem}>
                        <div className={s.historyItemHeader}>
                          <span className={s.historyItemTitle}>{res.eventName} — {res.assetName}</span>
                          <Badge variant={res.status === 'Confirmed' ? 'Reserved' : 'Neutral'}>
                            {res.status === 'Confirmed' ? 'Aktif Opsiyon' : res.status}
                          </Badge>
                        </div>
                        <div className={s.historyItemSub}>
                          Kapasite: {res.guestCountPax} PAX | Son Kullanma: {new Date(res.expirationDate).toLocaleString('tr-TR')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={s.emptyState}>Aktif veya geçmiş opsiyon kaydı bulunmuyor.</p>
                )}
              </div>

              {/* Operational Notes Timeline */}
              <div>
                <h4 className={s.sectionTitle}>
                  <MessageSquare size={14} /> Operasyonel Notlar Defteri ({historySummary.customer.notesTimeline.length})
                </h4>
                <form onSubmit={handleAddNote} className={s.noteForm}>
                  <textarea
                    className={s.noteInput}
                    placeholder="Müşteri hakkında özel operasyonel not ekleyin (örn: VIP şampanya ikramı, özel giriş kapısı talebi)..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                  />
                  <Button type="submit" variant="primary" icon={<Plus size={14} />}>
                    Notu Deftere İşle
                  </Button>
                </form>

                {historySummary.customer.notesTimeline.length > 0 && (
                  <div className={`${s.historyList} ${s.sectionMarginTop}`}>
                    {historySummary.customer.notesTimeline.map((note) => (
                      <div key={note.id} className={s.historyItem}>
                        <div className={s.historyItemHeader}>
                          <span className={s.historyItemTitle}>{note.author}</span>
                          <span className={s.historyItemSub}>{note.date}</span>
                        </div>
                        <div className={`${s.historyItemSub} ${s.textHighSub}`}>
                          {note.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className={s.emptyState}>Sorgulanan kritere uygun müşteri kaydı bulunamadı.</p>
          )}
        </div>
      </div>
    </div>
  );
}
