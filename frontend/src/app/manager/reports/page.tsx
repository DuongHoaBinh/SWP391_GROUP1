'use client';

import React from 'react';
import { BarChart3, TrendingUp, DollarSign, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function ManagerReportsPage() {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Logistics & Revenue Performance</h1>
          <p className="text-sm text-slate-500 mt-1">
            Executive operational overview, on-time delivery percentages, and financial summaries.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => toast.success('Exporting Executive PDF Report...')}>
          Export Performance Report
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase mb-2">
            <span>Gross Revenue</span>
            <DollarSign size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">$142,500</div>
          <p className="text-xs text-emerald-600 mt-2 font-bold flex items-center gap-1">
            <TrendingUp size={14} /> +12.4% vs last month
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase mb-2">
            <span>On-Time Delivery</span>
            <Clock size={18} className="text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">98.6%</div>
          <p className="text-xs text-slate-500 mt-2">Target benchmark: 95%</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase mb-2">
            <span>Completed Shipments</span>
            <CheckCircle2 size={18} className="text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">38 Trips</div>
          <p className="text-xs text-slate-500 mt-2">126 Horses safely transported</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase mb-2">
            <span>Quarantine Pass Rate</span>
            <ShieldCheck size={18} className="text-teal-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">100%</div>
          <p className="text-xs text-emerald-600 mt-2 font-bold">Zero border rejections</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4">Corridor Revenue Breakdown</h3>
        <div className="flex flex-col gap-4">
          {[
            { corridor: 'Vietnam → Singapore Turf Club (Air Transit)', rev: '$68,000', trips: 14, pct: 48 },
            { corridor: 'Vietnam → Thailand Royal Stables (Overland)', rev: '$44,500', trips: 16, pct: 31 },
            { corridor: 'Singapore → UAE Dubai World Cup Transit', rev: '$30,000', trips: 8, pct: 21 },
          ].map((c, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-slate-800">{c.corridor}</span>
                <span className="font-bold text-slate-900">{c.rev} ({c.trips} trips)</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
