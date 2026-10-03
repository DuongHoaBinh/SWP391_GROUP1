'use client';

import React, { useState } from 'react';
import { CalendarDays, Plus, Clock, Truck, User, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

interface ScheduleItem {
  id: string;
  orderCode: string;
  horseCount: number;
  departureTime: string;
  vehicleCode: string;
  driverName: string;
  escortName: string;
  routeTitle: string;
  status: 'Scheduled' | 'Boarding' | 'Departed';
}

const INITIAL_SCHEDULE: ScheduleItem[] = [
  { id: 'sch-1', orderCode: 'REQ-001', horseCount: 2, departureTime: '2026-10-15 08:00 AM', vehicleCode: 'TRK-VN-089', driverName: 'John Smith', escortName: 'Dr. Sarah (Vet)', routeTitle: 'Saigon to Singapore', status: 'Scheduled' },
  { id: 'sch-2', orderCode: 'REQ-002', horseCount: 4, departureTime: '2026-10-16 06:30 AM', vehicleCode: 'TRK-VN-102', driverName: 'Michael Brown', escortName: 'David Lee', routeTitle: 'Hanoi to Bangkok', status: 'Scheduled' },
  { id: 'sch-3', orderCode: 'REQ-005', horseCount: 1, departureTime: '2026-10-18 01:00 PM', vehicleCode: 'AIR-SG-330', driverName: 'Capt. Robert', escortName: 'Dr. Elena (FEI Vet)', routeTitle: 'Singapore to Dubai Express', status: 'Scheduled' },
];

export default function TripSchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>(INITIAL_SCHEDULE);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newSch, setNewSch] = useState({
    orderCode: 'REQ-009',
    departureTime: '',
    vehicleCode: 'TRK-VN-089',
    driverName: '',
    escortName: '',
    routeTitle: '',
    horseCount: 2,
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSch.departureTime || !newSch.driverName || !newSch.routeTitle) {
      toast.error('Please enter departure time, assigned driver, and route.');
      return;
    }
    const item: ScheduleItem = {
      id: `sch-${Date.now()}`,
      orderCode: newSch.orderCode,
      departureTime: newSch.departureTime,
      vehicleCode: newSch.vehicleCode,
      driverName: newSch.driverName,
      escortName: newSch.escortName || 'N/A',
      routeTitle: newSch.routeTitle,
      horseCount: Number(newSch.horseCount) || 1,
      status: 'Scheduled',
    };
    setSchedules([item, ...schedules]);
    toast.success('Trip schedule entry created successfully!');
    setIsAddOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Trip Dispatch Schedule</h1>
          <p className="text-sm text-slate-500 mt-1">
            Assign transport vehicles, drivers, equine escorts, and departure timetables.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsAddOpen(true)}>
          <Plus size={18} className="mr-1.5" /> Dispatch New Trip
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4">Order Code</th>
              <th className="p-4">Departure Time</th>
              <th className="p-4">Assigned Vehicle</th>
              <th className="p-4">Driver & Escort</th>
              <th className="p-4">Route Title</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schedules.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/70">
                <td className="p-4 font-bold text-blue-600">{s.orderCode}</td>
                <td className="p-4 text-slate-800 font-semibold flex items-center gap-1.5">
                  <Clock size={14} className="text-slate-400" /> {s.departureTime}
                </td>
                <td className="p-4 font-medium text-slate-700">
                  <span className="bg-slate-100 px-2.5 py-1 rounded text-xs font-bold">{s.vehicleCode}</span>
                </td>
                <td className="p-4 text-slate-700">
                  <p className="font-semibold text-slate-900 m-0">{s.driverName}</p>
                  <p className="text-xs text-slate-500 m-0">Escort: {s.escortName}</p>
                </td>
                <td className="p-4 font-medium text-slate-700">{s.routeTitle}</td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Schedule Modal */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Dispatch Transport Trip" maxWidth="500px">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Departure Timetable *</label>
              <input 
                type="datetime-local" 
                value={newSch.departureTime}
                onChange={(e) => setNewSch({ ...newSch, departureTime: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Assign Driver *</label>
                <input 
                  type="text" 
                  placeholder="Driver full name"
                  value={newSch.driverName}
                  onChange={(e) => setNewSch({ ...newSch, driverName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Medical Escort</label>
                <input 
                  type="text" 
                  placeholder="e.g. Dr. Nguyen (Vet)"
                  value={newSch.escortName}
                  onChange={(e) => setNewSch({ ...newSch, escortName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Route *</label>
              <input 
                type="text" 
                placeholder="e.g. Saigon to Singapore Turf Club"
                value={newSch.routeTitle}
                onChange={(e) => setNewSch({ ...newSch, routeTitle: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Confirm Dispatch</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
