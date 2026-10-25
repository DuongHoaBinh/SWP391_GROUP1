'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Check, Clock, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface DriverNotification {
  id: number | string;
  title: string;
  message: string;
  type?: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityId?: number;
}

export default function DriverNotificationsPage() {
  const [notifs, setNotifs] = useState<DriverNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient<any[]>('/notifications');
      if (Array.isArray(data)) {
        setNotifs(
          data.map((item) => ({
            id: item.notificationId || item.id,
            title: item.title,
            message: item.message,
            type: item.type,
            isRead: Boolean(item.isRead),
            createdAt: item.createdAt,
            relatedEntityId: item.relatedEntityId,
          }))
        );
      }
    } catch (err: any) {
      console.warn('Could not load real notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAll = async () => {
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('Đã đánh dấu đã đọc toàn bộ thông báo.');
    } catch {
      toast.error('Lỗi khi đánh dấu thông báo.');
    }
  };

  const markSingle = async (id: number | string) => {
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      // ignore
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return 'Vừa xong';
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Thông Báo Điều Phối &amp; Nhiệm Vụ</h1>
          <p className="text-sm text-slate-500 mt-1">
            Lịch phân công nhận chuyến, cập nhật lộ trình từ Logistics Manager &amp; Fleet Coordinator.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchNotifications} disabled={isLoading}>
            <RefreshCw size={15} className={`mr-1.5 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button variant="outline" size="sm" onClick={markAll}>
            <Check size={16} className="mr-1.5" /> Đánh dấu đã đọc
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
            Đang tải danh sách thông báo điều phối...
          </div>
        ) : notifs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Bell size={22} />
            </div>
            <h4 className="text-sm font-bold text-slate-700 m-0">Không có thông báo mới</h4>
            <p className="text-xs text-slate-400 mt-1 m-0">
              Khi Manager phân công chuyến đi hoặc có cảnh báo hành lang, bạn sẽ nhận được thông báo tại đây.
            </p>
          </div>
        ) : (
          notifs.map((n) => (
            <div
              key={n.id}
              onClick={() => markSingle(n.id)}
              className={`p-5 flex items-start gap-4 cursor-pointer transition-colors ${
                n.isRead ? 'bg-white hover:bg-slate-50/70' : 'bg-blue-50/40 hover:bg-blue-50/60'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  n.isRead ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-sm'
                }`}
              >
                <Bell size={18} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                    {n.title}
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 inline-block shrink-0" />
                    )}
                  </h4>
                  <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                    <Clock size={12} />
                    {formatTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1 m-0 leading-relaxed">{n.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
