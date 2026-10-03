'use client';

import React from 'react';
import Link from 'next/link';
import { Truck, MapPin, Calendar, Clock, ChevronRight, CheckCircle2, Navigation, Heart, User, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { useTranslation } from '@/lib/i18n/LanguageContext';

export default function DriverTripsPage() {
  const { schedules } = useFleetRouteStore();
  const { t, translateStatus } = useTranslation();

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 m-0">
          {t('driver.myTrips', 'My Assigned Trips')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('driver.myTripsDesc', 'Review dispatch schedules, assigned equine manifest, and route legs.')}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {schedules.length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
            No trips currently dispatched to drivers. Dispatches from the Coordinator will appear here in real time.
          </div>
        ) : (
          schedules.map((trip) => (
            <div key={trip.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-blue-600 text-sm">{trip.orderCode}</span>
                    <StatusBadge
                      label={translateStatus(trip.status)}
                      variant={trip.status === 'In Transit' ? 'transit' : trip.status === 'Completed' ? 'success' : 'pending'}
                      hasDot={trip.status === 'In Transit'}
                    />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 m-0">{trip.routeTitle}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/driver/status">
                    <Button variant="primary" size="sm">
                      <Navigation size={14} className="mr-1.5" /> {t('driver.updateMilestones', 'Update Milestones')}
                    </Button>
                  </Link>
                  <Link href="/driver/health">
                    <Button variant="outline" size="sm">
                      <Heart size={14} className="mr-1.5 text-red-500" /> {t('driver.recordHealth', 'Record Health')}
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase m-0">{t('coordinator.origin', 'Origin / Pickup Point')}</p>
                  <p className="font-semibold text-slate-800 m-0 mt-0.5">{trip.origin || 'Cu Chi Stables, HCMC'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase m-0">{t('coordinator.destination', 'Destination / Drop-off Point')}</p>
                  <p className="font-semibold text-slate-800 m-0 mt-0.5">{trip.destination || 'Singapore Turf Club'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 pt-1">
                <div className="flex items-center gap-2">
                  <Truck size={16} className="text-slate-400" />
                  <span>Vehicle: <strong className="text-slate-800">{trip.vehicleCode}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-slate-400" />
                  <span>Departure: <strong className="text-slate-800">{trip.departureTime}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={16} className="text-slate-400" />
                  <span>Driver: <strong className="text-slate-800">{trip.driverName}</strong></span>
                </div>
              </div>

              {trip.notes && (
                <div className="text-xs text-slate-500 bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                  <span className="font-bold text-blue-700 uppercase tracking-wider text-[10px] shrink-0 mt-0.5">Instructions:</span>
                  <span>{trip.notes}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
