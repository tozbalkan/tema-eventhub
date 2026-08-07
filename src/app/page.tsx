'use client';

import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { Badge } from '@/components/ui/Badge/Badge';
import { Modal } from '@/components/ui/Modal/Modal';
import { Input } from '@/components/ui/Input/Input';

import { VenueService } from '@/services/VenueService';
import { ReservationService } from '@/services/ReservationService';
import { ProcessExternalSaleConfirmationUseCase } from '@/services/ProcessExternalSaleConfirmationUseCase';
import { VenueAssetProjection, VenueAssetReadModel } from '@/operations/projections/VenueAssetProjection';
import { AdmissionPolicy, AdmissionDecision } from '@/operations/domain/services/AdmissionPolicy';
import { MockDataStore } from '@/repositories/mock/MockRepositories';

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
  const [projections, setProjections] = useState<VenueAssetReadModel[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('asset_vip_a1');
  
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
  const [admissionDecision, setAdmissionDecision] = useState<AdmissionDecision | null>(null);

  // Form durumları
  const [custName, setCustName] = useState('Emre Kaya');
  const [custPhone, setCustPhone] = useState('+905351234567');
  const [custEmail, setCustEmail] = useState('emre@vip.com');

  // Canlı İşlem Zaman Çizelgesi
  const [timeline, setTimeline] = useState<TimelineLog[]>([
    { time: '17:42', title: '✓ SaleRecorded Domain Event (v1) Yayınlandı', sub: 'Biletix (Ref: BTX-20260807-18291) - Net: ₺23.500' },
    { time: '17:40', title: '✓ VenueAssetProjection Handler Güncellendi', sub: 'Masa Statüsü: Satıldı | Satış Kanalı: Biletix' },
    { time: '17:38', title: '✓ Opsiyon Tanımlandı', sub: 'Selin Yılmaz (VIP Masa A2)' },
    { time: '17:30', title: '✓ Kapı Girişi Doğrulandı', sub: 'VIP Kuzey Kapısı (Tarık Özbalkan)' },
  ]);

  const refreshData = () => {
    VenueAssetProjection.initialize(VenueService.getAssets());
    setProjections([...VenueAssetProjection.getAll()]);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const toggleAccordion = (key: keyof typeof accordionState) => {
    setAccordionState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addTimeline = (title: string, sub: string) => {
    const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setTimeline((prev) => [{ time: nowStr, title, sub }, ...prev]);
  };

  const selectedAssetReadModel = projections.find((p) => p.assetId === selectedAssetId) || projections[0];
  const fullAsset = selectedAssetReadModel ? VenueService.getAssetById(selectedAssetReadModel.assetId) : null;

  // İade / Opsiyon / Satış / Check-In İşlem Tetikleyicileri
  const handleReserve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetReadModel) return;

    try {
      ReservationService.createReservation({
        eventId: MockDataStore.event.id,
        assetId: selectedAssetReadModel.assetId,
        customerName: custName,
        customerPhone: custPhone,
        customerEmail: custEmail,
        guestCountPax: selectedAssetReadModel.paxCapacity,
      });

      addTimeline(
        `✓ Opsiyon Tanımlandı: ${selectedAssetReadModel.name}`,
        `${custName} (${custPhone}) - 24 Saat Süreli Opsiyon`
      );
      setIsReserveModalOpen(false);
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleProcessExternalSaleConfirmation = () => {
    if (!selectedAssetReadModel) return;

    try {
      const ref = `BTX-20260807-${Math.floor(10000 + Math.random() * 90000)}`;
      // Execute ProcessExternalSaleConfirmationUseCase Application Use Case
      const result = ProcessExternalSaleConfirmationUseCase.execute({
        eventId: MockDataStore.event.id,
        assetId: selectedAssetReadModel.assetId,
        salesChannelId: 'biletix',
        externalSaleReference: ref,
        purchaserName: custName,
        purchaserPhone: custPhone,
        purchaserEmail: custEmail,
      });

      addTimeline(
        `✓ SaleRecorded Event (v1) Yayınlandı: ${selectedAssetReadModel.name}`,
        `Kanal: Biletix | Ref: ${ref} | Net Hakediş: ₺${result.sale.netRevenue.toLocaleString('tr-TR')}`
      );

      setIsSaleModalOpen(false);
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelReservation = () => {
    if (!selectedAssetReadModel) return;
    const res = MockDataStore.reservations.find((r) => r.assetId === selectedAssetReadModel.assetId && r.status === 'Confirmed');
    if (!res) return;

    ReservationService.cancelReservation(res.id, 'ORGANIZER');
    addTimeline(`✓ Opsiyon İptal Edildi: ${selectedAssetReadModel.name}`, `Masa tekrar müsait statüsüne çekildi.`);
    refreshData();
  };

  const openCheckInModal = () => {
    if (!selectedAssetReadModel) return;
    const decision = AdmissionPolicy.evaluate(selectedAssetReadModel.assetId);
    setAdmissionDecision(decision);
    setIsCheckInModalOpen(true);
  };

  const handleCheckIn = () => {
    if (!selectedAssetReadModel || !admissionDecision) return;

    if (admissionDecision.outcome === 'Granted') {
      MockDataStore.checkIns.push({
        id: `chk_${Date.now()}`,
        organizationId: MockDataStore.organizationId,
        eventId: MockDataStore.event.id,
        venueAssetId: selectedAssetReadModel.assetId,
        gateId: MockDataStore.gates[0]?.id || 'gate_vip_north',
        guestName: custName,
        checkedInAt: new Date().toISOString(),
        checkedInBy: 'VIP Kapı Görevlisi',
        status: 'Completed',
      });

      addTimeline(`✓ Kapı Girişi Onaylandı (${admissionDecision.code})`, `${selectedAssetReadModel.name} VIP Kuzey Kapısından Giriş Yaptı`);
    } else {
      addTimeline(`❌ Kapı Girişi Reddedildi (${admissionDecision.code})`, admissionDecision.message);
    }

    setIsCheckInModalOpen(false);
    refreshData();
  };

  // Target Customer details for selected asset
  const activeReservation = selectedAssetReadModel ? MockDataStore.reservations.find((r) => r.assetId === selectedAssetReadModel.assetId && r.status === 'Confirmed') : undefined;
  const activeSale = selectedAssetReadModel ? MockDataStore.sales.find((s) => s.lines.some((l) => l.venueAssetId === selectedAssetReadModel.assetId) && s.status === 'Completed') : undefined;

  return (
    <div className={pageContainer}>
      {/* Real-world Operational Workspace Header */}
      <header className={header}>
        <div className={logoGroup}>
          <div className={logoBadge}>VIP OPERASYON MASASI (v1 BASELINE)</div>
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
              <h2 className={floorPlanTitle}>Canlı Oturma Haritası (VenueAssetProjection)</h2>
              <p className={floorPlanSubTitle}>
                Yangın Emniyeti Sınırı: {MockDataStore.venue.fireCapacity} PAX | Okuma modelinden dinamik render edilir.
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

              {projections.map((readModel) => {
                const isSelected = selectedAssetId === readModel.assetId;
                const assetGeometry = VenueService.getAssetById(readModel.assetId);
                if (!assetGeometry) return null;

                const fillColor = readModel.status === 'Available' 
                  ? 'hsl(142 70% 45% / 0.15)' 
                  : readModel.status === 'Reserved' 
                    ? 'hsl(45 90% 50% / 0.2)' 
                    : readModel.status === 'Sold' 
                      ? 'hsl(350 80% 55% / 0.2)' 
                      : 'hsl(220 15% 45% / 0.2)';

                let strokeColor = readModel.displayColor;
                if (isSelected) {
                  strokeColor = 'hsl(260 85% 65%)';
                }

                return (
                  <g
                    key={readModel.assetId}
                    onClick={() => setSelectedAssetId(readModel.assetId)}
                    className={readModel.category === 'Stage' ? svgGroupStage : svgGroupAsset}
                  >
                    {assetGeometry.shape === 'Circle' ? (
                      <circle
                        cx={assetGeometry.x + assetGeometry.width / 2}
                        cy={assetGeometry.y + assetGeometry.height / 2}
                        r={assetGeometry.width / 2}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                    ) : (
                      <rect
                        x={assetGeometry.x}
                        y={assetGeometry.y}
                        width={assetGeometry.width}
                        height={assetGeometry.height}
                        rx={6}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                    )}
                    <text
                      x={assetGeometry.x + assetGeometry.width / 2}
                      y={assetGeometry.y + assetGeometry.height / 2 + 4}
                      textAnchor="middle"
                      fill={readModel.category === 'Stage' ? 'hsl(224 15% 75%)' : 'hsl(0 0% 98%)'}
                      fontSize="11"
                      fontWeight="600"
                    >
                      {readModel.name}
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
                <Layers size={16} color="hsl(260 85% 65%)" /> Seçili Alan Detayı (Read Model)
              </span>
              {accordionState.selected ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {accordionState.selected && selectedAssetReadModel && (
              <div className={accordionContent}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 className={floorPlanTitle}>{selectedAssetReadModel.name}</h3>
                  {selectedAssetReadModel.status === 'Available' && <Badge variant="Available">● Müsait</Badge>}
                  {selectedAssetReadModel.status === 'Reserved' && <Badge variant="Reserved">● Opsiyonda</Badge>}
                  {selectedAssetReadModel.status === 'Sold' && <Badge variant="Sold">● Satıldı</Badge>}
                  {selectedAssetReadModel.status === 'Blocked' && <Badge variant="Blocked">● Bloke</Badge>}
                </div>

                <div className={assetDetailGrid}>
                  <div className={assetDetailRow}>
                    <span className={assetDetailLabel}>Operasyonel Statü</span>
                    <span className={assetDetailValue}>{selectedAssetReadModel.occupancyState}</span>
                  </div>

                  <div className={assetDetailRow}>
                    <span className={assetDetailLabel}>Kapasite</span>
                    <span className={assetDetailValue}>{selectedAssetReadModel.paxCapacity} Kişi</span>
                  </div>

                  <div className={assetDetailRow}>
                    <span className={assetDetailLabel}>Liste Fiyatı</span>
                    <span className={assetDetailValue}>₺{selectedAssetReadModel.basePrice.toLocaleString('tr-TR')}</span>
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
                    </>
                  )}

                  {activeSale && (
                    <>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Alıcı Müşteri</span>
                        <span className={assetDetailValue}>{activeSale.purchaserSnapshot?.fullName || 'Tarık Özbalkan'}</span>
                      </div>
                      <div className={assetDetailRow}>
                        <span className={assetDetailLabel}>Satış Kanalı</span>
                        <span className={assetDetailValue}>{activeSale.channel?.name || 'Biletix'} (Ref: {activeSale.externalReference})</span>
                      </div>
                    </>
                  )}

                  {fullAsset?.metadata?.includedDrinks && (
                    <div className={assetDetailRow}>
                      <span className={assetDetailLabel}>Dahil Olanlar</span>
                      <span className={assetDetailValue}>{fullAsset.metadata.includedDrinks.join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Operator Actions */}
                <div className={selectedAssetActions}>
                  {selectedAssetReadModel.status === 'Available' && (
                    <>
                      <Button variant="secondary" onClick={() => setIsReserveModalOpen(true)}>
                        Opsiyonla & Rezerve Et
                      </Button>
                      <Button variant="primary" onClick={() => setIsSaleModalOpen(true)}>
                        Dış Satış Bildirimini Kaydet
                      </Button>
                    </>
                  )}
                  {selectedAssetReadModel.status === 'Reserved' && (
                    <>
                      <Button variant="primary" onClick={() => setIsSaleModalOpen(true)}>
                        Satışı Sisteme İşle
                      </Button>
                      <Button variant="danger" onClick={handleCancelReservation}>
                        Opsiyonu İptal Et
                      </Button>
                    </>
                  )}
                  {selectedAssetReadModel.status === 'Sold' && (
                    <Button variant="secondary" icon={<ShieldCheck size={14} />} onClick={openCheckInModal}>
                      Kapı Giriş Doğrulaması Yap
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
        title={`${selectedAssetReadModel?.name} için Opsiyon Tanımla`}
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
        title={`${selectedAssetReadModel?.name} - Dış Sistem Satış Bildirimi`}
      >
        <div className={modalStack}>
          <div className={modalPriceSummaryBox}>
            <p className={modalTextBase}>Satış Kanalı: <strong className={textBold}>Biletix</strong></p>
            <p className={modalTextMuted}>Dış Referans No: BTX-20260807-18291</p>
            <p className={modalTextBase}>Brüt Tutarı: ₺{selectedAssetReadModel?.basePrice.toLocaleString('tr-TR')}</p>
            <p className={modalTextSuccess}>Net Organizatör Hakedişi: ₺{((selectedAssetReadModel?.basePrice || 0) * 0.94).toLocaleString('tr-TR')}</p>
          </div>

          <p className={textSubtleSm}>
            Dış kanaldan gelen satışı StageOps operasyon defterine işler. Sırasıyla: SaleRecorded Event (v1) ➔ Operations & Accounting Handlers ➔ VenueAssetProjection Güncellemesi gerçekleşir.
          </p>

          <Button variant="primary" onClick={handleProcessExternalSaleConfirmation}>
            Satış Kaydını Oluştur & Event Yayınla
          </Button>
        </div>
      </Modal>

      {/* VIP Kapı Giriş Doğrulama Modalı */}
      <Modal
        isOpen={isCheckInModalOpen}
        onClose={() => setIsCheckInModalOpen(false)}
        title={`${selectedAssetReadModel?.name} VIP Kapı Giriş Doğrulaması`}
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
    </div>
  );
}
