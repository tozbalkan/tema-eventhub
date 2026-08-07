import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { modalCloseBtn, modalContent, modalHeader, modalOverlay, modalTitle } from './Modal.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={modalOverlay} onClick={onClose}>
      <div className={modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={modalHeader}>
          <h3 className={modalTitle}>{title}</h3>
          <button className={modalCloseBtn} onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};
