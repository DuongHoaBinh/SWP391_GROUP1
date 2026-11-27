'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Crosshair,
  CheckCircle2,
  MapPin,
  Truck,
  Stethoscope,
  RefreshCw,
  AlertTriangle,
  Play,
  Map as MapIcon,
  ClipboardCheck,
  Camera,
  Phone,
  ShieldCheck,
  Radio,
  Thermometer,
  Heart,
  Wind,
  X,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { DriverSectionTabs, DriverTabItem } from '@/components/layout/DriverSectionTabs';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getCurrentUser } from '@/lib/auth';
import {
  trackingApi,
  AssignedTripSummary,
  TripTrackingDetails,
  TrackingMilestoneItem,
  LiveTrackingDetails,
} from '@/features/tracking/api/tracking.api';
import { DeliveryHandoverPanel } from '@/features/tracking/components/DeliveryHandoverPanel';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';
import { VerticalTimeline, buildTimeline, TimelineItem } from '@/features/tracking/timeline';
import { incidentsApi } from '@/features/incidents/api/incidents.api';
import { markReturnNoShow } from '@/features/orders/return-api';
import { openAuthenticatedApiFile } from '@/lib/api-client';
import toast from 'react-hot-toast';

export interface DriverTripConsoleProps {
  initialShipmentId?: number | null;
  showBackToTrips?: boolean;
}

function parseNameAndPhone(raw?: string | null): { name: string; phone: string | null } {
  if (!raw) return { name: '', phone: null };
  const match = raw.match(/^(.*?)\s*\(([\d+\s.-]{8,})\)\s*$/);
  if (match) {
    return { name: match[1].trim(), phone: match[2].trim() };
  }
  return { name: raw.trim(), phone: null };
}

function getStatusBadgeVariant(status?: string): BadgeVariant {
  const s = String(status || '').toLowerCase();
  if (s === 'in_transit' || s === 'return_pending') return 'transit';
  if (s === 'completed' || s === 'delivered') return 'success';
  if (s === 'ready_to_depart' || s === 'confirmed') return 'info';
  return 'pending';
}

export function DriverTripConsole({
  initialShipmentId = null,
  showBackToTrips = false,
}: DriverTripConsoleProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, language, translateStatus, translateIncident, translateCondition, translateRole } = useLanguage();
  const isEn = language === 'en';

  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(initialShipmentId);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [liveData, setLiveData] = useState<LiveTrackingDetails | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [activeTab, setActiveTab] = useState<'milestones' | 'map' | 'health' | 'handover'>('milestones');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check-in modal state
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState<TrackingMilestoneItem | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState('');
  const [useManualCheckIn, setUseManualCheckIn] = useState(false);
  const [manualReason, setManualReason] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [geofenceError, setGeofenceError] = useState<{
    code?: 'OUTSIDE_GEOFENCE' | 'LOW_GPS_ACCURACY';
    distanceM?: number;
    radiusM?: number;
    message: string;
  } | null>(null);
  const [vitalsMissingError, setVitalsMissingError] = useState<{ missingHorses: Array<{ id: number; name: string }>; message: string } | null>(null);

  // GPS Simulation state (only active when backend simulationEnabled === true)
  const [isSendingSimPing, setIsSendingSimPing] = useState(false);

  // Unified Flow 5 Incident Modal
  const [isIncidentOpen, setIsIncidentOpen] = useState(false);
  const [incidentType, setIncidentType] = useState('traffic_delay');
  const [incidentSeverity, setIncidentSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [incidentLocation, setIncidentLocation] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [incidentFiles, setIncidentFiles] = useState<File[]>([]);

  // Quick Health Log Modal (aligned with rest/quarantine vitals & respiratoryRate + routeStopId)
  const [isQuickHealthOpen, setIsQuickHealthOpen] = useState(false);
  const [healthHorseId, setHealthHorseId] = useState('');
  const [healthCondition, setHealthCondition] = useState<'stable' | 'not_eating' | 'stressed' | 'climate_change' | 'other'>('stable');
  const [healthTemp, setHealthTemp] = useState('38.0');
  const [healthHr, setHealthHr] = useState('38');
  const [healthResp, setHealthResp] = useState('14');
  const [healthNotes, setHealthNotes] = useState('');
  const [healthStopId, setHealthStopId] = useState<number | undefined>(undefined);
  const [isSavingHealth, setIsSavingHealth] = useState(false);

  // Return No-Show Modal
  const [isNoShowOpen, setIsNoShowOpen] = useState(false);
  const [noShowNotes, setNoShowNotes] = useState('');
  const [noShowEvidenceUrls, setNoShowEvidenceUrls] = useState<string[]>([]);
  const [noShowPreviews, setNoShowPreviews] = useState<string[]>([]);
  const [isUploadingNoShow, setIsUploadingNoShow] = useState(false);
  const [isSubmittingNoShow, setIsSubmittingNoShow] = useState(false);

  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const isEscort =
    currentUser?.persona === 'escort' ||
    currentUser?.specialization === 'escort' ||
    currentUser?.email?.toLowerCase().includes('escort') ||
    Boolean(pathname?.startsWith('/escort'));
  const basePath = isEscort ? '/escort' : '/driver';

  const queryShipmentParam = searchParams.get('shipmentId');
  const queryTabParam = searchParams.get('tab');

  useEffect(() => {
    if (queryTabParam === 'map' || queryTabParam === 'health' || queryTabParam === 'handover' || queryTabParam === 'milestones') {
      setActiveTab(queryTabParam);
    }
  }, [queryTabParam]);

  const loadTrips = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const user = getCurrentUser();
      setCurrentUser(user);
      const list = await trackingApi.getMyTrips();
      const safeList = Array.isArray(list) ? list : [];
      setTrips(safeList);

      const qNum = queryShipmentParam ? Number(queryShipmentParam) : NaN;
      const targetId =
        initialShipmentId && Number.isFinite(initialShipmentId) && initialShipmentId > 0
          ? initialShipmentId
          : Number.isFinite(qNum) && qNum > 0
          ? qNum
          : null;

      if (targetId) {
        setSelectedShipmentId(targetId);
      } else if (safeList.length > 0) {
        const active =
          safeList.find((tr) => tr.shipment_status === 'in_transit' || tr.shipment_status === 'return_pending') ||
          safeList.find((tr) => tr.shipment_status === 'ready_to_depart') ||
          safeList.find((tr) => tr.shipment_status === 'confirmed' || tr.shipment_status === 'planning') ||
          safeList[0];
        setSelectedShipmentId((prev) =>
          prev && safeList.some((tr) => tr.shipment_id === prev) ? prev : active.shipment_id,
        );
      } else {
        setSelectedShipmentId(null);
        setTrackingDetails(null);
      }
    } catch (err: any) {
      setLoadError(
        err?.message ||
          (isEn ? 'Unable to load assigned trips.' : 'Không thể tải danh sách chuyến được phân công.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [initialShipmentId, isEn, queryShipmentParam]);

  const loadDetails = useCallback(
    async (shipmentId: number, silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const [details, live, timelineRes] = await Promise.all([
          trackingApi.getTrackingDetails(shipmentId),
          trackingApi.getLiveTracking(shipmentId).catch(() => null),
          trackingApi.getShipmentTimeline(shipmentId).catch(() => null),
        ]);
        setTrackingDetails(details);
        setLiveData(live);
        if (timelineRes) {
          setTimelineItems(buildTimeline({ timelineData: timelineRes, viewer: 'driver', language }));
        } else {
          setTimelineItems([]);
        }
        setLoadError(null);
      } catch (err: any) {
        if (!silent) {
          const msg = err?.message || (isEn ? 'Unable to load trip details.' : 'Không thể tải chi tiết chuyến đi.');
          setLoadError(msg);
          toast.error(msg);
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [isEn, language],
  );

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    if (!selectedShipmentId) return;
    void loadDetails(selectedShipmentId);
    const interval = setInterval(() => {
      void loadDetails(selectedShipmentId, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedShipmentId, loadDetails]);

  const currentTrip = useMemo(
    () => trips.find((tr) => tr.shipment_id === selectedShipmentId) || null,
    [trips, selectedShipmentId],
  );

  const milestones = useMemo(() => trackingDetails?.milestones || [], [trackingDetails]);
  const currentMilestone = useMemo(
    () => milestones.find((m) => m.status === 'CURRENT') || null,
    [milestones],
  );
  const completedMilestoneCount = useMemo(
    () => milestones.filter((m) => m.status === 'COMPLETED').length,
    [milestones],
  );
  const progressPct = useMemo(() => {
    if (trackingDetails?.shipmentStatus === 'completed') return 100;
    if (milestones.length === 0) return 0;
    return Math.round((completedMilestoneCount / milestones.length) * 100);
  }, [completedMilestoneCount, milestones.length, trackingDetails?.shipmentStatus]);

  const syncedLiveData = useMemo(() => {
    if (!liveData) return null;
    return {
      ...liveData,
      progressPct,
      progress: liveData.progress ? { ...liveData.progress, percent: progressPct } : { percent: progressPct },
    };
  }, [liveData, progressPct]);

  // Determine if current stop is a rest/quarantine stop requiring vitals before departing
  const activeStopMeta = useMemo(() => {
    if (!currentMilestone || currentMilestone.itemType !== 'stop' || !currentMilestone.stopId) return null;
    const liveStop = liveData?.stops?.find(
      (s) => Number(s.routeStopId ?? s.stopId) === Number(currentMilestone.stopId),
    );
    const stopType = String(liveStop?.stopType ?? liveStop?.type ?? '').toLowerCase();
    const stopStatus = String(liveStop?.status || '').toLowerCase();
    const isVitalsRequiredStop = stopType === 'rest' || stopType === 'quarantine';
    const isAtStopNow =
      stopStatus === 'arrived' ||
      stopStatus === 'customs_cleared' ||
      stopStatus === 'cleared' ||
      currentMilestone.allowedActions.includes('depart_stop');
    return {
      stopId: Number(currentMilestone.stopId),
      stopType,
      stopStatus,
      actualArrival: liveStop?.actualArrival || null,
      isVitalsRequiredStop,
      isVitalsRequiredNow: isVitalsRequiredStop && isAtStopNow,
    };
  }, [currentMilestone, liveData]);

  // Check which horses already have valid vitals (temp + hr) once arrived at a rest/quarantine stop
  const missingVitalsHorses = useMemo(() => {
    if (!activeStopMeta?.isVitalsRequiredNow || !trackingDetails) return [];
    const arrivalMs = activeStopMeta.actualArrival ? new Date(activeStopMeta.actualArrival).getTime() : 0;
    const logs = trackingDetails.healthLogs || [];
    return (trackingDetails.assignedHorses || []).filter((h) => {
      return !logs.some((l) => {
        const matchHorse =
          (l.horseId != null && Number(l.horseId) === Number(h.id)) ||
          String(l.horseName || '').toLowerCase() === String(h.name || '').toLowerCase();
        if (!matchHorse) return false;
        if (l.temperatureC == null || l.heartRateBpm == null) return false;
        const matchStop = l.routeStopId != null && Number(l.routeStopId) === activeStopMeta.stopId;
        const matchTime = arrivalMs > 0 && new Date(l.recordedAt).getTime() >= arrivalMs;
        return matchStop || matchTime;
      });
    });
  }, [activeStopMeta, trackingDetails]);

  // Handover readiness: only unlock form when shipment is completed, return_pending, or at final leg arrival
  const canSubmitHandover = useMemo(() => {
    const st = String(trackingDetails?.shipmentStatus || '').toLowerCase();
    if (st === 'completed' || st === 'return_pending') return true;
    if (st !== 'in_transit') return false;
    const lastMilestone = milestones[milestones.length - 1];
    if (!lastMilestone) return false;
    return lastMilestone.status === 'COMPLETED' || lastMilestone.status === 'CURRENT';
  }, [milestones, trackingDetails?.shipmentStatus]);

  const isTripEditable = useMemo(() => {
    const st = String(trackingDetails?.shipmentStatus || currentTrip?.shipment_status || '').toLowerCase();
    return !['planning', 'confirmed', 'approved', 'completed', 'cancelled', 'cancelled_operational', 'rejected'].includes(st);
  }, [trackingDetails?.shipmentStatus, currentTrip?.shipment_status]);

  const actionLabelMap = useCallback(
    (act: string) => {
      const map: Record<string, string> = isEn
        ? {
            start_leg: 'Confirm Leg Departure',
            arrive_stop: 'Arrived at Checkpoint',
            clear_customs: 'Customs & Quarantine Cleared',
            depart_stop: 'Depart Checkpoint',
            arrive_leg: 'Confirm Safe Arrival',
          }
        : {
            start_leg: 'Xác nhận xuất phát chặng',
            arrive_stop: 'Đã tới trạm kiểm soát',
            clear_customs: 'Hoàn tất thông quan & kiểm dịch',
            depart_stop: 'Rời trạm tiếp tục hành trình',
            arrive_leg: 'Xác nhận đã tới đích an toàn',
          };
      return map[act] || act;
    },
    [isEn],
  );

  const openQuickHealthModal = (presetHorseId?: number, presetStopId?: number) => {
    const horses = trackingDetails?.assignedHorses || [];
    const targetHorse =
      (presetHorseId ? horses.find((h) => h.id === presetHorseId) : null) ||
      missingVitalsHorses[0] ||
      horses[0];
    setHealthHorseId(targetHorse ? String(targetHorse.id) : '');
    setHealthStopId(presetStopId ?? activeStopMeta?.stopId ?? currentMilestone?.stopId ?? undefined);
    setHealthCondition('stable');
    setHealthTemp('38.0');
    setHealthHr('38');
    setHealthResp('14');
    setHealthNotes('');
    setIsQuickHealthOpen(true);
  };

  const handleSaveQuickHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipmentId || isSavingHealth) return;

    const horses = trackingDetails?.assignedHorses || [];
    const matchedHorse = horses.find((h) => String(h.id) === healthHorseId) || horses[0];
    const parsedTemp = healthTemp.trim() ? Number(healthTemp) : undefined;
    const parsedHr = healthHr.trim() ? Number(healthHr) : undefined;
    const parsedResp = healthResp.trim() ? Number(healthResp) : undefined;

    if (parsedTemp !== undefined && (!Number.isFinite(parsedTemp) || parsedTemp < 30 || parsedTemp > 45)) {
      toast.error(isEn ? 'Temperature must be between 30.0 and 45.0 °C.' : 'Thân nhiệt phải nằm trong khoảng 30.0 - 45.0 °C.');
      return;
    }
    if (parsedHr !== undefined && (!Number.isFinite(parsedHr) || parsedHr < 15 || parsedHr > 200)) {
      toast.error(isEn ? 'Heart rate must be between 15 and 200 BPM.' : 'Nhịp tim phải nằm trong khoảng 15 - 200 bpm.');
      return;
    }
    if (parsedResp !== undefined && (!Number.isFinite(parsedResp) || parsedResp < 4 || parsedResp > 80)) {
      toast.error(isEn ? 'Respiratory rate must be between 4 and 80 breaths/min.' : 'Nhịp thở phải nằm trong khoảng 4 - 80 nhịp/phút.');
      return;
    }

    setIsSavingHealth(true);
    try {
      await trackingApi.createHealthLog(selectedShipmentId, {
        horseId: matchedHorse?.id,
        horseName: matchedHorse?.name || (isEn ? 'Racehorse' : 'Chiến mã'),
        legName: currentMilestone ? `#${currentMilestone.seq} - ${currentMilestone.title}` : undefined,
        routeStopId: healthStopId,
        conditionStatus: healthCondition,
        temperatureC: parsedTemp,
        heartRateBpm: parsedHr != null ? Math.round(parsedHr) : undefined,
        respiratoryRate: parsedResp != null ? Math.round(parsedResp) : undefined,
        notes: healthNotes.trim() || undefined,
      });
      await loadDetails(selectedShipmentId, true);
      setIsQuickHealthOpen(false);
      setVitalsMissingError(null);
      toast.success(
        isEn
          ? `Vitals recorded for ${matchedHorse?.name || 'horse'}.`
          : `Đã ghi nhận sinh hiệu cho ${matchedHorse?.name || 'ngựa'}!`,
      );
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to save health log.' : 'Không thể lưu sinh hiệu ngựa.'));
    } finally {
      setIsSavingHealth(false);
    }
  };

  const handleOpenCheckin = (milestone: TrackingMilestoneItem) => {
    setActiveMilestone(milestone);
    const defaultAction = milestone.allowedActions[0] || (milestone.itemType === 'leg_start' ? 'start_leg' : milestone.itemType === 'leg_end' ? 'arrive_leg' : 'arrive_stop');
    setSelectedAction(defaultAction);
    setCheckInNotes('');
    setUseManualCheckIn(false);
    setManualReason('');
    setEvidenceUrl('');
    setEvidencePreview(null);
    setGeofenceError(null);
    setVitalsMissingError(null);
    setIsCheckInOpen(true);
  };

  const closeCheckInModal = () => {
    if (isSubmitting || isUploadingEvidence) return;
    setIsCheckInOpen(false);
    setActiveMilestone(null);
    setGeofenceError(null);
    setVitalsMissingError(null);
  };

  const handleUploadEvidenceFile = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedShipmentId) return;
    const file = files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error(isEn ? 'Image must be <= 5MB.' : 'Ảnh tải lên phải <= 5MB.');
      return;
    }
    setIsUploadingEvidence(true);
    try {
      const res = await trackingApi.uploadEvidencePhotos(selectedShipmentId, [file]);
      const uploadedUrl = res?.files?.[0];
      if (uploadedUrl) {
        setEvidenceUrl(uploadedUrl);
        const blobUrl = URL.createObjectURL(file);
        previewUrlsRef.current.push(blobUrl);
        setEvidencePreview(blobUrl);
        toast.success(isEn ? 'Evidence photo uploaded!' : 'Đã tải ảnh minh chứng thành công!');
      }
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to upload evidence image.' : 'Không thể tải ảnh minh chứng lên máy chủ.'));
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const handleUploadNoShowFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedShipmentId) return;
    const selected = Array.from(files).slice(0, 5 - noShowEvidenceUrls.length);
    if (selected.length === 0) return;
    if (selected.some((f) => f.size > 5 * 1024 * 1024)) {
      toast.error(isEn ? 'Each image must be <= 5MB.' : 'Mỗi ảnh phải <= 5MB.');
      return;
    }
    setIsUploadingNoShow(true);
    try {
      const res = await trackingApi.uploadEvidencePhotos(selectedShipmentId, selected);
      const urls = res?.files || [];
      const blobs = selected.map((f) => {
        const b = URL.createObjectURL(f);
        previewUrlsRef.current.push(b);
        return b;
      });
      setNoShowEvidenceUrls((prev) => [...prev, ...urls].slice(0, 5));
      setNoShowPreviews((prev) => [...prev, ...blobs].slice(0, 5));
      toast.success(isEn ? 'Evidence photos uploaded!' : 'Đã tải ảnh bằng chứng!');
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Upload failed.' : 'Tải ảnh thất bại.'));
    } finally {
      setIsUploadingNoShow(false);
    }
  };

  const handleConfirmCheckin = async () => {
    if (!activeMilestone || !selectedShipmentId || isSubmitting) return;

    // Client-side pre-check ONLY when departing a rest/quarantine stop with missing horses
    if (
      activeMilestone.itemType === 'stop' &&
      selectedAction === 'depart_stop' &&
      activeStopMeta?.isVitalsRequiredStop &&
      missingVitalsHorses.length > 0
    ) {
      setVitalsMissingError({
        missingHorses: missingVitalsHorses.map((h) => ({ id: h.id, name: h.name })),
        message: isEn
          ? 'All horses require temperature & heart rate vitals before departing this rest/quarantine stop.'
          : 'Bắt buộc ghi nhận thân nhiệt & nhịp tim cho tất cả ngựa trước khi rời trạm nghỉ/kiểm dịch.',
      });
      return;
    }

    setIsSubmitting(true);
    setGeofenceError(null);
    setVitalsMissingError(null);

    let locationPayload: { lat: number; lng: number; accuracyM?: number; source?: string } | undefined;

    if (useManualCheckIn) {
      if (!manualReason || manualReason.trim().length < 10) {
        toast.error(isEn ? 'Manual check-in requires a reason (>= 10 chars).' : 'Check-in thủ công cần lý do giải trình tối thiểu 10 ký tự.');
        setIsSubmitting(false);
        return;
      }
      if (!evidenceUrl || !evidenceUrl.trim()) {
        toast.error(isEn ? 'Please take or upload an evidence photo.' : 'Vui lòng chụp hoặc tải lên ảnh bằng chứng thực địa.');
        setIsSubmitting(false);
        return;
      }
      locationPayload = { lat: 0, lng: 0, source: 'manual' };
    } else {
      try {
        setIsGettingGps(true);
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('GPS unavailable'));
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 6000,
            maximumAge: 10000,
          });
        });
        locationPayload = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracyM: Math.round(pos.coords.accuracy),
          source: 'gps',
        };
      } catch {
        setIsGettingGps(false);
        setUseManualCheckIn(true);
        toast.error(
          isEn
            ? 'Unable to acquire device GPS. Switched to manual check-in with photo evidence.'
            : 'Không thể lấy GPS thiết bị. Đã chuyển sang check-in thủ công kèm ảnh minh chứng.',
        );
        setIsSubmitting(false);
        return;
      } finally {
        setIsGettingGps(false);
      }
    }

    try {
      const commonPayload = {
        notes: checkInNotes.trim() || undefined,
        location: locationPayload,
        manualReason: useManualCheckIn ? manualReason.trim() : undefined,
        evidenceUrl: useManualCheckIn ? evidenceUrl.trim() : undefined,
      };

      if (activeMilestone.itemType === 'leg_start') {
        await trackingApi.checkInLegStart(selectedShipmentId, activeMilestone.legId, commonPayload);
        toast.success(isEn ? 'Leg departure confirmed!' : 'Đã xác nhận xuất phát chặng!');
      } else if (activeMilestone.itemType === 'stop') {
        if (!activeMilestone.stopId) {
          toast.error(isEn ? 'Invalid checkpoint reference.' : 'Mốc dừng không có mã hợp lệ.');
          return;
        }
        const actionMap: Record<string, 'arrived' | 'departed' | 'customs_cleared'> = {
          arrive_stop: 'arrived',
          depart_stop: 'departed',
          clear_customs: 'customs_cleared',
        };
        await trackingApi.checkInStop(selectedShipmentId, activeMilestone.stopId, {
          action: actionMap[selectedAction] || 'arrived',
          ...commonPayload,
        });
        toast.success(isEn ? 'Checkpoint updated successfully!' : `Đã cập nhật mốc: ${activeMilestone.title}!`);
      } else if (activeMilestone.itemType === 'leg_end') {
        await trackingApi.checkInLegArrival(selectedShipmentId, activeMilestone.legId, commonPayload);
        toast.success(isEn ? 'Arrival confirmed safely!' : 'Đã xác nhận đến nơi an toàn!');
      }

      setIsCheckInOpen(false);
      setActiveMilestone(null);
      await loadDetails(selectedShipmentId, true);
    } catch (err: any) {
      const payload = err?.data || err?.response?.data || err;
      const errCode = payload?.code;
      if (errCode === 'OUTSIDE_GEOFENCE') {
        setGeofenceError({
          code: 'OUTSIDE_GEOFENCE',
          distanceM: Number(payload?.distanceM ?? 0),
          radiusM: Number(payload?.radiusM ?? 300),
          message:
            payload?.message ||
            (isEn
              ? 'Current GPS position is outside the allowed geofence radius.'
              : 'Vị trí GPS hiện tại nằm ngoài bán kính cho phép của điểm mốc.'),
        });
        return;
      }
      if (errCode === 'LOW_GPS_ACCURACY') {
        setGeofenceError({
          code: 'LOW_GPS_ACCURACY',
          message:
            payload?.message ||
            (isEn
              ? 'Device GPS accuracy is too low (> 200m). Please move to an open area and retry GPS, or use Manual Check-in with a photo.'
              : 'Độ chính xác GPS thiết bị quá thấp (> 200m). Vui lòng thử lại ở nơi thoáng sóng hoặc chuyển sang Check-in thủ công kèm ảnh.'),
        });
        return;
      }
      if (errCode === 'VITALS_REQUIRED') {
        setVitalsMissingError({
          missingHorses: Array.isArray(payload?.missingHorses) ? payload.missingHorses : [],
          message:
            payload?.message ||
            (isEn
              ? 'Temperature and heart rate vitals are required for all horses before departing.'
              : 'Bắt buộc ghi nhận sinh hiệu cho tất cả ngựa trước khi rời trạm dừng.'),
        });
        return;
      }
      toast.error(err?.message || (isEn ? 'Unable to update milestone.' : 'Không thể cập nhật mốc hành trình.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulatedPing = async () => {
    if (!selectedShipmentId || !liveData?.simulationEnabled || isSendingSimPing) return;
    // Pick coordinates of active stop, or next pending stop, or first leg point
    const targetStop =
      liveData.stops.find((s) => (s.status === 'arrived' || s.status === 'customs_cleared') && s.lat != null && s.lng != null) ||
      liveData.stops.find((s) => s.status === 'pending' && s.lat != null && s.lng != null) ||
      liveData.stops.find((s) => s.lat != null && s.lng != null);
    const polyPoint = liveData.legs.flatMap((l) => l.polyline || [])[0];
    const lat = targetStop?.lat ?? polyPoint?.[0] ?? 10.7769;
    const lng = targetStop?.lng ?? polyPoint?.[1] ?? 106.7009;

    setIsSendingSimPing(true);
    try {
      await trackingApi.sendPositionPings(selectedShipmentId, [
        {
          lat: Number(lat) + (Math.random() - 0.5) * 0.0004,
          lng: Number(lng) + (Math.random() - 0.5) * 0.0004,
          speedKmh: 48,
          accuracyM: 12,
          source: 'simulated',
          recordedAt: new Date().toISOString(),
        },
      ]);
      toast.success(isEn ? 'Simulated GPS ping transmitted!' : 'Đã gửi tọa độ GPS giả lập!');
      await loadDetails(selectedShipmentId, true);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to send simulated ping.' : 'Không thể gửi tọa độ giả lập.'));
    } finally {
      setIsSendingSimPing(false);
    }
  };

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipmentId || isSubmitting) return;
    if (!incidentNotes.trim()) {
      toast.error(isEn ? 'Please describe the incident.' : 'Vui lòng nhập mô tả sự cố.');
      return;
    }
    setIsSubmitting(true);
    try {
      await incidentsApi.createIncident(selectedShipmentId, {
        incidentType,
        severity: incidentSeverity,
        description: incidentNotes.trim(),
        locationText: incidentLocation.trim() || currentMilestone?.location || currentTrip?.origin_location || undefined,
        files: incidentFiles.slice(0, 5),
      });
      toast.success(
        isEn
          ? 'Incident report submitted to Logistics Manager!'
          : 'Đã gửi báo cáo sự cố khẩn cấp tới Logistics Manager!',
      );
      setIsIncidentOpen(false);
      setIncidentNotes('');
      setIncidentLocation('');
      setIncidentFiles([]);
      await loadDetails(selectedShipmentId, true);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to report incident.' : 'Không thể gửi báo cáo sự cố.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitNoShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipmentId || isSubmittingNoShow) return;
    if (!noShowNotes.trim()) {
      toast.error(isEn ? 'Please enter no-show notes.' : 'Vui lòng nhập ghi chú xác nhận khách không giao ngựa.');
      return;
    }
    setIsSubmittingNoShow(true);
    try {
      await markReturnNoShow(selectedShipmentId, {
        notes: noShowNotes.trim(),
        evidenceUrls: noShowEvidenceUrls,
      });
      toast.success(isEn ? 'Return no-show recorded.' : 'Đã ghi nhận No-Show chặng về thành công.');
      setIsNoShowOpen(false);
      setNoShowNotes('');
      setNoShowEvidenceUrls([]);
      setNoShowPreviews([]);
      await loadDetails(selectedShipmentId, true);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to mark no-show.' : 'Không thể ghi nhận No-Show.'));
    } finally {
      setIsSubmittingNoShow(false);
    }
  };

  const driverContact = parseNameAndPhone(trackingDetails?.assignedDriver);
  const escortContact = parseNameAndPhone(trackingDetails?.assignedEscort);

  const tabs: DriverTabItem[] = [
    {
      key: 'milestones',
      label: isEn ? 'Route & Check-in' : 'Lộ trình & Check-in',
      icon: <Crosshair size={14} aria-hidden="true" />,
      badge: milestones.length > 0 ? `${completedMilestoneCount}/${milestones.length}` : undefined,
      badgeTone: currentMilestone ? 'amber' : 'success',
    },
    {
      key: 'map',
      label: isEn ? 'GPS Map' : 'Bản đồ GPS',
      icon: <MapIcon size={14} aria-hidden="true" />,
    },
    {
      key: 'health',
      label: isEn ? 'Horse Health' : 'Sức khỏe ngựa',
      icon: <Stethoscope size={14} aria-hidden="true" />,
      badge: missingVitalsHorses.length > 0 ? missingVitalsHorses.length : trackingDetails?.healthLogs?.length || undefined,
      badgeTone: missingVitalsHorses.length > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'handover',
      label: isEn ? 'Handover' : 'Bàn giao',
      icon: <ClipboardCheck size={14} aria-hidden="true" />,
      badge: canSubmitHandover ? (isEn ? 'Ready' : 'Mở') : undefined,
      badgeTone: 'success',
    },
  ];

  const renderTierBadge = (tier?: string) => {
    if (tier === 'red') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#9E3B3B] text-white">
          {isEn ? 'Red Alert' : 'Cảnh báo đỏ'}
        </span>
      );
    }
    if (tier === 'amber_escalatable') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
          {isEn ? 'Amber Escalate' : 'Cảnh báo vàng'}
        </span>
      );
    }
    if (tier === 'amber_observational') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#FAF8F4] text-[#57564E] border border-[#D8CEBE]">
          {isEn ? 'Observational' : 'Theo dõi'}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#E8F2EB] text-[#2D5A3F]">
        {isEn ? 'Normal' : 'Bình thường'}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5 pb-12 min-w-0">
      {/* Compact Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD0]">
        <div className="flex items-start gap-2.5 min-w-0">
          {showBackToTrips && (
            <Link
              href={`${basePath}/trips`}
              aria-label={isEn ? 'Back to My Trips' : 'Quay lại danh sách chuyến'}
              className="w-10 h-10 rounded-xl border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] flex items-center justify-center text-[#181A17] shrink-0 no-underline"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-black text-sm text-[#A67C2E]">
                {trackingDetails?.requestCode || currentTrip?.request_code || (selectedShipmentId ? `REQ-${String(selectedShipmentId).padStart(3, '0')}` : '—')}
              </span>
              {trackingDetails && (
                <StatusBadge
                  label={translateStatus(trackingDetails.shipmentStatus)}
                  variant={getStatusBadgeVariant(trackingDetails.shipmentStatus)}
                  hasDot={trackingDetails.shipmentStatus === 'in_transit' || trackingDetails.shipmentStatus === 'return_pending'}
                />
              )}
              {trackingDetails?.tripType === 'round_trip' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3EFE4] text-[#181A17] border border-[#D4C5A3]">
                  {isEn ? 'Round-Trip' : 'Khứ hồi'}
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#181A17] m-0 mt-0.5 break-words leading-snug">
              {trackingDetails
                ? `${trackingDetails.origin} → ${trackingDetails.destination}`
                : currentTrip
                ? `${currentTrip.origin_location} → ${currentTrip.destination_location}`
                : isEn
                ? 'Field Trip Console'
                : 'Bảng Điều Hành Chuyến Đi'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {trips.length > 0 && (
            <select
              aria-label={isEn ? 'Select assigned trip' : 'Chọn chuyến đi'}
              value={selectedShipmentId || ''}
              onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
              className="min-h-[42px] max-w-full sm:max-w-[240px] px-3 py-1.5 rounded-xl border border-[#D8CEBE] bg-white text-xs font-bold text-[#181A17] outline-none focus:border-[#A67C2E]"
            >
              {trips.map((tr) => (
                <option key={tr.shipment_id} value={tr.shipment_id}>
                  {tr.request_code} · {translateStatus(tr.shipment_status)}
                </option>
              ))}
            </select>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (selectedShipmentId ? void loadDetails(selectedShipmentId) : void loadTrips())}
            disabled={isRefreshing}
            aria-label={isEn ? 'Refresh' : 'Làm mới'}
            className="min-h-[42px] min-w-[42px] px-3 border-[#D8CEBE] bg-white"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-[#A67C2E]' : 'text-[#181A17]'} aria-hidden="true" />
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!selectedShipmentId}
            onClick={() => setIsIncidentOpen(true)}
            className="min-h-[42px] px-3.5 bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-45"
          >
            <AlertTriangle size={14} className="mr-1.5" aria-hidden="true" />
            <span>{isEn ? 'Report Incident' : 'Báo sự cố'}</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-2">
          <span>{loadError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadTrips()}>
            {isEn ? 'Retry' : 'Thử lại'}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-[#D8CEBE] flex flex-col items-center gap-2.5">
          <RefreshCw size={24} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-xs font-semibold text-[#57564E] m-0">
            {isEn ? 'Loading field trip console...' : 'Đang tải bảng điều hành chuyến...'}
          </p>
        </div>
      ) : !selectedShipmentId || !trackingDetails ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-[#D8CEBE] flex flex-col items-center gap-3">
          <Truck size={32} className="text-[#8A8478]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[#181A17] m-0">
            {isEn ? 'No Trip Selected' : 'Chưa có chuyến đi đang chọn'}
          </h2>
          <Link
            href={`${basePath}/trips`}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#181A17] text-[#F7F7F4] text-xs font-bold inline-flex items-center no-underline"
          >
            {isEn ? 'View My Trips' : 'Xem danh sách chuyến đi'}
          </Link>
        </div>
      ) : (
        <>
          {/* 4-Tab Navigation Bar */}
          <DriverSectionTabs
            tabs={tabs}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as typeof activeTab)}
            ariaLabel={isEn ? 'Trip console sections' : 'Các mục điều hành chuyến'}
          />

          {/* TAB 1: ROUTE & CHECK-IN */}
          {activeTab === 'milestones' && (
            <div className="flex flex-col gap-4 min-w-0">
              {/* ABOVE-THE-FOLD ACTIVE MILESTONE CARD */}
              {!isTripEditable && trackingDetails.shipmentStatus !== 'completed' ? (
                <div className="px-4 py-3 rounded-xl border border-[#DFCA9A] bg-[#FAF5EB] text-xs text-[#7D5310] flex items-center gap-2.5">
                  <AlertTriangle size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="text-[#181A17]">
                      {isEn ? 'Read-Only:' : 'Chỉ xem:'}
                    </strong>{' '}
                    {isEn
                      ? 'Check-in unlocks once trip reaches Ready to Depart.'
                      : 'Check-in mở khóa khi đơn chuyển sang Sẵn sàng xuất phát.'}
                  </span>
                </div>
              ) : currentMilestone ? (
                <div className="rounded-2xl border-2 border-[#A67C2E] bg-gradient-to-br from-[#FAF8F4] via-white to-[#F5EFE2]/60 p-4 sm:p-5 shadow-sm flex flex-col gap-3.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#181A17] text-[#C4B38E] text-[11px] font-extrabold">
                        {isEn
                          ? `ACTIVE MILESTONE #${currentMilestone.seq}/${milestones.length}`
                          : `MỐC HIỆN TẠI #${currentMilestone.seq}/${milestones.length}`}
                      </span>
                      <span className="text-xs font-bold text-[#2D5A3F] tabular-nums">{progressPct}%</span>
                    </div>
                    {currentMilestone.isCustomsBorder && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                        {isEn ? 'Customs / Quarantine' : 'Hải quan / Kiểm dịch'}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-extrabold text-[#181A17] m-0 break-words leading-snug">
                      {currentMilestone.title}
                    </h2>
                    <p className="text-xs text-[#57564E] m-0 mt-1 flex items-start gap-1.5 break-words">
                      <MapPin size={13} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{currentMilestone.location}</span>
                    </p>
                  </div>

                  {!isEscort && (currentMilestone.responsibleRole === 'escort' || currentMilestone.legType === 'flight' || currentMilestone.legType === 'sea') && (
                    <div className="px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-[11px] text-sky-900 flex items-center gap-2">
                      <Info size={13} className="text-sky-700 shrink-0" aria-hidden="true" />
                      <span>
                        {isEn
                          ? 'Escort-owned milestone — driver backup check-in is allowed.'
                          : 'Mốc do Thú y phụ trách — tài xế vẫn có thể check-in hỗ trợ.'}
                      </span>
                    </div>
                  )}

                  {/* Missing vitals notice if at rest/quarantine stop and ready to depart */}
                  {activeStopMeta?.isVitalsRequiredStop &&
                    currentMilestone.allowedActions.includes('depart_stop') &&
                    missingVitalsHorses.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11px] text-amber-900 flex items-start gap-2">
                        <Stethoscope size={14} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          {isEn
                            ? `Vitals required before departure for: ${missingVitalsHorses.map((h) => h.name).join(', ')}.`
                            : `Cần ghi sinh hiệu trước khi rời trạm cho: ${missingVitalsHorses.map((h) => h.name).join(', ')}.`}
                        </span>
                      </div>
                    )}

                  {/* Primary Action Row */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    {currentMilestone.allowedActions.length > 0 && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => handleOpenCheckin(currentMilestone)}
                        className={`min-h-[44px] flex-1 sm:flex-initial px-5 font-extrabold text-xs rounded-xl shadow-sm cursor-pointer ${
                          currentMilestone.itemType === 'leg_start' && currentMilestone.seq === 1
                            ? 'bg-[#2D5A3F] hover:bg-[#234731] text-white'
                            : 'bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4]'
                        }`}
                      >
                        {currentMilestone.itemType === 'leg_start' && currentMilestone.seq === 1 ? (
                          <>
                            <Play size={14} fill="currentColor" className="mr-1.5" aria-hidden="true" />
                            <span>{isEn ? 'Start Trip' : 'Bắt đầu chuyến đi'}</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={15} className="mr-1.5" aria-hidden="true" />
                            <span>{actionLabelMap(currentMilestone.allowedActions[0])}</span>
                          </>
                        )}
                      </Button>
                    )}

                    {(activeStopMeta?.isVitalsRequiredStop || isEscort) && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openQuickHealthModal()}
                        className="min-h-[44px] px-4 rounded-xl border-[#2D5A3F]/40 bg-[#E8F2EB]/60 hover:bg-[#E8F2EB] text-[#1E402C] font-bold text-xs cursor-pointer"
                      >
                        <Stethoscope size={14} className="mr-1.5" aria-hidden="true" />
                        <span>
                          {missingVitalsHorses.length > 0
                            ? isEn
                              ? `Log Vitals (${missingVitalsHorses.length} left)`
                              : `Ghi sinh hiệu (còn ${missingVitalsHorses.length})`
                            : isEn
                            ? 'Log Horse Vitals'
                            : 'Ghi sinh hiệu ngựa'}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              ) : trackingDetails.shipmentStatus === 'completed' ? (
                <div className="p-4 rounded-2xl border border-[#2D5A3F]/30 bg-[#E8F2EB] flex flex-wrap items-center justify-between gap-3 text-xs text-[#1E402C]">
                  <div className="flex items-center gap-2.5 font-bold">
                    <ShieldCheck size={20} className="text-[#2D5A3F] shrink-0" aria-hidden="true" />
                    <span>
                      {isEn
                        ? 'All route milestones completed. Review or submit delivery handover records.'
                        : 'Toàn bộ mốc hành trình đã hoàn tất. Chuyển sang tab Bàn giao để kiểm tra biên bản.'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => setActiveTab('handover')}
                    className="bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold text-xs rounded-xl"
                  >
                    {isEn ? 'Open Handover' : 'Mở biên bản bàn giao'}
                  </Button>
                </div>
              ) : null}

              {/* Compact Crew & Vehicle Strip with clickable tel: links */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 bg-white rounded-xl border border-[#E5DDD0] min-w-0">
                  <span className="text-[10px] font-bold uppercase text-[#747D88] block">
                    {isEn ? 'Vehicle & Distance' : 'Phương tiện & Quãng đường'}
                  </span>
                  <span className="font-bold text-[#181A17] block mt-0.5 truncate">
                    {trackingDetails.assignedVehicle || (isEn ? 'Specialized Vehicle' : 'Xe chuyên dụng')}
                    {trackingDetails.totalDistanceKm ? ` · ${trackingDetails.totalDistanceKm} km` : ''}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#E5DDD0] min-w-0">
                  <span className="text-[10px] font-bold uppercase text-[#747D88] block">
                    {isEn ? 'Driver' : 'Tài xế phụ trách'}
                  </span>
                  <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                    <span className="font-bold text-[#181A17] truncate">
                      {driverContact.name || (isEn ? 'Unassigned' : 'Chưa gán')}
                    </span>
                    {driverContact.phone && (
                      <a
                        href={`tel:${driverContact.phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2D5A3F] hover:underline shrink-0"
                      >
                        <Phone size={11} aria-hidden="true" />
                        {driverContact.phone}
                      </a>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#E5DDD0] min-w-0">
                  <span className="text-[10px] font-bold uppercase text-[#747D88] block">
                    {isEn ? 'Vet / Escort' : 'Thú y / Áp tải'}
                  </span>
                  <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                    <span className="font-bold text-[#181A17] truncate">
                      {escortContact.name || (isEn ? 'Unassigned' : 'Chưa gán')}
                    </span>
                    {escortContact.phone && (
                      <a
                        href={`tel:${escortContact.phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2D5A3F] hover:underline shrink-0"
                      >
                        <Phone size={11} aria-hidden="true" />
                        {escortContact.phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Vertical Timeline with collapsed pre_trip & exact milestoneId binding */}
              <div className="bg-white rounded-2xl border border-[#D8CEBE] p-4 sm:p-6 shadow-sm min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[#EAE5DA]">
                  <h2 className="text-sm sm:text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                    <Crosshair size={18} className="text-[#A67C2E]" aria-hidden="true" />
                    <span>{isEn ? 'Full Journey Timeline' : 'Tiến Độ Lộ Trình Chi Tiết'}</span>
                  </h2>
                  <span className="text-xs font-bold text-[#57564E] tabular-nums">
                    {completedMilestoneCount}/{milestones.length}{' '}
                    {isEn ? 'milestones done' : 'mốc hoàn tất'} ({progressPct}%)
                  </span>
                </div>

                <VerticalTimeline
                  items={timelineItems}
                  viewer="driver"
                  collapsePreTripWhenDone
                  emptyText={
                    isEn
                      ? 'No transit milestones configured for this shipment.'
                      : 'Chưa có chặng và trạm dừng nào được cấu hình cho chuyến này.'
                  }
                  renderCurrentActions={(item) => {
                    if (item.group === 'pre_trip' || item.group === 'post_trip') return null;
                    const matched = item.milestoneId
                      ? milestones.find((x) => x.id === item.milestoneId)
                      : milestones.find((x) => x.id === item.id) ||
                        milestones.find((x) => x.status === 'CURRENT');

                    if (!matched || !isTripEditable || matched.allowedActions.length === 0) return null;

                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenCheckin(matched)}
                          className="min-h-[42px] px-4 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] font-bold text-xs cursor-pointer"
                        >
                          <CheckCircle2 size={14} className="mr-1.5 text-[#C4B38E]" aria-hidden="true" />
                          <span>{actionLabelMap(matched.allowedActions[0])}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsIncidentOpen(true)}
                          className="min-h-[42px] px-3.5 rounded-xl border-[#9E3B3B]/40 text-[#9E3B3B] hover:bg-rose-50 font-bold text-xs cursor-pointer"
                        >
                          <AlertTriangle size={14} className="mr-1" aria-hidden="true" />
                          <span>{isEn ? 'Incident' : 'Báo sự cố'}</span>
                        </Button>
                      </div>
                    );
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 2: LIVE GPS MAP */}
          {activeTab === 'map' && (
            <div className="bg-white rounded-2xl border border-[#D8CEBE] p-4 sm:p-5 shadow-sm flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                    <MapIcon size={18} className="text-[#A67C2E]" aria-hidden="true" />
                    <span>{isEn ? 'Live GPS Telemetry & Geofences' : 'Bản Đồ Định Vị GPS & Vùng Kiểm Soát'}</span>
                  </h2>
                  <p className="text-xs text-[#57564E] m-0 mt-0.5">
                    {isEn
                      ? 'Shows planned route legs, stop geofences, and real-time vehicle coordinates.'
                      : 'Hiển thị lộ trình dự kiến, vùng kiểm soát trạm dừng và vị trí phương tiện trực tiếp.'}
                  </p>
                </div>

                {liveData?.simulationEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSendingSimPing}
                    onClick={() => void handleSimulatedPing()}
                    className="min-h-[42px] px-3.5 rounded-xl border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs cursor-pointer"
                  >
                    <Radio size={14} className={`mr-1.5 ${isSendingSimPing ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    <span>
                      {isSendingSimPing
                        ? isEn ? 'Transmitting...' : 'Đang phát...'
                        : isEn ? 'Send Simulated GPS Ping' : 'Phát tọa độ GPS giả lập'}
                    </span>
                  </Button>
                )}
              </div>

              {syncedLiveData ? (
                <LiveTrackingMap liveData={syncedLiveData} height="440px" autoCenter />
              ) : (
                <div className="p-10 text-center bg-[#FAF8F4] rounded-xl border border-dashed border-[#D8CEBE] text-xs text-[#57564E]">
                  {isEn
                    ? 'GPS telemetry is not available for this shipment yet.'
                    : 'Chưa có dữ liệu định vị GPS trực tuyến cho chuyến đi này.'}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HORSE HEALTH */}
          {activeTab === 'health' && (
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-[#D8CEBE] p-4 sm:p-5 shadow-sm flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                      <Stethoscope size={18} className="text-[#2D5A3F]" aria-hidden="true" />
                      <span>{isEn ? 'Equine Vitals & Health Logs' : 'Sinh Hiệu & Nhật Ký Sức Khỏe Ngựa'}</span>
                    </h2>
                    <p className="text-xs text-[#57564E] m-0 mt-0.5">
                      {isEn
                        ? 'Log body temperature, heart rate, and respiratory rate for every horse.'
                        : 'Ghi nhận thân nhiệt, nhịp tim và nhịp thở cho từng cá thể ngựa trên chuyến.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={!isTripEditable || trackingDetails.assignedHorses.length === 0}
                      onClick={() => openQuickHealthModal()}
                      className="min-h-[42px] px-4 rounded-xl bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold text-xs cursor-pointer disabled:opacity-45"
                    >
                      <Stethoscope size={14} className="mr-1.5" aria-hidden="true" />
                      <span>{isEn ? 'Log Vitals' : 'Ghi sinh hiệu mới'}</span>
                    </Button>
                    <Link
                      href={`${basePath}/health?shipmentId=${selectedShipmentId}`}
                      className="min-h-[42px] px-3.5 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] hover:bg-[#F3EFE4] text-[#181A17] text-xs font-bold inline-flex items-center no-underline"
                    >
                      {isEn ? 'Full Health Dossier →' : 'Trang hồ sơ đầy đủ →'}
                    </Link>
                  </div>
                </div>

                {/* Per-horse checklist status at current rest/quarantine stop */}
                {trackingDetails.assignedHorses.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {trackingDetails.assignedHorses.map((horse) => {
                      const isMissingAtStop = missingVitalsHorses.some((mh) => mh.id === horse.id);
                      const latestForHorse = (trackingDetails.healthLogs || []).find(
                        (l) => l.horseId === horse.id || l.horseName === horse.name,
                      );
                      return (
                        <div
                          key={horse.id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                            isMissingAtStop
                              ? 'border-amber-300 bg-amber-50/70'
                              : 'border-[#E5DDD0] bg-[#FAF8F4]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <strong className="text-sm text-[#181A17]">{horse.name}</strong>
                              {activeStopMeta?.isVitalsRequiredNow && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isMissingAtStop
                                      ? 'bg-amber-200 text-amber-900'
                                      : 'bg-[#E8F2EB] text-[#2D5A3F]'
                                  }`}
                                >
                                  {isMissingAtStop
                                    ? isEn ? 'Vitals Pending' : 'Chưa ghi tại trạm'
                                    : isEn ? 'Vitals OK' : 'Đã ghi tại trạm'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#57564E] mt-1 flex flex-wrap gap-2">
                              {latestForHorse ? (
                                <>
                                  <span>{latestForHorse.temperatureC != null ? `${latestForHorse.temperatureC}°C` : '—'}</span>
                                  <span>·</span>
                                  <span>{latestForHorse.heartRateBpm != null ? `${latestForHorse.heartRateBpm} bpm` : '—'}</span>
                                  {latestForHorse.respiratoryRateBpm != null && (
                                    <>
                                      <span>·</span>
                                      <span>{latestForHorse.respiratoryRateBpm} {isEn ? 'rpm' : 'lần/p'}</span>
                                    </>
                                  )}
                                </>
                              ) : (
                                <span>{isEn ? 'No vitals logged yet' : 'Chưa có nhật ký sinh hiệu'}</span>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!isTripEditable}
                            onClick={() => openQuickHealthModal(horse.id)}
                            className="min-h-[38px] px-3 rounded-lg border-[#D8CEBE] bg-white text-xs font-bold shrink-0"
                          >
                            {isEn ? 'Log' : 'Ghi'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Recent Health Logs */}
                <div className="flex flex-col gap-2.5">
                  {(trackingDetails.healthLogs || []).length === 0 ? (
                    <p className="text-xs text-[#747D88] text-center py-6 m-0">
                      {isEn ? 'No health records logged for this trip yet.' : 'Chưa có bản ghi sức khỏe nào cho chuyến này.'}
                    </p>
                  ) : (
                    trackingDetails.healthLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3.5 rounded-xl border border-[#E5DDD0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-[#181A17]">{log.horseName}</strong>
                            <span className="px-2 py-0.5 rounded bg-[#FAF8F4] border border-[#E5DDD0] font-semibold text-[11px]">
                              {translateCondition(log.conditionStatus)}
                            </span>
                            {renderTierBadge(log.alertTier)}
                          </div>
                          {log.notes && <p className="text-[#57564E] m-0 mt-1 break-words">{log.notes}</p>}
                          {log.attachments && log.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1.5">
                              {log.attachments.map((att, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => void openAuthenticatedApiFile(att)}
                                  className="text-[11px] font-bold text-[#A67C2E] hover:underline bg-transparent border-0 p-0 cursor-pointer"
                                >
                                  {isEn ? `Photo #${idx + 1}` : `Ảnh #${idx + 1}`}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="sm:text-right shrink-0">
                          <span className="font-bold text-[#181A17] block">
                            {log.temperatureC != null ? `${log.temperatureC}°C` : '—'} ·{' '}
                            {log.heartRateBpm != null ? `${log.heartRateBpm} bpm` : '—'}
                            {log.respiratoryRateBpm != null ? ` · ${log.respiratoryRateBpm} rpm` : ''}
                          </span>
                          <span className="text-[11px] text-[#747D88] block">
                            {new Date(log.recordedAt).toLocaleString(isEn ? 'en-US' : 'vi-VN')}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: HANDOVER & NO-SHOW */}
          {activeTab === 'handover' && (
            <div className="flex flex-col gap-4">
              <DeliveryHandoverPanel
                role="driver"
                shipmentId={selectedShipmentId}
                shipmentStatus={trackingDetails.shipmentStatus}
                assignedHorses={trackingDetails.assignedHorses}
                canSubmitHandover={canSubmitHandover}
              />

              {/* Return Leg No-Show Card (Round-trip only) */}
              {trackingDetails.tripType === 'round_trip' &&
                trackingDetails.returnStatus !== 'completed' &&
                trackingDetails.returnStatus !== 'no_show' && (
                  <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/50 p-5 shadow-sm flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-rose-600" aria-hidden="true" />
                        <h3 className="text-sm font-bold text-rose-950 m-0">
                          {isEn
                            ? 'Return Leg — Customer No-Show'
                            : 'Chặng Về — Khách Không Giao Ngựa (No-Show)'}
                        </h3>
                      </div>
                      {trackingDetails.returnDepartureAt && (
                        <span className="text-xs font-semibold text-rose-800">
                          {isEn ? 'Scheduled pickup:' : 'Giờ đón chặng về:'}{' '}
                          {new Date(trackingDetails.returnDepartureAt).toLocaleString(isEn ? 'en-US' : 'vi-VN')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-rose-900 m-0 leading-relaxed">
                      {isEn
                        ? `Wait at least ${trackingDetails.returnWaitMinutes ?? 120} minutes at the return pickup location before marking no-show with photo evidence.`
                        : `Cần chờ tối thiểu ${trackingDetails.returnWaitMinutes ?? 120} phút tại điểm đón chặng về và chụp ảnh minh chứng trước khi xác nhận No-Show.`}
                    </p>
                    {(() => {
                      const depTime = trackingDetails.returnDepartureAt
                        ? new Date(trackingDetails.returnDepartureAt).getTime()
                        : 0;
                      const waitMs = (trackingDetails.returnWaitMinutes ?? 120) * 60 * 1000;
                      const allowedAtTime = depTime + waitMs;
                      const isAllowed = Boolean(depTime && Date.now() >= allowedAtTime);
                      const allowedStr = depTime
                        ? new Date(allowedAtTime).toLocaleString(isEn ? 'en-US' : 'vi-VN')
                        : '—';

                      return (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rose-200">
                          <span className="text-xs font-semibold text-rose-700">
                            {isAllowed
                              ? isEn
                                ? 'Wait period passed. Ready to report no-show.'
                                : 'Đã đủ thời gian chờ tối thiểu.'
                              : isEn
                              ? `Allowed after: ${allowedStr}`
                              : `Được phép đánh No-Show sau: ${allowedStr}`}
                          </span>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={!isAllowed}
                            onClick={() => setIsNoShowOpen(true)}
                            className="min-h-[42px] px-4 rounded-xl text-xs font-bold"
                          >
                            <AlertTriangle size={14} className="mr-1.5" aria-hidden="true" />
                            <span>{isEn ? 'Mark Return No-Show' : 'Xác nhận No-Show chặng về'}</span>
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                )}
            </div>
          )}
        </>
      )}

      {/* MODAL 1: CHECK-IN MILESTONE (with GPS + Direct Camera/File Upload for Manual Check-in) */}
      {isCheckInOpen && activeMilestone && (
        <Modal
          isOpen={isCheckInOpen}
          onClose={closeCheckInModal}
          closeDisabled={isSubmitting || isUploadingEvidence}
          title={
            activeMilestone.itemType === 'leg_start' && activeMilestone.seq === 1
              ? isEn
                ? 'Start Trip at Pickup Location'
                : 'Bắt đầu chuyến đi tại điểm đón'
              : isEn
              ? `Check-in Milestone #${activeMilestone.seq}`
              : `Check-in Mốc #${activeMilestone.seq}`
          }
          maxWidth="520px"
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-[#FAF8F4] border border-[#D8CEBE] rounded-xl text-[#181A17]">
              <strong className="block text-sm mb-1">{activeMilestone.title}</strong>
              <p className="m-0 text-[#57564E]">
                {activeMilestone.location} ·{' '}
                {currentUser?.fullName || currentUser?.name || ''} ({translateRole(isEscort ? 'escort' : 'driver')})
              </p>
              {activeMilestone.itemType === 'stop' && activeMilestone.stopId && (() => {
                const liveStop = liveData?.stops?.find(
                  (s) => Number(s.routeStopId ?? s.stopId) === Number(activeMilestone.stopId),
                );
                if (!liveStop) return null;
                const hasStopCoords = liveStop.lat != null && liveStop.lng != null;
                const radiusM = liveStop.geofenceRadiusM || 300;
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {hasStopCoords ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                        <MapPin size={11} aria-hidden="true" />
                        {isEn
                          ? `GPS Geofence active (${radiusM}m radius)`
                          : `Đối chiếu GPS Geofence (bán kính ${radiusM}m)`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                        <AlertTriangle size={11} aria-hidden="true" />
                        {isEn
                          ? 'Stop has no GPS coordinates — check-in will be flagged for verification'
                          : 'Trạm chưa có tọa độ GPS — check-in sẽ được gắn cờ xác minh'}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {activeMilestone.itemType === 'stop' && activeMilestone.allowedActions.length > 1 && (
              <div>
                <p className="font-bold text-[#181A17] mb-1.5 uppercase tracking-wider text-[11px] m-0">
                  {isEn ? 'Select checkpoint action *' : 'Chọn thao tác tại trạm *'}
                </p>
                <div className="flex flex-col gap-2">
                  {activeMilestone.allowedActions.map((act) => (
                    <label
                      key={act}
                      className={`p-3 min-h-[44px] rounded-xl border flex items-center gap-2.5 cursor-pointer font-bold ${
                        selectedAction === act
                          ? 'border-[#A67C2E] bg-[#FAF5EB] text-[#181A17]'
                          : 'border-[#D8CEBE] bg-white text-[#57564E]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="console_milestone_action"
                        checked={selectedAction === act}
                        onChange={() => setSelectedAction(act)}
                        className="accent-[#A67C2E]"
                      />
                      <span>{actionLabelMap(act)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="console-checkin-notes" className="font-bold text-[#181A17] block mb-1">
                {isEn ? 'Field notes (optional)' : 'Ghi chú thực địa (tùy chọn)'}
              </label>
              <textarea
                id="console-checkin-notes"
                rows={2}
                value={checkInNotes}
                onChange={(e) => setCheckInNotes(e.target.value)}
                placeholder={
                  isEn
                    ? 'e.g. Horses calm, trailer AC 18°C...'
                    : 'VD: Ngựa ổn định, nhiệt độ thùng xe duy trì 18°C...'
                }
                className="w-full px-3 py-2 border border-[#D8CEBE] rounded-xl outline-none focus:border-[#A67C2E] text-xs"
              />
            </div>

            {geofenceError && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-col gap-2 text-amber-900">
                <div className="flex items-start gap-2 font-bold">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    {geofenceError.code === 'LOW_GPS_ACCURACY'
                      ? isEn ? 'Low GPS Accuracy' : 'Tín hiệu GPS kém chính xác'
                      : isEn ? 'Outside Geofence Radius' : 'Ngoài bán kính định vị (Geofence)'}
                  </span>
                </div>
                <p className="m-0">{geofenceError.message}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setGeofenceError(null)}>
                    {isEn ? 'Retry GPS' : 'Thử lại GPS'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setGeofenceError(null);
                      setUseManualCheckIn(true);
                    }}
                    className="bg-[#A67C2E] text-white"
                  >
                    {isEn ? 'Manual Check-in + Photo' : 'Check-in thủ công + Ảnh'}
                  </Button>
                </div>
              </div>
            )}

            {vitalsMissingError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex flex-col gap-2 text-rose-900">
                <div className="flex items-start gap-2 font-bold">
                  <Stethoscope size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{isEn ? 'Mandatory Vitals Required' : 'Bắt buộc ghi sinh hiệu trước khi rời trạm'}</span>
                </div>
                <p className="m-0">
                  {vitalsMissingError.message}{' '}
                  {vitalsMissingError.missingHorses.length > 0 && (
                    <strong>({vitalsMissingError.missingHorses.map((h) => h.name).join(', ')})</strong>
                  )}
                </p>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setIsCheckInOpen(false);
                      openQuickHealthModal(vitalsMissingError.missingHorses[0]?.id, activeMilestone.stopId ?? undefined);
                    }}
                  >
                    {isEn ? 'Record Vitals Now' : 'Ghi sinh hiệu ngay'}
                  </Button>
                </div>
              </div>
            )}

            {/* GPS vs Manual Check-in with Camera/File Upload */}
            {useManualCheckIn ? (
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between font-bold text-amber-900">
                  <span>{isEn ? 'Manual Check-in (Photo Required)' : 'Check-in thủ công (Cần ảnh minh chứng)'}</span>
                  <button
                    type="button"
                    onClick={() => setUseManualCheckIn(false)}
                    className="text-xs text-[#A67C2E] underline bg-transparent border-0 cursor-pointer"
                  >
                    {isEn ? 'Use GPS' : 'Dùng lại GPS'}
                  </button>
                </div>

                <div>
                  <label htmlFor="console-manual-reason" className="font-bold text-[#181A17] block mb-1">
                    {isEn ? 'Reason (min 10 chars) *' : 'Lý do giải trình (tối thiểu 10 ký tự) *'}
                  </label>
                  <textarea
                    id="console-manual-reason"
                    rows={2}
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    placeholder={
                      isEn
                        ? 'e.g. Weak GPS signal near border warehouse...'
                        : 'VD: Mất sóng GPS tại khu vực kiểm dịch cửa khẩu...'
                    }
                    className="w-full px-3 py-2 border border-[#D8CEBE] rounded-xl bg-white outline-none focus:border-[#A67C2E] text-xs"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="font-bold text-[#181A17]">
                    {isEn ? 'Field Evidence Photo *' : 'Ảnh minh chứng thực địa *'}
                  </span>
                  <label className="min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[#A67C2E] bg-white hover:bg-[#FAF8F4] text-[#181A17] font-bold cursor-pointer">
                    <Camera size={15} className="text-[#A67C2E]" aria-hidden="true" />
                    <span>
                      {isUploadingEvidence
                        ? isEn ? 'Uploading photo...' : 'Đang tải ảnh lên...'
                        : evidenceUrl
                        ? isEn ? 'Retake / Replace Photo' : 'Chụp lại / Đổi ảnh khác'
                        : isEn ? 'Take Photo or Choose Image' : 'Chụp ảnh hoặc chọn từ máy'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={isUploadingEvidence}
                      onChange={(e) => {
                        void handleUploadEvidenceFile(e.target.files);
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>

                  {evidencePreview && (
                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white border border-[#D8CEBE]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={evidencePreview} alt="Evidence preview" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      <span className="text-[11px] font-semibold text-[#2D5A3F] flex-1">
                        {isEn ? 'Photo ready for submission' : 'Ảnh minh chứng đã sẵn sàng'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEvidenceUrl('');
                          setEvidencePreview(null);
                        }}
                        aria-label={isEn ? 'Remove photo' : 'Xóa ảnh'}
                        className="p-1 text-[#747D88] hover:text-rose-600 bg-transparent border-0 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[#5F6977]">
                <span>
                  {isGettingGps
                    ? isEn ? 'Acquiring GPS coordinates...' : 'Đang lấy tọa độ GPS thiết bị...'
                    : isEn ? 'Coordinates will be captured automatically via GPS' : 'Tọa độ sẽ được lấy tự động qua GPS thiết bị'}
                </span>
                <button
                  type="button"
                  onClick={() => setUseManualCheckIn(true)}
                  className="text-xs font-bold text-[#A67C2E] underline bg-transparent border-0 cursor-pointer"
                >
                  {isEn ? 'Manual check-in?' : 'Check-in thủ công?'}
                </button>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-[#EAE5DA]">
              <Button type="button" variant="outline" onClick={closeCheckInModal} disabled={isSubmitting}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleConfirmCheckin()}
                disabled={isSubmitting || isUploadingEvidence}
                className="min-h-[44px] px-5 bg-[#181A17] hover:bg-[#2C2F2A] text-white font-bold"
              >
                {isSubmitting
                  ? isEn ? 'Submitting...' : 'Đang lưu...'
                  : actionLabelMap(selectedAction || activeMilestone.allowedActions[0] || 'arrive_stop')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: QUICK HORSE VITALS LOG (with respiratoryRate & routeStopId) */}
      {isQuickHealthOpen && (
        <Modal
          isOpen={isQuickHealthOpen}
          onClose={() => !isSavingHealth && setIsQuickHealthOpen(false)}
          closeDisabled={isSavingHealth}
          title={isEn ? 'Record Equine Vitals' : 'Ghi Nhận Sinh Hiệu Ngựa'}
          maxWidth="500px"
        >
          <form onSubmit={handleSaveQuickHealth} className="flex flex-col gap-3.5 text-xs">
            {(trackingDetails?.assignedHorses || []).length > 0 && (
              <div>
                <label htmlFor="console-health-horse" className="font-bold text-[#181A17] block mb-1">
                  {isEn ? 'Horse *' : 'Chiến mã *'}
                </label>
                <select
                  id="console-health-horse"
                  value={healthHorseId}
                  onChange={(e) => setHealthHorseId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] bg-white font-semibold"
                >
                  {(trackingDetails?.assignedHorses || []).map((h) => (
                    <option key={h.id} value={String(h.id)}>
                      {h.name} {h.microchipNo ? `(${h.microchipNo})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="console-health-cond" className="font-bold text-[#181A17] block mb-1">
                {isEn ? 'Clinical Condition *' : 'Tình trạng lâm sàng *'}
              </label>
              <select
                id="console-health-cond"
                value={healthCondition}
                onChange={(e) => setHealthCondition(e.target.value as typeof healthCondition)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] bg-white font-semibold"
              >
                <option value="stable">{translateCondition('stable')}</option>
                <option value="not_eating">{translateCondition('not_eating')}</option>
                <option value="stressed">{translateCondition('stressed')}</option>
                <option value="climate_change">{translateCondition('climate_change')}</option>
                <option value="other">{translateCondition('other')}</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="console-health-temp" className="font-bold text-[#181A17] block mb-1 flex items-center gap-1">
                  <Thermometer size={12} className="text-[#A67C2E]" />
                  <span>{isEn ? 'Temp (°C)' : 'Thân nhiệt'}</span>
                </label>
                <input
                  id="console-health-temp"
                  type="text"
                  inputMode="decimal"
                  required
                  value={healthTemp}
                  onChange={(e) => setHealthTemp(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] font-bold"
                />
              </div>
              <div>
                <label htmlFor="console-health-hr" className="font-bold text-[#181A17] block mb-1 flex items-center gap-1">
                  <Heart size={12} className="text-rose-600" />
                  <span>{isEn ? 'HR (bpm)' : 'Nhịp tim'}</span>
                </label>
                <input
                  id="console-health-hr"
                  type="text"
                  inputMode="numeric"
                  required
                  value={healthHr}
                  onChange={(e) => setHealthHr(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] font-bold"
                />
              </div>
              <div>
                <label htmlFor="console-health-resp" className="font-bold text-[#181A17] block mb-1 flex items-center gap-1">
                  <Wind size={12} className="text-sky-600" />
                  <span>{isEn ? 'Resp (/m)' : 'Nhịp thở'}</span>
                </label>
                <input
                  id="console-health-resp"
                  type="text"
                  inputMode="numeric"
                  value={healthResp}
                  onChange={(e) => setHealthResp(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] font-bold"
                />
              </div>
            </div>

            <div>
              <label htmlFor="console-health-notes" className="font-bold text-[#181A17] block mb-1">
                {isEn ? 'Observations (optional)' : 'Ghi chú quan sát (tùy chọn)'}
              </label>
              <textarea
                id="console-health-notes"
                rows={2}
                value={healthNotes}
                onChange={(e) => setHealthNotes(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#D8CEBE] text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE5DA]">
              <Button type="button" variant="outline" onClick={() => setIsQuickHealthOpen(false)} disabled={isSavingHealth}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSavingHealth}
                className="min-h-[44px] px-5 bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold"
              >
                {isSavingHealth ? (isEn ? 'Saving...' : 'Đang lưu...') : isEn ? 'Save Vitals' : 'Lưu sinh hiệu'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: UNIFIED FLOW 5 INCIDENT REPORT */}
      {isIncidentOpen && (
        <Modal
          isOpen={isIncidentOpen}
          onClose={() => !isSubmitting && setIsIncidentOpen(false)}
          closeDisabled={isSubmitting}
          title={isEn ? 'Report Route / Equine Incident' : 'Báo Cáo Sự Cố Thực Địa'}
          maxWidth="520px"
        >
          <form onSubmit={handleReportIncident} className="flex flex-col gap-3.5 text-xs">
            <div className="p-3 rounded-xl bg-rose-50 border border-[#9E3B3B]/30 text-rose-900">
              {isEn
                ? 'Immediately notifies Logistics Manager to coordinate backup transport, detour approval, or veterinary rescue.'
                : 'Thông báo trực tiếp tới Logistics Manager để điều phối xe thay thế, duyệt tuyến vòng tránh hoặc hỗ trợ thú y khẩn cấp.'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="console-inc-type" className="font-bold text-[#181A17] block mb-1">
                  {isEn ? 'Incident Type *' : 'Loại sự cố *'}
                </label>
                <select
                  id="console-inc-type"
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] bg-white font-semibold"
                >
                  <option value="traffic_delay">{translateIncident('traffic_delay')}</option>
                  <option value="vehicle_breakdown">{translateIncident('vehicle_breakdown')}</option>
                  <option value="weather">{translateIncident('weather')}</option>
                  <option value="border_issue">{translateIncident('border_issue')}</option>
                  <option value="horse_medical">{translateIncident('horse_medical')}</option>
                  <option value="other">{translateIncident('other')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="console-inc-sev" className="font-bold text-[#181A17] block mb-1">
                  {isEn ? 'Severity *' : 'Mức độ *'}
                </label>
                <select
                  id="console-inc-sev"
                  value={incidentSeverity}
                  onChange={(e) => setIncidentSeverity(e.target.value as typeof incidentSeverity)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] bg-white font-semibold"
                >
                  <option value="critical">{isEn ? 'Critical' : 'Khẩn cấp'}</option>
                  <option value="high">{isEn ? 'High' : 'Cao'}</option>
                  <option value="medium">{isEn ? 'Medium' : 'Trung bình'}</option>
                  <option value="low">{isEn ? 'Low' : 'Thấp'}</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="console-inc-loc" className="font-bold text-[#181A17] block mb-1">
                {isEn ? 'Current Location' : 'Vị trí hiện tại'}
              </label>
              <input
                id="console-inc-loc"
                type="text"
                value={incidentLocation}
                onChange={(e) => setIncidentLocation(e.target.value)}
                placeholder={currentMilestone?.location || (isEn ? 'Km / Highway / Checkpoint' : 'Km / Quốc lộ / Cửa khẩu')}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE]"
              />
            </div>

            <div>
              <label htmlFor="console-inc-desc" className="font-bold text-[#181A17] block mb-1">
                {isEn ? 'Incident Description *' : 'Mô tả tình huống *'}
              </label>
              <textarea
                id="console-inc-desc"
                rows={3}
                required
                value={incidentNotes}
                onChange={(e) => setIncidentNotes(e.target.value)}
                placeholder={
                  isEn
                    ? 'Describe road blockage, vehicle issue, or horse condition...'
                    : 'Mô tả tình trạng xe, tắc đường hoặc dấu hiệu bất thường của ngựa...'
                }
                className="w-full p-3 rounded-xl border border-[#D8CEBE]"
              />
            </div>

            <div>
              <label className="font-bold text-[#181A17] block mb-1">
                {isEn ? 'Evidence Photos (optional, max 5)' : 'Ảnh minh chứng (tùy chọn, tối đa 5 ảnh)'}
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={(e) => setIncidentFiles(Array.from(e.target.files || []).slice(0, 5))}
                className="block w-full text-xs text-[#57564E]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE5DA]">
              <Button type="button" variant="outline" onClick={() => setIsIncidentOpen(false)} disabled={isSubmitting}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={isSubmitting}
                className="min-h-[44px] px-5 font-bold"
              >
                {isSubmitting ? (isEn ? 'Submitting...' : 'Đang gửi...') : isEn ? 'Submit Incident' : 'Gửi báo cáo sự cố'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 4: RETURN NO-SHOW WITH CAMERA / FILE UPLOAD */}
      {isNoShowOpen && selectedShipmentId && (
        <Modal
          isOpen={isNoShowOpen}
          onClose={() => !isSubmittingNoShow && setIsNoShowOpen(false)}
          closeDisabled={isSubmittingNoShow || isUploadingNoShow}
          title={isEn ? 'Confirm Return Leg No-Show' : 'Xác Nhận Khách Không Giao Ngựa (No-Show)'}
          maxWidth="500px"
        >
          <form onSubmit={handleSubmitNoShow} className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 leading-relaxed">
              {isEn
                ? 'This will close the shipment as completed with return status set to No-Show. Please attach on-site photo evidence.'
                : 'Thao tác này sẽ đóng chuyến với trạng thái No-Show chặng về. Vui lòng chụp hoặc tải ảnh minh chứng tại điểm đón.'}
            </div>

            <div>
              <label htmlFor="console-noshow-notes" className="font-bold text-[#181A17] block mb-1">
                {isEn ? 'Detailed Notes *' : 'Ghi chú tình huống *'}
              </label>
              <textarea
                id="console-noshow-notes"
                rows={3}
                required
                value={noShowNotes}
                onChange={(e) => setNoShowNotes(e.target.value)}
                placeholder={
                  isEn
                    ? 'Arrived on time, contacted customer multiple times, waited full 120 minutes...'
                    : 'Đến đúng giờ đón, đã liên hệ khách nhiều lần và chờ đủ 120 phút...'
                }
                className="w-full p-2.5 rounded-xl border border-[#D8CEBE]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-bold text-[#181A17]">
                {isEn ? 'On-site Evidence Photos (max 5)' : 'Ảnh minh chứng tại điểm đón (tối đa 5 ảnh)'}
              </span>
              <label className="min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-rose-400 bg-rose-50/40 hover:bg-rose-50 text-rose-900 font-bold cursor-pointer">
                <Camera size={15} aria-hidden="true" />
                <span>
                  {isUploadingNoShow
                    ? isEn ? 'Uploading...' : 'Đang tải ảnh...'
                    : isEn ? 'Take Photo / Upload Image' : 'Chụp ảnh / Chọn ảnh từ máy'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  disabled={isUploadingNoShow}
                  onChange={(e) => {
                    void handleUploadNoShowFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="sr-only"
                />
              </label>

              {noShowPreviews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {noShowPreviews.map((src, idx) => (
                    <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#D8CEBE]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`No-show evidence ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setNoShowEvidenceUrls((prev) => prev.filter((_, i) => i !== idx));
                          setNoShowPreviews((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        aria-label={isEn ? 'Remove photo' : 'Xóa ảnh'}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center border-0 cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE5DA]">
              <Button type="button" variant="outline" onClick={() => setIsNoShowOpen(false)} disabled={isSubmittingNoShow}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={isSubmittingNoShow || isUploadingNoShow}
                className="min-h-[44px] px-5 font-bold"
              >
                {isSubmittingNoShow ? (isEn ? 'Submitting...' : 'Đang xử lý...') : isEn ? 'Confirm No-Show' : 'Xác nhận No-Show'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
