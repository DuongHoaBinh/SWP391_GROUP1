'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Trash2, AlertTriangle, Loader2, ShieldAlert, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface DeleteHorseModalProps {
  isOpen: boolean;
  onClose: () => void;
  horse: Horse;
  onHorseDeleted?: () => void;
}

export const DeleteHorseModal: React.FC<DeleteHorseModalProps> = ({
  isOpen,
  onClose,
  horse,
  onHorseDeleted,
}) => {
  const { deleteHorse, refreshHorses } = useCustomerStore();
  const { t, language, translateBreed } = useLanguage();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError('');

    const targetBackendId = horse.backendId || (Number(horse.id) > 0 ? Number(horse.id) : undefined);

    try {
      if (targetBackendId) {
        await apiClient<any>(`/horses/${targetBackendId}`, {
          method: 'DELETE',
        });
      }

      deleteHorse(horse.id);
      await refreshHorses();

      if (onHorseDeleted) {
        onHorseDeleted();
      }

      onClose();
    } catch (err: any) {
      console.error('Failed to delete horse:', err);
      const msg = err?.message || t('horses.deleteFailed', 'Không thể xóa hồ sơ chiến mã');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isDeleting && onClose()}
      closeDisabled={isDeleting}
      maxWidth="max-w-md"
      hideHeader
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex flex-col bg-surface">
        {/* Luxury Obsidian Warning Banner */}
        <div className="bg-gradient-to-r from-[#181A17] via-[#242722] to-[#2B1920] p-6 text-[#F7F7F4] border-b border-[#2C2F2A] relative">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/35">
              <ShieldAlert size={14} className="text-rose-300" aria-hidden="true" />
              {t('horses.archiveConfirmBadge', language === 'en' ? 'CONFIRM PROFILE ARCHIVE' : 'XÁC NHẬN LƯU TRỮ HỒ SƠ')}
            </span>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
              aria-label={t('common.close', 'Đóng')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            {t(
              'horses.confirmDeleteTitle',
              language === 'en' ? `Confirm archiving / deleting ${horse.name}?` : `Xác nhận lưu trữ / xóa ${horse.name}?`,
              { name: horse.name }
            )}
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            {t('horses.identifierCode', language === 'en' ? 'Identifier Code' : 'Mã định danh')}:{' '}
            <span className="font-mono font-bold text-[#B49A68]">{horse.code || horse.id}</span> •{' '}
            {t('horses.breed', language === 'en' ? 'Breed' : 'Giống Ngựa')}:{' '}
            <strong>{translateBreed(horse.breed)}</strong>
          </p>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 bg-surface">
          <div className="p-4 bg-warning-bg border border-warning/25 rounded-xl flex items-start gap-3">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-text-primary leading-relaxed">
              <strong>
                {t('horses.dataProtectionTitle', language === 'en' ? 'Quarantine Data Retention' : 'Bảo toàn dữ liệu kiểm dịch')}:
              </strong>{' '}
              {t(
                'horses.archiveDataProtection',
                language === 'en'
                  ? 'If this horse has participated in any transport shipment or holds veterinary certs, the system will safely archive it (status "retired") to comply with international IATA/FEI audit regulations.'
                  : 'Nếu chiến mã này đã từng tham gia chuyến vận tải hoặc có chứng thư thú y, hệ thống sẽ tự động lưu trữ an toàn (trạng thái "retired") để đáp ứng quy định kiểm toán quốc tế IATA/FEI.'
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-danger-bg border border-danger/25 rounded-xl text-danger text-xs font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-muted border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-border/30 text-text-primary text-xs sm:text-sm font-bold transition-colors disabled:opacity-50"
          >
            {t('common.cancel', 'Hủy bỏ')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-5 py-2 rounded-xl bg-danger hover:opacity-90 text-white text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>{t('common.deleting', 'Đang xử lý...')}</span>
              </>
            ) : (
              <>
                <Trash2 size={15} />
                <span>{t('horses.confirmArchiveAction', 'Xác nhận lưu trữ / Xóa')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
