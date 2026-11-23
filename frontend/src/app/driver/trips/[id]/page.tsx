'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Truck,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Play,
  Heart,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  trackingApi,
  TripTrackingDetails,
  LiveTrackingDetails,
} from '@/features/tracking/api/tracking.api';
import { VerticalTimeline, buildTimeline, TimelineItem } from '@/features/tracking/timeline';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';
import toast from 'react-hot-toast';

export default function DriverTripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const shipmentId = Number(resolvedParams.id);
  const router = useRouter();
  const { t, language, translateStatus } = useLanguage();

  const [details, setDetails] = useState<TripTrackingDetails | null>(null);
  const [liveData, setLiveData] = useState<LiveTrackingDetails | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTripData = useCallback(async () => {
    if (!shipmentId || isNaN(shipmentId)) return;
    try {
      setLoadError(null);
      const [tripDetails, live, timelineRes] = await Promise.all([
        trackingApi.getTrackingDetails(shipmentId),
        trackingApi.getLiveTracking(shipmentId).catch(() => null),
        trackingApi.getShipmentTimeline(shipmentId).catch(() => null),
      ]);
      setDetails(tripDetails);
      if (live) setLiveData(live);
      if (timelineRes) {
        setTimelineItems(buildTimeline({ timelineData: timelineRes, viewer: 'driver' }));
      }
    } catch (err: any) {
      console.warn('Could not load driver trip details:', err);
      setLoadError(
        err?.message ||
          (language === 'en'
            ? 'Unable to load trip progress.'
            : 'Không thể tải chi tiết tiến độ chuyến đi.')
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shipmentId, language]);

  useEffect(() => {
    void fetchTripData();
  }, [fetchTripData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    void fetchTripData();
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-16 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DDD0] pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/driver/trips"
            className="w-10 h-10 rounded-xl border border-[#D8CEBE] bg-white flex items-center justify-center text-[#181A17] hover:bg-[#FAF8F4] transition-colors"
            aria-label="Quay lại danh sách chuyến đi"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#A67C2E] uppercase tracking-wider">
                {details?.requestCode || `TR-${shipmentId}`}
              </span>
              {details && (
                <StatusBadge
                  label={translateStatus(details.shipmentStatus)}
                  variant={
                    details.shipmentStatus === 'in_transit'
                      ? 'transit'
                      : details.shipmentStatus === 'completed'
                      ? 'success'
                      : 'pending'
                  }
                  hasDot={details.shipmentStatus === 'in_transit'}
                />
              )}
            </div>
            <h1 className="text-xl font-extrabold text-[#181A17] m-0">
              {language === 'en' ? 'Trip Progress & Milestones' : 'Chi tiết Tiến độ Hành trình & Mốc'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="min-h-[40px]"
          >
            <RefreshCw
              size={14}
              className={`mr-1.5 text-[#A67C2E] ${refreshing ? 'animate-spin' : ''}`}
            />
            {language === 'en' ? 'Refresh' : 'Làm mới'}
          </Button>

          <Link
            href={`/driver/status?shipmentId=${shipmentId}`}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#181A17] text-[#C4B38E] hover:bg-[#2A2D27] text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Play size={13} fill="currentColor" />
            <span>{language === 'en' ? 'Check-in Console' : 'Giao diện Check-in'}</span>
          </Link>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 font-medium">
          <AlertTriangle size={16} className="text-red-600 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#E5DDD0]">
          <RefreshCw size={28} className="animate-spin text-[#A67C2E] mx-auto mb-3" />
          <p className="text-sm text-[#747D88] font-semibold m-0">
            {language === 'en' ? 'Loading journey timeline...' : 'Đang tải thông tin tiến độ...'}
          </p>
        </div>
      ) : !details ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#E5DDD0]">
          <Truck size={36} className="text-[#D8CEBE] mx-auto mb-3" />
          <p className="text-sm font-bold text-[#181A17] m-0">
            {language === 'en' ? 'Trip details not found' : 'Không tìm thấy chuyến đi'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Journey Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#747D88] uppercase">
                  {language === 'en' ? 'Route' : 'Lộ trình'}
                </span>
                <p className="font-bold text-[#181A17] text-sm mt-1 m-0">
                  {details.origin.split(',')[0]} → {details.destination.split(',')[0]}
                </p>
                <p className="text-xs text-[#747D88] mt-0.5 m-0">
                  {details.totalDistanceKm || 0} km
                </p>
              </div>
              <MapPin size={24} className="text-[#A67C2E]" />
            </div>

            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#747D88] uppercase">
                  {language === 'en' ? 'Equine Manifest' : 'Ngựa vận chuyển'}
                </span>
                <p className="font-bold text-[#181A17] text-sm mt-1 m-0">
                  {details.assignedHorses.length} {language === 'en' ? 'horses' : 'chiến mã'}
                </p>
                <p className="text-xs text-[#747D88] mt-0.5 m-0 truncate max-w-[160px]">
                  {details.assignedHorses.map((h) => h.name).join(', ')}
                </p>
              </div>
              <ShieldCheck size={24} className="text-[#287653]" />
            </div>

            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#747D88] uppercase">
                  {language === 'en' ? 'ETA / Current' : 'Dự kiến đến'}
                </span>
                <p className="font-bold text-[#181A17] text-sm mt-1 m-0">
                  {details.eta
                    ? new Date(details.eta).toLocaleTimeString(language === 'en' ? 'en-US' : 'vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Đúng lịch'}
                </p>
                <p className="text-xs text-[#747D88] mt-0.5 m-0">
                  {details.currentMilestone || '—'}
                </p>
              </div>
              <Clock size={24} className="text-[#A67C2E]" />
            </div>
          </div>

          {/* Live Telemetry Map (if active) */}
          {liveData && (
            <div className="bg-[#FAF8F4] border border-[#E5DDD0] rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#A67C2E] uppercase tracking-wide">
                  {language === 'en' ? 'Live Telemetry Map' : 'Bản đồ Định vị GPS Trực tiếp'}
                </span>
                {liveData.isSimulated && (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300">
                    SIMULATION
                  </span>
                )}
              </div>
              <LiveTrackingMap liveData={liveData} height="360px" autoCenter />
            </div>
          )}

          {/* Step 11 Vertical Timeline */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
              <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                <Truck size={18} className="text-[#A67C2E]" />
                {language === 'en' ? 'Full Transit Milestone Timeline' : 'Tiến trình Mốc Hành Trình Dọc'}
              </h2>
              <span className="text-xs text-[#747D88]">
                {timelineItems.length} {language === 'en' ? 'milestones' : 'mốc sự kiện'}
              </span>
            </div>

            <VerticalTimeline
              items={timelineItems}
              viewer="driver"
              emptyText={
                language === 'en'
                  ? 'No transit milestones configured for this shipment.'
                  : 'Chưa có mốc kiểm soát nào cho chuyến đi này.'
              }
              renderCurrentActions={() => (
                <Link
                  href={`/driver/status?shipmentId=${shipmentId}`}
                  className="px-4 py-2 rounded-xl bg-[#181A17] text-[#C4B38E] hover:bg-[#2A2D27] text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <CheckCircle2 size={14} className="text-[#C4B38E]" />
                  <span>{language === 'en' ? 'Open Check-in Console' : 'Mở bảng điều khiển Check-in'}</span>
                </Link>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
