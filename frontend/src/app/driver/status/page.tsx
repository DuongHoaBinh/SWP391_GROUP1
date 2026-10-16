'use client';

import React, { useState, useEffect } from 'react';
import { Crosshair, CheckCircle2, Clock, MapPin, AlertCircle, Plus, Send, Truck, Stethoscope, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { getCurrentUser } from '@/lib/auth';

interface Milestone {
  id: string;
  title: string;
  location: string;
  timestamp: string;
  status: 'COMPLETED' | 'CURRENT' | 'UPCOMING';
  notes?: string;
}

const INITIAL_MILESTONES: Milestone[] = [
  { id: 'm1', title: 'Departed Soc Son Equestrian Center', location: 'Soc Son, Hanoi', timestamp: 'Today at 06:30 AM', status: 'COMPLETED', notes: 'Vehicle departure inspection passed. 3 horses loaded in good condition.' },
  { id: 'm2', title: 'Rest & Hydration Stop #1', location: 'Ninh Binh Transit Depot', timestamp: 'Today at 09:15 AM', status: 'COMPLETED', notes: 'Horses watered; 30-minute rest observed.' },
  { id: 'm3', title: 'Cau Treo Border Gate Inspection', location: 'Ha Tinh - Laos Border', timestamp: 'Expected: 02:00 PM', status: 'CURRENT', notes: 'Awaiting veterinary quarantine clearance at customs lane 2.' },
  { id: 'm4', title: 'Vientiane Equine Resting Facility', location: 'Vientiane, Laos', timestamp: 'Expected: 07:30 PM', status: 'UPCOMING' },
  { id: 'm5', title: 'Final Handover at Bangkok Royal Stables', location: 'Bangkok, Thailand', timestamp: 'Tomorrow at 09:00 AM', status: 'UPCOMING' },
];

export default function DriverStatusPage() {
  const [milestones, setMilestones] = useState<Milestone[]>(INITIAL_MILESTONES);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [checkInNotes, setCheckInNotes] = useState('');
  const [currentWaypoint, setCurrentWaypoint] = useState('Cau Treo Border Gate Inspection');
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const isEscort = currentUser?.persona === 'escort' || currentUser?.email?.includes('escort');

  const handleConfirmCheckin = () => {
    if (isEscort) {
      toast.error('Chỉ Tài xế lái xe (Driver) mới được cập nhật mốc lộ trình của phương tiện.');
      return;
    }
    setMilestones(milestones.map(m => {
      if (m.title === currentWaypoint) {
        return {
          ...m,
          status: 'COMPLETED',
          timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          notes: checkInNotes || 'Milestone verified by vehicle driver.',
        };
      }
      return m;
    }));
    toast.success(`Check-in logged for ${currentWaypoint}!`);
    setIsCheckInOpen(false);
    setCheckInNotes('');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Role Banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between text-xs transition-all ${
        !isEscort ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}>
        <div className="flex items-center gap-2.5">
          {!isEscort ? (
            <Truck size={20} className="text-blue-600 shrink-0" />
          ) : (
            <Stethoscope size={20} className="text-emerald-600 shrink-0" />
          )}
          <div>
            <span className="font-bold block text-sm">
              {!isEscort ? '🚚 Quyền cập nhật mốc lộ trình: Tài Xế Lái Xe (Driver)' : '👁️ Chế độ theo dõi: Bác Sĩ Thú Y / Hộ Tống (Escort/Vet)'}
            </span>
            <p className="m-0 mt-0.5 opacity-90 text-xs">
              {!isEscort
                ? 'Bạn trực tiếp điều khiển xe vận tải và xác nhận các trạm dừng, mốc kiểm tra thực địa.'
                : 'Bạn đang đăng nhập với tư cách Bác sĩ thú y / Hộ tống viên. Bạn có thể theo dõi tiến độ hành trình nhưng quyền xác nhận mốc di chuyển thuộc về Tài xế.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Trip Milestone Check-in</h1>
          <p className="text-sm text-slate-500 mt-1">
            Trip: <strong className="text-blue-600">REQ-002 (Hanoi to Bangkok)</strong> • Vehicle TRK-VN-102
          </p>
        </div>
        
        {/* Only Driver can submit milestones */}
        {!isEscort && (
          <Button variant="primary" onClick={() => setIsCheckInOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <CheckCircle2 size={18} className="mr-1.5" /> Submit Next Milestone
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Crosshair size={20} className="text-blue-600" /> Milestone Execution Progress
        </h3>

        <div className="relative border-l-2 border-slate-200 ml-4 pl-6 flex flex-col gap-8">
          {milestones.map((m, idx) => (
            <div key={m.id} className="relative">
              {/* Dot */}
              <div className={`absolute -left-[33px] top-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                m.status === 'COMPLETED' ? 'border-emerald-500 text-emerald-600' :
                m.status === 'CURRENT' ? 'border-blue-600 text-blue-600 animate-pulse' : 'border-slate-300 text-slate-300'
              }`}>
                {m.status === 'COMPLETED' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                {m.status === 'CURRENT' && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 m-0">{m.title}</h4>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    m.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                    m.status === 'CURRENT' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {m.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 m-0">
                  <MapPin size={12} className="text-slate-400" /> {m.location} • <Clock size={12} className="text-slate-400 ml-1" /> {m.timestamp}
                </p>
                {m.notes && (
                  <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600">
                    <strong>Driver Notes:</strong> {m.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Checkin Modal */}
      {isCheckInOpen && (
        <Modal isOpen={isCheckInOpen} onClose={() => setIsCheckInOpen(false)} title="Confirm Milestone Check-in" maxWidth="500px">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Current Waypoint</label>
              <select
                value={currentWaypoint}
                onChange={(e) => setCurrentWaypoint(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white font-medium"
              >
                {milestones.filter(m => m.status !== 'COMPLETED').map(m => (
                  <option key={m.id} value={m.title}>{m.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Driver Observations / Waypoint Notes</label>
              <textarea 
                rows={3}
                placeholder="e.g. Cleared customs inspection without delay. Horses calm, vital signs normal."
                value={checkInNotes}
                onChange={(e) => setCheckInNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <Button type="button" variant="outline" onClick={() => setIsCheckInOpen(false)}>Cancel</Button>
              <Button type="button" variant="primary" onClick={handleConfirmCheckin}>Confirm Check-in</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
