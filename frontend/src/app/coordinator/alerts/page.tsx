'use client';

import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle, Clock, MapPin, Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface Alert {
  id: string;
  tripCode: string;
  type: 'Border Congestion' | 'Severe Weather' | 'Traffic Delay';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  location: string;
  message: string;
  timeAgo: string;
  isAcknowledged: boolean;
}

const INITIAL_ALERTS: Alert[] = [
  { id: 'alt-1', tripCode: 'TR-2026-002', type: 'Border Congestion', severity: 'CRITICAL', location: 'Moc Bai Border Gate', message: 'Customs queue backed up 3+ hours due to scanner maintenance. Recommendation: Divert to secondary quarantine lane.', timeAgo: '20m ago', isAcknowledged: false },
  { id: 'alt-2', tripCode: 'TR-2026-001', type: 'Severe Weather', severity: 'WARNING', location: 'Singapore Strait Flight Corridor', message: 'Tropical thunderstorm warning between 15:00 - 18:00. Pre-flight check recommended.', timeAgo: '1h ago', isAcknowledged: false },
  { id: 'alt-3', tripCode: 'TR-2026-005', type: 'Traffic Delay', severity: 'INFO', location: 'Highway 1A - Phan Thiet Bypass', message: 'Heavy road construction. Slow transit expected; +25 mins delay.', timeAgo: '3h ago', isAcknowledged: true },
];

export default function CoordinatorAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>(INITIAL_ALERTS);

  const handleAcknowledge = (id: string) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, isAcknowledged: true } : a));
    toast.success('Alert acknowledged and logged in dispatch records.');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 m-0">Route & Fleet Operational Alerts</h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time incident signals, border congestion warnings, and weather advisories.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {alerts.map((alert) => (
          <div 
            key={alert.id} 
            className={`p-5 rounded-xl border transition-all ${
              alert.severity === 'CRITICAL' ? 'bg-red-50/60 border-red-200' :
              alert.severity === 'WARNING' ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg shrink-0 ${
                  alert.severity === 'CRITICAL' ? 'bg-red-100 text-red-600' :
                  alert.severity === 'WARNING' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{alert.type}</span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-white border text-slate-700">
                      {alert.tripCode}
                    </span>
                    <span className="text-xs text-slate-400">• {alert.timeAgo}</span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium mt-1 flex items-center gap-1 m-0">
                    <MapPin size={12} className="text-slate-400" /> Location: {alert.location}
                  </p>
                  <p className="text-sm text-slate-700 mt-2 m-0 leading-relaxed font-medium">
                    {alert.message}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {alert.isAcknowledged ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                    <CheckCircle size={14} /> Acknowledged
                  </span>
                ) : (
                  <Button 
                    variant="primary" 
                    size="sm"
                    onClick={() => handleAcknowledge(alert.id)}
                    className={alert.severity === 'CRITICAL' ? 'bg-red-600 hover:bg-red-700' : ''}
                  >
                    Acknowledge
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
