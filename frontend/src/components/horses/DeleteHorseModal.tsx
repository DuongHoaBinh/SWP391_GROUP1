'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    const targetBackendId = horse.backendId || (Number(horse.id) > 0 ? Number(horse.id) : undefined);

    try {
      // 1. Call backend API if backendId exists
      if (targetBackendId) {
        try {
          await apiClient<any>(`/horses/${targetBackendId}`, {
            method: 'DELETE',
          });
        } catch (apiErr: any) {
          console.warn('Backend DELETE /horses/:id error:', apiErr);
        }
      }

      // 2. Remove from local store & refresh
      deleteHorse(horse.id);
      await refreshHorses();

      if (onHorseDeleted) {
        onHorseDeleted();
      }

      onClose();
    } catch (err: any) {
      console.error('Failed to delete horse:', err);
      deleteHorse(horse.id);
      await refreshHorses();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Xác nhận xóa con ngựa"
      maxWidth="500px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Warning Icon & Text */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>
              Bạn có chắc chắn muốn xóa {horse.name}?
            </h3>
            <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Mã ngựa: <strong>{horse.code || horse.id}</strong> • Giống loài: <strong>{horse.breed}</strong>
            </p>
            <p style={{ margin: '8px 0 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
              * Lưu ý: Nếu con ngựa này đã từng tham gia chuyến vận chuyển, hệ thống sẽ tự động chuyển trạng thái sang <strong>&quot;retired&quot;</strong> để bảo toàn lịch sử hồ sơ kiểm dịch và giấy tờ pháp lý.
            </p>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-light)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: 'var(--text-body)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
            }}
          >
            {isDeleting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang xóa...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>Xóa con ngựa</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
