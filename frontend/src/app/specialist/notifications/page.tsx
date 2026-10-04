'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Check, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface Notif {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  timeAgo: string;
}

export default function SpecialistNotificationsPage() {
  const [notifications, setNotifications] = useState<Notif[]>([
    {
      id: 'notif-1',
      title: 'New Quarantine Document Uploaded',
      message: 'Customer uploaded EIA Certificate for horse Thunder (TR-2026-001). Pending review.',
      isRead: false,
      timeAgo: '15m ago',
    },
    {
      id: 'notif-2',
      title: 'Document Expiration Alert',
      message: 'Import permit for Starlight (TR-2026-015) has expired. Client notification required.',
      isRead: false,
      timeAgo: '2h ago',
    },
    {
      id: 'notif-3',
      title: 'Regulation Update: Singapore',
      message: 'New quarantine isolation guidelines updated by Singapore Food Agency.',
      isRead: true,
      timeAgo: '1d ago',
    },
  ]);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast.success('Marked all notifications as read');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Specialist Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">
            System updates, regulatory compliance alerts, and customer document submissions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead} className="shadow-sm">
          <Check size={16} className="mr-1.5" /> Mark all as read
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`p-5 flex items-start gap-4 transition-colors ${
              n.isRead ? 'bg-white hover:bg-slate-50/50' : 'bg-blue-50/30 hover:bg-blue-50/50'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                n.isRead ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-600'
              }`}
            >
              <Bell size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 m-0">{n.title}</h4>
                <span className="text-xs text-slate-400 font-medium">{n.timeAgo}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1 m-0">{n.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
