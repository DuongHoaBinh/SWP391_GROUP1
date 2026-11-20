'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Check,
  Clock,
  ArrowRight,
  CheckCircle2,
  FileText,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface NotificationItem {
  id: number;
  userId: number;
  shipmentId: number | null;
  horseId: number | null;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

function formatFallbackTimeAgo(dateString: string, language: 'en' | 'vi'): string {
  const now = Date.now();
  const past = new Date(dateString).getTime();
  if (!Number.isFinite(past)) return '';
  const diffMs = Math.max(0, now - past);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return language === 'en' ? 'Just now' : 'Vừa xong';
  if (diffMinutes < 60) return language === 'en' ? `${diffMinutes}m ago` : `${diffMinutes} phút trước`;
  if (diffHours < 24) return language === 'en' ? `${diffHours}h ago` : `${diffHours} giờ trước`;
  return language === 'en' ? `${diffDays}d ago` : `${diffDays} ngày trước`;
}

export default function SpecialistNotificationsPage() {
  const { t, language, translateNotification, translateTimeAgo } = useLanguage();
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const {
    data: notifications = [],
    error,
    isLoading,
    mutate,
  } = useSWR<NotificationItem[]>(
    '/notifications',
    (url: string) => apiClient<NotificationItem[]>(url),
    { revalidateOnFocus: true }
  );

  const markAllRead = async () => {
    if (isMarkingAll || unreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      await mutate();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
      toast.success(t('notifications.markAllSuccess', language === 'en' ? 'All notifications marked as read' : 'Đã đánh dấu tất cả là đã đọc'));
    } catch {
      toast.error(t('notifications.updateError', language === 'en' ? 'Failed to update notifications' : 'Có lỗi xảy ra khi cập nhật thông báo'));
    } finally {
      setIsMarkingAll(false);
    }
  };

  const markSingleRead = async (id: number) => {
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
      await mutate();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
    } catch {
      // ignore background single-read failure
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#181A17] m-0">
            {t('specialist.notifications.title', language === 'en' ? 'Quarantine Specialist Notifications' : 'Thông Báo Chuyên Viên Kiểm Dịch')}
          </h1>
          <p className="text-sm text-[#5F6977] mt-1">
            {t(
              'specialist.notifications.subtitle',
              language === 'en'
                ? 'Approved shipments awaiting quarantine setup and customer-submitted document updates.'
                : 'Thông báo các đơn hàng vừa được duyệt cần thiết lập hồ sơ kiểm dịch và giấy tờ khách hàng nộp.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isMarkingAll}
              onClick={markAllRead}
              className="shadow-sm"
            >
              {isMarkingAll ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check size={16} className="mr-1.5" aria-hidden="true" />
              )}
              {isMarkingAll
                ? t('common.updating', language === 'en' ? 'Updating...' : 'Đang cập nhật...')
                : `${t('common.markAllRead', language === 'en' ? 'Mark all as read' : 'Đánh dấu tất cả đã đọc')} (${unreadCount})`}
            </Button>
          ) : (
            <span className="text-xs text-[#5F6977] flex items-center gap-1.5 font-medium bg-[#FAF8F4] border border-[#D8CEBE] px-3 py-1.5 rounded-lg shadow-sm">
              <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" />{' '}
              {t('common.allRead', language === 'en' ? 'All notifications read' : 'Tất cả thông báo đã đọc')}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-sm text-red-800 font-medium">
            <AlertTriangle size={18} className="text-red-600 shrink-0" aria-hidden="true" />
            <span>
              {t(
                'notifications.loadError',
                language === 'en'
                  ? 'Unable to load quarantine notifications. Please try again.'
                  : 'Không thể tải danh sách thông báo kiểm dịch. Vui lòng thử lại.'
              )}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void mutate()}
            className="border-red-300 text-red-700 hover:bg-red-100 shrink-0"
          >
            <RotateCcw size={14} className="mr-1.5" aria-hidden="true" />
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#D8CEBE] divide-y divide-[#EAE5DA] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-[#5F6977] text-sm flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
            <span>{t('common.loadingNotifications', language === 'en' ? 'Loading notifications...' : 'Đang tải thông báo...')}</span>
          </div>
        ) : notifications.length === 0 && !error ? (
          <div className="p-12 text-center text-[#5F6977] text-sm">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-3 opacity-60" aria-hidden="true" />
            {t('notifications.emptyState', language === 'en' ? 'No new notifications.' : 'Không có thông báo mới nào.')}
          </div>
        ) : (
          notifications.map((n) => {
            const isUnread = !n.isRead;
            const isMissingDocs = n.type === 'document_missing' || n.title.includes('hồ sơ');
            const localized = translateNotification(n.title, n.message);
            const timeLabel = translateTimeAgo ? translateTimeAgo(n.createdAt) : formatFallbackTimeAgo(n.createdAt, language);

            return (
              <div
                key={n.id}
                role={isUnread ? 'button' : undefined}
                tabIndex={isUnread ? 0 : undefined}
                onClick={() => {
                  if (isUnread) void markSingleRead(n.id);
                }}
                onKeyDown={(e) => {
                  if (isUnread && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    void markSingleRead(n.id);
                  }
                }}
                className={`p-4 sm:p-5 flex items-start gap-4 transition-colors ${
                  isUnread
                    ? 'bg-[#FAF5EB] hover:bg-[#F3ECE0] border-l-4 border-l-[#A67C2E] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#A67C2E]'
                    : 'bg-white hover:bg-slate-50/80'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isUnread
                      ? 'bg-[#181A17] text-[#C4B38E] ring-4 ring-[#EAE5DA]'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isMissingDocs ? <FileText size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4
                        className={`text-sm m-0 ${
                          isUnread ? 'font-bold text-[#181A17]' : 'font-semibold text-slate-700'
                        }`}
                      >
                        {localized.title || n.title}
                      </h4>
                      {isUnread && (
                        <span
                          className="w-2 h-2 rounded-full bg-[#A67C2E] shrink-0"
                          title={language === 'en' ? 'Unread' : 'Chưa đọc'}
                        />
                      )}
                    </div>
                    <span className="text-xs text-[#5F6977] shrink-0 flex items-center gap-1">
                      <Clock size={12} aria-hidden="true" /> {timeLabel}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 m-0 leading-relaxed whitespace-pre-line break-words">
                    {localized.message || n.message}
                  </p>
                  {n.shipmentId && (
                    <div className="mt-3">
                      <Link
                        href={`/specialist/compliance-orders?shipmentId=${n.shipmentId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#966516] hover:text-[#181A17] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isUnread) void markSingleRead(n.id);
                        }}
                      >
                        {t('specialist.notifications.openComplianceOrder', language === 'en' ? 'Open compliance dossier' : 'Mở hồ sơ kiểm dịch')} REQ-{String(n.shipmentId).padStart(3, '0')} <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
