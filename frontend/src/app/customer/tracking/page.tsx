'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Navigation,
  ShieldCheck,
  Thermometer,
  Heart,
  Clock,
  MapPin,
  Activity,
  Wind,
  CheckCircle2,
  AlertCircle,
  Truck,
  Stethoscope,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { useTranslation } from '@/lib/i18n/LanguageContext';

export default function CustomerTrackingPage() {
  const { schedules, getMilestonesByTrip, getTelemetryByTrip, getHealthLogsByTrip } = useFleetRouteStore();
  const { t, translateStatus } = useTranslation();

  const [selectedTripCode, setSelectedTripCode] = useState<string>('TR-2026-002');

  const activeTrip = schedules.find((s) => s.orderCode === selectedTripCode) || schedules[0];
  const currentTripCode = activeTrip ? activeTrip.orderCode : selectedTripCode;

  const telemetry = getTelemetryByTrip(currentTripCode);
  const milestones = getMilestonesByTrip(currentTripCode);
  const healthLogs = getHealthLogsByTrip(currentTripCode);
  const latestHealth = healthLogs[0];

  const completedMilestonesCount = milestones.filter((m) => m.status === 'COMPLETED').length;
  const progressPct = milestones.length > 0
    ? Math.round((completedMilestonesCount / milestones.length) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/customer"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 m-0">
              {t('tracking.liveTitle', 'Live Trip Tracking')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('tracking.liveSubtitle', 'Real-time telemetry, GPS milestones, and vital signs monitoring during transit.')}
            </p>
          </div>
        </div>

        {/* Shipment Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-500 hidden sm:block">
            {t('tracking.selectShipment', 'Select Shipment')}:
          </label>
          <select
            value={currentTripCode}
            onChange={(e) => setSelectedTripCode(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm outline-none focus:border-blue-500 shadow-sm"
          >
            {schedules.map((s) => (
              <option key={s.id} value={s.orderCode}>
                {s.orderCode} - {s.horseName} ({translateStatus(s.status)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Tracking Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <span className="text-xs font-extrabold text-blue-600 tracking-wider uppercase">
              {t('tracking.shipmentCode', 'SHIPMENT CODE')}
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-1 m-0 flex items-center gap-3">
              {currentTripCode} • {activeTrip?.horseName}
            </h2>
            <p className="text-sm text-slate-500 mt-1.5 flex items-center gap-2">
              <MapPin size={15} className="text-slate-400 shrink-0" />
              <span>
                <strong>{activeTrip?.origin || 'Depot'}</strong> → <strong>{activeTrip?.destination || 'Destination'}</strong>
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500">
              Vehicle: <strong>{activeTrip?.vehicleCode}</strong>
            </span>
            <StatusBadge
              label={translateStatus(activeTrip?.status || 'Scheduled')}
              variant={activeTrip?.status === 'In Transit' ? 'transit' : activeTrip?.status === 'Completed' ? 'success' : 'pending'}
              hasDot={activeTrip?.status === 'In Transit'}
            />
          </div>
        </div>

        {/* Telemetry Sensor Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Cabin / Stall Temp */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-col justify-between">
            <div className="flex items-center justify-between text-blue-700">
              <span className="text-xs font-bold uppercase">{t('tracking.stallTemp', 'Stall Temp')}</span>
              <Thermometer size={18} />
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-blue-950">
                {telemetry.cabinTempC.toFixed(1)}°C
              </span>
              <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                {t('tracking.stallTempOk', 'Within safe range (18-22°C)')}
              </p>
            </div>
          </div>

          {/* Card 2: Equine Heart Rate */}
          <div className="p-4 rounded-xl bg-red-50/70 border border-red-100 flex flex-col justify-between">
            <div className="flex items-center justify-between text-red-600">
              <span className="text-xs font-bold uppercase">{t('driver.heartRate', 'Heart Rate')}</span>
              <Heart size={18} />
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-red-950">
                {latestHealth?.heartRateBpm || 40} <span className="text-xs font-bold text-slate-500">bpm</span>
              </span>
              <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                {latestHealth?.condition === 'Stressed' ? 'Escort Attending' : 'Calm & Resting'}
              </p>
            </div>
          </div>

          {/* Card 3: Body Temperature */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-100 flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-700">
              <span className="text-xs font-bold uppercase">{t('driver.bodyTemp', 'Body Temp')}</span>
              <Activity size={18} />
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-amber-950">
                {(latestHealth?.tempC || 37.8).toFixed(1)}°C
              </span>
              <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                {t('driver.normalRange', 'Normal: 37.2 - 38.3°C')}
              </p>
            </div>
          </div>

          {/* Card 4: Quarantine Seal */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-700">
              <span className="text-xs font-bold uppercase">{t('tracking.quarantineSeal', 'Quarantine Seal')}</span>
              <ShieldCheck size={18} />
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-emerald-950">
                {telemetry.quarantineSealStatus}
              </span>
              <p className="text-[11px] font-bold text-emerald-600 mt-1 m-0">
                {t('tracking.sealIntact', 'Intact & Inspected')}
              </p>
            </div>
          </div>
        </div>

        {/* Environmental Extra Sensors Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          <div>
            <span className="text-slate-400 font-bold uppercase block">{t('tracking.humidity', 'Cabin Humidity')}</span>
            <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">{telemetry.humidityPct}% RH</span>
          </div>
          <div>
            <span className="text-slate-400 font-bold uppercase block">{t('tracking.airQuality', 'HEPA Air Quality')}</span>
            <span className="font-extrabold text-emerald-700 text-sm mt-0.5 block">{telemetry.airQuality}</span>
          </div>
          <div>
            <span className="text-slate-400 font-bold uppercase block">{t('tracking.speed', 'Current Speed')}</span>
            <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">{telemetry.speedKmH} km/h</span>
          </div>
          <div>
            <span className="text-slate-400 font-bold uppercase block">Last Sensor Sync</span>
            <span className="font-bold text-slate-600 text-sm mt-0.5 block">{telemetry.lastUpdated}</span>
          </div>
        </div>

        {/* Route Radar Banner */}
        <div className="bg-slate-950 text-white rounded-xl p-6 sm:p-8 relative overflow-hidden shadow-lg border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-emerald-400 animate-pulse" />
              <span className="text-xs font-extrabold tracking-widest text-emerald-400 uppercase">
                {t('tracking.gpsRadar', 'LIVE GPS SATELLITE RADAR')}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-400">
              Trip Progress: <strong className="text-white">{progressPct}%</strong>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 my-4">
            <div className="text-center sm:text-left">
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 mb-1.5 ring-4 ring-emerald-500/20 mx-auto sm:mx-0" />
              <div className="font-bold text-base text-white">{activeTrip?.origin?.split(',')[0]}</div>
              <div className="text-xs text-slate-400">Departed: {activeTrip?.departureTime}</div>
            </div>

            <div className="flex-1 w-full relative px-4">
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${Math.max(10, progressPct)}%` }}
                />
              </div>
              <div className="flex justify-center mt-3">
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 shadow-md">
                  <Truck size={13} /> {telemetry.currentLocation} ({telemetry.speedKmH} km/h)
                </span>
              </div>
            </div>

            <div className="text-center sm:text-right">
              <div className="w-3.5 h-3.5 rounded-full bg-slate-600 mb-1.5 mx-auto sm:ml-auto" />
              <div className="font-bold text-base text-white">{activeTrip?.destination?.split(',')[0]}</div>
              <div className="text-xs text-slate-400">Est. Arrival: {activeTrip?.estimatedArrival}</div>
            </div>
          </div>
        </div>

        {/* Milestones Timeline */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 m-0 flex items-center gap-2">
              <Navigation size={18} className="text-blue-600" />
              {t('tracking.milestones', 'Transit Milestones Timeline')}
            </h3>
            <span className="text-xs font-bold text-slate-500">
              {completedMilestonesCount} of {milestones.length} checkpoints cleared
            </span>
          </div>

          <div className="relative border-l-2 border-slate-200 ml-4 pl-6 flex flex-col gap-6 py-2">
            {milestones.length === 0 ? (
              <p className="text-sm text-slate-500">No scheduled milestones recorded for this route.</p>
            ) : (
              milestones.map((m, idx) => (
                <div key={m.id} className="relative">
                  {/* Status Indicator Icon */}
                  <div
                    className={`absolute -left-[35px] top-0.5 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      m.status === 'COMPLETED'
                        ? 'bg-emerald-500 text-white ring-4 ring-emerald-50'
                        : m.status === 'CURRENT'
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {m.status === 'COMPLETED' ? <CheckCircle2 size={16} /> : idx + 1}
                  </div>

                  <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80 hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{m.title}</span>
                        {m.isCustomsBorder && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            Customs & Quarantine Gate
                          </span>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full w-fit ${
                        m.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : m.status === 'CURRENT'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {m.status === 'COMPLETED' ? 'Completed' : m.status === 'CURRENT' ? 'In Progress' : 'Upcoming'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1.5 m-0">
                      <MapPin size={13} className="text-slate-400" /> {m.location}
                    </p>

                    {m.status === 'COMPLETED' && (
                      <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <span className="text-slate-700 italic">
                          &ldquo;{m.notes || 'Checkpoint cleared.'}&rdquo;
                        </span>
                        <span className="text-slate-400 font-medium shrink-0">
                          {m.timestamp} {m.author ? `• Logged by ${m.author}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Equine Health Logs & Escort Feed */}
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 m-0 flex items-center gap-2">
              <Stethoscope size={18} className="text-purple-600" />
              {t('tracking.equineVitals', 'Equine Vital Signs & Escort Feed')}
            </h3>
            <span className="text-xs font-bold text-slate-500">
              {healthLogs.length} Logged Checks
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {healthLogs.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-xl text-center text-sm text-slate-500">
                No health observations reported yet. Driver and escort conduct checks every 3 hours.
              </div>
            ) : (
              healthLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <Heart size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{log.horseName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          log.condition === 'Stable'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {log.condition}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 m-0">{log.notes}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-semibold shrink-0 sm:border-l sm:border-slate-100 sm:pl-4">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Temp / HR</span>
                      <span className="text-slate-800">{log.tempC}°C • {log.heartRateBpm} bpm</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Examined By</span>
                      <span className="text-slate-700">{log.loggedBy || 'Escort'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Time</span>
                      <span className="text-slate-500">{log.loggedAt}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
