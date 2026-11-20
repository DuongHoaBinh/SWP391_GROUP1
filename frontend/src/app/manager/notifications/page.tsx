'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Check, Clock, ArrowRight, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
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

function formatTimeAgo(dateString: string, language: string): string {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = Math.max(0, now.getTime() - past.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (language === 'en') {
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
  if (diffMinutes < 1) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${diffDays} ngày trước`;
}

export default function ManagerNotificationsPage() {
  const { t, language, translateNotification, translateTimeAgo } = useLanguage();
  const [currentUser, setCurrentUser] = useState<{ id?: number | string; role?: string } | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    const onUserUpdate = () => setCurrentUser(getCurrentUser());
    window.addEventListener('auth-user-updated', onUserUpdate);
    return () => window.removeEventListener('auth-user-updated', onUserUpdate);
  }, []);

  const {
    data: notifications = [],
    error: swrError,
    isLoading,
    mutate,
    isValidating,
  } = useSWR<NotificationItem[]>(
    currentUser ? ['/notifications', currentUser.id, currentUser.role] : null,
    () => apiClient<NotificationItem[]>('/notifications'),
    { revalidateOnFocus: true, refreshInterval: 10000 },
  );

  useEffect(() => {
    const onNotifsUpdate = () => {
      void mutate();
    };
    window.addEventListener('notifications-updated', onNotifsUpdate);
    return () => window.removeEventListener('notifications-updated', onNotifsUpdate);
  }, [mutate]);

  const markAllRead = async () => {
    if (isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      await mutate();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
      toast.success(t('notifications.markAllSuccess', 'Đã đánh dấu tất cả là đã đọc'));
    } catch {
      toast.error(t('notifications.updateError', 'Có lỗi xảy ra khi cập nhật thông báo'));
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
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visibleNotifications =
    filterMode === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#181A17] m-0">
            {t('manager.notifications.title', 'Thông Báo Ban Quản Lý')}
          </h1>
          <p className="text-sm text-[#5F6977] mt-1 mb-0">
            {t('manager.notifications.subtitle', 'Thông báo đơn hàng mới từ khách hàng, duyệt yêu cầu và vận hành chuyến đi.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-xl border border-[#D8CEBE] bg-white p-1 text-xs">
            <button
              type="button"
              aria-pressed={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={`min-h-[36px] px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterMode === 'all' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {t('common.all', 'Tất cả')} ({notifications.length})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'unread'}
              onClick={() => setFilterMode('unread')}
              className={`min-h-[36px] px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterMode === 'unread' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {t('common.unread', language === 'en' ? 'Unread' : 'Chưa đọc')} ({unreadCount})
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void mutate()}
            disabled={isValidating}
            className="shadow-sm min-h-[44px]"
          >
            <RefreshCw size={14} className={`mr-1.5 ${isValidating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('common.refresh', 'Làm mới')}
          </Button>
          {unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={isMarkingAll}
              className="shadow-sm min-h-[44px]"
            >
              <Check size={16} className="mr-1.5" aria-hidden="true" />{' '}
              {t('common.markAllRead', 'Đánh dấu tất cả đã đọc')} ({unreadCount})
            </Button>
          ) : (
            <span className="text-xs text-[#5F6977] flex items-center gap-1.5 font-medium bg-[#FAF8F4] border border-[#D8CEBE] px-3 py-2 rounded-xl shadow-sm">
              <CheckCircle2 size={14} className="text-[#287653]" aria-hidden="true" />{' '}
              {t('common.allRead', 'Tất cả thông báo đã đọc')}
            </span>
          )}
        </div>
      </div>

      {swrError && (
        <div
          role="alert"
          className="rounded-xl border border-[#B33E3E]/30 bg-[#F8EAEA] p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E]"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              {swrError?.message ||
                (language === 'en' ? 'Failed to load notifications.' : 'Không thể tải danh sách thông báo.')}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RefreshCw size={14} aria-hidden="true" /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#D8CEBE] divide-y divide-[#E8E2D8] overflow-hidden shadow-sm">
        {isLoading || !currentUser ? (
          <div role="status" className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-[#F0EEE8] animate-pulse motion-reduce:animate-none" />
            ))}
            <span className="sr-only">{t('common.loadingNotifications', 'Đang tải thông báo...')}</span>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="p-12 text-center text-[#5F6977] text-sm">
            <CheckCircle2 size={32} className="mx-auto text-[#287653] mb-3 opacity-70" aria-hidden="true" />
            {filterMode === 'unread'
              ? t('common.allRead', 'Tất cả thông báo đã đọc')
              : t('notifications.empty', 'Không có thông báo mới nào.')}
          </div>
        ) : (
          visibleNotifications.map((n) => {
            const isUnread = !n.isRead;
            const localized = translateNotification(n.title, n.message);

            return (
              <div
                key={n.id}
                role={isUnread ? 'button' : undefined}
                tabIndex={isUnread ? 0 : undefined}
                onClick={() => isUnread && void markSingleRead(n.id)}
                onKeyDown={(e) => {
                  if (isUnread && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    void markSingleRead(n.id);
                  }
                }}
                className={`p-5 flex items-start gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#A67C2E] ${
                  isUnread
                    ? 'bg-[#FAF8F4] hover:bg-[#F5EFE2] border-l-4 border-l-[#A67C2E] cursor-pointer'
                    : 'bg-white hover:bg-[#FAF8F4]/60'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isUnread
                      ? 'bg-[#F5EFE2] text-[#8C6621] ring-4 ring-[#F0EEE8]'
                      : 'bg-[#F0EEE8] text-[#5F6977]'
                  }`}
                >
                  <Bell size={18} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2
                        className={`text-sm m-0 ${
                          isUnread ? 'font-bold text-[#181A17]' : 'font-semibold text-[#5F6977]'
                        }`}
                      >
                        {localized.title || n.title}
                      </h2>
                      {isUnread && <span className="w-2 h-2 rounded-full bg-[#A67C2E] shrink-0" aria-hidden="true" />}
                    </div>
                    <span className="text-xs text-[#5F6977] shrink-0 flex items-center gap-1">
                      <Clock size={12} aria-hidden="true" />{' '}
                      {translateTimeAgo ? translateTimeAgo(n.createdAt) : formatTimeAgo(n.createdAt, language)}
                    </span>
                  </div>
                  <p className="text-sm text-[#181A17]/85 mt-1 m-0 leading-relaxed whitespace-pre-line">
                    {localized.message || n.message}
                  </p>
                  {n.shipmentId && (
                    <div className="mt-3">
                      <Link
                        href={`/manager/requests/${n.shipmentId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A67C2E] hover:text-[#181A17] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t('manager.notifications.viewRequest', 'Xem yêu cầu vận chuyển')} REQ-{String(n.shipmentId).padStart(3, '0')}{' '}
                        <ArrowRight size={13} aria-hidden="true" />
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
