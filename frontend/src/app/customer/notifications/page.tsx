'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface CustomerNotification {
  id: string;
  type: 'CRITICAL' | 'SUCCESS' | 'INFO';
  title: string;
  message: string;
  createdAt?: string;
  timeAgo?: string;
  isRead: boolean;
  actionText?: string;
  actionUrl?: string;
}

function humanizeNotificationText(text: string, isEn: boolean): string {
  if (!text) return '';
  let result = text;

  const tokenReplacements: Array<[RegExp, string, string]> = [
    [/\bhealth_certificate\b/gi, 'Health Certificate', 'Giấy kiểm dịch y tế'],
    [/\bhorse_passport\b/gi, 'FEI Horse Passport', 'Hộ chiếu ngựa FEI'],
    [/\bimport_permit\b/gi, 'Import Permit', 'Giấy phép nhập khẩu'],
    [/\bexport_permit\b/gi, 'Export Permit', 'Giấy phép xuất khẩu'],
    [/\bcustoms_declaration\b/gi, 'Customs Declaration', 'Tờ khai hải quan'],
    [/\bcoggins_test\b/gi, 'Coggins Test (EIA)', 'Xét nghiệm Coggins (EIA)'],
    [/\bawaiting_payment\b/gi, 'Awaiting Payment', 'Chờ thanh toán'],
    [/\bpaid_pending_review\b/gi, 'Pending Feasibility Review', 'Chờ duyệt khả thi'],
    [/\brefund_requested\b/gi, 'Refund Requested', 'Chờ hoàn tiền'],
    [/\bready_to_depart\b/gi, 'Ready to Depart', 'Sẵn sàng xuất phát'],
    [/\bin_transit\b/gi, 'In Transit', 'Đang vận chuyển'],
    [/Chuyên viên kiểm dịch/g, 'Logistics Manager', 'Quản lý vận hành'],
    [/Quarantine Specialist/g, 'Logistics Manager', 'Quản lý vận hành'],
  ];

  for (const [regex, enVal, viVal] of tokenReplacements) {
    result = result.replace(regex, isEn ? enVal : viVal);
  }

  // Localize bare YYYY-MM-DD dates in Vietnamese mode to DD/MM/YYYY
  if (!isEn) {
    result = result.replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
  }

  return result;
}

export default function NotificationsPage() {
  const { t, language, translateNotification, translateTimeAgo } = useLanguage();
  const isEn = language === 'en';
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchNotifications = useCallback(
    async (showLoadingSpinner = true) => {
      if (showLoadingSpinner) setLoading(true);
      setIsRefreshing(true);
      setLoadError('');
      try {
        const data = await apiClient<any[]>('/notifications');
        if (Array.isArray(data) && data.length > 0) {
          const mapped: CustomerNotification[] = data.map((item) => {
            const titleLower = String(item.title || '').toLowerCase();
            const isSuccess =
              titleLower.includes('phê duyệt') ||
              titleLower.includes('approved') ||
              titleLower.includes('hoàn tất') ||
              titleLower.includes('thành công');
            const isCritical =
              item.notifType === 'health_alert' ||
              titleLower.includes('từ chối') ||
              titleLower.includes('rejected') ||
              titleLower.includes('hủy') ||
              titleLower.includes('quá hạn');

            return {
              id: String(item.id || item.notification_id),
              type: isCritical ? 'CRITICAL' : isSuccess ? 'SUCCESS' : 'INFO',
              title: item.title || '',
              message: item.message || '',
              createdAt: item.createdAt || item.created_at,
              timeAgo: item.createdAt || item.created_at,
              isRead: Boolean(item.isRead ?? item.is_read),
              actionText: item.shipmentId
                ? isEn
                  ? 'View Order Details'
                  : 'Xem chi tiết đơn'
                : undefined,
              actionUrl: item.shipmentId ? `/customer/requests/${item.shipmentId}` : undefined,
            };
          });
          setNotifications(mapped);
        } else {
          setNotifications([]);
        }
      } catch (err: any) {
        console.error('Failed to fetch notifications:', err);
        setLoadError(
          err?.message ||
            (isEn ? 'Failed to load notifications.' : 'Không thể tải danh sách thông báo.'),
        );
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [isEn],
  );

  useEffect(() => {
    void fetchNotifications(true);

    const handleUpdate = () => void fetchNotifications(false);
    window.addEventListener('notifications-updated', handleUpdate);
    const interval = setInterval(() => void fetchNotifications(false), 10000);

    return () => {
      window.removeEventListener('notifications-updated', handleUpdate);
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (isMarkingAll) return;
    setIsMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
    } catch {
      // ignore and sync next cycle
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visibleNotifications =
    filterMode === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
            {t('notifications.title', isEn ? 'Notifications' : 'Thông báo')}
          </h1>
          <p className="text-sm text-[#5F6977] mt-1 mb-0">
            {t(
              'notifications.subtitle',
              isEn
                ? 'Updates on order payments, feasibility reviews, quarantine dossiers, and live journeys.'
                : 'Cập nhật thanh toán, phê duyệt đơn vận chuyển, thủ tục kiểm dịch và hành trình của ngựa.',
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="inline-flex rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] p-0.5 text-xs">
            <button
              type="button"
              aria-pressed={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterMode === 'all' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {t('common.all', isEn ? 'All' : 'Tất cả')} ({notifications.length})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'unread'}
              onClick={() => setFilterMode('unread')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterMode === 'unread' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {t('common.unread', isEn ? 'Unread' : 'Chưa đọc')} ({unreadCount})
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchNotifications(false)}
            disabled={isRefreshing}
            className="min-h-[36px]"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
            {t('common.refresh', isEn ? 'Refresh' : 'Làm mới')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isMarkingAll || unreadCount === 0}
            className="min-h-[36px]"
          >
            {t('common.markAllRead', isEn ? 'Mark all read' : 'Đánh dấu đã đọc tất cả')}
          </Button>
        </div>
      </header>

      {/* Error State */}
      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-[#B33E3E]/30 bg-[#F8EAEA] p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E]"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchNotifications(true)}>
            <RefreshCw size={14} aria-hidden="true" /> {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {/* Notifications Container */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
        {loading ? (
          <div role="status" className="divide-y divide-[#EFEAE0]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-5">
                <div className="h-14 rounded-xl bg-[#FAF8F4] animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
            <span className="sr-only">{t('common.loading', 'Đang tải thông báo...')}</span>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="text-center px-6 py-14 text-[#5F6977]">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-[#287653]" aria-hidden="true" />
            <div className="text-sm font-bold text-[#181A17] mb-1">
              {filterMode === 'unread'
                ? t('common.allRead', isEn ? 'All notifications read' : 'Bạn đã đọc hết thông báo')
                : t('common.noNotifications', isEn ? 'No notifications yet' : 'Không có thông báo mới nào')}
            </div>
            <div className="text-xs text-[#747D88]">
              {t(
                'notifications.emptyDesc',
                isEn
                  ? 'Updates on order approvals, compliance documents, and trips will appear here.'
                  : 'Thông báo về duyệt đơn, danh mục kiểm dịch và hành trình sẽ xuất hiện tại đây.',
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#EFEAE0]">
            {visibleNotifications.map((notif) => {
              const localized = translateNotification(notif.title, notif.message);
              const cleanTitle = humanizeNotificationText(localized.title, isEn);
              const cleanMessage = humanizeNotificationText(localized.message, isEn);
              const actionText = notif.actionText
                ? localized.actionText || notif.actionText
                : localized.actionText;
              const dotColor =
                notif.type === 'CRITICAL'
                  ? 'bg-[#B33E3E]'
                  : notif.type === 'SUCCESS'
                    ? 'bg-[#287653]'
                    : 'bg-[#A67C2E]';

              return (
                <div
                  key={notif.id}
                  role={!notif.isRead ? 'button' : undefined}
                  tabIndex={!notif.isRead ? 0 : undefined}
                  onClick={() => !notif.isRead && void handleMarkSingleRead(notif.id)}
                  onKeyDown={(e) => {
                    if (!notif.isRead && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      void handleMarkSingleRead(notif.id);
                    }
                  }}
                  className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#A67C2E] ${
                    notif.isRead ? 'bg-white' : 'bg-[#FAF8F4] hover:bg-[#F5EFE2]/50 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                        notif.isRead ? 'bg-transparent' : dotColor
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#181A17] text-sm">{cleanTitle}</div>
                      <div className="text-xs sm:text-sm text-[#5F6977] mt-1 leading-relaxed">
                        {cleanMessage}
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="text-[11px] text-[#747D88]">
                          {translateTimeAgo(notif.createdAt || notif.timeAgo)}
                        </span>
                        {notif.actionUrl ? (
                          <Link
                            href={notif.actionUrl}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!notif.isRead) void handleMarkSingleRead(notif.id);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#A67C2E] hover:underline no-underline"
                          >
                            {actionText || t('common.viewDetails', isEn ? 'View Details' : 'Xem chi tiết')} →
                          </Link>
                        ) : actionText ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!notif.isRead) void handleMarkSingleRead(notif.id);
                              setIsUploadOpen(true);
                            }}
                            className={`inline-flex items-center text-xs font-semibold bg-transparent border-0 p-0 cursor-pointer hover:underline ${
                              notif.type === 'CRITICAL' ? 'text-[#B33E3E]' : 'text-[#A67C2E]'
                            }`}
                          >
                            {actionText}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {!notif.isRead && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#F5EFE2] text-[#8C6621] border border-[#DFCA9A] whitespace-nowrap shrink-0">
                      {t('common.new', isEn ? 'NEW' : 'MỚI')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => setIsUploadOpen(false)}
      />
    </div>
  );
}
