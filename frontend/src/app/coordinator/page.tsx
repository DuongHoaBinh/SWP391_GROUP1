'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Truck,
  Plane,
  CalendarCheck,
  Clock,
  Wrench,
  Filter,
  MapPin,
  Flag,
  ShieldAlert,
  Bed,
  CheckCircle2,
  Sliders,
  CalendarDays,
  Bell,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function CoordinatorDashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { vehicles, routes, schedules, alerts, acknowledgeAlert } = useFleetRouteStore();
  const [tripFilter, setTripFilter] = useState('ALL');
  const [showTripFilterDropdown, setShowTripFilterDropdown] = useState(false);

  // Dynamic KPI Metrics
  const activeTrips = schedules.filter((s) => s.status === 'In Transit').length;
  const scheduledDepartures = schedules.filter((s) => s.status === 'Scheduled').length;
  const delayedTrips = schedules.filter((s) => s.status === 'Delayed').length;
  const completedTrips = schedules.filter((s) => s.status === 'Completed').length;

  const availableVehicles = vehicles.filter((v) => v.status === 'available').length;
  const inUseVehicles = vehicles.filter((v) => v.status === 'in_use').length;
  const inMaintenanceVehicles = vehicles.filter((v) => v.status === 'maintenance').length;

  const unacknowledgedAlerts = alerts.filter((a) => !a.isAcknowledged);

  // Featured trip for Route Progress
  const featuredTrip = schedules.find((s) => s.status === 'In Transit') || schedules[0];

  // Filtered schedules for table
  const filteredSchedules = tripFilter === 'ALL' 
    ? schedules 
    : schedules.filter((s) => s.status === tripFilter);

  const formatDisplayDate = (dStr: string) => {
    if (!dStr) return '—';
    if (dStr.includes('T')) {
      try {
        const d = new Date(dStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch {
        return dStr;
      }
    }
    return dStr;
  };

  const getTripStatusBadge = (status: string) => {
    switch (status) {
      case 'In Transit':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} /> {t('status.inTransit', 'In Transit')}
          </span>
        );
      case 'Delayed':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#fef2f2', color: '#b91c1c' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> {t('status.delayed', 'Delayed')}
          </span>
        );
      case 'Scheduled':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#f3f4f6', color: '#4b5563' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#6b7280' }} /> {t('status.scheduled', 'Scheduled')}
          </span>
        );
      case 'Completed':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#047857' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} /> {t('status.completed', 'Completed')}
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#475569' }}>
            {status}
          </span>
        );
    }
  };

  const getVehicleStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#047857' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} /> {t('status.available', 'Available')}
          </span>
        );
      case 'in_use':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} /> {t('status.inUse', 'In Use')}
          </span>
        );
      case 'maintenance':
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#fffbeb', color: '#b45309' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> {t('status.maintenance', 'Maintenance')}
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. WELCOME BANNER */}
      <div
        style={{
          backgroundColor: '#0f172a',
          backgroundImage:
            'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          borderRadius: '16px',
          padding: '28px 34px',
          border: '1px solid rgba(15, 23, 42, 0.2)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
            Saturday, September 26
          </p>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0', lineHeight: 1.2 }}>
            {t('coordinator.welcome', 'Good morning')}, Alex
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0, fontWeight: 500 }}>
            {t('coordinator.subtitle', "Here is an overview of today's fleet and route operations.")}
          </p>

          {/* Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Plane size={14} color="#60a5fa" />
              <span>{String(activeTrips).padStart(2, '0')} {t('coordinator.activeTrips', 'active trips')}</span>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Truck size={14} color="#34d399" />
              <span>{String(availableVehicles).padStart(2, '0')} {t('coordinator.availableVehicles', 'vehicles available')}</span>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: delayedTrips > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                border: delayedTrips > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Clock size={14} color={delayedTrips > 0 ? '#f87171' : '#94a3b8'} />
              <span>{String(delayedTrips).padStart(2, '0')} {t('coordinator.delayedTrips', 'delayed trips')}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => router.push('/coordinator/routes')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '12px 22px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            border: '1px solid rgba(96, 165, 250, 0.3)',
            boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb')}
        >
          <MapPin size={16} /> {t('coordinator.planNewRoute', 'Plan New Route')}
        </button>
      </div>

      {/* 2. KPI CARDS (5 Columns) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <Truck size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>{String(activeTrips).padStart(2, '0')}</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{t('coordinator.activeTrips', 'Active Trips')}</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <Truck size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>{String(availableVehicles).padStart(2, '0')}</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{t('coordinator.availableVehicles', 'Available Vehicles')}</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#f8fafc', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <CalendarCheck size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>{String(scheduledDepartures).padStart(2, '0')}</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{t('coordinator.scheduledDepartures', 'Scheduled Departures')}</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: delayedTrips > 0 ? '#fef2f2' : '#f8fafc', color: delayedTrips > 0 ? '#ef4444' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={20} />
            </div>
            {delayedTrips > 0 && (
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', backgroundColor: '#fef2f2', padding: '2px 7px', borderRadius: '4px' }}>Action Req</span>
            )}
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: delayedTrips > 0 ? '#dc2626' : '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>{String(delayedTrips).padStart(2, '0')}</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{t('coordinator.delayedTrips', 'Delayed Trips')}</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <Wrench size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>{String(inMaintenanceVehicles).padStart(2, '0')}</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{t('coordinator.inMaintenance', 'In Maintenance')}</p>
        </div>
      </div>

      {/* 3. MAIN GRID (2 Cols Left, 1 Col Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: Route Progress + Trip Schedule + Vehicle Fleet */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', gridColumn: 'span 2' }}>
          {/* PREMIUM ROUTE OVERVIEW */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(249, 250, 251, 0.5)',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>
                {t('coordinator.routeProgress', 'Active Route Progress')}
              </h3>
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #dbeafe',
                }}
              >
                {featuredTrip ? `${featuredTrip.id} (${featuredTrip.horseName})` : 'No Active Trip'}
              </div>
            </div>

            <div style={{ padding: '36px 32px' }}>
              <div style={{ position: 'relative', maxWidth: '750px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Background Line */}
                <div style={{ position: 'absolute', left: '20px', right: '20px', top: '22px', height: '4px', backgroundColor: '#e5e7eb', zIndex: 0, borderRadius: '999px' }} />
                {/* Progress Active Line (50%) */}
                <div style={{ position: 'absolute', left: '20px', top: '22px', height: '4px', width: '50%', backgroundColor: '#2563eb', zIndex: 0, borderRadius: '999px' }} />

                {/* Stop 1: Origin */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#2563eb', color: '#ffffff', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Flag size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', margin: 0, lineHeight: 1.2 }}>
                      {featuredTrip ? featuredTrip.origin.split(',')[0] : 'Origin'}
                    </p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>
                      {t('coordinator.origin', 'Origin')}
                    </p>
                  </div>
                </div>

                {/* Stop 2: Transit */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#2563eb', color: '#ffffff', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plane size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', margin: 0, lineHeight: 1.2 }}>Mumbai</p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>
                      {t('coordinator.transitStop', 'Transit Stop')}
                    </p>
                  </div>
                </div>

                {/* Stop 3: Quarantine (Current) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ffffff', color: '#2563eb', border: '3px solid #2563eb', boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', margin: 0, lineHeight: 1.2 }}>Singapore</p>
                    <p style={{ fontSize: '10px', color: '#2563eb', margin: '2px 0 0 0', fontWeight: 600 }}>
                      {t('coordinator.quarantine', 'Quarantine')}
                    </p>
                  </div>
                </div>

                {/* Stop 4: Rest */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#ffffff', color: '#9ca3af', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bed size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', margin: 0, lineHeight: 1.2 }}>Bangkok</p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>
                      {t('coordinator.restStop', 'Rest Stop')}
                    </p>
                  </div>
                </div>

                {/* Stop 5: Destination */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#ffffff', color: '#9ca3af', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', margin: 0, lineHeight: 1.2 }}>
                      {featuredTrip ? featuredTrip.destination.split(',')[0] : 'Destination'}
                    </p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>
                      {t('coordinator.destination', 'Destination')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TRIP SCHEDULE TABLE */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>
                  {t('coordinator.tripSchedule', 'Trip Schedule')}
                </h3>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', margin: '2px 0 0 0' }}>
                  {t('coordinator.tripScheduleDesc', 'Live monitoring of all active and scheduled trips')} ({filteredSchedules.length})
                </p>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowTripFilterDropdown(!showTripFilterDropdown)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    border: tripFilter !== 'ALL' ? '1px solid #3b82f6' : '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: tripFilter !== 'ALL' ? '#2563eb' : '#374151',
                    backgroundColor: tripFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <Filter size={13} color={tripFilter !== 'ALL' ? '#2563eb' : '#9ca3af'} />
                  {tripFilter === 'ALL' ? 'Filter' : tripFilter}
                </button>
                {showTripFilterDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: '6px',
                      width: '160px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      padding: '6px',
                      zIndex: 20,
                    }}
                  >
                    {['ALL', 'In Transit', 'Delayed', 'Scheduled', 'Completed'].map((st) => (
                      <button
                        key={st}
                        onClick={() => {
                          setTripFilter(st);
                          setShowTripFilterDropdown(false);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: tripFilter === st ? 700 : 500,
                          color: tripFilter === st ? '#2563eb' : '#374151',
                          backgroundColor: tripFilter === st ? '#eff6ff' : 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        {st === 'ALL' ? 'All Trips' : st}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.tripIdHorse', 'Trip ID / Horse')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.route', 'Route')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.vehicleDriver', 'Vehicle / Driver')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.departure', 'Departure')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.arrival', 'Arrival')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.status', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedules.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', color: '#6b7280' }}>
                        No trips found matching filter "{tripFilter}".
                      </td>
                    </tr>
                  ) : (
                    filteredSchedules.map((trip) => (
                      <tr 
                        key={trip.id} 
                        style={{ 
                          borderBottom: '1px solid #f3f4f6',
                          backgroundColor: trip.status === 'Delayed' ? 'rgba(254, 242, 242, 0.25)' : '#ffffff',
                        }}
                      >
                        <td style={{ padding: '16px 24px' }}>
                          <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>{trip.id}</p>
                          <p 
                            onClick={() => router.push('/coordinator/schedule')}
                            style={{ fontSize: '12px', color: '#2563eb', margin: '2px 0 0 0', cursor: 'pointer', fontWeight: 600 }}
                          >
                            {trip.horseName}
                          </p>
                        </td>
                        <td style={{ padding: '16px 24px', fontWeight: 600, color: '#1f2937' }}>
                          {trip.origin} <span style={{ color: '#9ca3af' }}>→</span> {trip.destination}
                        </td>
                        <td style={{ padding: '16px 24px' }}>
                          <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>{trip.vehicleCode}</p>
                          <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>{trip.driverName}</p>
                        </td>
                        <td style={{ padding: '16px 24px', color: '#4b5563' }}>{formatDisplayDate(trip.departureTime)}</td>
                        <td style={{ padding: '16px 24px', color: trip.status === 'Delayed' ? '#dc2626' : '#4b5563', fontWeight: trip.status === 'Delayed' ? 700 : 400 }}>
                          {formatDisplayDate(trip.estimatedArrival)}
                        </td>
                        <td style={{ padding: '16px 24px' }}>
                          {getTripStatusBadge(trip.status)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* VEHICLE MANAGEMENT */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>
                  {t('coordinator.vehicleFleetStatus', 'Vehicle Fleet Status')}
                </h3>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>
                  Showing {vehicles.slice(0, 5).length} of {vehicles.length} fleet units
                </p>
              </div>
              <button
                onClick={() => router.push('/coordinator/vehicles')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                {t('coordinator.viewAllVehicles', 'View All Vehicles →')}
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.vehicleId', 'Vehicle ID')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.typeCap', 'Type & Cap.')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.location', 'Location')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.status', 'Status')}</th>
                    <th style={{ padding: '12px 24px' }}>{t('coordinator.table.assignedTrip', 'Assigned Trip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.slice(0, 5).map((veh) => (
                    <tr 
                      key={veh.id} 
                      style={{ 
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: veh.status === 'maintenance' ? 'rgba(255, 251, 235, 0.35)' : '#ffffff',
                      }}
                    >
                      <td style={{ padding: '16px 24px', fontWeight: 700, color: '#111827' }}>
                        <div>{veh.code}</div>
                      </td>
                      <td style={{ padding: '16px 24px', color: '#4b5563' }}>
                        {veh.type} ({veh.capacity} stalls)
                      </td>
                      <td style={{ padding: '16px 24px', color: '#4b5563' }}>{veh.location}</td>
                      <td style={{ padding: '16px 24px' }}>
                        {getVehicleStatusBadge(veh.status)}
                      </td>
                      <td style={{ padding: '16px 24px', color: veh.assignedTripCode ? '#2563eb' : '#9ca3af', fontWeight: veh.assignedTripCode ? 600 : 400 }}>
                        {veh.assignedTripCode || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Vehicle Status Summary + Schedule Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* VEHICLE STATUS SUMMARY */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              padding: '20px',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 16px 0' }}>
              {t('coordinator.vehicleStatus', 'Vehicle Status')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  {t('status.available', 'Available')}
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#10b981' }}>{String(availableVehicles).padStart(2, '0')}</span>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  {t('status.inUse', 'In Use')}
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#2563eb' }}>{String(inUseVehicles).padStart(2, '0')}</span>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#d97706', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  {t('status.maintenance', 'Maintenance')}
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#d97706' }}>{String(inMaintenanceVehicles).padStart(2, '0')}</span>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  {t('coordinator.totalFleet', 'Total Fleet')}
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>{String(vehicles.length).padStart(2, '0')}</span>
              </div>
            </div>
          </div>

          {/* SCHEDULE ALERTS */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: unacknowledgedAlerts.length > 0 ? 'rgba(254, 242, 242, 0.25)' : '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={16} color={unacknowledgedAlerts.length > 0 ? '#ef4444' : '#6b7280'} /> {t('coordinator.alerts.title', 'Schedule Alerts')}
              </h3>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', backgroundColor: unacknowledgedAlerts.length > 0 ? '#fee2e2' : '#e5e7eb', color: unacknowledgedAlerts.length > 0 ? '#dc2626' : '#4b5563' }}>
                {unacknowledgedAlerts.length} {t('coordinator.alerts.active', 'Active')}
              </span>
            </div>
            <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {unacknowledgedAlerts.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                  <CheckCircle2 size={24} color="#10b981" style={{ margin: '0 auto 8px' }} />
                  <p style={{ margin: 0, fontWeight: 600, color: '#111827' }}>{t('coordinator.alerts.allClearTitle', 'All Clear')}</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>{t('coordinator.alerts.allClearDesc', 'No pending operational alerts.')}</p>
                </div>
              ) : (
                unacknowledgedAlerts.slice(0, 3).map((al) => (
                  <div
                    key={al.id}
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9', transition: 'background-color 0.15s' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0 }}>{al.type}</p>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{al.timeAgo}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#4b5563', margin: '4px 0 8px 0' }}>
                      {al.message}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span 
                        onClick={() => router.push('/coordinator/alerts')}
                        style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', cursor: 'pointer' }}
                      >
                        {t('coordinator.alerts.reviewAlert', 'Review Alert')} ({al.tripCode}) →
                      </span>
                      <button
                        onClick={() => {
                          acknowledgeAlert(al.id);
                          toast.success(t('coordinator.alerts.acknowledgedSuccess', 'Alert acknowledged'));
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid #e5e7eb',
                          backgroundColor: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#4b5563',
                          cursor: 'pointer',
                        }}
                      >
                        <Check size={12} /> {t('coordinator.acknowledge', 'Acknowledge')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '14px' }}>
          {t('coordinator.quickActions.title', 'Quick Actions')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div
            onClick={() => router.push('/coordinator/routes')}
            style={{ backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '12px', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <MapPin size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px 0' }}>{t('nav.routePlanning', 'Plan Route')}</h4>
            <p style={{ fontSize: '12px', color: '#bfdbfe', margin: 0, fontWeight: 500 }}>
              {t('coordinator.quickActions.planRouteDesc', 'Create a new transport route')}
            </p>
          </div>

          <div
            onClick={() => router.push('/coordinator/vehicles')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Truck size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>
              {t('coordinator.manageVehicles', 'Manage Vehicles')}
            </h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>
              {t('coordinator.quickActions.manageVehiclesDesc', 'Update fleet assignments')}
            </p>
          </div>

          <div
            onClick={() => router.push('/coordinator/schedule')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#f3e8ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <CalendarDays size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>
              {t('coordinator.viewSchedule', 'View Schedule')}
            </h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>
              {t('coordinator.quickActions.viewScheduleDesc', 'Check all upcoming trips')}
            </p>
          </div>

          <div
            onClick={() => {
              toast.success(t('coordinator.quickActions.adjustTripDesc', 'Modify active trip details'));
              router.push('/coordinator/schedule');
            }}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Sliders size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>
              {t('coordinator.adjustTrip', 'Adjust Trip')}
            </h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>
              {t('coordinator.quickActions.adjustTripDesc', 'Modify active trip details')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
