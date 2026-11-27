'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Check, Clock, RefreshCw, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DriverNotification {
  id: number | string;
  title: string;
  message: string;
  type?: string;
  isRead: boolean;
  createdAt: string;
  shipmentId?: number | null;
}

function formatFallbackTimeAgo(iso: string, language: 'en' | 'vi'): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (language === 'en') {
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  return `${days} ngày trước`;
}

export default function DriverNotificationsPage() {
  const pathname = usePathname();
  const { t, language, translateNotification, translateTimeAgo } = useLanguage();
  const [notifs, setNotifs] = useState<DriverNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const isEscort =
    currentUser?.persona === 'escort' ||
    currentUser?.specialization === 'escort' ||
    currentUser?.email?.toLowerCase().includes('escort') ||
    Boolean(pathname?.startsWith('/escort'));
  const basePath = isEscort ? '/escort' : '/driver';

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient<any[]>('/notifications');
      if (Array.isArray(data)) {
        setNotifs(
          data.map((item) => ({
            id: item.notificationId || item.id,
            title: item.title || '',
            message: item.message || '',
            type: item.type,
            isRead: Boolean(item.isRead),
            createdAt: item.createdAt,
            shipmentId: item.shipmentId ?? item.relatedEntityId ?? null,
          }))
        );
      }
    } catch (err: any) {
      setLoadError(
        err?.message ||
          t(
            'notifications.loadError',
            language === 'en' ? 'Unable to load notifications. Please try again.' : 'Không thể tải danh sách thông báo. Vui lòng thử lại.'
          )
      );
    } finally {
      setIsLoading(false);
    }
  }, [language, t]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = notifs.filter((n) => !n.isRead).length;
  const displayedNotifs = filter === 'unread' ? notifs.filter((n) => !n.isRead) : notifs;

  const markAll = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
      toast.success(
        t(
          'notifications.markAllSuccess',
          language === 'en' ? 'All notifications marked as read.' : 'Đã đánh dấu đã đọc toàn bộ thông báo.'
        )
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'notifications.updateError',
            language === 'en' ? 'Unable to mark notifications as read.' : 'Lỗi khi đánh dấu thông báo.'
          )
      );
    } finally {
      setIsMarkingAll(false);
    }
  };

  const markSingle = async (n: DriverNotification) => {
    if (n.isRead) return;
    try {
      await apiClient(`/notifications/${n.id}/read`, { method: 'PATCH' });
      setNotifs((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'notifications.updateError',
            language === 'en' ? 'Unable to update notification status.' : 'Không thể cập nhật trạng thái thông báo.'
          )
      );
    }
  };

  const getActionLink = (n: DriverNotification) => {
    const text = `${n.title} ${n.message}`.toLowerCase();
    const qs = n.shipmentId ? `?shipmentId=${n.shipmentId}` : '';
    if (text.includes('sự cố') || text.includes('incident')) {
      return {
        href: `${basePath}/incidents`,
        label: language === 'en' ? 'View incident alerts' : 'Xem báo cáo sự cố',
      };
    }
    if (text.includes('sức khỏe') || text.includes('health') || text.includes('thú y') || text.includes('sinh hiệu')) {
      return {
        href: `${basePath}/health${qs}`,
        label: language === 'en' ? 'Open equine health log' : 'Mở nhật ký sức khỏe ngựa',
      };
    }
    if (n.shipmentId && (text.includes('phân công') || text.includes('assign'))) {
      return {
        href: `${basePath}/trips`,
        label: language === 'en' ? 'Review & confirm trip' : 'Xem & xác nhận chuyến',
      };
    }
    if (n.shipmentId) {
      return {
        href: `${basePath}/status?shipmentId=${n.shipmentId}`,
        label: language === 'en' ? 'Open trip console' : 'Mở bảng điều hành chuyến',
      };
    }
    if (text.includes('phân công') || text.includes('chuyến') || text.includes('assign') || text.includes('trip')) {
      return {
        href: `${basePath}/trips`,
        label: language === 'en' ? 'View my trips' : 'Xem chuyến đi được phân công',
      };
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {t('driver.notifications.title', language === 'en' ? 'Dispatch & Crew Notifications' : 'Thông Báo Điều Phối & Nhiệm Vụ')}
            </h1>
            {unreadCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3]">
                {unreadCount} {t('common.unreadNotificationsCount', language === 'en' ? 'unread' : 'thông báo mới')}
              </span>
            )}
          </div>
          <p className="text-sm text-[#57564E] mt-1 mb-0">
            {language === 'en'
              ? 'Trip assignments, schedule updates, and urgent operational notices from Logistics Manager.'
              : 'Lịch phân công nhận chuyến, cập nhật lộ trình và cảnh báo từ Quản lý Logistics.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchNotifications()}
            disabled={isLoading}
            className="min-h-[44px] px-4 rounded-xl font-bold border-[#D8CEBE]"
          >
            <RefreshCw size={15} className={`mr-1.5 text-[#A67C2E] ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('common.refresh', language === 'en' ? 'Refresh' : 'Làm mới')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void markAll()}
            disabled={unreadCount === 0 || isMarkingAll || isLoading}
            className="min-h-[44px] px-4 rounded-xl font-bold border-[#D8CEBE] disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {isMarkingAll ? (
              <Loader2 size={15} className="mr-1.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check size={16} className="mr-1.5" aria-hidden="true" />
            )}
            {t('common.markAllRead', language === 'en' ? 'Mark all read' : 'Đánh dấu đã đọc')}
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
              : 'bg-white border border-[#D8CEBE] text-[#57564E] hover:bg-[#FAF8F4]'
          }`}
        >
          {t('common.all', language === 'en' ? 'All' : 'Tất cả')} ({notifs.length})
        </button>
        <button
          type="button"
          aria-pressed={filter === 'unread'}
          onClick={() => setFilter('unread')}
          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'unread'
              ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
              : 'bg-white border border-[#D8CEBE] text-[#57564E] hover:bg-[#FAF8F4]'
          }`}
        >
          {t('common.unread', language === 'en' ? 'Unread' : 'Chưa đọc')} ({unreadCount})
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void fetchNotifications()}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#D8CEBE] divide-y divide-[#EAE5DA] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-[#57564E] flex flex-col items-center gap-2 text-sm">
            <RefreshCw size={24} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
            <span>
              {t('common.loadingNotifications', language === 'en' ? 'Loading dispatch notifications...' : 'Đang tải danh sách thông báo điều phối...')}
            </span>
          </div>
        ) : displayedNotifs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FAF8F4] text-[#8A8478] flex items-center justify-center mx-auto mb-3 border border-[#D8CEBE]">
              {filter === 'unread' ? (
                <CheckCircle2 size={22} className="text-[#2D5A3F]" aria-hidden="true" />
              ) : (
                <Bell size={22} aria-hidden="true" />
              )}
            </div>
            <h2 className="text-sm font-bold text-[#181A17] m-0">
              {filter === 'unread'
                ? t('notifications.noUnread', language === 'en' ? 'No unread notifications' : 'Không có thông báo chưa đọc')
                : t('notifications.emptyState', language === 'en' ? 'No notifications yet' : 'Không có thông báo mới')}
            </h2>
            <p className="text-xs text-[#747D88] mt-1 m-0 max-w-md mx-auto leading-relaxed">
              {t(
                'driver.notifications.emptyDesc',
                language === 'en'
                  ? 'When Manager assigns a trip or route alerts occur, they will appear here.'
                  : 'Khi Manager phân công chuyến đi hoặc có cảnh báo hành lang, bạn sẽ nhận được thông báo tại đây.'
              )}
            </p>
            <div className="mt-4">
              <Link
                href={`${basePath}/trips`}
                className="min-h-[44px] inline-flex items-center justify-center px-4 py-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] hover:border-[#A67C2E] text-xs font-bold text-[#181A17] no-underline"
              >
                {t('driver.dashboard.viewAllTrips', language === 'en' ? 'View Assigned Trips' : 'Xem Chuyến Đi Được Giao')}
              </Link>
            </div>
          </div>
        ) : (
          displayedNotifs.map((n) => {
            const isUnread = !n.isRead;
            const localized = translateNotification(n.title, n.message);
            const action = getActionLink(n);

            return (
              <div
                key={n.id}
                role={isUnread ? 'button' : undefined}
                tabIndex={isUnread ? 0 : undefined}
                onClick={() => isUnread && void markSingle(n)}
                onKeyDown={
                  isUnread
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void markSingle(n);
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
                      ? 'bg-[#181A17] text-[#C4B38E] ring-4 ring-[#EAE5DA] shadow-sm'
                      : 'bg-[#F4F1E9] text-[#747D88]'
                  }`}
                >
                  <Bell size={18} aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <h2 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-2 min-w-0">
                      <span className="truncate">{localized.title || n.title}</span>
                      {isUnread && (
                        <span
                          className="w-2 h-2 rounded-full bg-[#A67C2E] inline-block shrink-0"
                          aria-label={language === 'en' ? 'Unread' : 'Chưa đọc'}
                        />
                      )}
                    </h2>
                    <span className="text-xs text-[#747D88] flex items-center gap-1 shrink-0">
                      <Clock size={12} aria-hidden="true" />
                      {translateTimeAgo ? translateTimeAgo(n.createdAt) : formatFallbackTimeAgo(n.createdAt, language)}
                    </span>
                  </div>

                  <p className="text-sm text-[#57564E] mt-1 m-0 leading-relaxed break-words">
                    {localized.message || n.message}
                  </p>

                  {action && (
                    <div className="mt-2.5">
                      <Link
                        href={action.href}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isUnread) void markSingle(n);
                        }}
                        className="inline-flex items-center gap-1.5 min-h-[36px] text-xs font-bold text-[#A67C2E] hover:text-[#181A17] hover:underline"
                      >
                        <span>{action.label}</span>
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
