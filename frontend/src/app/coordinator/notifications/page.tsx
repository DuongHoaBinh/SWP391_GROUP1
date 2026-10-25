'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Bell, Check, Clock, ArrowRight, CheckCircle2, 
  Map, CalendarDays, AlertTriangle, Radio, RefreshCw 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';
import toast from 'react-hot-toast';

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

function timeAgo(dateString: string): string {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${diffDays} ngày trước`;
}

export default function CoordinatorNotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: notifications = [], isLoading, mutate } = useSWR<NotificationItem[]>(
    '/notifications',
    (url: string) => apiClient<NotificationItem[]>(url),
    { revalidateOnFocus: true, refreshInterval: 15000 }
  );

  const markAllRead = async () => {
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      await mutate();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }
      toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
    } catch {
      toast.error('Có lỗi xảy ra khi cập nhật thông báo');
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
  const filteredNotifications = filter === 'unread' 
    ? notifications.filter((n) => !n.isRead) 
    : notifications;

  const getNotificationIcon = (n: NotificationItem) => {
    const text = (n.title + ' ' + n.message).toLowerCase();
    if (text.includes('sự cố') || text.includes('incident') || n.type === 'incident') {
      return <AlertTriangle size={18} className="text-rose-600" />;
    }
    if (text.includes('lập tuyến') || text.includes('lộ trình') || text.includes('route')) {
      return <Map size={18} className="text-blue-600" />;
    }
    if (text.includes('xuất phát') || text.includes('khởi hành') || text.includes('lịch trình')) {
      return <CalendarDays size={18} className="text-amber-600" />;
    }
    if (text.includes('di chuyển') || text.includes('tracking') || text.includes('hiện trường')) {
      return <Radio size={18} className="text-emerald-600" />;
    }
    return <Bell size={18} className={!n.isRead ? 'text-blue-600' : 'text-slate-400'} />;
  };

  const getTargetLink = (n: NotificationItem) => {
    if (!n.shipmentId) return null;
    const text = (n.title + ' ' + n.message).toLowerCase();
    const reqCode = `REQ-${String(n.shipmentId).padStart(3, '0')}`;

    if (text.includes('sự cố') || text.includes('incident')) {
      return {
        label: `Xử lý sự cố đơn ${reqCode}`,
        href: `/coordinator/routes?shipmentId=${n.shipmentId}`,
      };
    }
    if (text.includes('lập tuyến') || text.includes('lộ trình') || text.includes('kế hoạch')) {
      return {
        label: `Mở bản vẽ lộ trình ${reqCode}`,
        href: `/coordinator/routes?shipmentId=${n.shipmentId}`,
      };
    }
    if (text.includes('xuất phát') || text.includes('lịch') || text.includes('khởi hành')) {
      return {
        label: `Xem lịch điều độ ${reqCode}`,
        href: `/coordinator/schedule`,
      };
    }
    return {
      label: `Xem chi tiết đơn ${reqCode}`,
      href: `/coordinator/monitoring?shipmentId=${n.shipmentId}`,
    };
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">Coordinator Notifications</h1>
            {unreadCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {unreadCount} thông báo mới
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Thông báo điều phối phân công tuyến đường, cập nhật khởi hành và tiến độ thực tế từ hiện trường.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead} className="shadow-xs">
              <Check size={16} className="mr-1.5" /> Đánh dấu tất cả đã đọc ({unreadCount})
            </Button>
          ) : (
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-500" /> Tất cả thông báo đã đọc
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            className="shadow-xs text-slate-600"
            title="Làm mới thông báo"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            filter === 'all'
              ? 'bg-slate-800 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Tất cả ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            filter === 'unread'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Chưa đọc ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
            <span>Đang tải thông báo thực tế từ máy chủ...</span>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-3 opacity-70" />
            <p className="font-semibold text-slate-800 m-0">
              {filter === 'unread' ? 'Không có thông báo chưa đọc nào.' : 'Không có thông báo nào.'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Các thông báo điều phối mới sẽ xuất hiện tại đây theo thời gian thực.</p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isUnread = !n.isRead;
            const link = getTargetLink(n);

            return (
              <div
                key={n.id}
                onClick={() => isUnread && markSingleRead(n.id)}
                className={`p-5 flex items-start gap-4 transition-colors cursor-pointer ${
                  isUnread ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isUnread
                      ? 'bg-blue-100 text-blue-600 ring-4 ring-blue-50'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {getNotificationIcon(n)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4
                        className={`text-sm m-0 truncate ${
                          isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                        }`}
                      >
                        {n.title}
                      </h4>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                      <Clock size={12} /> {timeAgo(n.createdAt)}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 mt-1 m-0 leading-relaxed whitespace-pre-line">
                    {n.message}
                  </p>

                  {link && (
                    <div className="mt-3">
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>{link.label}</span>
                        <ArrowRight size={13} />
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
