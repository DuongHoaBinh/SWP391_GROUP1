'use client';

import React, { useState } from 'react';
import { AlertTriangle, Plus, ShieldAlert, CheckCircle, Clock, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

interface Incident {
  id: string;
  tripCode: string;
  type: 'Vehicle Breakdown' | 'Traffic Delay' | 'Equine Medical Emergency' | 'Severe Weather' | 'Border Issue';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
  description: string;
  reportedAt: string;
}

const INITIAL_INCIDENTS: Incident[] = [
  { id: 'inc-01', tripCode: 'REQ-002', type: 'Border Issue', severity: 'HIGH', status: 'IN_REVIEW', description: 'Scanner delay at customs checkpoint. Vehicle held for manual papers verification.', reportedAt: '1h ago' },
  { id: 'inc-02', tripCode: 'REQ-001', type: 'Traffic Delay', severity: 'MEDIUM', status: 'RESOLVED', description: 'Heavy congestion on highway 1A due to overturned truck. Delay +35m.', reportedAt: 'Yesterday' },
];

export default function DriverIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>(INITIAL_INCIDENTS);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'Vehicle Breakdown',
    severity: 'HIGH',
    description: '',
  });

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description) {
      toast.error('Please describe the incident situation.');
      return;
    }
    const newInc: Incident = {
      id: `inc-${Date.now()}`,
      tripCode: 'REQ-002',
      type: form.type as any,
      severity: form.severity as any,
      status: 'OPEN',
      description: form.description,
      reportedAt: 'Just now',
    };
    setIncidents([newInc, ...incidents]);
    toast.success('Emergency incident reported to Dispatch & Manager!');
    setIsAddOpen(false);
    setForm({ type: 'Vehicle Breakdown', severity: 'HIGH', description: '' });
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Emergency Incident Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Report breakdowns, border delays, and equine medical emergencies directly to Operations.
          </p>
        </div>
        <Button 
          variant="primary" 
          onClick={() => setIsAddOpen(true)}
          className="bg-red-600 hover:bg-red-700 shadow-sm"
        >
          <AlertTriangle size={18} className="mr-1.5" /> Report New Incident
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {incidents.map((inc) => (
          <div key={inc.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-blue-600 text-sm">{inc.tripCode}</span>
                <span className="font-bold text-slate-900 text-sm">• {inc.type}</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  inc.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                  inc.severity === 'HIGH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {inc.severity}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">{inc.reportedAt}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  inc.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' :
                  inc.status === 'IN_REVIEW' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                }`}>
                  {inc.status}
                </span>
              </div>
            </div>
            <p className="text-sm text-slate-700 mt-3 m-0 leading-relaxed font-medium">
              {inc.description}
            </p>
          </div>
        ))}
      </div>

      {/* Report Modal */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Report Transport Incident" maxWidth="500px">
          <form onSubmit={handleReport} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Incident Category</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value="Vehicle Breakdown">Vehicle Breakdown / Engine Trouble</option>
                <option value="Traffic Delay">Traffic / Route Congestion</option>
                <option value="Equine Medical Emergency">Equine Medical Emergency (Colic, Fever, Injury)</option>
                <option value="Border Issue">Border Gate / Customs Inspection Delay</option>
                <option value="Severe Weather">Severe Weather (Flooding, Storms)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Severity Level</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white font-semibold text-red-600"
              >
                <option value="CRITICAL">CRITICAL (Requires immediate emergency response)</option>
                <option value="HIGH">HIGH (Major route or schedule disruption)</option>
                <option value="MEDIUM">MEDIUM (Moderate delay)</option>
                <option value="LOW">LOW (Informational)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Situation Description *</label>
              <textarea 
                rows={4}
                placeholder="Provide location, symptoms, vehicle condition, and immediate assistance needed..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" className="bg-red-600 hover:bg-red-700">Submit Emergency Report</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
