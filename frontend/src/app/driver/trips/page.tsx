'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Truck, MapPin, Calendar, Clock, ChevronRight, CheckCircle2, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface DriverTrip {
  id: string;
  orderCode: string;
  routeTitle: string;
  origin: string;
  destination: string;
  departureTime: string;
  vehicle: string;
  horses: string[];
  status: 'In Transit' | 'Ready to Depart' | 'Completed';
}

const DRIVER_TRIPS: DriverTrip[] = [
  {
    id: 'tr-01',
    orderCode: 'REQ-002',
    routeTitle: 'Hanoi to Bangkok Overland Corridor',
    origin: 'Soc Son Equestrian Center, Hanoi',
    destination: 'Bangkok Royal Stables, Thailand',
    departureTime: 'Today at 06:30 AM',
    vehicle: 'TRK-VN-102 (Specialized 6-Stall)',
    horses: ['Silver Star (Thoroughbred)', 'Royal Stallion (Arabian)', 'Thunderbolt (Warmblood)'],
    status: 'In Transit',
  },
  {
    id: 'tr-02',
    orderCode: 'REQ-001',
    routeTitle: 'Saigon to Singapore Turf Club Transfer',
    origin: 'Cu Chi Stables, HCMC',
    destination: 'Tan Son Nhat Airport Hub',
    departureTime: 'Oct 15, 2026 • 08:00 AM',
    vehicle: 'TRK-VN-089 (Climate-Controlled 4-Stall)',
    horses: ['Thunder (Thoroughbred)', 'Pegasus Star (Thoroughbred)'],
    status: 'Ready to Depart',
  },
];

export default function DriverTripsPage() {
  const [trips] = useState<DriverTrip[]>(DRIVER_TRIPS);

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 m-0">My Assigned Trips</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review dispatch schedules, assigned equine manifest, and route legs.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {trips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-blue-600 text-sm">{trip.orderCode}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    trip.status === 'In Transit' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {trip.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1 m-0">{trip.routeTitle}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/driver/status">
                  <Button variant="primary" size="sm">
                    <Navigation size={14} className="mr-1.5" /> Update Milestones
                  </Button>
                </Link>
                <Link href="/driver/health">
                  <Button variant="outline" size="sm">
                    Record Health
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase m-0">Pickup Point</p>
                <p className="font-semibold text-slate-800 m-0 mt-0.5">{trip.origin}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase m-0">Delivery Point</p>
                <p className="font-semibold text-slate-800 m-0 mt-0.5">{trip.destination}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-slate-400" />
                <span>Vehicle: <strong className="text-slate-800">{trip.vehicle}</strong></span>
              </div>
              <div>
                Horses on board: <strong className="text-slate-900">{trip.horses.join(', ')}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
