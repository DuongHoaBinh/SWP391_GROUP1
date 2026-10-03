'use client';

import React, { useState } from 'react';
import { Crosshair, CheckCircle2, Clock, MapPin, AlertCircle, Plus, Send, Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

export default function DriverStatusPage() {
  const { schedules, getMilestonesByTrip, checkInMilestone } = useFleetRouteStore();
  const { t, translateStatus } = useTranslation();

  const [selectedTripCode, setSelectedTripCode] = useState('TR-2026-002');
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [checkInNotes, setCheckInNotes] = useState('');

  const currentTrip = schedules.find((s) => s.orderCode === selectedTripCode) || schedules[0];
  const milestones = getMilestonesByTrip(selectedTripCode);

  const currentWaypointMilestone =
    milestones.find((m) => m.status === 'CURRENT') ||
    milestones.find((m) => m.status === 'UPCOMING') ||
    milestones[milestones.length - 1];

  const [selectedMilestoneId, setSelectedMilestoneId] = useState(currentWaypointMilestone?.id || '');

  const handleOpenCheckin = () => {
    setSelectedMilestoneId(currentWaypointMilestone?.id || '');
    setIsCheckInOpen(true);
  };

  const handleConfirmCheckin = () => {
    if (!selectedMilestoneId) {
      toast.error('Please select a milestone to check in.');
      return;
    }

    const target = milestones.find((m) => m.id === selectedMilestoneId);
    checkInMilestone(
      selectedTripCode,
      selectedMilestoneId,
      checkInNotes || 'Milestone verified and logged by driver.',
      currentTrip?.driverName || 'Driver'
    );

    toast.success(`Check-in logged for "${target?.title || 'Milestone'}"!`);
    setIsCheckInOpen(false);
    setCheckInNotes('');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">
            {t('driver.checkInTitle', 'Trip Milestone Check-in')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Trip: <strong className="text-blue-600">{currentTrip?.orderCode} ({currentTrip?.routeTitle})</strong> • Vehicle: {currentTrip?.vehicleCode}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Trip Selector */}
          <select
            value={selectedTripCode}
            onChange={(e) => setSelectedTripCode(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold bg-white outline-none focus:border-blue-500"
          >
            {schedules.map((s) => (
              <option key={s.id} value={s.orderCode}>
                {s.orderCode} - {s.horseName} ({s.status})
              </option>
            ))}
          </select>

          <Button variant="primary" onClick={handleOpenCheckin} disabled={milestones.every((m) => m.status === 'COMPLETED')}>
            <CheckCircle2 size={18} className="mr-1.5" /> {t('driver.checkIn', 'Submit Next Milestone')}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
            <Crosshair size={20} className="text-blue-600" /> Milestone Execution Progress
          </h3>
          <span className="text-xs font-bold text-slate-500">
            {milestones.filter((m) => m.status === 'COMPLETED').length} / {milestones.length} Completed
          </span>
        </div>

        <div className="relative border-l-2 border-slate-200 ml-4 pl-6 flex flex-col gap-8">
          {milestones.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No milestones scheduled for this trip.</p>
          ) : (
            milestones.map((m) => (
              <div key={m.id} className="relative">
                {/* Dot Indicator */}
                <div
                  className={`absolute -left-[33px] top-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                    m.status === 'COMPLETED'
                      ? 'border-emerald-500 text-emerald-600'
                      : m.status === 'CURRENT'
                      ? 'border-blue-600 text-blue-600 animate-pulse'
                      : 'border-slate-300 text-slate-300'
                  }`}
                >
                  {m.status === 'COMPLETED' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                  {m.status === 'CURRENT' && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 m-0">{m.title}</h4>
                    {m.isCustomsBorder && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                        Customs / Quarantine
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        m.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : m.status === 'CURRENT'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 m-0">
                    <MapPin size={12} className="text-slate-400" /> {m.location} • <Clock size={12} className="text-slate-400 ml-1" /> {m.timestamp}
                  </p>
                  {m.notes && (
                    <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600">
                      <strong>Notes:</strong> {m.notes}
                      {m.author && <span className="text-slate-400 ml-2">• Logged by {m.author}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Checkin Modal */}
      {isCheckInOpen && (
        <Modal isOpen={isCheckInOpen} onClose={() => setIsCheckInOpen(false)} title="Confirm Milestone Check-in" maxWidth="500px">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Select Waypoint to Check-in</label>
              <select
                value={selectedMilestoneId}
                onChange={(e) => setSelectedMilestoneId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white font-medium"
              >
                {milestones
                  .filter((m) => m.status !== 'COMPLETED')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.seq}. {m.title} ({m.location})
                    </option>
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
              <Button type="button" variant="outline" onClick={() => setIsCheckInOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant="primary" onClick={handleConfirmCheckin}>
                {t('common.confirm', 'Confirm Check-in')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
