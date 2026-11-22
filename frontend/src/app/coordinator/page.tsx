'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Truck,
  Plane,
  Clock,
  Filter,
  MapPin,
  Flag,
  ShieldAlert,
  Bed,
  CheckCircle2,
  CalendarDays,
  Bell,
  Check,
  RotateCcw,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Route as RouteIcon,
} from 'lucide-react';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { FlightyRouteDisplay } from '@/components/ui/FlightyRouteDisplay';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { trackingApi, AssignedTripSummary, TripTrackingDetails } from '@/features/tracking/api/tracking.api';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

export default function CoordinatorDashboardPage() {
  const { t, language, translateVehicleType, translateStatus, translateNotification } = useLanguage();
  const isEn = language === 'en';
  const { vehicles, routes, schedules, alerts, acknowledgeAlert } = useFleetRouteStore();
  const [tripFilter, setTripFilter] = useState('ALL');
  const [showTripFilterDropdown, setShowTripFilterDropdown] = useState(false);
  const [realTrips, setRealTrips] = useState<AssignedTripSummary[]>([]);
  const [awaitingPlanningCount, setAwaitingPlanningCount] = useState<number>(0);
  const [selectedFeaturedId, setSelectedFeaturedId] = useState<number | null>(null);
  const [featuredTracking, setFeaturedTracking] = useState<TripTrackingDetails | null>(null);
  const [isLoadingMilestones, setIsLoadingMilestones] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState<any[]>([]);
  const [isLoadingRealTrips, setIsLoadingRealTrips] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoadingRealTrips(true);
      setDashboardError(null);
      const [tripsRes, notifRes, ordersRes] = await Promise.allSettled([
        trackingApi.getMyTrips(),
        apiClient<any[]>('/notifications'),
        apiClient<any[]>('/orders'),
      ]);

      if (tripsRes.status === 'fulfilled' && Array.isArray(tripsRes.value)) {
        setRealTrips(tripsRes.value);
        const preferred =
          tripsRes.value.find((r) => r.shipment_status === 'in_transit') || tripsRes.value[0];
        if (preferred) {
          setSelectedFeaturedId((prev) =>
            prev && tripsRes.value.some((r) => r.shipment_id === prev) ? prev : preferred.shipment_id
          );
        } else {
          setSelectedFeaturedId(null);
        }
      } else if (tripsRes.status === 'rejected') {
        setDashboardError(
          tripsRes.reason?.message ||
            t(
              'coordinator.dashboard.loadError',
              isEn ? 'Unable to sync live trips from server.' : 'Không thể đồng bộ dữ liệu chuyến đi trực tiếp từ máy chủ.'
            )
        );
      }

      if (notifRes.status === 'fulfilled' && Array.isArray(notifRes.value)) {
        setLiveNotifications(notifRes.value);
      }

      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
        const pendingPlan = ordersRes.value.filter((o) =>
          ['approved', 'planning'].includes(String(o?.status || '').toLowerCase())
        ).length;
        setAwaitingPlanningCount(pendingPlan);
      }
    } catch (err: any) {
      setDashboardError(
        err?.message ||
          t('coordinator.dashboard.loadError', isEn ? 'Unable to load coordinator dashboard.' : 'Không thể tải dữ liệu điều phối.')
      );
    } finally {
      setIsLoadingRealTrips(false);
    }
  }, [isEn, t]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedFeaturedId) {
      setFeaturedTracking(null);
      return;
    }
    const loadFeaturedDetails = async () => {
      try {
        setIsLoadingMilestones(true);
        const details = await trackingApi.getTrackingDetails(selectedFeaturedId);
        if (!cancelled) {
          setFeaturedTracking(details);
        }
      } catch {
        if (!cancelled) setFeaturedTracking(null);
      } finally {
        if (!cancelled) setIsLoadingMilestones(false);
      }
    };
    void loadFeaturedDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedFeaturedId]);

  useEffect(() => {
    if (!showTripFilterDropdown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTripFilterDropdown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showTripFilterDropdown]);

  const mapBackendStatusToScheduleStatus = (st?: string): 'Scheduled' | 'Boarding' | 'In Transit' | 'Completed' | 'Delayed' => {
    const s = String(st || '').toLowerCase();
    if (s === 'in_transit') return 'In Transit';
    if (s === 'completed' || s === 'arrived') return 'Completed';
    if (s === 'incident_reported' || s === 'delayed') return 'Delayed';
    if (s === 'ready_to_depart') return 'Boarding';
    return 'Scheduled';
  };

  const displaySchedules = useMemo(
    () =>
      realTrips.length > 0
        ? realTrips.map((r) => ({
            id: String(r.shipment_id),
            shipmentId: r.shipment_id,
            orderCode: r.request_code || `REQ-${String(r.shipment_id).padStart(3, '0')}`,
            horseName: r.request_title || r.contact_name || `${r.requested_horse_count} ${t('common.horsesUnit', 'ngựa')}`,
            horseCount: Number(r.requested_horse_count || 1),
            departureTime: r.requested_date || '',
            routeTitle: r.route_name || `${r.origin_location} → ${r.destination_location}`,
            origin: r.origin_location,
            destination: r.destination_location,
            status: mapBackendStatusToScheduleStatus(r.shipment_status),
          }))
        : schedules.map((s) => ({
            id: s.id,
            shipmentId: null as number | null,
            orderCode: s.orderCode,
            horseName: s.horseName,
            horseCount: Number(s.horseCount || 1),
            departureTime: s.departureTime,
            routeTitle: `${s.origin} → ${s.destination}`,
            origin: s.origin,
            destination: s.destination,
            status: s.status,
          })),
    [realTrips, schedules, t]
  );

  // Compute KPI from backend tracking & orders
  const realActive = realTrips.filter((r) => r.shipment_status === 'in_transit').length;
  const realScheduled = realTrips.filter(
    (r) =>
      r.shipment_status === 'ready_to_depart' ||
      r.shipment_status === 'scheduled' ||
      r.shipment_status === 'planning' ||
      r.shipment_status === 'confirmed'
  ).length;
  const realDelayed = realTrips.filter(
    (r) => r.shipment_status === 'incident_reported' || r.shipment_status === 'delayed'
  ).length;

  const activeTrips =
    realTrips.length > 0 ? realActive : displaySchedules.filter((s) => s.status === 'In Transit').length;
  const scheduledDepartures =
    realTrips.length > 0
      ? realScheduled
      : displaySchedules.filter((s) => s.status === 'Scheduled' || s.status === 'Boarding').length;
  const delayedTrips =
    realTrips.length > 0 ? realDelayed : displaySchedules.filter((s) => s.status === 'Delayed').length;

  const availableVehicles = vehicles.filter((v) => v.status === 'available').length;
  const inMaintenanceVehicles = vehicles.filter((v) => v.status === 'maintenance').length;

  const liveUnreadAlerts = liveNotifications
    .filter((n) => !n.isRead && ['incident', 'status_update', 'document_missing'].includes(String(n.type || '').toLowerCase()))
    .map((n) => {
      const loc = translateNotification(n.title, n.message);
      return {
        id: `notif-${n.id}`,
        notificationId: Number(n.id),
        type: loc.title || n.title || t('coordinator.alerts.opsAlert', 'Thông báo điều phối'),
        message: loc.message || n.message || n.title || '',
        timeAgo: n.createdAt ? new Date(n.createdAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN') : '',
        tripCode: n.shipmentId ? `REQ-${String(n.shipmentId).padStart(3, '0')}` : 'OPS',
        isAcknowledged: false,
      };
    });

  const unacknowledgedAlerts =
    liveUnreadAlerts.length > 0 ? liveUnreadAlerts : alerts.filter((a) => !a.isAcknowledged);

  // Featured trip for Route Progress
  const featuredTrip =
    (selectedFeaturedId
      ? displaySchedules.find((s) => s.shipmentId === selectedFeaturedId)
      : undefined) ||
    displaySchedules.find((s) => s.status === 'In Transit') ||
    displaySchedules[0];
  const featuredRoute = featuredTrip ? routes.find((r) => r.orderCode === featuredTrip.orderCode) : null;

  const realMilestones = useMemo(
    () => featuredTracking?.milestones || [],
    [featuredTracking]
  );
  const featuredProgressPercent = useMemo(() => {
    if (realMilestones.length > 0) {
      const completed = realMilestones.filter((m) => m.status === 'COMPLETED').length;
      const hasCurrent = realMilestones.some((m) => m.status === 'CURRENT');
      return Math.min(100, Math.round(((completed + (hasCurrent ? 0.5 : 0)) / realMilestones.length) * 100));
    }
    return null;
  }, [realMilestones]);

  // Filtered schedules for table
  const filteredSchedules =
    tripFilter === 'ALL' ? displaySchedules : displaySchedules.filter((s) => s.status === tripFilter);

  const formatDisplayDate = (dStr?: string) => {
    if (!dStr) return '—';
    if (dStr.includes('T')) {
      try {
        const d = new Date(dStr);
        return d.toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return dStr;
      }
    }
    return dStr;
  };

  const getTripStatusBadge = (status: string) => {
    const label = translateStatus(status);
    const lower = (status || '').toLowerCase();
    if (lower.includes('transit') || lower.includes('đang vận chuyển')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF8F4] text-[#966516] border border-[#C4B38E]/50">
          <span className="w-2 h-2 rounded-full bg-[#181A17] animate-pulse" />
          {label}
        </span>
      );
    }
    if (lower.includes('delay') || lower.includes('trễ')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          {label}
        </span>
      );
    }
    if (lower.includes('completed') || lower.includes('hoàn tất')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        {label}
      </span>
    );
  };

  const getVehicleStatusBadge = (status: string) => {
    const label = translateStatus(status);
    const lower = (status || '').toLowerCase();
    if (lower.includes('available') || lower.includes('sẵn sàng')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {label}
        </span>
      );
    }
    if (lower.includes('in_use') || lower.includes('in_transit') || lower.includes('in use') || lower.includes('đang')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A67C2E]" />
          {label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        {label}
      </span>
    );
  };

  const getCity = (locationStr?: string) => {
    if (!locationStr) return '—';
    return locationStr.split(',')[0].trim();
  };

  const displaySchedulesFiltered = filteredSchedules;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* 1. EDITORIAL LIGHT HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-5 border-b border-[#E5DDD0]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#966516] m-0 mb-1.5">
            {t('coordinator.crossBorderTag', isEn ? 'Fleet & Route Operations' : 'Điều Phối Tuyến & Đội Xe')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#181A17] m-0">
            {t('coordinator.welcome', 'Xin chào')},{' '}
            <span className="text-[#966516]">{t('role.coordinator', 'Điều Phối Viên')}</span>
          </h1>
          <p className="text-sm text-[#5F6977] mt-1.5 mb-0 max-w-2xl">
            {t(
              'coordinator.subtitle',
              'Tổng quan tình trạng vận hành đội xe và tiến độ điều phối các chuyến vận chuyển ngựa đua hôm nay.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadDashboardData()}
            disabled={isLoadingRealTrips}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF8F4] text-[#181A17] text-xs font-bold border border-[#D8CEBE] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoadingRealTrips ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh', isEn ? 'Refresh' : 'Làm mới')}</span>
          </button>

          <Link
            href="/coordinator/routes"
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2D28] text-white text-xs font-bold shadow-sm inline-flex items-center gap-2 transition-colors no-underline"
          >
            <MapPin className="w-3.5 h-3.5 text-[#D4C5A3]" />
            <span>{t('coordinator.planNewRoute', 'Lập Lộ Trình Mới')}</span>
          </Link>
        </div>
      </div>

      {dashboardError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-red-800"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span>{dashboardError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboardData()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 font-bold hover:bg-red-100 cursor-pointer"
          >
            <RotateCcw size={13} /> {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* 2. CLICKABLE 4-KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/coordinator/routes"
          className={`no-underline rounded-2xl p-5 border shadow-sm flex flex-col justify-between transition-all hover:shadow-md ${
            awaitingPlanningCount > 0
              ? 'bg-[#FAF8F4] border-[#C4B38E]'
              : 'bg-white border-[#E5DDD0] hover:border-[#C4B38E]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#966516]">
              {t('coordinator.kpi.awaitingPlan', isEn ? 'Awaiting Routing' : 'Chờ Lập Tuyến')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#F3ECE0] flex items-center justify-center text-[#966516]">
              <RouteIcon className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#181A17] tracking-tight">
              <NumberTicker value={awaitingPlanningCount} padZero />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#966516] font-semibold">
              <span>{t('coordinator.kpi.awaitingPlanSub', isEn ? 'Approved orders to plan' : 'Đơn đã duyệt cần xếp lịch')}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        </Link>

        <Link
          href="/coordinator/monitoring"
          className="no-underline bg-white rounded-2xl p-5 border border-[#E5DDD0] hover:border-[#C4B38E] shadow-sm flex flex-col justify-between transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#181A17]">
              {t('coordinator.kpi.inTransit', 'Đang Di Chuyển')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center justify-center text-[#A67C2E]">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#181A17] tracking-tight">
              <NumberTicker value={activeTrips} padZero />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#5F6977] font-medium">
              <span>{t('coordinator.kpi.rolling', 'Đang lăn bánh trên tuyến')}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#966516]" />
            </div>
          </div>
        </Link>

        <Link
          href="/coordinator/routes"
          className="no-underline bg-white rounded-2xl p-5 border border-[#E5DDD0] hover:border-[#C4B38E] shadow-sm flex flex-col justify-between transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#5F6977]">
              {t('coordinator.kpi.scheduled', 'Chờ Xuất Phát')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#F4F1EA] flex items-center justify-center text-[#181A17]">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#181A17] tracking-tight">
              <NumberTicker value={scheduledDepartures} padZero />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#5F6977] font-medium">
              <span>
                {delayedTrips > 0
                  ? `${delayedTrips} ${t('coordinator.kpi.delayedInline', isEn ? 'need attention' : 'cần chú ý')}`
                  : t('coordinator.kpi.approvedPlan', 'Đã duyệt kế hoạch')}
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#966516]" />
            </div>
          </div>
        </Link>

        <Link
          href="/coordinator/vehicles"
          className="no-underline bg-white rounded-2xl p-5 border border-[#E5DDD0] hover:border-[#B7DBC4] shadow-sm flex flex-col justify-between transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#287653]">
              {t('coordinator.kpi.available', 'Xe Sẵn Sàng')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#E8F2EB] flex items-center justify-center text-[#287653]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-[#287653] tracking-tight flex items-baseline gap-1">
              <NumberTicker value={availableVehicles} padZero />
              <span className="text-base font-bold text-[#747D88]">/{vehicles.length}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#287653] font-medium">
              <span>
                {inMaintenanceVehicles > 0
                  ? `${inMaintenanceVehicles} ${t('coordinator.kpi.inMaintInline', isEn ? 'in maintenance' : 'đang bảo trì')}`
                  : t('coordinator.kpi.atDepots', 'Sẵn sàng tại các depot')}
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        </Link>
      </div>

      {/* 3. MAIN DASHBOARD CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: Route Progress + Schedule Table (Span 2) */}
        <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
          {/* ACTIVE ROUTE STEPPER */}
          <div className="rounded-2xl border border-[#E5DDD0] bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-[#FAF8F4] border-b border-[#E5DDD0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-sm font-bold text-[#181A17] uppercase tracking-wider flex items-center gap-2 m-0">
                  <Plane className="w-4 h-4 text-[#A67C2E]" />
                  {t('coordinator.routeProgress', 'Tiến Trình Tuyến Đang Vận Hành')}
                </h2>

                {realTrips.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {realTrips.slice(0, 4).map((rt) => {
                      const isSel = selectedFeaturedId === rt.shipment_id;
                      const code = rt.request_code || `REQ-${String(rt.shipment_id).padStart(3, '0')}`;
                      return (
                        <button
                          key={rt.shipment_id}
                          type="button"
                          onClick={() => setSelectedFeaturedId(rt.shipment_id)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                            isSel
                              ? 'bg-[#181A17] text-white border-[#181A17]'
                              : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:border-[#A67C2E]'
                          }`}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {featuredProgressPercent !== null ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-[#181A17] text-[#D4C5A3]">
                    {featuredProgressPercent}%
                  </span>
                ) : featuredTrip ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#966516] border border-[#D4C5A3]">
                    {translateStatus(featuredTrip.status)}
                  </span>
                ) : null}
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white text-[#181A17] border border-[#D8CEBE]">
                  {featuredTrip
                    ? `${featuredTrip.orderCode || featuredTrip.id} • ${featuredTrip.horseName || t('coordinator.transportShipment', isEn ? 'Transport Shipment' : 'Chuyến vận chuyển')}`
                    : t('coordinator.noActiveTrip', 'Chưa có chuyến nào')}
                </span>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              {isLoadingRealTrips && realTrips.length === 0 && schedules.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 text-[#747D88] text-xs">
                  <Loader2 size={22} className="animate-spin text-[#A67C2E]" />
                  <span>{t('coordinator.loadingProgress', isEn ? 'Syncing route progress...' : 'Đang đồng bộ tiến trình tuyến...')}</span>
                </div>
              ) : isLoadingMilestones ? (
                <div className="py-8 flex flex-col items-center gap-2 text-[#747D88] text-xs">
                  <Loader2 size={20} className="animate-spin text-[#A67C2E]" />
                  <span>{t('coordinator.loadingMilestones', isEn ? 'Loading route checkpoints...' : 'Đang tải các mốc hành trình...')}</span>
                </div>
              ) : realMilestones.length > 0 ? (
                <div className="overflow-x-auto pb-2">
                  <div className="relative min-w-[540px] max-w-2xl mx-auto flex items-start justify-between gap-2">
                    <div className="absolute left-8 right-8 top-5 h-1 bg-[#E5DDD0] rounded-full" />
                    <div
                      className="absolute left-8 top-5 h-1 bg-[#181A17] rounded-full transition-all duration-500"
                      style={{
                        width: `calc(${Math.max(0, Math.min(100, featuredProgressPercent ?? 0))}% - 32px)`,
                      }}
                    />

                    {realMilestones.slice(0, 5).map((ms, idx) => {
                      const isDone = ms.status === 'COMPLETED';
                      const isCurr = ms.status === 'CURRENT';
                      return (
                        <div key={ms.id ?? idx} className="flex flex-col items-center gap-2 relative z-10 text-center w-28 shrink-0">
                          <div
                            className={`w-11 h-11 rounded-full ring-4 ring-white shadow-sm flex items-center justify-center ${
                              isDone
                                ? 'bg-[#181A17] text-white'
                                : isCurr
                                ? 'bg-white border-[3px] border-[#A67C2E] text-[#A67C2E]'
                                : 'bg-white border-2 border-[#D8CEBE] text-[#747D88]'
                            }`}
                          >
                            {isDone ? (
                              <Check className="w-4 h-4" />
                            ) : isCurr ? (
                              <Truck className="w-4 h-4" />
                            ) : idx === realMilestones.slice(0, 5).length - 1 ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <MapPin className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <p
                              className={`text-xs font-bold leading-tight line-clamp-2 m-0 ${
                                isDone || isCurr ? 'text-[#181A17]' : 'text-[#5F6977]'
                              }`}
                            >
                              {ms.title}
                            </p>
                            {ms.location && (
                              <p className="text-[10px] text-[#747D88] font-medium line-clamp-1 mt-0.5 m-0">
                                {ms.location}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : featuredTrip ? (
                <div className="overflow-x-auto pb-2">
                  <div className="relative min-w-[460px] max-w-2xl mx-auto flex items-start justify-between gap-3">
                    <div className="absolute left-8 right-8 top-5 h-1 bg-[#E5DDD0] rounded-full" />

                    {/* Origin */}
                    <div className="flex flex-col items-center gap-2 relative z-10 text-center w-28 shrink-0">
                      <div className="w-11 h-11 rounded-full bg-[#181A17] text-white ring-4 ring-white shadow-sm flex items-center justify-center">
                        <Flag className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#181A17] leading-tight line-clamp-2 m-0">
                          {getCity(featuredTrip.origin)}
                        </p>
                        <p className="text-[10px] text-[#747D88] font-medium m-0">
                          {t('coordinator.originStation', 'Điểm xuất phát')}
                        </p>
                      </div>
                    </div>

                    {featuredRoute && featuredRoute.stops.length > 0 ? (
                      featuredRoute.stops.slice(0, 3).map((st, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-2 relative z-10 text-center w-28 shrink-0">
                          <div className="w-11 h-11 rounded-full bg-white border-2 border-[#C4B38E] text-[#966516] ring-4 ring-white shadow-sm flex items-center justify-center">
                            {st.type === 'Quarantine' ? (
                              <ShieldAlert className="w-4 h-4" />
                            ) : st.type === 'Rest' ? (
                              <Bed className="w-4 h-4" />
                            ) : (
                              <Plane className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#181A17] leading-tight line-clamp-2 m-0">
                              {st.name}
                            </p>
                            <p className="text-[10px] text-[#747D88] font-medium m-0">{st.type}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center gap-2 relative z-10 text-center w-40 shrink-0">
                        <div className="w-11 h-11 rounded-full bg-[#FAF8F4] border-2 border-[#C4B38E] text-[#966516] ring-4 ring-white shadow-sm flex items-center justify-center">
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#181A17] leading-tight line-clamp-2 m-0">
                            {featuredTrip.routeTitle}
                          </p>
                          <p className="text-[10px] text-[#747D88] font-medium m-0">
                            {translateStatus(featuredTrip.status)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Destination */}
                    <div className="flex flex-col items-center gap-2 relative z-10 text-center w-28 shrink-0">
                      <div
                        className={`w-11 h-11 rounded-full ring-4 ring-white flex items-center justify-center ${
                          featuredTrip.status === 'Completed'
                            ? 'bg-[#287653] text-white'
                            : 'bg-white border-2 border-[#D8CEBE] text-[#747D88]'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#181A17] leading-tight line-clamp-2 m-0">
                          {getCity(featuredTrip.destination)}
                        </p>
                        <p className="text-[10px] text-[#747D88] font-medium m-0">
                          {t('coordinator.destinationStation', 'Điểm đến')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-[#5F6977] text-sm">
                  {t('coordinator.noTripsInTransit', 'Hiện chưa có chuyến đi nào đang vận hành.')}
                </div>
              )}
            </div>
          </div>

          {/* TRIP SCHEDULE TABLE */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-[#FAF8F4] border-b border-[#E5DDD0] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#181A17] uppercase tracking-wider m-0">
                  {t('coordinator.tripSchedule', 'Lịch Trình Vận Chuyển')}
                </h2>
                <p className="text-xs text-[#5F6977] mt-0.5 m-0">
                  {t('coordinator.tripScheduleDesc', 'Danh sách các chuyến đi đã lập tuyến và đang điều phối')} ({displaySchedulesFiltered.length})
                </p>
              </div>

              <div className="relative">
                <button
                  type="button"
                  aria-expanded={showTripFilterDropdown}
                  aria-haspopup="menu"
                  onClick={() => setShowTripFilterDropdown((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    tripFilter !== 'ALL'
                      ? 'border-[#C4B38E] bg-[#FAF8F4] text-[#181A17]'
                      : 'border-[#D8CEBE] bg-white text-[#181A17] hover:bg-[#FAF8F4]'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{tripFilter === 'ALL' ? t('coordinator.filterAll', 'Lọc: Tất cả') : translateStatus(tripFilter)}</span>
                </button>

                {showTripFilterDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowTripFilterDropdown(false)} />
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-2 w-44 rounded-2xl bg-white border border-[#D8CEBE] shadow-xl p-1.5 z-20"
                    >
                      {['ALL', 'In Transit', 'Delayed', 'Scheduled', 'Completed'].map((st) => (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={tripFilter === st}
                          key={st}
                          onClick={() => {
                            setTripFilter(st);
                            setShowTripFilterDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                            tripFilter === st ? 'bg-[#FAF8F4] text-[#181A17] font-bold' : 'text-[#5F6977] hover:bg-[#FAF8F4]'
                          }`}
                        >
                          {st === 'ALL' ? t('coordinator.allTrips', 'Tất cả chuyến') : translateStatus(st)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[640px]">
                <thead>
                  <tr className="bg-[#FAF8F4]/70 border-b border-[#E5DDD0] text-[11px] font-bold text-[#5F6977] uppercase tracking-wider">
                    <th className="px-6 py-3.5">{t('coordinator.table.tripOrder', isEn ? 'Order / Shipment' : 'Mã Đơn / Yêu Cầu')}</th>
                    <th className="px-6 py-3.5">{t('coordinator.table.route', 'Hành lang')}</th>
                    <th className="px-6 py-3.5">{t('coordinator.table.scaleRoute', isEn ? 'Scope & Route' : 'Quy mô / Tuyến')}</th>
                    <th className="px-6 py-3.5">{t('coordinator.table.departure', 'Ngày dự kiến')}</th>
                    <th className="px-6 py-3.5">{t('coordinator.table.status', 'Trạng thái')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0ECE3]">
                  {displaySchedulesFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-[#5F6977]">
                        {t('coordinator.noTripsMatchFilter', 'Không có chuyến đi nào phù hợp với bộ lọc.')}
                      </td>
                    </tr>
                  ) : (
                    displaySchedulesFiltered.map((trip) => (
                      <tr key={trip.id} className="hover:bg-[#FAF8F4]/60 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-[#966516] bg-[#FAF8F4] border border-[#D4C5A3] px-2 py-0.5 rounded text-[11px] font-bold">
                            {trip.orderCode || trip.id}
                          </span>
                          <Link
                            href="/coordinator/monitoring"
                            className="block text-xs text-[#181A17] font-bold hover:text-[#966516] mt-1 no-underline"
                          >
                            {trip.horseName || t('common.racehorse', 'Ngựa đua')}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <FlightyRouteDisplay
                            origin={trip.origin || t('coordinator.originStation', 'Xuất phát')}
                            destination={trip.destination || t('coordinator.destinationStation', 'Điểm đến')}
                            variant="ticket"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#181A17] m-0">
                            {trip.horseCount} {t('common.horsesUnit', 'ngựa')}
                          </p>
                          <p className="text-[11px] text-[#5F6977] m-0 line-clamp-1">{trip.routeTitle}</p>
                        </td>
                        <td className="px-6 py-4 text-[#5F6977] whitespace-nowrap">
                          {formatDisplayDate(trip.departureTime)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{getTripStatusBadge(trip.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Schedule Alerts + Compact Fleet Status */}
        <div className="flex flex-col gap-6">
          {/* SCHEDULE ALERTS */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
            <div
              className={`px-5 py-4 border-b flex items-center justify-between gap-2 ${
                unacknowledgedAlerts.length > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-[#FAF8F4] border-[#E5DDD0]'
              }`}
            >
              <h2 className="text-sm font-bold text-[#181A17] uppercase tracking-wider flex items-center gap-2 m-0">
                <Bell className={`w-4 h-4 ${unacknowledgedAlerts.length > 0 ? 'text-rose-600 animate-pulse' : 'text-[#747D88]'}`} />
                {t('coordinator.alerts.title', 'Cảnh Báo Vận Hành')}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                  unacknowledgedAlerts.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-[#EFEBE2] text-[#5F6977]'
                }`}
              >
                {unacknowledgedAlerts.length} {t('coordinator.alerts.active', 'Cần xử lý')}
              </span>
            </div>

            <div className="p-4 space-y-3">
              {unacknowledgedAlerts.length === 0 ? (
                <div className="p-5 text-center text-[#5F6977]">
                  <CheckCircle2 className="w-7 h-7 text-[#287653] mx-auto mb-2" />
                  <p className="font-bold text-[#181A17] text-sm m-0">{t('coordinator.alerts.allClearTitle', 'Hành lang an toàn')}</p>
                  <p className="text-xs text-[#5F6977] mt-1 m-0">{t('coordinator.alerts.allClearDesc', 'Không có cảnh báo vận hành nào cần xử lý.')}</p>
                </div>
              ) : (
                unacknowledgedAlerts.slice(0, 4).map((al) => (
                  <div key={al.id} className="p-3.5 rounded-xl border border-[#E5DDD0] bg-[#FAF8F4]/50 hover:bg-[#FAF8F4] transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-bold text-[#181A17] text-xs m-0">{al.type}</p>
                      <span className="text-[10px] text-[#747D88] shrink-0">{al.timeAgo}</span>
                    </div>
                    <p className="text-xs text-[#5F6977] mb-3 m-0">{al.message}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href="/coordinator/alerts"
                        className="text-[11px] font-bold text-[#966516] hover:underline no-underline"
                      >
                        {t('coordinator.alerts.reviewAlert', 'Xem chi tiết')} ({al.tripCode}) →
                      </Link>
                      <button
                        type="button"
                        disabled={acknowledgingId === al.id}
                        onClick={async () => {
                          if ('notificationId' in al && al.notificationId) {
                            setAcknowledgingId(al.id);
                            try {
                              await apiClient(`/notifications/${al.notificationId}/read`, { method: 'PATCH' });
                              setLiveNotifications((prev) =>
                                prev.map((n) => (n.id === al.notificationId ? { ...n, isRead: true } : n))
                              );
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('notifications-updated'));
                              }
                              toast.success(t('coordinator.alerts.acknowledgedSuccess', 'Đã xác nhận cảnh báo'));
                            } catch (err: any) {
                              toast.error(
                                err?.message ||
                                  t('coordinator.alerts.acknowledgeError', isEn ? 'Failed to acknowledge alert' : 'Không thể xác nhận cảnh báo')
                              );
                            } finally {
                              setAcknowledgingId(null);
                            }
                          } else {
                            acknowledgeAlert(al.id);
                            toast.success(t('coordinator.alerts.acknowledgedSuccess', 'Đã xác nhận cảnh báo'));
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] disabled:opacity-50 text-[11px] font-semibold text-[#181A17] cursor-pointer transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        <span>{t('coordinator.acknowledge', 'Tiếp nhận')}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* COMPACT FLEET STATUS LIST */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-[#FAF8F4] border-b border-[#E5DDD0] flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#181A17] uppercase tracking-wider m-0">
                  {t('coordinator.vehicleFleetStatus', 'Đội Xe Chuyên Dụng')}
                </h2>
                <p className="text-[11px] text-[#5F6977] mt-0.5 m-0">
                  {availableVehicles} {t('coordinator.vehicles.readyInline', isEn ? 'ready' : 'sẵn sàng')} · {vehicles.length}{' '}
                  {t('coordinator.vehicles.totalInline', isEn ? 'total' : 'tổng')}
                </p>
              </div>
              <Link
                href="/coordinator/vehicles"
                className="text-xs font-bold text-[#966516] hover:underline no-underline shrink-0"
              >
                {t('coordinator.viewAllVehicles', 'Xem tất cả →')}
              </Link>
            </div>

            <div className="divide-y divide-[#F0ECE3]">
              {vehicles.slice(0, 5).map((veh) => (
                <div key={veh.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#FAF8F4]/50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[#181A17]">{veh.code}</span>
                      {veh.assignedTripCode && (
                        <span className="text-[10px] font-bold text-[#966516] bg-[#FAF8F4] border border-[#D4C5A3] px-1.5 py-0.5 rounded">
                          {veh.assignedTripCode}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#5F6977] mt-0.5 m-0 truncate">
                      {translateVehicleType(veh.type)} ({veh.capacity} {t('coordinator.stallsUnit', 'buồng')}) ·{' '}
                      {veh.location || t('coordinator.depot', 'Depot')}
                    </p>
                  </div>
                  <div className="shrink-0">{getVehicleStatusBadge(veh.status)}</div>
                </div>
              ))}
              {vehicles.length === 0 && (
                <div className="px-5 py-8 text-center text-xs text-[#5F6977]">
                  {t('coordinator.noVehiclesFound', 'Chưa có phương tiện nào trong danh mục.')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
