'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, TrendingUp, Calendar, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function CustomerReportsPage() {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-3">
        <Link
          href="/customer"
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Transport Analytics & Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Summary of your horse transportation history, completion metrics, and health compliance.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase mb-2">
            <span>Completed Trips</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">12</div>
          <p className="text-xs text-emerald-600 mt-2 font-medium">100% On-time delivery rate</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase mb-2">
            <span>Active Transport</span>
            <Clock size={18} className="text-blue-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">2</div>
          <p className="text-xs text-blue-600 mt-2 font-medium">Currently in transit</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase mb-2">
            <span>Compliance Score</span>
            <TrendingUp size={18} className="text-purple-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">98%</div>
          <p className="text-xs text-purple-600 mt-2 font-medium">Veterinary records verified</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center py-12">
        <BarChart3 size={48} className="text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800 m-0">Detailed Trip History Available</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-5">
          Export full PDF statements of past horse transports, invoices, and veterinary inspection forms.
        </p>
        <Button variant="outline" size="sm" onClick={() => toast.success('Đang tạo và tải báo cáo vận chuyển (PDF)...')}>
          Download Transport Statement (PDF)
        </Button>
      </div>
    </div>
  );
}
