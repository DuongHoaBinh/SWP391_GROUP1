'use client';

import React, { useState } from 'react';
import { Stethoscope, Plus, Thermometer, Heart, AlertTriangle, CheckCircle2, Trash2, ShieldAlert, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useFleetRouteStore, HorseHealthLog } from '@/lib/fleet-route-store';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

export default function HorseHealthPage() {
  const { schedules, healthLogs, addHealthLog, deleteHealthLog, getHealthLogsByTrip } = useFleetRouteStore();
  const { t } = useTranslation();

  const [selectedTripCode, setSelectedTripCode] = useState<string>('TR-2026-002');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const currentTrip = schedules.find((s) => s.orderCode === selectedTripCode) || schedules[0];
  const tripLogs = getHealthLogsByTrip(selectedTripCode);
  const displayLogs = tripLogs.length > 0 ? tripLogs : healthLogs;

  const [formData, setFormData] = useState({
    horseName: currentTrip?.horseName || 'Silver Star',
    tempC: 37.9,
    heartRateBpm: 40,
    condition: 'Stable' as HorseHealthLog['condition'],
    notes: '',
    loggedBy: currentTrip?.escortName || currentTrip?.driverName || 'Veterinary Escort Dr. Nam',
  });

  // Calculate live statistics
  const avgTemp = displayLogs.length > 0
    ? (displayLogs.reduce((acc, l) => acc + l.tempC, 0) / displayLogs.length).toFixed(1)
    : '37.8';

  const stableCount = displayLogs.filter((l) => l.condition === 'Stable').length;
  const abnormalCount = displayLogs.length - stableCount;

  const handleOpenAdd = () => {
    setFormData({
      horseName: currentTrip?.horseName?.split('&')[0]?.trim() || 'Silver Star',
      tempC: 37.9,
      heartRateBpm: 40,
      condition: 'Stable',
      notes: '',
      loggedBy: currentTrip?.escortName || 'Veterinary Escort Dr. Nam',
    });
    setIsAddOpen(true);
  };

  const handleCreateLog = (e: React.FormEvent) => {
    e.preventDefault();
    const tempNum = Number(formData.tempC) || 37.9;
    const hrNum = Number(formData.heartRateBpm) || 40;

    const newLog = addHealthLog({
      tripCode: selectedTripCode,
      horseName: formData.horseName || 'Racehorse',
      tempC: tempNum,
      heartRateBpm: hrNum,
      condition: formData.condition,
      notes: formData.notes || t('driver.routineCheckCompleted', 'Routine health check completed.'),
      loggedBy: formData.loggedBy || 'Driver & Escort',
    });

    if (formData.condition === 'Stressed' || formData.condition === 'Not Eating' || tempNum >= 38.3) {
      toast(t('driver.healthAlertGenerated', 'Warning alert generated for Coordinator due to equine stress/temperature!'), {
        icon: '⚠️',
        duration: 5000,
        style: {
          background: '#fffbeb',
          color: '#92400e',
          border: '1px solid #fef3c7',
          fontWeight: 600,
        },
      });
    } else {
      toast.success(`Health observation logged for ${newLog.horseName}!`);
    }

    setIsAddOpen(false);
  };

  const handleDeleteLog = (id: string) => {
    deleteHealthLog(id);
    toast.success('Log entry removed.');
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">
            {t('driver.healthTitle', 'Equine Health Observation Logs')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('driver.healthSubtitle', 'Vital signs, body temperature, and behavioral logs monitored by Driver & Medical Escort.')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Trip Selector */}
          <select
            value={selectedTripCode}
            onChange={(e) => setSelectedTripCode(e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-semibold bg-white outline-none focus:border-blue-500 shadow-sm"
          >
            {schedules.map((s) => (
              <option key={s.id} value={s.orderCode}>
                {s.orderCode} - {s.horseName}
              </option>
            ))}
          </select>

          <Button variant="primary" onClick={handleOpenAdd}>
            <Plus size={18} className="mr-1.5" /> {t('driver.recordObservation', 'Record Observation')}
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">
              {t('driver.avgBodyTemp', 'Average Body Temp')}
            </p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1 m-0">{avgTemp}°C</h3>
            <span className="text-[11px] font-bold text-emerald-600">
              {t('driver.normalRange', 'Equine Normal: 37.2 - 38.3°C')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Thermometer size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">
              {t('driver.conditionStatus', 'Condition Status')}
            </p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1 m-0">
              {stableCount} Stable {abnormalCount > 0 ? `/ ${abnormalCount} Watch` : ''}
            </h3>
            <span className={`text-[11px] font-bold ${abnormalCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {abnormalCount > 0 ? 'Under close escort observation' : 'All horses fit and relaxed'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Heart size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider m-0">
              {t('driver.complianceRate', 'Check Compliance')}
            </p>
            <h3 className="text-2xl font-extrabold text-purple-600 mt-1 m-0">
              {displayLogs.length} Checked
            </h3>
            <span className="text-[11px] font-bold text-purple-600">Checked at scheduled stops</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
        </div>
      </div>

      {/* Observations History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Stethoscope size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 m-0">
              Trip {selectedTripCode} Observations History
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {displayLogs.length} Recorded Checks
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Horse</th>
                <th className="p-4">{t('driver.bodyTemp', 'Body Temp')}</th>
                <th className="p-4">{t('driver.heartRate', 'Heart Rate')}</th>
                <th className="p-4">{t('driver.condition', 'Condition')}</th>
                <th className="p-4">{t('driver.notes', 'Observation Notes')}</th>
                <th className="p-4">{t('driver.loggedBy', 'Logged By')}</th>
                <th className="p-4">{t('driver.loggedTime', 'Logged Time')}</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No health records logged for this trip yet. Click &quot;Record Observation&quot; to add one.
                  </td>
                </tr>
              ) : (
                displayLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-4 font-bold text-slate-900">
                      <div>{log.horseName}</div>
                      <span className="text-[11px] font-normal text-slate-400">{log.tripCode}</span>
                    </td>
                    <td className="p-4 font-semibold text-slate-800">
                      <span className={`inline-flex items-center gap-1 ${log.tempC > 38.3 ? 'text-amber-600 font-bold' : 'text-slate-800'}`}>
                        <Thermometer size={14} className={log.tempC > 38.3 ? 'text-amber-500 animate-pulse' : 'text-slate-400'} />
                        {log.tempC}°C
                      </span>
                    </td>
                    <td className="p-4 font-medium text-slate-700">{log.heartRateBpm} bpm</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        log.condition === 'Stable'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : log.condition === 'Stressed'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {log.condition}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-600 max-w-xs">{log.notes}</td>
                    <td className="p-4 text-xs font-medium text-slate-700">{log.loggedBy || 'Escort'}</td>
                    <td className="p-4 text-xs text-slate-500">{log.loggedAt}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Delete log"
                        aria-label="Delete health record"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Observation Modal */}
      {isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title={`Record Equine Health: ${selectedTripCode}`}
          maxWidth="520px"
        >
          <form onSubmit={handleCreateLog} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Horse Name *
              </label>
              <input
                type="text"
                required
                value={formData.horseName}
                onChange={(e) => setFormData({ ...formData, horseName: e.target.value })}
                placeholder="e.g. Silver Star"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {t('driver.bodyTemp', 'Body Temp (°C)')} *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  min="34"
                  max="43"
                  value={formData.tempC}
                  onChange={(e) => setFormData({ ...formData, tempC: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 font-semibold"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Normal: 37.2 - 38.3°C</span>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {t('driver.heartRate', 'Heart Rate (BPM)')} *
                </label>
                <input
                  type="number"
                  required
                  min="20"
                  max="120"
                  value={formData.heartRateBpm}
                  onChange={(e) => setFormData({ ...formData, heartRateBpm: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 font-semibold"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Normal resting: 28 - 44 bpm</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {t('driver.condition', 'Physiological Condition')} *
              </label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white font-medium"
              >
                <option value="Stable">{t('driver.stable', 'Stable & Calm')}</option>
                <option value="Stressed">{t('driver.stressed', 'Stressed / Agitated')}</option>
                <option value="Not Eating">{t('driver.notEating', 'Not Eating / Off-Feed')}</option>
                <option value="Minor Abrasion">{t('driver.minorAbrasion', 'Minor Abrasion / Scratch')}</option>
              </select>
            </div>

            {(formData.condition === 'Stressed' || formData.condition === 'Not Eating' || formData.tempC >= 38.3) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Safety Protocol Notice:</strong> Recording elevated body temperature (&gt;38.3°C) or Stressed/Off-feed condition will automatically trigger an <strong>Operational Warning Alert</strong> to the Logistics Coordinator and dispatch notification.
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {t('driver.loggedBy', 'Examiner / Escort Name')}
              </label>
              <input
                type="text"
                value={formData.loggedBy}
                onChange={(e) => setFormData({ ...formData, loggedBy: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {t('driver.notes', 'Observation Notes')}
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Horse drank 15L water, resting calmly on soft bedding."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-3 mt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" variant="primary">
                {t('common.save', 'Save Observation')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
