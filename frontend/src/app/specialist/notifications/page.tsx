'use client';

import React from 'react';
import Link from 'next/link';
import { Bell, Check, Clock, ArrowRight, CheckCircle2, ShieldAlert, FileText } from 'lucide-react';
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

export default function SpecialistNotificationsPage() {
  const { data: notifications = [], isLoading, mutate } = useSWR<NotificationItem[]>(
    '/notifications',
    (url: string) => apiClient<NotificationItem[]>(url),
    { revalidateOnFocus: true }
  );

  const markAllRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.isRead);
      await Promise.all(
        unread.map((n) =>
          apiClient(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {})
        )
      );
      await mutate();
      toast.success('Đã đánh dấu tất cả là đã đọc');
    } catch {
      toast.error('Có lỗi xảy ra khi cập nhật thông báo');
    }
  };

  const markSingleRead = async (id: number) => {
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
      await mutate();
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Specialist Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">
            Thông báo các đơn hàng vừa được duyệt cần thiết lập hồ sơ kiểm dịch và giấy tờ khách hàng nộp.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="shadow-sm">
            <Check size={16} className="mr-1.5" /> Đánh dấu tất cả đã đọc ({unreadCount})
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Đang tải thông báo...</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-3 opacity-60" />
            Không có thông báo mới nào.
          </div>
        ) : (
          notifications.map((n) => {
            const isUnread = !n.isRead;
            const isMissingDocs = n.type === 'document_missing' || n.title.includes('hồ sơ');
            return (
              <div
                key={n.id}
                onClick={() => isUnread && markSingleRead(n.id)}
                className={`p-5 flex items-start gap-4 transition-colors cursor-pointer ${
                  isUnread ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isUnread
                      ? 'bg-indigo-100 text-indigo-600 ring-4 ring-indigo-50'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isMissingDocs ? <FileText size={18} /> : <Bell size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-sm m-0 ${
                          isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                        }`}
                      >
                        {n.title}
                      </h4>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                      <Clock size={12} /> {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 m-0 leading-relaxed whitespace-pre-line">
                    {n.message}
                  </p>
                  {n.shipmentId && (
                    <div className="mt-3">
                      <Link
                        href={`/specialist/compliance-orders`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Mở đơn hàng Compliance Orders #{n.shipmentId} <ArrowRight size={13} />
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
