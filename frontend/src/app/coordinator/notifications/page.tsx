'use client';

import React, { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function CoordinatorNotificationsPage() {
  const [notifs, setNotifs] = useState([
    { id: '1', title: 'New Approved Order Assigned', desc: 'Order REQ-001 has been approved by Logistics Manager. Route and vehicle assignment required.', time: '10m ago', read: false },
    { id: '2', title: 'Vehicle Inspection Due', desc: 'Truck TRK-TH-501 routine maintenance checklist has been submitted by technician.', time: '1h ago', read: false },
    { id: '3', title: 'Driver Departure Check-in', desc: 'Driver Michael Brown confirmed departure from Soc Son Stables.', time: '4h ago', read: true },
  ]);

  const markAll = () => {
    setNotifs(notifs.map(n => ({ ...n, read: true })));
    toast.success('All notifications marked as read.');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Coordinator Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">Operational dispatch notices and schedule updates.</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAll}>
          <Check size={16} className="mr-1.5" /> Mark all read
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
        {notifs.map(n => (
          <div key={n.id} className={`p-5 flex items-start gap-4 ${n.read ? 'bg-white' : 'bg-blue-50/30'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.read ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-600'}`}>
              <Bell size={18} />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-900 m-0">{n.title}</h4>
                <span className="text-xs text-slate-400">{n.time}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1 m-0">{n.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
