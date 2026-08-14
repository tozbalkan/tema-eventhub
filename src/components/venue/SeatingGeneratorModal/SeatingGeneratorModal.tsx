'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { BlockConfig } from '@/domain/venue/geometry';
import { Plus, Trash2, Copy, Grid3X3 } from 'lucide-react';
import * as s from './SeatingGeneratorModal.css';

export interface SeatingGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateBlock: (config: BlockConfig, pattern?: string) => void;
}

export function SeatingGeneratorModal({ isOpen, onClose, onGenerateBlock }: SeatingGeneratorModalProps) {
  const [blockName, setBlockName] = useState('VIP Stand A');
  const [rowCount, setRowCount] = useState(8);
  const [seatsPerRow, setSeatsPerRow] = useState(20);
  const [seatSpacing, setSeatSpacing] = useState(6);
  const [rowSpacing, setRowSpacing] = useState(12);
  const [startingRow, setStartingRow] = useState('A');
  const [startingSeat, setStartingSeat] = useState(1);
  const [patternTokens, setPatternTokens] = useState<('seat' | 'gap')[]>(['seat', 'seat', 'gap', 'seat', 'seat']);

  if (!isOpen) return null;

  const handleAddSeat = () => setPatternTokens([...patternTokens, 'seat']);
  const handleAddGap = () => setPatternTokens([...patternTokens, 'gap']);
  const handleDuplicatePattern = () => setPatternTokens([...patternTokens, ...patternTokens]);
  const handleClearPattern = () => setPatternTokens([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const patternStr = patternTokens.map((t) => (t === 'seat' ? '●' : '_')).join(' ');

    onGenerateBlock(
      {
        blockName,
        areaId: 'area_main',
        rowCount: Number(rowCount),
        seatsPerRow: Number(seatsPerRow),
        seatSpacing: Number(seatSpacing),
        rowSpacing: Number(rowSpacing),
        seatWidth: 16,
        seatHeight: 16,
        startingRow,
        startingSeat: Number(startingSeat),
        direction: 'ltr',
        originX: 100,
        originY: 100,
      },
      patternTokens.length > 0 ? patternStr : undefined
    );

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Otomatik Tribün & Masa Düzeni Oluştur (Block Generator)">
      <form onSubmit={handleSubmit} className={s.modalForm}>
        <Input label="Blok Adı" value={blockName} onChange={(e) => setBlockName(e.target.value)} required />

        <div className={s.formGrid}>
          <Input label="Sıra Sayısı (Rows)" type="number" min={1} max={50} value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))} required />
          <Input label="Sıra Başı Koltuk (Seats/Row)" type="number" min={1} max={100} value={seatsPerRow} onChange={(e) => setSeatsPerRow(Number(e.target.value))} required />
          <Input label="Koltuk Mesafesi (px)" type="number" min={1} max={50} value={seatSpacing} onChange={(e) => setSeatSpacing(Number(e.target.value))} required />
          <Input label="Sıra Mesafesi (px)" type="number" min={1} max={100} value={rowSpacing} onChange={(e) => setRowSpacing(Number(e.target.value))} required />
          <Input label="Başlangıç Sıra Harfi" value={startingRow} onChange={(e) => setStartingRow(e.target.value)} required />
          <Input label="Başlangıç Koltuk No" type="number" value={startingSeat} onChange={(e) => setStartingSeat(Number(e.target.value))} required />
        </div>

        <div className={s.patternSection}>
          <div className={s.btnRow}>
            <strong>Sıra Düzeni Deseni (Seat / Gap Pattern Editor)</strong>
          </div>
          <div className={s.patternPreview}>
            {patternTokens.length === 0 ? (
              <span>Standart Eşit Koltuk Dizilimi</span>
            ) : (
              patternTokens.map((t, idx) => (
                <span key={idx} className={t === 'seat' ? s.patternChipSeat : s.patternChipGap}>
                  {t === 'seat' ? `Koltuk ${idx + 1}` : 'Boşluk (Gap)'}
                </span>
              ))
            )}
          </div>
          <div className={s.btnRow}>
            <Button type="button" variant="secondary" onClick={handleAddSeat}>
              <Plus size={14} /> Koltuk Ekle
            </Button>
            <Button type="button" variant="secondary" onClick={handleAddGap}>
              <Plus size={14} /> Boşluk Ekle
            </Button>
            <Button type="button" variant="secondary" onClick={handleDuplicatePattern}>
              <Copy size={14} /> Deseni Çoğalt
            </Button>
            <Button type="button" variant="secondary" onClick={handleClearPattern}>
              <Trash2 size={14} /> Temizle
            </Button>
          </div>
        </div>

        <Button type="submit" variant="primary" icon={<Grid3X3 size={16} />}>
          Tribün & Sıra Düzeneğini Sahneye Aktar
        </Button>
      </form>
    </Modal>
  );
}
