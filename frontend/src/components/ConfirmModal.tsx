'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
}: ConfirmModalProps) {
  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-charcoal-medium border border-charcoal-light rounded-2xl shadow-2xl flex flex-col max-h-[90vh] z-10 animate-fade-in overflow-hidden">
        {/* Border Beam */}
        <div 
          className="border-beam-container" 
          style={{
            '--border-beam-width': '1.5px',
            '--border-beam-dark-opacity': '0.3',
            '--border-beam-light-opacity': '0.15',
          } as React.CSSProperties}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-charcoal-light bg-charcoal-dark/20">
          <h3 className="text-sm font-semibold text-foreground tracking-wide uppercase font-display">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-charcoal-light rounded-lg text-foreground/50 hover:text-foreground transition-all cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="text-sm text-foreground/75 leading-relaxed font-light">
            {children}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-charcoal-light bg-charcoal-dark/10">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-charcoal-light hover:bg-charcoal-light rounded-xl text-xs font-semibold text-foreground transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-brand-gold hover:bg-brand-gold/90 text-charcoal-dark rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Confirm & Sign
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
