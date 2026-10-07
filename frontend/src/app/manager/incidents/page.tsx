'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, DollarSign, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function ManagerIncidentsPage() {
  const [incidents, setIncidents] = useState([
    { id: 'inc-01', tripCode: 'REQ-002', type: 'Border Gate Inspection Delay', reporter: 'Michael Brown (Driver)', severity: 'HIGH', requestedCost: '2,500,000 VND (Emergency Vet Examination)', status: 'PENDING_APPROVAL', desc: 'Customs requires local veterinary re-inspection at Cau Treo checkpoint. Route change and fee authorization needed.' },
    { id: 'inc-02', tripCode: 'REQ-001', type: 'Traffic Rerouting', reporter: 'John Smith (Driver)', severity: 'MEDIUM', requestedCost: '500,000 VND (Toll fees)', status: 'APPROVED', desc: 'Diverted via expressway to avoid flood zone.' },
  ]);

  const handleApprove = (id: string) => {
    setIncidents(incidents.map(i => i.id === id ? { ...i, status: 'APPROVED' } : i));
    toast.success('Emergency cost & route deviation authorized.');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 m-0">Emergency Incident Escalations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review on-route incidents, authorize route diversions, and approve emergency veterinary costs.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {incidents.map((inc) => (
          <div key={inc.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-600 text-sm">{inc.tripCode}</span>
                <span className="font-bold text-slate-900 text-sm">• {inc.type}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                  {inc.severity}
                </span>
              </div>
              <div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  inc.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {inc.status === 'APPROVED' ? 'Approved & Logged' : 'Needs Approval'}
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-700 m-0 font-medium">{inc.desc}</p>
            
            <div className="p-3 bg-slate-50 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-100">
              <span>Reported by: <strong>{inc.reporter}</strong></span>
              <span className="text-blue-700 font-bold">Estimated Cost Impact: {inc.requestedCost}</span>
            </div>

            {inc.status === 'PENDING_APPROVAL' && (
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => toast('Escalated to Operations board')}>
                  Request Details
                </Button>
                <Button variant="primary" size="sm" onClick={() => handleApprove(inc.id)} className="bg-emerald-600 hover:bg-emerald-700">
                  Authorize Emergency Deviation
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
