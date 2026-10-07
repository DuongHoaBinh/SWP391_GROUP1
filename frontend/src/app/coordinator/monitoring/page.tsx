'use client';

import React, { useState } from 'react';
import { Radio, Truck, Thermometer, Wind, ShieldCheck, MapPin, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function TripMonitoringPage() {
  const [activeTrip, setActiveTrip] = useState({
    id: 'TR-2026-002',
    horseName: 'Silver Star & Royal Stallion',
    vehicle: 'TRK-VN-102',
    driver: 'Michael Brown',
    currentLocation: 'Moc Bai Border Quarantine Staging',
    eta: 'Today at 04:30 PM',
    speedKmH: 68,
    tempC: 21.5,
    humidityPct: 58,
    airQuality: 'Optimal (HEPA active)',
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Live Active Trip Telemetry</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time GPS tracking, climate sensors, and cabin telemetry for horses in transit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
            Live IoT Connected
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Telemetry Data */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{activeTrip.id}</span>
                <h2 className="text-xl font-bold text-slate-900 mt-1">{activeTrip.horseName}</h2>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  <Truck size={14} /> Vehicle: <strong>{activeTrip.vehicle}</strong> • Driver: {activeTrip.driver}
                </p>
              </div>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                Moving • {activeTrip.speedKmH} km/h
              </span>
            </div>

            {/* Environmental Sensors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-5">
              <div className="p-4 bg-slate-50 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Thermometer size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Cabin Temp</p>
                  <p className="text-lg font-extrabold text-slate-900 m-0">{activeTrip.tempC}°C</p>
                  <span className="text-[10px] text-emerald-600 font-bold">Standard 18-24°C</span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                  <Wind size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Humidity</p>
                  <p className="text-lg font-extrabold text-slate-900 m-0">{activeTrip.humidityPct}%</p>
                  <span className="text-[10px] text-emerald-600 font-bold">Safe range</span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Ventilation</p>
                  <p className="text-sm font-extrabold text-slate-900 m-0">HEPA 100%</p>
                  <span className="text-[10px] text-emerald-600 font-bold">Air Exchange: 45/h</span>
                </div>
              </div>
            </div>
          </div>

          {/* Simulated Map / GPS Milestone */}
          <div className="bg-slate-900 rounded-xl p-8 text-white flex flex-col justify-between shadow-lg relative overflow-hidden min-h-[220px]">
            <div className="relative z-10">
              <span className="text-xs uppercase font-bold tracking-widest text-blue-400">Current GPS Waypoint</span>
              <h3 className="text-2xl font-bold mt-1 mb-2">{activeTrip.currentLocation}</h3>
              <p className="text-sm text-slate-400 flex items-center gap-2">
                <Clock size={16} /> Estimated arrival at next station: <strong>{activeTrip.eta}</strong>
              </p>
            </div>
            <div className="flex justify-end relative z-10 mt-6">
              <Button 
                variant="primary" 
                size="sm"
                onClick={() => toast.success('Telemetry logs exported (CSV)')}
              >
                Export Telemetry CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Active Fleet Quick Switcher */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
          <h3 className="text-base font-bold text-slate-900 m-0">Trips Currently En Route</h3>
          <div className="flex flex-col gap-3">
            <div className="p-3.5 rounded-xl border-2 border-blue-500 bg-blue-50/50 cursor-pointer">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-blue-700">TR-2026-002</span>
                <span className="text-[10px] font-bold bg-blue-200 text-blue-800 px-2 py-0.5 rounded">Selected</span>
              </div>
              <p className="text-sm font-bold text-slate-900 m-0">Hanoi to Bangkok Overland</p>
              <p className="text-xs text-slate-500 mt-1">Truck TRK-VN-102 • 4 Horses</p>
            </div>

            <div 
              onClick={() => toast('Switched telemetry to TR-2026-001')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-slate-600">TR-2026-001</span>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">En Route</span>
              </div>
              <p className="text-sm font-bold text-slate-900 m-0">Saigon to Singapore Turf Club</p>
              <p className="text-xs text-slate-500 mt-1">Truck TRK-VN-089 • 2 Horses</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
