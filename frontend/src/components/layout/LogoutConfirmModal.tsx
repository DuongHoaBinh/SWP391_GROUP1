'use client';

import React, { useEffect, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) setIsConfirming(false);
  }, [isOpen]);

  const modalTitle = title || t('auth.logoutConfirmTitle', isEn ? 'Confirm Sign Out' : 'Xác Nhận Đăng Xuất');
  const modalDesc =
    description ||
    t(
      'auth.logoutConfirmDesc',
      isEn
        ? 'Are you sure you want to sign out? Your current session will be ended.'
        : 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản không? Phiên làm việc hiện tại của bạn sẽ kết thúc.'
    );

  const handleConfirm = () => {
    if (isConfirming) return;
    setIsConfirming(true);
    onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hideHeader
      closeDisabled={isConfirming}
      ariaLabel={modalTitle}
      maxWidth="max-w-[420px]"
      bodyClassName="p-7 relative flex flex-col items-center text-center bg-surface"
    >
      <button
        type="button"
        disabled={isConfirming}
        onClick={onClose}
        aria-label={t('common.close', isEn ? 'Close' : 'Đóng')}
        className="absolute top-3 right-3 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X size={20} aria-hidden="true" />
      </button>

      <div
        aria-hidden="true"
        className="w-14 h-14 rounded-full bg-danger-bg border-4 border-danger/15 flex items-center justify-center text-danger mb-4 shrink-0"
      >
        <LogOut size={24} strokeWidth={2.3} className="-translate-x-0.5" />
      </div>

      <h2 className="text-lg font-extrabold text-text-primary m-0 mb-2">
        {modalTitle}
      </h2>

      <p className="text-sm text-text-secondary leading-relaxed m-0 mb-6 max-w-xs">
        {modalDesc}
      </p>

      <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
        <button
          type="button"
          disabled={isConfirming}
          onClick={onClose}
          className="flex-1 py-2.5 px-4 rounded-xl border border-border bg-surface-muted hover:bg-border/40 text-text-primary font-semibold text-sm transition-colors cursor-pointer min-h-[44px] flex items-center justify-center disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t('common.cancel', isEn ? 'Cancel' : 'Hủy bỏ')}
        </button>

        <button
          type="button"
          disabled={isConfirming}
          onClick={handleConfirm}
          className="flex-1 py-2.5 px-4 rounded-xl bg-danger hover:opacity-90 text-white font-bold text-sm shadow-md transition-all cursor-pointer min-h-[44px] flex items-center justify-center disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          {t('common.logout', isEn ? 'Logout' : 'Đăng xuất')}
        </button>
      </div>
    </Modal>
  );
};
