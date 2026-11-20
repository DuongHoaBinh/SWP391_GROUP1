'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Check,
  Clock,
  ArrowRight,
  CheckCircle2,
  Map,
  CalendarDays,
  AlertTriangle,
  Radio,
  RefreshCw,
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

export default function CoordinatorNotificationsPage() {
  const { t, language, translateNotification, translateTimeAgo } = useLanguage();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<number | null>(null);

  const {
    data: notifications = [],
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<NotificationItem[]>(
    '/notifications',
    (url: string) => apiClient<NotificationItem[]>(url),
    { revalidateOnFocus: true, refreshInterval: 15000 }
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filteredNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  const markAllRead = async () => {
    if (isMarkingAll || unreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      await mutate();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
      toast.success(
        t(
          'notifications.markAllSuccess',
          language === 'en' ? 'All notifications marked as read' : 'Đã đánh dấu tất cả thông báo là đã đọc'
        )
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'notifications.updateError',
            language === 'en' ? 'Unable to update notifications' : 'Có lỗi xảy ra khi cập nhật thông báo'
          )
      );
    } finally {
      setIsMarkingAll(false);
    }
  };

  const markSingleRead = async (id: number) => {
    if (markingId === id) return;
    setMarkingId(id);
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
      await mutate();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'notifications.updateError',
            language === 'en' ? 'Unable to update notification status' : 'Không thể cập nhật trạng thái thông báo'
          )
      );
    } finally {
      setMarkingId(null);
    }
  };

  const getNotificationIcon = (n: NotificationItem) => {
    const text = `${n.title || ''} ${n.message || ''}`.toLowerCase();
    if (text.includes('sự cố') || text.includes('incident') || n.type === 'incident') {
      return <AlertTriangle size={18} className="text-[#9E3B3B]" aria-hidden="true" />;
    }
    if (text.includes('lập tuyến') || text.includes('lộ trình') || text.includes('route')) {
      return <Map size={18} className="text-[#A67C2E]" aria-hidden="true" />;
    }
    if (
      text.includes('xuất phát') ||
      text.includes('khởi hành') ||
      text.includes('lịch trình') ||
      text.includes('schedule') ||
      text.includes('departure')
    ) {
      return <CalendarDays size={18} className="text-[#A67C2E]" aria-hidden="true" />;
    }
    if (
      text.includes('di chuyển') ||
      text.includes('tracking') ||
      text.includes('hiện trường') ||
      text.includes('transit')
    ) {
      return <Radio size={18} className="text-[#2D5A3F]" aria-hidden="true" />;
    }
    return <Bell size={18} className={!n.isRead ? 'text-[#A67C2E]' : 'text-[#8A8478]'} aria-hidden="true" />;
  };

  const getTargetLink = (n: NotificationItem) => {
    if (!n.shipmentId) return null;
    const text = `${n.title || ''} ${n.message || ''}`.toLowerCase();
    const reqCode = `REQ-${String(n.shipmentId).padStart(3, '0')}`;

    if (text.includes('sự cố') || text.includes('incident')) {
      return {
        label:
          language === 'en'
            ? `Handle incident ${reqCode}`
            : `Xử lý sự cố đơn ${reqCode}`,
        href: `/coordinator/routes?shipmentId=${n.shipmentId}`,
      };
    }
    if (
      text.includes('lập tuyến') ||
      text.includes('lộ trình') ||
      text.includes('kế hoạch') ||
      text.includes('route') ||
      text.includes('plan')
    ) {
      return {
        label:
          language === 'en'
            ? `Open route blueprint ${reqCode}`
            : `Mở bản vẽ lộ trình ${reqCode}`,
        href: `/coordinator/routes?shipmentId=${n.shipmentId}`,
      };
    }
    if (
      text.includes('xuất phát') ||
      text.includes('lịch') ||
      text.includes('khởi hành') ||
      text.includes('schedule') ||
      text.includes('departure')
    ) {
      return {
        label:
          language === 'en'
            ? `View dispatch schedule (${reqCode})`
            : `Xem lịch điều độ ${reqCode}`,
        href: `/coordinator/schedule`,
      };
    }
    return {
      label:
        language === 'en'
          ? `View live tracking (${reqCode})`
          : `Xem chi tiết đơn ${reqCode}`,
      href: `/coordinator/monitoring?shipmentId=${n.shipmentId}`,
    };
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {t('coordinator.notifications.title', language === 'en' ? 'Route & Fleet Notifications' : 'Thông Báo Điều Phối Tuyến & Đội Xe')}
            </h1>
            {unreadCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3]">
                {unreadCount} {t('common.unreadNotificationsCount', language === 'en' ? 'unread' : 'thông báo mới')}
              </span>
            )}
          </div>
          <p className="text-sm text-[#57564E] mt-1 mb-0">
            {t(
              'coordinator.notifications.subtitle',
              language === 'en'
                ? 'Route assignment notices, departure updates, and live field progress.'
                : 'Thông báo điều phối phân công tuyến đường, cập nhật khởi hành và tiến độ thực tế từ hiện trường.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isMarkingAll}
              onClick={() => void markAllRead()}
              className="shadow-sm border-[#D4C5A3] text-[#181A17]"
            >
              {isMarkingAll ? (
                <Loader2 size={15} className="mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check size={15} className="mr-1.5" aria-hidden="true" />
              )}
              <span>
                {t('common.markAllRead', language === 'en' ? 'Mark all read' : 'Đánh dấu tất cả đã đọc')} ({unreadCount})
              </span>
            </Button>
          ) : (
            <span className="text-xs text-[#57564E] flex items-center gap-1.5 font-medium bg-[#FAF8F4] border border-[#D8CEBE] px-3 py-1.5 rounded-lg shadow-sm">
              <CheckCircle2 size={14} className="text-[#2D5A3F]" aria-hidden="true" />{' '}
              {t('common.allRead', language === 'en' ? 'All caught up' : 'Tất cả thông báo đã đọc')}
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isValidating}
            onClick={() => void mutate()}
            className="shadow-sm border-[#D8CEBE] text-[#181A17]"
            aria-label={t('common.refresh', language === 'en' ? 'Refresh notifications' : 'Làm mới thông báo')}
            title={t('common.refresh', language === 'en' ? 'Refresh notifications' : 'Làm mới thông báo')}
          >
            <RefreshCw size={14} className={isValidating ? 'animate-spin' : ''} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
              : 'bg-white border border-[#D8CEBE] text-[#57564E] hover:bg-[#FAF8F4]'
          }`}
        >
          {t('common.all', language === 'en' ? 'All' : 'Tất cả')} ({notifications.length})
        </button>
        <button
          type="button"
          aria-pressed={filter === 'unread'}
          onClick={() => setFilter('unread')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'unread'
              ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
              : 'bg-white border border-[#D8CEBE] text-[#57564E] hover:bg-[#FAF8F4]'
          }`}
        >
          {t('common.unread', language === 'en' ? 'Unread' : 'Chưa đọc')} ({unreadCount})
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3"
        >
          <span>
            {error?.message ||
              t(
                'notifications.loadError',
                language === 'en' ? 'Unable to load notifications from server.' : 'Không thể tải danh sách thông báo từ máy chủ.'
              )}
          </span>
          <button
            type="button"
            onClick={() => void mutate()}
            className="px-3 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] divide-y divide-[#EAE5DA] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-[#57564E] text-sm flex flex-col items-center gap-2">
            <RefreshCw size={24} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
            <span>
              {t('common.loadingNotifications', language === 'en' ? 'Loading live notifications...' : 'Đang tải thông báo thực tế từ máy chủ...')}
            </span>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-12 text-center text-[#57564E] text-sm">
            <CheckCircle2 size={36} className="mx-auto text-[#2D5A3F] mb-3 opacity-80" aria-hidden="true" />
            <p className="font-semibold text-[#181A17] m-0">
              {filter === 'unread'
                ? t('notifications.noUnread', language === 'en' ? 'No unread notifications.' : 'Không có thông báo chưa đọc nào.')
                : t('notifications.emptyState', language === 'en' ? 'No notifications yet.' : 'Không có thông báo nào.')}
            </p>
            <p className="text-xs text-[#747D88] mt-1 mb-0">
              {t(
                'coordinator.notifications.emptyDesc',
                language === 'en'
                  ? 'New route and dispatch notifications will appear here in real time.'
                  : 'Các thông báo điều phối mới sẽ xuất hiện tại đây theo thời gian thực.'
              )}
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isUnread = !n.isRead;
            const link = getTargetLink(n);
            const localized = translateNotification(n.title, n.message);

            return (
              <div
                key={n.id}
                role={isUnread ? 'button' : undefined}
                tabIndex={isUnread ? 0 : undefined}
                onClick={() => isUnread && void markSingleRead(n.id)}
                onKeyDown={
                  isUnread
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void markSingleRead(n.id);
                        }
                      }
                    : undefined
                }
                className={`p-5 flex items-start gap-4 transition-colors ${
                  isUnread
                    ? 'bg-[#FAF5EB] hover:bg-[#F3ECE0] border-l-4 border-l-[#A67C2E] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#A67C2E]'
                    : 'bg-white hover:bg-[#FAF8F4]'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isUnread
                      ? 'bg-[#F3EFE4] text-[#A67C2E] ring-4 ring-[#EAE5DA]'
                      : 'bg-[#F4F1E9] text-[#747D88]'
                  }`}
                >
                  {getNotificationIcon(n)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2
                        className={`text-sm m-0 truncate ${
                          isUnread ? 'font-bold text-[#181A17]' : 'font-semibold text-[#3C403A]'
                        }`}
                      >
                        {localized.title || n.title}
                      </h2>
                      {isUnread && (
                        <span
                          className="w-2 h-2 rounded-full bg-[#A67C2E] shrink-0"
                          aria-label={language === 'en' ? 'Unread' : 'Chưa đọc'}
                        />
                      )}
                    </div>
                    <span className="text-xs text-[#747D88] shrink-0 flex items-center gap-1">
                      <Clock size={12} aria-hidden="true" />{' '}
                      {translateTimeAgo ? translateTimeAgo(n.createdAt) : formatFallbackTimeAgo(n.createdAt, language)}
                    </span>
                  </div>

                  <p className="text-sm text-[#57564E] mt-1 m-0 leading-relaxed whitespace-pre-line break-words">
                    {localized.message || n.message}
                  </p>

                  {link && (
                    <div className="mt-3">
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A67C2E] hover:text-[#181A17] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isUnread) void markSingleRead(n.id);
                        }}
                      >
                        <span>{link.label}</span>
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
