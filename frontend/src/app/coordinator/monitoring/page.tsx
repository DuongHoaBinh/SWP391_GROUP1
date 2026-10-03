'use client';

import React, { useState } from 'react';
import {
  Radio,
  Truck,
  Thermometer,
  Wind,
  ShieldCheck,
  MapPin,
  Clock,
  ArrowRight,
  Heart,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Activity,
  Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

export default function TripMonitoringPage() {
  const { schedules, getTelemetryByTrip, getMilestonesByTrip, getHealthLogsByTrip, alerts, acknowledgeAlert } = useFleetRouteStore();
  const { t, translateStatus } = useTranslation();

  const [selectedTripCode, setSelectedTripCode] = useState<string>('TR-2026-002');

  const activeTrip = schedules.find((s) => s.orderCode === selectedTripCode) || schedules[0];
  const currentTripCode = activeTrip ? activeTrip.orderCode : selectedTripCode;

  const telemetry = getTelemetryByTrip(currentTripCode);
  const milestones = getMilestonesByTrip(currentTripCode);
  const healthLogs = getHealthLogsByTrip(currentTripCode);
  const tripAlerts = alerts.filter((a) => a.tripCode.toLowerCase() === currentTripCode.toLowerCase() && !a.isAcknowledged);

  const completedMilestones = milestones.filter((m) => m.status === 'COMPLETED');
  const currentMilestone = milestones.find((m) => m.status === 'CURRENT') || milestones[0];

  const handleExportCSV = () => {
    toast.success(`Telemetry logs for ${currentTripCode} exported as CSV.`);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">
            {t('nav.monitoring', 'Live Active Trip Telemetry')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time GPS tracking, microclimate sensors, and equine biometrics for horses in transit.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              Live IoT Sensors Connected
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileSpreadsheet size={16} className="mr-1.5 text-emerald-600" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Main Grid: Telemetry & Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Telemetry Data (2 Cols) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Active Trip Telemetry Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-blue-600 uppercase tracking-wider">{currentTripCode}</span>
                  <StatusBadge
                    label={translateStatus(activeTrip?.status || 'In Transit')}
                    variant={activeTrip?.status === 'In Transit' ? 'transit' : activeTrip?.status === 'Completed' ? 'success' : 'pending'}
                    hasDot={activeTrip?.status === 'In Transit'}
                  />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1 m-0">
                  {activeTrip?.horseName} ({activeTrip?.routeTitle})
                </h2>
                <p className="text-xs text-slate-500 flex items-center gap-2 mt-1 m-0">
                  <Truck size={14} className="text-slate-400" />
                  <span>Vehicle: <strong>{activeTrip?.vehicleCode}</strong></span>
                  <span>•</span>
                  <span>Driver: <strong>{activeTrip?.driverName}</strong></span>
                  <span>•</span>
                  <span>Escort: <strong>{activeTrip?.escortName}</strong></span>
                </p>
              </div>

              <div className="text-right">
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1.5">
                  <Activity size={14} /> Speed: {telemetry.speedKmH} km/h
                </span>
                <span className="block text-[11px] text-slate-400 mt-1">Last Sync: {telemetry.lastUpdated}</span>
              </div>
            </div>

            {/* Environmental Sensors Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-5">
              <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Thermometer size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Cabin Temp</p>
                  <p className="text-lg font-extrabold text-slate-900 m-0">{telemetry.cabinTempC.toFixed(1)}°C</p>
                  <span className="text-[10px] text-emerald-600 font-bold">Safe: 18 - 24°C</span>
                </div>
              </div>

              <div className="p-4 bg-teal-50/70 border border-teal-100 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                  <Wind size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Humidity</p>
                  <p className="text-lg font-extrabold text-slate-900 m-0">{telemetry.humidityPct}% RH</p>
                  <span className="text-[10px] text-emerald-600 font-bold">Optimal Airflow</span>
                </div>
              </div>

              <div className="p-4 bg-purple-50/70 border border-purple-100 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Quarantine Seal</p>
                  <p className="text-sm font-extrabold text-slate-900 m-0">{telemetry.quarantineSealStatus}</p>
                  <span className="text-[10px] text-emerald-600 font-bold">{telemetry.airQuality}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Alerts Banner (If Any for this trip) */}
          {tripAlerts.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-600" />
                  <span className="font-bold text-amber-900 text-sm">
                    {tripAlerts.length} Active Alert(s) on Trip {currentTripCode}
                  </span>
                </div>
              </div>
              {tripAlerts.map((alt) => (
                <div key={alt.id} className="p-3 bg-white rounded-lg border border-amber-100 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="font-bold text-slate-800">[{alt.type}] {alt.message}</span>
                    <span className="block text-slate-400 mt-0.5">{alt.location} • {alt.timeAgo}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { acknowledgeAlert(alt.id); toast.success('Alert acknowledged.'); }}>
                    Acknowledge
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Simulated GPS Radar Map */}
          <div className="bg-slate-900 rounded-xl p-6 sm:p-8 text-white flex flex-col justify-between shadow-lg relative overflow-hidden min-h-[220px]">
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400">
                  Current GPS Waypoint
                </span>
                <span className="text-xs text-slate-400">
                  Cleared: <strong>{completedMilestones.length} / {milestones.length}</strong>
                </span>
              </div>
              <h3 className="text-2xl font-bold mt-1 mb-2 text-white flex items-center gap-2">
                <MapPin size={22} className="text-emerald-400" />
                {telemetry.currentLocation}
              </h3>
              <p className="text-sm text-slate-400 flex items-center gap-2 m-0">
                <Clock size={16} /> Destination Arrival ETA: <strong>{activeTrip?.estimatedArrival || 'On Schedule'}</strong>
              </p>
            </div>

            {/* Visual Waypoint Progress Steps */}
            <div className="relative z-10 mt-6 grid grid-cols-1 sm:grid-cols-4 gap-2">
              {milestones.map((m, idx) => (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                    m.status === 'COMPLETED'
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                      : m.status === 'CURRENT'
                      ? 'bg-blue-900/80 border-blue-600 text-blue-100 ring-2 ring-blue-500/50'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-[10px]">#{idx + 1}</span>
                    <span className="text-[10px] font-bold">
                      {m.status === 'COMPLETED' ? 'Done' : m.status === 'CURRENT' ? 'Active' : 'Queued'}
                    </span>
                  </div>
                  <span className="font-semibold truncate">{m.title}</span>
                  <span className="text-[10px] text-slate-400 truncate mt-0.5">{m.location}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Equine Health Monitor Widget */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                <Heart size={18} className="text-red-500" /> Equine Vital Signs Observation Stream
              </h3>
              <span className="text-xs font-bold text-slate-500">{healthLogs.length} Records</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {healthLogs.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  No health checks submitted by driver/escort for this trip yet.
                </p>
              ) : (
                healthLogs.slice(0, 3).map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                        <Heart size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{log.horseName}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.condition === 'Stable' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {log.condition}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5 m-0">{log.notes}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold text-slate-800 block">{log.tempC}°C • {log.heartRateBpm} bpm</span>
                      <span className="text-[10px] text-slate-400">{log.loggedAt} by {log.loggedBy}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Active Fleet Quick Switcher */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4 h-fit">
          <div>
            <h3 className="text-base font-bold text-slate-900 m-0">Dispatched Active Trips</h3>
            <p className="text-xs text-slate-500 mt-1">Select a trip to switch real-time telemetry stream.</p>
          </div>

          <div className="flex flex-col gap-3">
            {schedules.map((trip) => {
              const isSelected = trip.orderCode === currentTripCode;
              return (
                <div
                  key={trip.id}
                  onClick={() => {
                    setSelectedTripCode(trip.orderCode);
                    toast.success(`Switched telemetry to ${trip.orderCode}`);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/70 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-black text-blue-700">{trip.orderCode}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      isSelected
                        ? 'bg-blue-200 text-blue-900'
                        : trip.status === 'In Transit'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {isSelected ? 'Active View' : trip.status}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 m-0">{trip.routeTitle}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                    <span>Vehicle: <strong className="text-slate-700">{trip.vehicleCode}</strong></span>
                    <span>{trip.horseName}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
