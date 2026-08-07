'use client';

import React, { useState } from 'react';
import { 
  UserCheck, 
  Sparkles,
  QrCode,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { Badge } from '@/components/ui/Badge/Badge';
import { Modal } from '@/components/ui/Modal/Modal';
import { Input } from '@/components/ui/Input/Input';

import { VenueService } from '@/services/VenueService';
import { ReservationService } from '@/services/ReservationService';
import { ProcessExternalSaleConfirmationUseCase } from '@/services/ProcessExternalSaleConfirmationUseCase';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { VenueAsset } from '@/types/venue-asset';

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
  floorPlanBadgeGroup,
  svgCanvasContainer,
  svgCanvasElement,
  svgGroupAsset,
  svgGroupStage,
  sidebarPanel,
  card,
  cardTitle,
  cardTitleGroup,
  accordionContent,
  kpiGrid,
  kpiBox,
  kpiValue,
  kpiLabel,
  assetDetailGrid,
  assetDetailRow,
  assetDetailLabel,
  assetDetailValue,
  selectedAssetActions,
  textSubtleSm,
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
  modalTextError,
} from './page.css';

interface TimelineLog {
  time: string;
  title: string;
  sub: string;
}

export default function OperationalWorkspaceDesk() {
  const [assets, setAssets] = useState<VenueAsset[]>(VenueService.getAssets());
  const [selectedAsset, setSelectedAsset] = useState<VenueAsset | null>(assets[1] || null); // Default selected VIP A1
  
  // Akordiyon durum yönetimi
  const [accordionState, setAccordionState] = useState({
    selected: true,
    tasks: true,
    timeline: true,
  });

  // Modal durumları
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);

  // Form durumları
  const [custName, setCustName] = useState('Emre Kaya');
  const [custPhone, setCustPhone] = useState('+905351234567');
  const [custEmail, setCustEmail] = useState('emre@vip.com');

  // Canlı İşlem Zaman Çizelgesi
  const [timeline, setTimeline] = useState<TimelineLog[]>([
    { time: '17:42', title: '✓ Biletix Satış Bildirimi İşlendi', sub: 'Ref: BTX-20260807-18291 (Net: ₺23.500)' },
    { time: '17:40', title: '✓ Satış Kanalı Doğrulandı', sub: 'Kanal: Biletix' },
    { time: '17:39', title: '✓ Bilet Düzenlendi', sub: 'Token: VIP_A1_87F4A0B2' },
    { time: '17:38', title: '✓ Opsiyon Oluşturuldu', sub: 'Selin Yılmaz (VIP Masa A2)' },
    { time: '17:30', title: '✓ Kapı Girişi Doğrulandı', sub: 'VIP Kuzey Kapısı (Mehmet Y.)' },
  ]);

  const toggleAccordion = (key: keyof typeof accordionState) => {
    setAccordionState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const refreshData = () => {
    setAssets([...VenueService.getAssets()]);
  };

  const addTimeline = (title: string, sub: string) => {
    const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setTimeline((prev) => [{ time: nowStr, title, sub }, ...prev]);
  };

  // İade / Opsiyon / Satış / Check-In İşlem Tetikleyicileri
  const handleReserve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    try {
      const res = ReservationService.createReservation({
        eventId: MockDataStore.event.id,
        assetId: selectedAsset.id,
        customerName: custName,
        customerPhone: custPhone,
        customerEmail: custEmail,
        guestCountPax: selectedAsset.paxCapacity,
      });

      addTimeline(
        `✓ Opsiyon Tanımlandı: ${selectedAsset.name}`,
        `${custName} (${custPhone}) - 24 Saat Süreli Opsiyon`
      );
      setIsReserveModalOpen(false);
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleProcessExternalSaleConfirmation = () => {
    if (!selectedAsset) return;

    try {
      const ref = `BTX-20260807-${Math.floor(10000 + Math.random() * 90000)}`;
      // Execute ProcessExternalSaleConfirmationUseCase Application Use Case
      const result = ProcessExternalSaleConfirmationUseCase.execute({
        eventId: MockDataStore.event.id,
        assetId: selectedAsset.id,
        salesChannelId: 'biletix',
        externalSaleReference: ref,
      });

      addTimeline(
        `✓ Dış Satış Bildirimi İşlendi: ${selectedAsset.name}`,
        `Kanal: Biletix | Ref: ${ref} | Net Hakediş: ₺${result.sale.netRevenue.toLocaleString('tr-TR')} (Bilet Token: ${result.ticket.token})`
      );

      setIsSaleModalOpen(false);
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelReservation = () => {
    if (!selectedAsset) return;
    const res = MockDataStore.reservations.find((r) => r.assetId === selectedAsset.id && r.status === 'Confirmed');
    if (!res) return;

    ReservationService.cancelReservation(res.id, 'ORGANIZER');
    addTimeline(`✓ Opsiyon İptal Edildi: ${selectedAsset.name}`, `Masa tekrar müsait statüsüne çekildi.`);
    refreshData();
  };

  const handleCheckIn = () => {
    const activeTicket = MockDataStore.tickets.find((t) => t.status === 'Active');
    if (!activeTicket) {
      alert('Giriş simülasyonu için aktif bilet bulunamadı! Önce dış sistem satış bildirimini işleyin.');
      return;
    }

    activeTicket.status = 'CheckedIn';
    MockDataStore.checkIns.push({
      id: `chk_${Date.now()}`,
      organizationId: MockDataStore.organizationId,
      eventId: MockDataStore.event.id,
      reservationId: activeTicket.reservationId,
      ticketId: activeTicket.id,
      gateId: MockDataStore.gates[0]?.id || 'gate_vip_north',
      checkedInAt: new Date().toISOString(),
      checkedInBy: 'VIP Kapı Görevlisi',
      status: 'Completed',
    });

    addTimeline(`✓ Kapı Girişi Onaylandı`, `Bilet ${activeTicket.id} VIP Kuzey Kapısından Taptırıldı`);
    setIsCheckInModalOpen(false);
    refreshData();
  };

  // Target Customer details for selected asset
  const activeReservation = selectedAsset ? MockDataStore.reservations.find((r) => r.assetId === selectedAsset.id && r.status === 'Confirmed') : undefined;
  const activeSale = selectedAsset ? MockDataStore.sales.find((s) => s.lines.some((l) => l.venueAssetId === selectedAsset.id) && s.status === 'Completed') : undefined;

  return (
    <div className={pageContainer}>
      {/* Real-world Operational Workspace Header */}
      <header className={header}>
        <div className={logoGroup}>
          <div className={logoBadge}>VIP OPERASYON MASASI</div>
          <div>
            <h1 className={headerTitle}>
              <Sparkles size={18} color="hsl(260 85% 65%)" /> {MockDataStore.event.name}
            </h1>
            <p className={headerSubtitle}>
              20 Ağustos 2026 | 19:30 - 04:00 | {MockDataStore.venue.name}
            </p>
          </div>
        </div>

        <div className={headerBadgeGroup}>
          <Badge variant="Available">Satışta</Badge>
          <Badge variant="Neutral">Yayında</Badge>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={refreshData}>
            Yenile
          </Button>
        </div>
      </header>

      {/* Main Single-Page Workspace Grid */}
      <div className={mainGrid}>
        {/* SVG Interactive Seat Map Canvas Workspace */}
        <div className={floorPlanPanel}>
          <div className={floorPlanHeader}>
            <div>
              <h2 className={floorPlanTitle}>Canlı Oturma Haritası</h2>
              <p className={floorPlanSubTitle}>
                Yangın Emniyeti Sınırı: {MockDataStore.venue.fireCapacity} PAX | Bir masa seçerek detaylarını yönetin.
              </p>
            </div>
            <div className={floorPlanBadgeGroup}>
              <Badge variant="Available">Müsait</Badge>
              <Badge variant="Reserved">Opsiyonda</Badge>
              <Badge variant="Sold">Satıldı</Badge>
              <Badge variant="Blocked">Bloke</Badge>
            </div>
          </div>

          {/* SVG Canvas Container (Aspect Ratio 16/10) */}
          <div className={svgCanvasContainer}>
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 600 320"
              className={svgCanvasElement}
            >
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(224 18% 18%)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {assets.map((asset) => {
                const isSelected = selectedAsset?.id === asset.id;
                let strokeColor = 'hsl(224 18% 24%)';
                let fillColor = 'hsl(224 22% 12%)';

                if (asset.status === 'Available') {
                  fillColor = 'hsl(142 70% 45% / 0.15)';
                  strokeColor = 'hsl(142 70% 45%)';
                } else if (asset.status === 'Reserved') {
                  fillColor = 'hsl(45 90% 50% / 0.2)';
                  strokeColor = 'hsl(45 90% 50%)';
                } else if (asset.status === 'Sold') {
                  fillColor = 'hsl(350 80% 55% / 0.2)';
                  strokeColor = 'hsl(350 80% 55%)';
                } else if (asset.status === 'Blocked') {
                  fillColor = 'hsl(220 15% 45% / 0.2)';
                  strokeColor = 'hsl(220 15% 45%)';
                }

                if (isSelected) {
                  strokeColor = 'hsl(260 85% 65%)';
                }

                return (
                  <g
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={asset.category === 'Stage' ? svgGroupStage : svgGroupAsset}
                  >
                    {asset.shape === 'Circle' ? (
                      <circle
                        cx={asset.x + asset.width / 2}
                        cy={asset.y + asset.height / 2}
                        r={asset.width / 2}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                    ) : (
                      <rect
                        x={asset.x}
                        y={asset.y}
                        width={asset.width}
                        height={asset.height}
                        rx={6}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                    )}
                    <text
                      x={asset.x + asset.width / 2}
                      y={asset.y + asset.height / 2 + 4}
                      textAnchor="middle"
                      fill={asset.category === 'Stage' ? 'hsl(224 15% 75%)' : 'hsl(0 0% 98%)'}
                      fontSize="11"
                      fontWeight="600"
                    >
                      {asset.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Dedicated Operator Dynamic Right Workspace Sidebar */}
        <div className={sidebarPanel}>
          {/* Selected Asset Rich Workspace Card */}
          <div className={card}>
            <div className={cardTitle} onClick={() => toggleAccordion('selected')}>
              <span className={cardTitleGroup}>
                <Layers size={16} color="hsl(260 85% 65%)" /> Seçili Alan Detayı
              </span>
              {accordionState.selected ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {accordionState.selected && selectedAsset && (
              <div className={accordionContent}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 className={floorPlanTitle}>{selectedAsset.name}</h3>
                  {selectedAsset.status === 'Available' && <Badge variant="Available">● Müsait</Badge>}
                  {selectedAsset.status === 'Reserved' && <Badge variant="Reserved">● Opsiyonda</Badge>}
                  {selectedAsset.status === 'Sold' && <Badge variant="Sold">● Satıldı</Badge>}
                  {selectedAsset.status === 'Blocked' && <Badge variant="Blocked">● Bloke</Badge>}
                </div>

                <div className={assetDetailGrid}>
                  <div className={assetDetailRow}>
                    <span className={assetDetailLabel}>Grup / Zone</span>
                    <span className={assetDetailValue}>{selectedAsset.groupName || 'Genel Saha'}</span>
                  </div>

                  <div className={assetDetailRow}>
                    <span className={assetDetailLabel}>Kapasite</span>
                    <span className={assetDetailValue}>{selectedAsset.paxCapacity} Kişi</span>
                  </div>

                  <div className={assetDetailRow}>
                    <span className={assetDetailLabel}>Liste Fiyatı</span>
                    <span className={assetDetailValue}>₺{selectedAsset.pricing.basePrice.toLocaleString('tr-TR')}</span>
                  </div>

                  {activeReservation && (
                    <>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Müşteri</span>
                        <span className={assetDetailValue}>{activeReservation.customerName}</span>
                      </div>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Telefon</span>
                        <span className={assetDetailValue}>{activeReservation.customerPhone}</span>
                      </div>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Opsiyon Bitiş</span>
                        <span className={assetDetailValue}>18:42 (Kalan: 04sa 20dk)</span>
                      </div>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Temsilci</span>
                        <span className={assetDetailValue}>Ahmet Yılmazer</span>
                      </div>
                    </>
                  )}

                  {activeSale && (
                    <>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Alıcı Müşteri</span>
                        <span className={assetDetailValue}>Tarık Özbalkan</span>
                      </div>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Satış Kanalı</span>
                        <span className={assetDetailValue}>Biletix (Ref: BTX-20260807-18291)</span>
                      </div>
                    </>
                  )}

                  {selectedAsset.metadata?.includedDrinks && (
                    <div className={assetDetailRow}>
                      <span className={assetDetailLabel}>Dahil Olanlar</span>
                      <span className={assetDetailValue}>{selectedAsset.metadata.includedDrinks.join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Operator Actions */}
                <div className={selectedAssetActions}>
                  {selectedAsset.status === 'Available' && (
                    <>
                      <Button variant="secondary" onClick={() => setIsReserveModalOpen(true)}>
                        Opsiyonla & Rezerve Et
                      </Button>
                      <Button variant="primary" onClick={() => setIsSaleModalOpen(true)}>
                        Dış Sistem Satışını İşle (Biletix / Passo)
                      </Button>
                    </>
                  )}
                  {selectedAsset.status === 'Reserved' && (
                    <>
                      <Button variant="primary" onClick={() => setIsSaleModalOpen(true)}>
                        Satışı Kaydet & Bilet Düzenle
                      </Button>
                      <Button variant="danger" onClick={handleCancelReservation}>
                        Opsiyonu İptal Et
                      </Button>
                    </>
                  )}
                  {selectedAsset.status === 'Sold' && (
                    <Button variant="secondary" icon={<QrCode size={14} />} onClick={() => setIsCheckInModalOpen(true)}>
                      Kapı Check-In Taraması Yap
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Operational Task Queue (Bekleyen İşler) Card */}
          <div className={card}>
            <div className={cardTitle} onClick={() => toggleAccordion('tasks')}>
              <span className={cardTitleGroup}>
                <Clock size={16} color="hsl(45 90% 50%)" /> Bekleyen Operasyon İşleri
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

          {/* Real-time Operational Timeline Stream Card */}
          <div className={card}>
            <div className={cardTitle} onClick={() => toggleAccordion('timeline')}>
              <span className={cardTitleGroup}>
                <CheckCircle2 size={16} color="hsl(142 70% 45%)" /> Canlı İşlem Zaman Çizelgesi
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
      </div>

      {/* Opsiyon & Rezervasyon Modalı */}
      <Modal
        isOpen={isReserveModalOpen}
        onClose={() => setIsReserveModalOpen(false)}
        title={`${selectedAsset?.name} için Opsiyon Tanımla`}
      >
        <form onSubmit={handleReserve} className={modalForm}>
          <Input label="Müşteri Ad Soyad" value={custName} onChange={(e) => setCustName(e.target.value)} required />
          <Input label="Cep Telefonu" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} required />
          <Input label="E-posta Adresi" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} required />
          
          <Button type="submit" variant="primary">
            24 Saatlik Rezervasyon Opsiyonunu Onayla
          </Button>
        </form>
      </Modal>

      {/* Dış Sistem Satış Bildirim Modalı */}
      <Modal
        isOpen={isSaleModalOpen}
        onClose={() => setIsSaleModalOpen(false)}
        title={`${selectedAsset?.name} - Dış Sistem Satış Bildirimi (Biletix / Passo)`}
      >
        <div className={modalStack}>
          <div className={modalPriceSummaryBox}>
            <p className={modalTextBase}>Satış Kanalı: <strong className={textBold}>Biletix</strong></p>
            <p className={modalTextMuted}>Dış Referans No: BTX-20260807-18291</p>
            <p className={modalTextBase}>Brüt Tutarı: ₺{selectedAsset?.pricing.basePrice.toLocaleString('tr-TR')}</p>
            <p className={modalTextSuccess}>Net Organizatör Hakedişi: ₺{((selectedAsset?.pricing.basePrice || 0) * 0.94).toLocaleString('tr-TR')}</p>
          </div>

          <p className={textSubtleSm}>
            Biletix / Passo kanalından gelen satış bildirimini StageOps operasyon defterine işler. Sırasıyla: Satış Kaydı ➔ Çift Taraflı Muhasebe Defteri ➔ Bilet Üretimi gerçekleşir.
          </p>

          <Button variant="primary" onClick={handleProcessExternalSaleConfirmation}>
            Satışı Sisteme İşle & Bileti Düzenle
          </Button>
        </div>
      </Modal>

      {/* Kapı Check-In Modalı */}
      <Modal
        isOpen={isCheckInModalOpen}
        onClose={() => setIsCheckInModalOpen(false)}
        title="VIP Kapı Check-In Masası"
      >
        <div className={modalStack}>
          <p className={modalTextMuted}>
            VIP Kuzey Kapısında QR Kod Taraması Yapılır. Bilet durumu doğrulanır.
          </p>

          {MockDataStore.tickets.find((t) => t.status === 'Active') ? (
            <div className={modalTicketTokenBox}>
              <p className={textBold}>Aktif Bilet Kodu Taranmaya Hazır</p>
              <p className={modalTokenCode}>
                {MockDataStore.tickets.find((t) => t.status === 'Active')?.token}
              </p>
            </div>
          ) : (
            <p className={modalTextError}>Aktif bilet bulunamadı! Lütfen önce dış sistem satışını işleyin.</p>
          )}

          <Button
            variant="primary"
            icon={<UserCheck size={16} />}
            onClick={handleCheckIn}
            disabled={!MockDataStore.tickets.find((t) => t.status === 'Active')}
          >
            Müşteri Kapı Girişini Tamamla
          </Button>
        </div>
      </Modal>
    </div>
  );
}
