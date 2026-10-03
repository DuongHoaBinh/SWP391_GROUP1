'use client';

import React, { useState } from 'react';
import { Stethoscope, Plus, Thermometer, Heart, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

interface HealthLog {
  id: string;
  horseName: string;
  tripCode: string;
  tempC: number;
  condition: 'Stable' | 'Stressed' | 'Not Eating' | 'Minor Abrasion';
  heartRateBpm: number;
  notes: string;
  loggedAt: string;
}

const INITIAL_LOGS: HealthLog[] = [
  { id: 'hl-1', horseName: 'Silver Star', tripCode: 'REQ-002', tempC: 37.8, condition: 'Stable', heartRateBpm: 38, notes: 'Horse is calm and hydrated. Ate standard ration during Ninh Binh rest stop.', loggedAt: 'Today at 09:30 AM' },
  { id: 'hl-2', horseName: 'Royal Stallion', tripCode: 'REQ-002', tempC: 38.4, condition: 'Stressed', heartRateBpm: 46, notes: 'Restless due to road vibration near mountain pass. Administered electrolyte water; soothing music on.', loggedAt: 'Today at 11:15 AM' },
  { id: 'hl-3', horseName: 'Thunderbolt', tripCode: 'REQ-002', tempC: 37.6, condition: 'Stable', heartRateBpm: 36, notes: 'Optimal physiological status. Normal appetite.', loggedAt: 'Today at 09:35 AM' },
];

export default function HorseHealthPage() {
  const [logs, setLogs] = useState<HealthLog[]>(INITIAL_LOGS);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    horseName: 'Silver Star',
    tempC: 38.0,
    heartRateBpm: 40,
    condition: 'Stable',
    notes: '',
  });

  const handleCreateLog = (e: React.FormEvent) => {
    e.preventDefault();
    const newLog: HealthLog = {
      id: `hl-${Date.now()}`,
      horseName: formData.horseName,
      tripCode: 'REQ-002',
      tempC: Number(formData.tempC) || 38.0,
      heartRateBpm: Number(formData.heartRateBpm) || 40,
      condition: formData.condition as any || 'Stable',
      notes: formData.notes || 'Routine check completed.',
      loggedAt: `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    };
    setLogs([newLog, ...logs]);
    toast.success(`Health observation logged for ${newLog.horseName}!`);
    setIsAddOpen(false);
    setFormData({ horseName: 'Silver Star', tempC: 38.0, heartRateBpm: 40, condition: 'Stable', notes: '' });
  };

  const handleDeleteLog = (id: string) => {
    setLogs(logs.filter(l => l.id !== id));
    toast.success('Log entry removed.');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Equine Health Observation Logs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Trip: <strong className="text-blue-600">REQ-002</strong> • Monitored by Driver & Medical Escort
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsAddOpen(true)}>
          <Plus size={18} className="mr-1.5" /> Record Health Observation
        </Button>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">Average Body Temp</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1 m-0">37.9°C</h3>
            <span className="text-[11px] font-bold text-emerald-600">Equine Normal: 37.2 - 38.3°C</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Thermometer size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">Condition Status</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1 m-0">2 Stable / 1 Stressed</h3>
            <span className="text-[11px] font-bold text-amber-600">Under close escort watch</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Heart size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">Health Check Compliance</p>
            <h3 className="text-2xl font-extrabold text-purple-600 mt-1 m-0">100%</h3>
            <span className="text-[11px] font-bold text-purple-600">Checked every 3 hours</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-900 m-0">Observations History</h3>
          <span className="text-xs font-bold text-slate-500">{logs.length} Logged Checks</span>
        </div>

        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4">Horse</th>
              <th className="p-4">Body Temp</th>
              <th className="p-4">Heart Rate</th>
              <th className="p-4">Condition</th>
              <th className="p-4">Observation Notes</th>
              <th className="p-4">Logged Time</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50/70">
                <td className="p-4 font-bold text-slate-900">{log.horseName}</td>
                <td className="p-4 font-semibold text-slate-800">
                  <span className={`inline-flex items-center gap-1 ${log.tempC > 38.3 ? 'text-amber-600 font-bold' : 'text-slate-800'}`}>
                    <Thermometer size={14} /> {log.tempC}°C
                  </span>
                </td>
                <td className="p-4 font-medium text-slate-700">{log.heartRateBpm} bpm</td>
                <td className="p-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    log.condition === 'Stable' ? 'bg-emerald-100 text-emerald-800' :
                    log.condition === 'Stressed' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {log.condition}
                  </span>
                </td>
                <td className="p-4 text-xs text-slate-600 max-w-xs">{log.notes}</td>
                <td className="p-4 text-xs text-slate-500">{log.loggedAt}</td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => handleDeleteLog(log.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100"
                    title="Delete log"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Observation Modal */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Record Horse Health Observation" maxWidth="500px">
          <form onSubmit={handleCreateLog} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Select Horse</label>
              <select
                value={formData.horseName}
                onChange={(e) => setFormData({ ...formData, horseName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white font-medium"
              >
                <option value="Silver Star">Silver Star (Thoroughbred)</option>
                <option value="Royal Stallion">Royal Stallion (Arabian)</option>
                <option value="Thunderbolt">Thunderbolt (Warmblood)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Body Temp (°C) *</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={formData.tempC}
                  onChange={(e) => setFormData({ ...formData, tempC: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Heart Rate (BPM)</label>
                <input 
                  type="number" 
                  value={formData.heartRateBpm}
                  onChange={(e) => setFormData({ ...formData, heartRateBpm: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Physiological Condition</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value="Stable">Stable & Calm</option>
                <option value="Stressed">Stressed / Agitated</option>
                <option value="Not Eating">Not Eating / Off-Feed</option>
                <option value="Minor Abrasion">Minor Abrasion / Scratch</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Observation Notes</label>
              <textarea 
                rows={3}
                placeholder="e.g. Horse drank 15L water, resting calmly on soft bedding."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Save Health Record</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
