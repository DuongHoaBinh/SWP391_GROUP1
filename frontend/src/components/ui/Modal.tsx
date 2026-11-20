'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  hideHeader?: boolean;
  customHeader?: React.ReactNode;
  bodyClassName?: string;
  closeDisabled?: boolean;
  ariaLabel?: string;
}

const modalStack: string[] = [];
let savedBodyOverflow: string | null = null;

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-2xl',
  hideHeader = false,
  customHeader,
  bodyClassName = 'p-6 overflow-y-auto',
  closeDisabled = false,
  ariaLabel,
}) => {
  const modalId = useId();
  const titleId = `${modalId}-title`;
  const subtitleId = `${modalId}-subtitle`;

  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const backdropMouseDownRef = useRef(false);

  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  const langCtx = useLanguage() as { language?: string; t?: (k: string, f?: string) => string } | null;
  const closeLabel =
    langCtx?.t?.('common.close', langCtx?.language === 'en' ? 'Close' : 'Đóng') || 'Đóng';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    modalStack.push(modalId);

    if (modalStack.length === 1) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const focusTimer = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (dialog && !dialog.contains(document.activeElement)) {
        dialog.focus({ preventScroll: true });
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle key events for the topmost stacked modal
      if (modalStack[modalStack.length - 1] !== modalId) return;

      if (e.key === 'Escape') {
        if (!closeDisabledRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === dialogRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);

      const idx = modalStack.lastIndexOf(modalId);
      if (idx !== -1) modalStack.splice(idx, 1);

      if (modalStack.length === 0) {
        document.body.style.overflow = savedBodyOverflow ?? '';
        savedBodyOverflow = null;
      }

      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [isOpen, modalId]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-[#181A17]/60 animate-fade-in-only backdrop-blur-sm"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          backdropMouseDownRef.current &&
          e.target === e.currentTarget &&
          !closeDisabledRef.current
        ) {
          onCloseRef.current();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={!hideHeader && !customHeader && title ? titleId : undefined}
        aria-describedby={!hideHeader && !customHeader && subtitle ? subtitleId : undefined}
        aria-label={hideHeader || customHeader || !title ? ariaLabel || title || closeLabel : undefined}
        tabIndex={-1}
        className={cn(
          'bg-surface rounded-2xl w-full max-h-[92vh] flex flex-col shadow-xl border border-border overflow-hidden animate-modal-enter focus:outline-none',
          maxWidth.startsWith('max-w') ? maxWidth : undefined
        )}
        style={maxWidth.startsWith('max-w') ? undefined : { maxWidth }}
      >
        {customHeader ? (
          customHeader
        ) : !hideHeader ? (
          <div className="shrink-0 px-6 py-4 sm:py-5 border-b border-border flex items-start justify-between gap-4 bg-surface relative">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="text-lg font-bold text-text-primary m-0 tracking-tight break-words">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p id={subtitleId} className="text-xs text-text-secondary mt-1 mb-0 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="kbd-badge hidden sm:inline-flex" aria-hidden="true">Esc</span>
              <button
                type="button"
                disabled={closeDisabled}
                onClick={() => {
                  if (!closeDisabledRef.current) onCloseRef.current();
                }}
                className="w-9 h-9 rounded-full text-text-muted hover:text-text-primary flex items-center justify-center bg-surface-muted hover:bg-border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={closeLabel}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Modal Body */}
        <div className={cn('min-h-0 flex-1 p-6 overflow-y-auto text-text-primary', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
