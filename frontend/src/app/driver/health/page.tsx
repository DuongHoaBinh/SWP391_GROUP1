'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  Stethoscope,
  Plus,
  Thermometer,
  Heart,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  Image as ImageIcon,
  MapPin,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getCurrentUser } from '@/lib/auth';
import { openAuthenticatedApiFile } from '@/lib/api-client';
import { routesApi } from '@/features/routes/api/routes.api';
import {
  trackingApi,
  AssignedTripSummary,
  EquineVitalConfigItem,
  TripTrackingDetails,
} from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';

const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const HTTP_URL_REGEX = /^https?:\/\/.+/i;

const DEFAULT_VITAL_CFG: EquineVitalConfigItem = {
  configName: 'Default Equine Transport Vitals v3.1',
  tempGreenMin: 37.5,
  tempGreenMax: 38.5,
  tempAmberLowMin: 37.0,
  tempAmberHighMax: 39.3,
  hrGreenMin: 28,
  hrGreenMax: 44,
  hrAmberLowMin: 24,
  hrAmberHighMax: 60,
  consecutiveAlertWindowHours: 6,
  escalatableConditions: ['not_eating', 'stressed'],
  observationalConditions: ['climate_change', 'other'],
};

export default function HorseHealthPage() {
  const pathname = usePathname();
  const { t, language, translateStatus, translateCondition, translateBreed, translateRole } = useLanguage();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Flow 5 Emergency Incident modal
  const [isIncidentOpen, setIsIncidentOpen] = useState(false);
  const [incidentNotes, setIncidentNotes] = useState('');

  // Attachment URL input ref & state
  const [urlDraft, setUrlDraft] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [vitalConfig, setVitalConfig] = useState<EquineVitalConfigItem>(DEFAULT_VITAL_CFG);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [photoPreviewMap, setPhotoPreviewMap] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<string[]>([]);

  // Form state (tempC & heartRateBpm stored as strings for clean mobile editing)
  const [formData, setFormData] = useState<{
    horseName: string;
    horseId: number | undefined;
    legName: string;
    conditionStatus: 'stable' | 'not_eating' | 'stressed' | 'climate_change' | 'other';
    tempC: string;
    heartRateBpm: string;
    notes: string;
    attachments: string[];
  }>({
    horseName: '',
    horseId: undefined,
    legName: '',
    conditionStatus: 'stable',
    tempC: '38.0',
    heartRateBpm: '40',
    notes: '',
    attachments: [],
  });

  const isEscort =
    currentUser?.persona === 'escort' ||
    currentUser?.specialization === 'escort' ||
    currentUser?.email?.toLowerCase().includes('escort') ||
    Boolean(pathname?.startsWith('/escort'));

  const canRecordHealth = Boolean(
    currentUser &&
      (isEscort ||
        currentUser.persona === 'driver' ||
        currentUser.specialization === 'driver' ||
        String(currentUser.role || '').toUpperCase().includes('DRIVER') ||
        String(currentUser.role || '').toUpperCase().includes('ESCORT')),
  );

  const loadTrips = useCallback(async () => {
    setIsLoadingTrips(true);
    setLoadError(null);
    try {
      const user = getCurrentUser();
      setCurrentUser(user);
      const list = await trackingApi.getMyTrips();
      setTrips(list);
      if (list.length > 0) {
        const active = list.find((tr) => tr.shipment_status === 'in_transit') || list[0];
        setSelectedShipmentId((prev) =>
          prev && list.some((tr) => tr.shipment_id === prev) ? prev : active.shipment_id
        );
      } else {
        setSelectedShipmentId(null);
        setTrackingDetails(null);
      }
    } catch (err: any) {
      setLoadError(
        err?.message ||
          (language === 'en'
            ? 'Failed to load assigned trips for equine health records.'
            : 'Không thể tải danh sách chuyến đi cho hồ sơ sức khỏe ngựa.')
      );
    } finally {
      setIsLoadingTrips(false);
    }
  }, [language]);

  const loadDetails = useCallback(
    async (shipmentId: number, isSilent = false) => {
      try {
        const details = await trackingApi.getTrackingDetails(shipmentId);
        setTrackingDetails(details);
      } catch (err: any) {
        if (!isSilent) {
          toast.error(
            err?.message ||
              (language === 'en' ? 'Failed to load equine health details' : 'Không thể tải chi tiết sức khỏe')
          );
        }
      }
    },
    [language]
  );

  useEffect(() => {
    void loadTrips();
    void trackingApi
      .getVitalConfig()
      .then((cfg) => {
        if (cfg && Number.isFinite(Number(cfg.tempGreenMin))) {
          setVitalConfig(cfg);
        }
      })
      .catch(() => {});
    return () => {
      previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      previewUrlsRef.current = [];
    };
  }, [loadTrips]);

  useEffect(() => {
    if (!selectedShipmentId) return;
    void loadDetails(selectedShipmentId);
    const interval = setInterval(() => {
      void loadDetails(selectedShipmentId, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedShipmentId, loadDetails]);

  const currentTrip = trips.find((tr) => tr.shipment_id === selectedShipmentId);
  const healthLogs = trackingDetails?.healthLogs || [];
  const assignedHorses = trackingDetails?.assignedHorses || [];

  const handleOpenAdd = () => {
    if (!canRecordHealth) {
      toast.error(
        t(
          'driver.health.onlyEscortAllowed',
          language === 'en'
            ? 'Only assigned Veterinary Escort or Driver (DEC-07 backup) personnel may record health logs.'
            : 'Chỉ Bác sĩ Thú y / Nhân viên Hộ tống hoặc Tài xế được phân công (dự phòng DEC-07) mới có quyền ghi nhật ký.'
        )
      );
      return;
    }
    if (assignedHorses.length === 0) {
      toast.error(
        t(
          'driver.health.noHorsesForLog',
          language === 'en'
            ? 'No horses assigned to this shipment yet.'
            : 'Chuyến đi này chưa có ngựa được phân công để ghi nhật ký.'
        )
      );
      return;
    }

    const firstHorse = assignedHorses[0];
    const currentMilestone = trackingDetails?.milestones.find((m) => m.status === 'CURRENT');
    if (
      !currentMilestone &&
      (currentTrip?.shipment_status === 'completed' || trackingDetails?.shipmentStatus === 'completed')
    ) {
      toast.error(
        t(
          'driver.health.tripCompletedReadOnly',
          language === 'en'
            ? 'Trip is completed; additional health logs cannot be recorded.'
            : 'Chuyến đi đã hoàn tất, không thể ghi thêm nhật ký sức khỏe!'
        )
      );
      return;
    }

    const defaultLegName = currentMilestone
      ? `#${currentMilestone.seq} - ${currentMilestone.title}`
      : trackingDetails?.milestones && trackingDetails.milestones.length > 0
      ? `#${trackingDetails.milestones[0].seq} - ${trackingDetails.milestones[0].title}`
      : t('driver.health.defaultLegName', language === 'en' ? 'Leg 1: Field Departure' : 'Chặng 1: Xuất phát thực địa');

    setFormData({
      horseName: firstHorse.name,
      horseId: firstHorse.id,
      legName: defaultLegName,
      conditionStatus: 'stable',
      tempC: '38.0',
      heartRateBpm: '40',
      notes: '',
      attachments: [],
    });
    setUrlDraft('');
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    if (isSubmitting) return;
    setIsAddOpen(false);
    setUrlDraft('');
  };

  const openIncidentModal = (prefillNotes = '') => {
    if (!selectedShipmentId) return;
    setIncidentNotes(prefillNotes);
    setIsIncidentOpen(true);
  };

  const closeIncidentModal = () => {
    if (isSubmitting) return;
    setIsIncidentOpen(false);
    setIncidentNotes('');
  };

  const handleAddImageUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    if (!HTTP_URL_REGEX.test(trimmed)) {
      toast.error(
        language === 'en'
          ? 'Please enter a valid http:// or https:// image URL.'
          : 'Vui lòng nhập URL ảnh hợp lệ bắt đầu bằng http:// hoặc https://'
      );
      urlInputRef.current?.focus();
      return;
    }
    if (formData.attachments.length >= MAX_ATTACHMENTS) {
      toast.error(
        language === 'en'
          ? `Maximum ${MAX_ATTACHMENTS} images allowed per health log.`
          : `Tối đa ${MAX_ATTACHMENTS} ảnh cho mỗi bản ghi sức khỏe.`
      );
      return;
    }
    setFormData((prev) => ({
      ...prev,
      attachments: [...prev.attachments, trimmed],
    }));
    setUrlDraft('');
  };

  const handleCreateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!canRecordHealth) {
      toast.error(
        t(
          'driver.health.onlyEscortAllowedShort',
          language === 'en'
            ? 'Assigned Escort or Driver role required.'
            : 'Yêu cầu vai trò Hộ tống hoặc Tài xế phụ trách.'
        )
      );
      return;
    }
    if (!selectedShipmentId || assignedHorses.length === 0) return;

    const parsedTemp = Number(formData.tempC.trim());
    if (!formData.tempC.trim() || !Number.isFinite(parsedTemp) || parsedTemp < 30 || parsedTemp > 45) {
      toast.error(
        language === 'en'
          ? 'Temperature must be between 30.0°C and 45.0°C.'
          : 'Thân nhiệt phải nằm trong khoảng hợp lệ 30.0°C - 45.0°C.'
      );
      return;
    }

    const parsedHeartRate = Number(formData.heartRateBpm.trim());
    if (
      !formData.heartRateBpm.trim() ||
      !Number.isFinite(parsedHeartRate) ||
      parsedHeartRate < 15 ||
      parsedHeartRate > 200
    ) {
      toast.error(
        language === 'en'
          ? 'Heart rate must be between 15 and 200 bpm.'
          : 'Nhịp tim phải nằm trong khoảng hợp lệ 15 - 200 bpm.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await trackingApi.createHealthLog(selectedShipmentId, {
        horseId: formData.horseId,
        horseName: formData.horseName,
        legName: formData.legName,
        conditionStatus: formData.conditionStatus,
        temperatureC: parsedTemp,
        heartRateBpm: Math.round(parsedHeartRate),
        notes: formData.notes,
        attachments: formData.attachments,
      });

      const createdTier = created?.alertTier;
      if (
        createdTier === 'red' ||
        (!createdTier && (formData.conditionStatus === 'not_eating' || formData.conditionStatus === 'stressed'))
      ) {
        toast(
          t(
            'driver.health.warningAlertToast',
            language === 'en'
              ? 'Health log saved & RED ALERT sent to Logistics Manager and Coordinator!'
              : 'Đã ghi nhật ký & gửi CẢNH BÁO ĐỎ (Red Alert) đến Logistics Manager và Điều phối viên!'
          ),
          {
            icon: '🚨',
            duration: 6000,
            style: {
              background: '#fff1f2',
              color: '#9E3B3B',
              border: '1px solid #fecdd3',
              fontWeight: 700,
            },
          }
        );
      } else if (createdTier === 'amber_escalatable' || createdTier === 'amber_observational') {
        toast(
          created?.alertReason ||
            (language === 'en'
              ? 'Health log saved under Amber monitoring tier.'
              : 'Đã ghi nhật ký ở mức Theo dõi / Cảnh báo Vàng (Amber).'),
          {
            icon: '⚠️',
            duration: 5000,
            style: {
              background: '#FAF5EB',
              color: '#966516',
              border: '1px solid #DFCA9A',
              fontWeight: 700,
            },
          }
        );
      } else {
        toast.success(
          t('driver.health.saveSuccess', 'Đã lưu nhật ký sức khỏe cho ngựa {name}!', {
            name: formData.horseName,
          })
        );
      }

      setIsAddOpen(false);
      setUrlDraft('');
      await loadDetails(selectedShipmentId);
    } catch (err: any) {
      toast.error(
        err?.message ||
          t('driver.health.saveFailed', language === 'en' ? 'Unable to save health log.' : 'Không thể lưu nhật ký sức khỏe')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipmentId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await routesApi.reportIncident(selectedShipmentId, {
        incidentType: 'horse_medical',
        description:
          incidentNotes.trim() ||
          t(
            'driver.health.defaultIncidentDesc',
            language === 'en'
              ? 'Horse showing fever or colic signs requiring urgent veterinary intervention'
              : 'Chiến mã có biểu hiện sốt cao hoặc đau bụng cần can thiệp thú y khẩn cấp trên tuyến'
          ),
        severity: 'critical',
      });
      toast.success(
        t(
          'driver.health.incidentSentSuccess',
          language === 'en'
            ? 'Equine medical emergency reported to Manager & Coordinator!'
            : 'Báo cáo sự cố y tế ngựa đã được gửi tới Logistics Manager & Fleet Coordinator!'
        )
      );
      setIsIncidentOpen(false);
      setIncidentNotes('');
      await loadDetails(selectedShipmentId);
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'driver.health.incidentSentFailed',
            language === 'en' ? 'Failed to report medical incident.' : 'Không thể gửi báo cáo sự cố y tế'
          )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedTempNum = Number(formData.tempC);
  const parsedHrNum = Number(formData.heartRateBpm);
  const hasTempInput = Number.isFinite(parsedTempNum) && formData.tempC.trim() !== '';
  const hasHrInput = Number.isFinite(parsedHrNum) && formData.heartRateBpm.trim() !== '';

  const tempBand: 'green' | 'amber' | 'red' = !hasTempInput
    ? 'green'
    : parsedTempNum < vitalConfig.tempAmberLowMin || parsedTempNum >= vitalConfig.tempAmberHighMax
    ? 'red'
    : parsedTempNum >= vitalConfig.tempGreenMin && parsedTempNum <= vitalConfig.tempGreenMax
    ? 'green'
    : 'amber';

  const hrBand: 'green' | 'amber' | 'red' = !hasHrInput
    ? 'green'
    : parsedHrNum < vitalConfig.hrAmberLowMin || parsedHrNum >= vitalConfig.hrAmberHighMax
    ? 'red'
    : parsedHrNum >= vitalConfig.hrGreenMin && parsedHrNum <= vitalConfig.hrGreenMax
    ? 'green'
    : 'amber';

  const isPreviewRed = tempBand === 'red' || hrBand === 'red';
  const isPreviewAmber =
    !isPreviewRed &&
    (tempBand === 'amber' || hrBand === 'amber' || formData.conditionStatus !== 'stable');

  const avgTemp =
    healthLogs.length > 0
      ? (healthLogs.reduce((acc, l) => acc + (l.temperatureC || 38), 0) / healthLogs.length).toFixed(1)
      : '38.0';

  const stableCount = healthLogs.filter((l) => l.conditionStatus === 'stable').length;
  const abnormalLogs = healthLogs.filter(
    (l) => l.conditionStatus === 'not_eating' || l.conditionStatus === 'stressed'
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Role Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs transition-all ${
          isEscort
            ? 'bg-[#E8F2EB] border-[#2D5A3F]/25 text-[#1E402C]'
            : 'bg-[#FAF5EB] border-[#D4C5A3] text-[#181A17]'
        }`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          <Stethoscope
            size={20}
            className={`${isEscort ? 'text-[#2D5A3F]' : 'text-[#A67C2E]'} shrink-0 mt-0.5 sm:mt-0`}
            aria-hidden="true"
          />
          <div>
            <span className="font-bold block text-sm">
              {isEscort
                ? t('driver.health.roleBannerEscort', language === 'en' ? 'Veterinary Access: Equine Vet / Escort' : '🩺 Chuyên môn Theo dõi Thú y: Bác Sĩ Thú Y / Nhân Viên Hộ Tống')
                : t('driver.health.roleBannerDriverBackup', language === 'en' ? 'Access Level: Assigned Driver — DEC-07 Health Backup Mode' : '🛡️ Quyền Hạn: Tài xế phụ trách chuyến — Chế độ dự phòng ghi nhận sinh hiệu (DEC-07)')}
            </span>
            <p className="m-0 mt-0.5 opacity-90 text-xs">
              {isEscort
                ? t(
                    'driver.health.escortRoleDesc',
                    language === 'en'
                      ? 'Authorized to record temperature, heart rate, clinical remarks, and photos during transit.'
                      : 'Theo quy chuẩn quốc tế, bạn có trách nhiệm theo dõi thân nhiệt, nhịp tim và biểu hiện hành vi của đàn ngựa trong suốt chuyến đi.'
                  )
                : t(
                    'driver.health.driverRoleBackupDesc',
                    language === 'en'
                      ? 'Assigned drivers may record backup vital checks when Veterinary Escort is absent on a trip (audit-tagged as driver).'
                      : 'Bạn có thể ghi nhận sinh hiệu dự phòng khi chuyến chưa có Nhân viên Hộ tống trực tiếp đi cùng; hệ thống lưu rõ vai trò người ghi.'
                  )}
            </p>
          </div>
        </div>
      </div>

      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#181A17] m-0">
            {t('driver.healthTitle', language === 'en' ? 'Equine Health & Vitals Log' : 'Nhật ký Sức khỏe & Sinh hiệu Ngựa Đua')}
          </h1>
          <p className="text-sm text-[#57564E] mt-1 mb-0 break-words">
            {t('common.trip', language === 'en' ? 'Trip' : 'Chuyến')}:{' '}
            <strong className="text-[#A67C2E]">#{currentTrip?.request_code || '—'}</strong> •{' '}
            {t('driver.health.assignedHorsesList', language === 'en' ? 'Horses' : 'Đàn ngựa')}:{' '}
            {assignedHorses.map((h) => h.name).join(', ') ||
              t('driver.health.noHorsesAssigned', language === 'en' ? 'No horses assigned' : 'Chưa gán ngựa')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <label htmlFor="health-trip-select" className="sr-only">
            {t('common.trip', language === 'en' ? 'Select Trip' : 'Chọn chuyến đi')}
          </label>
          <select
            id="health-trip-select"
            value={selectedShipmentId || ''}
            disabled={trips.length === 0}
            onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D8CEBE] text-sm font-semibold bg-white outline-none focus:border-[#A67C2E] shadow-sm disabled:opacity-60"
          >
            {trips.length === 0 ? (
              <option value="">{t('driver.trips.noTrips', language === 'en' ? 'No trips' : 'Chưa có chuyến đi')}</option>
            ) : (
              trips.map((s) => (
                <option key={s.shipment_id} value={s.shipment_id}>
                  #{s.request_code} • {translateStatus(s.shipment_status)}
                </option>
              ))
            )}
          </select>

          {canRecordHealth && (
            <Button
              type="button"
              variant="primary"
              onClick={handleOpenAdd}
              disabled={
                !selectedShipmentId ||
                assignedHorses.length === 0 ||
                currentTrip?.shipment_status === 'completed' ||
                trackingDetails?.shipmentStatus === 'completed'
              }
              className="min-h-[44px] px-4 bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Plus size={18} className="mr-1.5" aria-hidden="true" />{' '}
              {t('driver.health.newRecordBtn', language === 'en' ? 'New Health Log' : 'Ghi Nhật Ký Mới')}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (selectedShipmentId) void loadDetails(selectedShipmentId);
              else void loadTrips();
            }}
            aria-label={t('common.refresh', language === 'en' ? 'Refresh health data' : 'Làm mới dữ liệu sức khỏe')}
            className="min-h-[44px] min-w-[44px] px-3 text-[#181A17] border-[#D8CEBE] rounded-xl"
            title={t('common.refresh', language === 'en' ? 'Refresh' : 'Làm mới')}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadTrips()}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {isLoadingTrips ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw size={28} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#57564E] m-0">
            {t('common.loading', language === 'en' ? 'Loading equine health records...' : 'Đang tải hồ sơ sức khỏe ngựa...')}
          </p>
        </div>
      ) : trips.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#FAF8F4] border border-[#D8CEBE] text-[#8A8478] flex items-center justify-center">
            <Stethoscope size={28} aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-[#181A17] m-0">
            {t('driver.noTripsTitle', language === 'en' ? 'No Trips Assigned' : 'Chưa Có Chuyến Đi Nào Được Giao')}
          </h2>
          <p className="text-xs text-[#57564E] max-w-md m-0 leading-relaxed">
            {t(
              'driver.health.emptyTripsDesc',
              language === 'en'
                ? 'Equine health dossiers become available once you are assigned to a shipment.'
                : 'Hồ sơ theo dõi sức khỏe chiến mã sẽ xuất hiện ngay khi bạn được phân công vào chuyến vận chuyển.'
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Abnormal Warning Box */}
          {abnormalLogs.length > 0 && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm"
            >
              <div className="flex items-start sm:items-center gap-3">
                <AlertCircle size={22} className="text-[#9E3B3B] shrink-0" aria-hidden="true" />
                <div>
                  <strong className="block text-sm text-[#9E3B3B]">
                    {t('driver.health.abnormalWarningTitle', language === 'en' ? 'Veterinary Alert: Abnormal Signs Detected' : 'Cảnh báo thú y đặc biệt: Đang có biểu hiện bất thường!')}
                  </strong>
                  <p className="m-0 mt-0.5 text-rose-800 break-words">
                    {t('driver.health.abnormalObserved', 'Ghi nhận gần nhất: Ngựa {name} bị {condition} ({notes}).', {
                      name: abnormalLogs[0].horseName,
                      condition: translateCondition(abnormalLogs[0].conditionStatus),
                      notes: abnormalLogs[0].notes || t('common.noAdditionalNotes', 'Không có ghi chú thêm'),
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={!selectedShipmentId}
                onClick={() =>
                  openIncidentModal(
                    `${language === 'en' ? 'Equine health observation' : 'Sức khỏe ngựa'} ${abnormalLogs[0].horseName} — ${translateCondition(abnormalLogs[0].conditionStatus)}: ${abnormalLogs[0].notes || ''}`
                  )
                }
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold text-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <AlertTriangle size={14} aria-hidden="true" />{' '}
                {t('driver.health.triggerIncidentBtn', language === 'en' ? 'Trigger Medical Incident Alert' : 'Kích hoạt Báo sự cố khẩn cấp')}
              </button>
            </div>
          )}

          {/* Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-[#D8CEBE] p-4 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F3EFE4] text-[#A67C2E] flex items-center justify-center shrink-0">
                <Thermometer size={22} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs text-[#57564E] font-semibold block">
                  {t('driver.health.avgTemp', language === 'en' ? 'Average Temperature' : 'Thân nhiệt trung bình')}
                </span>
                <span className="text-lg font-bold text-[#181A17]">
                  {avgTemp}°C ({t('driver.health.standardTempRange', language === 'en' ? 'Normal: 37.5 - 38.5°C' : 'Chuẩn: 37.5 - 38.5°C')})
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#D8CEBE] p-4 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E8F2EB] text-[#2D5A3F] flex items-center justify-center shrink-0">
                <Heart size={22} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs text-[#57564E] font-semibold block">
                  {t('driver.health.stableCount', language === 'en' ? 'Stable Checks' : 'Trạng thái ổn định')}
                </span>
                <span className="text-lg font-bold text-[#2D5A3F]">
                  {stableCount} / {healthLogs.length} {t('driver.health.checksCount', language === 'en' ? 'checks' : 'lần kiểm tra')}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#D8CEBE] p-4 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF5EB] text-[#A67C2E] flex items-center justify-center shrink-0">
                <AlertTriangle size={22} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs text-[#57564E] font-semibold block">
                  {t('driver.health.needsAttentionCount', language === 'en' ? 'Needs Attention' : 'Lưu ý cần theo dõi')}
                </span>
                <span className="text-lg font-bold text-[#A67C2E]">
                  {abnormalLogs.length} {t('driver.health.casesCount', language === 'en' ? 'cases' : 'trường hợp')}
                </span>
              </div>
            </div>
          </div>

          {/* Health Observation Logs Stream */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-6 shadow-sm flex flex-col gap-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                <Stethoscope size={18} className="text-[#2D5A3F]" aria-hidden="true" />
                {t('driver.health.logStreamTitle', language === 'en' ? 'Clinical Observations & Vitals Stream' : 'Dòng Sự Kiện Khám Lâm Sàng & Nhật Ký Thú Y')}
              </h2>
              <span className="text-xs font-bold text-[#57564E]">
                {healthLogs.length} {t('driver.health.recordsCount', language === 'en' ? 'records' : 'Bản ghi')}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {healthLogs.length === 0 ? (
                <div className="p-8 text-center text-[#57564E] text-xs">
                  {t(
                    'driver.health.emptyLogDesc',
                    language === 'en'
                      ? 'No equine health observations recorded for this trip yet.'
                      : 'Chưa có nhật ký quan sát sức khỏe nào được ghi nhận cho chuyến đi này.'
                  )}
                </div>
              ) : (
                healthLogs.map((log) => {
                  const tier = log.alertTier;
                  const isRed = tier === 'red' || (!tier && (log.conditionStatus === 'not_eating' || log.conditionStatus === 'stressed'));
                  const isAmber = tier === 'amber_escalatable' || tier === 'amber_observational';

                  return (
                    <div
                      key={log.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs transition-all shadow-sm ${
                        isRed
                          ? 'border-[#9E3B3B]/40 bg-rose-50/70'
                          : isAmber
                          ? 'border-[#DFCA9A] bg-[#FAF5EB]/80'
                          : 'border-[#D8CEBE] bg-white hover:border-[#A67C2E]'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isRed
                              ? 'bg-rose-100 text-[#9E3B3B]'
                              : isAmber
                              ? 'bg-[#F3E6CE] text-[#966516]'
                              : 'bg-[#E8F2EB] text-[#2D5A3F]'
                          }`}
                        >
                          <Heart size={18} aria-hidden="true" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-[#181A17]">{log.horseName}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                log.conditionStatus === 'stable'
                                  ? 'bg-[#E8F2EB] text-[#2D5A3F]'
                                  : log.conditionStatus === 'climate_change'
                                  ? 'bg-[#F3EFE4] text-[#181A17]'
                                  : 'bg-rose-100 text-[#9E3B3B] border border-[#9E3B3B]/25'
                              }`}
                            >
                              {translateCondition(log.conditionStatus)}
                            </span>
                            {tier && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
                                  tier === 'red'
                                    ? 'bg-[#9E3B3B] text-white'
                                    : tier === 'amber_escalatable'
                                    ? 'bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]'
                                    : tier === 'amber_observational'
                                    ? 'bg-[#FAF8F4] text-[#57564E] border border-[#D8CEBE]'
                                    : 'bg-[#E8F2EB] text-[#2D5A3F]'
                                }`}
                              >
                                {tier === 'red'
                                  ? 'RED ALERT'
                                  : tier === 'amber_escalatable'
                                  ? 'AMBER ESCALATE'
                                  : tier === 'amber_observational'
                                  ? 'OBSERVATIONAL'
                                  : 'GREEN'}
                              </span>
                            )}
                            {log.legName && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA] inline-flex items-center gap-1 shadow-sm">
                                <MapPin size={11} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                                <span>{log.legName}</span>
                              </span>
                            )}
                          </div>

                          {log.alertReason && (
                            <p className="text-[11px] text-[#966516] mt-1 m-0 font-semibold">
                              {log.alertReason}
                            </p>
                          )}

                          <p className="text-[#3C403A] mt-1.5 m-0 leading-relaxed font-medium break-words">
                            {log.notes || t('common.noAdditionalNotes', language === 'en' ? 'No additional notes.' : 'Không có ghi chú thêm.')}
                          </p>

                          {log.attachments && log.attachments.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-[11px] text-[#747D88] font-semibold flex items-center gap-1">
                                <ImageIcon size={12} aria-hidden="true" /> {log.attachments.length}{' '}
                                {t('driver.health.attachedImages', language === 'en' ? 'attached photos:' : 'hình ảnh đính kèm:')}
                              </span>
                              {log.attachments.map((url, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => void openAuthenticatedApiFile(url)}
                                  className="text-[11px] text-[#A67C2E] hover:underline font-bold bg-transparent border-0 p-0 cursor-pointer"
                                >
                                  {t('driver.health.photoIndex', 'Ảnh #{idx}', { idx: idx + 1 })}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-[#EAE5DA]">
                        <span className="font-extrabold text-sm text-[#181A17] block">
                          {log.temperatureC ? `${log.temperatureC}°C` : 'N/A'} •{' '}
                          {log.heartRateBpm ? `${log.heartRateBpm} bpm` : 'N/A'}
                        </span>
                        <span suppressHydrationWarning className="text-[11px] text-[#747D88] mt-0.5 block">
                          {new Date(log.recordedAt).toLocaleTimeString(language === 'en' ? 'en-US' : 'vi-VN')}{' '}
                          {new Date(log.recordedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN')}
                        </span>
                        <span className="text-[11px] text-[#57564E] font-medium block">
                          {t('driver.health.recordedBy', language === 'en' ? 'Recorded by:' : 'Người ghi:')}{' '}
                          {log.recordedByName || (language === 'en' ? 'Equine Vet' : 'Bác sĩ thú y')} (
                          {translateRole(log.recordedByRole || 'escort')})
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Record Observation Modal */}
      {canRecordHealth && isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={closeAddModal}
          closeDisabled={isSubmitting}
          title={t('driver.health.modalTitle', language === 'en' ? 'Record Horse Clinical Health Log' : 'Ghi nhật ký tình trạng sức khỏe ngựa')}
          maxWidth="540px"
        >
          <form onSubmit={handleCreateLog} className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-[#E8F2EB] border border-[#2D5A3F]/25 rounded-xl text-[#1E402C]">
              {t(
                'driver.health.vetRuleNotice',
                language === 'en'
                  ? 'Veterinary protocol: Marking Not Eating or Stressed triggers an urgent alert to dispatch.'
                  : 'Quy tắc thú y: Nếu phát hiện ngựa có dấu hiệu Bỏ ăn hoặc Căng thẳng, hệ thống sẽ tự động thông báo khẩn tới Điều phối viên và đề xuất phương án hỗ trợ.'
              )}
            </div>

            <div>
              <label htmlFor="health-horse-select" className="font-bold text-[#181A17] block mb-1.5">
                {t('driver.health.selectHorseLabel', language === 'en' ? 'Select horse *' : 'Chọn cá thể ngựa kiểm tra *')}
              </label>
              <select
                id="health-horse-select"
                value={formData.horseName}
                onChange={(e) => {
                  const selectedName = e.target.value;
                  const matched = assignedHorses.find((h) => h.name === selectedName);
                  setFormData({ ...formData, horseName: selectedName, horseId: matched?.id });
                }}
                className="w-full min-h-[44px] px-3 border border-[#D8CEBE] rounded-xl outline-none font-bold text-xs bg-white focus:border-[#2D5A3F]"
                required
              >
                {assignedHorses.map((h) => (
                  <option key={h.id} value={h.name}>
                    🐎 {h.name} • {translateBreed(h.breed) || (language === 'en' ? 'Racehorse' : 'Ngựa đua')} • Chip:{' '}
                    {h.microchipNo || 'N/A'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="health-leg-select" className="font-bold text-[#181A17] block mb-1.5 flex items-center gap-1">
                <MapPin size={13} className="text-[#2D5A3F]" aria-hidden="true" />
                <span>{t('driver.health.milestoneCheckLabel', language === 'en' ? 'Transit leg / Check location *' : 'Chặng vận chuyển / Điểm kiểm tra thực địa *')}</span>
              </label>
              <select
                id="health-leg-select"
                value={formData.legName}
                onChange={(e) => setFormData({ ...formData, legName: e.target.value })}
                className="w-full min-h-[44px] px-3 border border-[#D8CEBE] rounded-xl outline-none font-bold text-xs bg-white focus:border-[#2D5A3F]"
                required
              >
                {trackingDetails?.milestones && trackingDetails.milestones.length > 0 ? (
                  trackingDetails.milestones.map((m) => (
                    <option key={m.id} value={`#${m.seq} - ${m.title}`}>
                      #{m.seq}: {m.title}{' '}
                      {m.status === 'CURRENT'
                        ? language === 'en'
                          ? '⭐ [Current]'
                          : '⭐ [Mốc hiện tại]'
                        : m.status === 'COMPLETED'
                        ? language === 'en'
                          ? '✓ [Passed]'
                          : '✓ [Đã qua]'
                        : ''}
                    </option>
                  ))
                ) : (
                  <option value={t('driver.health.defaultLegOption', 'Chặng 1: Xuất phát thực địa')}>
                    {t('driver.health.defaultLegOption', 'Chặng 1: Xuất phát thực địa')}
                  </option>
                )}
              </select>
            </div>

            <div>
              <p className="font-bold text-[#181A17] block mb-1.5 uppercase tracking-wider text-[11px] m-0">
                {t('driver.health.clinicalConditionLabel', language === 'en' ? 'Clinical Condition *' : 'Tình trạng lâm sàng hiện tại *')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                {[
                  { value: 'stable', label: `✅ ${translateCondition('stable')}` },
                  { value: 'not_eating', label: `⚠️ ${translateCondition('not_eating')}` },
                  { value: 'stressed', label: `⚡ ${translateCondition('stressed')}` },
                  { value: 'climate_change', label: `🌤️ ${translateCondition('climate_change')}` },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={formData.conditionStatus === opt.value}
                    onClick={() => setFormData({ ...formData, conditionStatus: opt.value as any })}
                    className={`min-h-[44px] p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                      formData.conditionStatus === opt.value
                        ? 'border-[#2D5A3F] bg-[#E8F2EB] text-[#1E402C] ring-2 ring-[#2D5A3F]/20'
                        : 'border-[#D8CEBE] bg-white text-[#181A17] hover:bg-[#FAF8F4]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="health-temp-input" className="font-bold text-[#181A17] block mb-1.5">
                  {t('driver.health.tempLabel', language === 'en' ? 'Body Temp (°C)' : 'Thân nhiệt (°C)')}{' '}
                  <span className="text-[#747D88] font-normal">
                    ({t('driver.health.tempStandard', language === 'en' ? 'Normal 37.5 - 38.5' : 'Chuẩn 37.5 - 38.5')})
                  </span>
                </label>
                <input
                  id="health-temp-input"
                  type="text"
                  inputMode="decimal"
                  required
                  value={formData.tempC}
                  onChange={(e) => setFormData({ ...formData, tempC: e.target.value })}
                  placeholder="38.0"
                  className="w-full h-11 px-3 border border-[#D8CEBE] rounded-xl outline-none text-sm font-bold text-[#181A17] focus:border-[#2D5A3F]"
                />
              </div>

              <div>
                <label htmlFor="health-hr-input" className="font-bold text-[#181A17] block mb-1.5">
                  {t('driver.health.heartRateLabel', language === 'en' ? 'Heart Rate (bpm)' : 'Nhịp tim (bpm)')}{' '}
                  <span className="text-[#747D88] font-normal">
                    ({t('driver.health.heartRateStandard', language === 'en' ? 'Normal 28 - 44' : 'Chuẩn 28 - 44')})
                  </span>
                </label>
                <input
                  id="health-hr-input"
                  type="text"
                  inputMode="numeric"
                  required
                  value={formData.heartRateBpm}
                  onChange={(e) => setFormData({ ...formData, heartRateBpm: e.target.value })}
                  placeholder="40"
                  className="w-full h-11 px-3 border border-[#D8CEBE] rounded-xl outline-none text-sm font-bold text-[#181A17] focus:border-[#2D5A3F]"
                />
              </div>
            </div>

            {(isPreviewRed || isPreviewAmber) && (
              <div
                role="alert"
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                  isPreviewRed
                    ? 'border-[#9E3B3B]/35 bg-rose-50 text-rose-900'
                    : 'border-[#DFCA9A] bg-[#FAF5EB] text-[#7D5310]'
                }`}
              >
                <AlertTriangle
                  size={18}
                  className={`${isPreviewRed ? 'text-[#9E3B3B]' : 'text-[#A67C2E]'} shrink-0 mt-0.5`}
                  aria-hidden="true"
                />
                <div className="text-xs leading-relaxed">
                  <strong className={`block font-extrabold mb-0.5 ${isPreviewRed ? 'text-[#9E3B3B]' : 'text-[#966516]'}`}>
                    {isPreviewRed
                      ? t('driver.health.vitalAlertRedTitle', language === 'en' ? '🚨 Red Clinical Alert Thresholds Triggered' : '🚨 Ngưỡng CẢNH BÁO ĐỎ (Red Alert) theo cấu hình thú y')
                      : t('driver.health.vitalAlertAmberTitle', language === 'en' ? '⚠️ Amber Monitoring Thresholds Triggered' : '⚠️ Ngưỡng Theo Dõi / Cảnh Báo Vàng (Amber)')}
                  </strong>
                  {tempBand !== 'green' && (
                    <span className="block">
                      {language === 'en'
                        ? `• Temperature ${parsedTempNum}°C is outside Green band (${vitalConfig.tempGreenMin}–${vitalConfig.tempGreenMax}°C; Red < ${vitalConfig.tempAmberLowMin} or ≥ ${vitalConfig.tempAmberHighMax}°C).`
                        : `• Thân nhiệt ${parsedTempNum}°C nằm ngoài dải Xanh (${vitalConfig.tempGreenMin}–${vitalConfig.tempGreenMax}°C; Đỏ < ${vitalConfig.tempAmberLowMin} hoặc ≥ ${vitalConfig.tempAmberHighMax}°C).`}
                    </span>
                  )}
                  {hrBand !== 'green' && (
                    <span className="block">
                      {language === 'en'
                        ? `• Heart rate ${parsedHrNum} bpm is outside Green band (${vitalConfig.hrGreenMin}–${vitalConfig.hrGreenMax} bpm; Red < ${vitalConfig.hrAmberLowMin} or ≥ ${vitalConfig.hrAmberHighMax} bpm).`
                        : `• Nhịp tim ${parsedHrNum} bpm nằm ngoài dải Xanh (${vitalConfig.hrGreenMin}–${vitalConfig.hrGreenMax} bpm; Đỏ < ${vitalConfig.hrAmberLowMin} hoặc ≥ ${vitalConfig.hrAmberHighMax} bpm).`}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="health-notes-input" className="font-bold text-[#181A17] block mb-1.5">
                {t('driver.health.notesLabel', language === 'en' ? 'Clinical Observation Notes (Optional)' : 'Ghi chú quan sát lâm sàng (Tùy chọn)')}
              </label>
              <textarea
                id="health-notes-input"
                rows={3}
                placeholder={t(
                  'driver.health.notesPlaceholder',
                  language === 'en'
                    ? 'Note hydration, appetite, bedding condition, or thermal adaptation...'
                    : 'Ghi nhận tình trạng uống nước, tiêu hóa, đệm rơm lót chuồng, mức độ thích nghi nhiệt độ...'
                )}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-3 border border-[#D8CEBE] rounded-xl outline-none text-xs font-medium focus:border-[#2D5A3F]"
              />
            </div>

            {/* Image Attachments */}
            <div>
              <div className="font-bold text-[#181A17] mb-1.5 flex items-center justify-between">
                <label htmlFor="health-url-input" className="flex items-center gap-1 cursor-pointer">
                  <ImageIcon size={13} className="text-[#2D5A3F]" aria-hidden="true" />
                  <span>{t('driver.health.attachmentLabel', language === 'en' ? 'Photos (Max 5 images, <= 5MB each)' : 'Ảnh chụp sinh hiệu / thể trạng (Tối đa 5 ảnh)')}</span>
                </label>
                <span className="text-[10px] text-[#747D88] font-normal">
                  {formData.attachments.length}/{MAX_ATTACHMENTS}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                <label className="min-h-[44px] flex items-center justify-center gap-2 p-2.5 border border-dashed border-[#2D5A3F]/50 rounded-xl bg-[#E8F2EB]/60 hover:bg-[#E8F2EB] text-[#1E402C] font-semibold cursor-pointer text-xs transition-all">
                  <Upload size={14} aria-hidden="true" />
                  <span>
                    {isUploadingPhotos
                      ? language === 'en'
                        ? 'Uploading images...'
                        : 'Đang tải ảnh lên máy chủ...'
                      : t('driver.health.uploadFileBtn', language === 'en' ? 'Upload image files (JPG, PNG)' : 'Chọn ảnh chụp từ máy (JPG, PNG)')}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isUploadingPhotos}
                    className="sr-only"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = '';
                      if (files.length === 0 || !selectedShipmentId) return;

                      const remaining = MAX_ATTACHMENTS - formData.attachments.length;
                      if (remaining <= 0) {
                        toast.error(
                          language === 'en'
                            ? `Maximum ${MAX_ATTACHMENTS} images reached.`
                            : `Đã đạt giới hạn tối đa ${MAX_ATTACHMENTS} ảnh.`
                        );
                        return;
                      }

                      const validFiles: File[] = [];
                      for (const file of files.slice(0, remaining)) {
                        if (file.size > MAX_IMAGE_BYTES) {
                          toast.error(
                            language === 'en'
                              ? `"${file.name}" exceeds 5MB size limit.`
                              : `Tệp "${file.name}" vượt quá dung lượng tối đa 5MB.`
                          );
                        } else {
                          validFiles.push(file);
                        }
                      }
                      if (validFiles.length === 0) return;

                      setIsUploadingPhotos(true);
                      try {
                        const uploaded = await trackingApi.uploadHealthPhotos(selectedShipmentId, validFiles);
                        const returnedPaths = Array.isArray(uploaded?.files) ? uploaded.files : [];
                        const newPreviews: Record<string, string> = {};
                        returnedPaths.forEach((urlPath, idx) => {
                          if (validFiles[idx]) {
                            const blobUrl = URL.createObjectURL(validFiles[idx]);
                            previewUrlsRef.current.push(blobUrl);
                            newPreviews[urlPath] = blobUrl;
                          }
                        });
                        setPhotoPreviewMap((prev) => ({ ...prev, ...newPreviews }));
                        setFormData((prev) => ({
                          ...prev,
                          attachments: [...prev.attachments, ...returnedPaths].slice(0, MAX_ATTACHMENTS),
                        }));
                      } catch (err: any) {
                        toast.error(
                          err?.message ||
                            (language === 'en' ? 'Failed to upload image files.' : 'Không thể tải ảnh lên máy chủ.'),
                        );
                      } finally {
                        setIsUploadingPhotos(false);
                      }
                    }}
                  />
                </label>

                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                  <input
                    ref={urlInputRef}
                    id="health-url-input"
                    type="url"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder={t('driver.health.urlPlaceholder', language === 'en' ? 'Or paste image URL (https://...)' : 'Hoặc dán liên kết URL ảnh (https://...)')}
                    className="flex-1 min-h-[44px] px-3 border border-[#D8CEBE] rounded-xl outline-none text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddImageUrl();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] text-xs px-4 font-semibold border-[#D8CEBE]"
                    onClick={handleAddImageUrl}
                  >
                    {t('driver.health.addUrlBtn', language === 'en' ? 'Add URL' : 'Thêm URL')}
                  </Button>
                </div>

                {formData.attachments.length > 0 && (
                  <div className="flex items-center gap-2.5 flex-wrap mt-1">
                    {formData.attachments.map((img, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-xl border border-[#D8CEBE] overflow-hidden bg-[#FAF8F4]">
                        <img src={photoPreviewMap[img] ?? img} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              attachments: prev.attachments.filter((_, i) => i !== idx),
                            }))
                          }
                          aria-label={language === 'en' ? `Remove photo ${idx + 1}` : `Xóa ảnh ${idx + 1}`}
                          title={t('common.delete', language === 'en' ? 'Remove photo' : 'Xóa ảnh này')}
                          className="absolute top-0.5 right-0.5 w-6 h-6 bg-[#181A17]/80 hover:bg-[#9E3B3B] text-white rounded-full flex items-center justify-center transition-all cursor-pointer"
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#EAE5DA]">
              <Button
                type="button"
                variant="outline"
                onClick={closeAddModal}
                disabled={isSubmitting}
                className="min-h-[44px] border-[#D8CEBE]"
              >
                {t('common.close', language === 'en' ? 'Close' : 'Đóng')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || isUploadingPhotos}
                className="min-h-[44px] px-5 bg-[#2D5A3F] hover:bg-[#234731] text-white font-bold"
              >
                {isSubmitting
                  ? t('common.saving', language === 'en' ? 'Saving...' : 'Đang lưu...')
                  : t('driver.health.saveRecordBtn', language === 'en' ? 'Save Health Log' : 'Lưu Nhật Ký Sức Khỏe')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Emergency Incident Modal */}
      {isIncidentOpen && (
        <Modal
          isOpen={isIncidentOpen}
          onClose={closeIncidentModal}
          closeDisabled={isSubmitting}
          title={t('driver.health.emergencyModalTitle', language === 'en' ? 'Report Medical Emergency' : 'Báo cáo sự cố khẩn cấp trên đường')}
          maxWidth="500px"
        >
          <form onSubmit={handleReportIncident} className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-rose-50 border border-[#9E3B3B]/30 rounded-xl text-rose-900">
              {t(
                'driver.health.emergencyNotice',
                language === 'en'
                  ? 'Urgent medical emergency alert goes straight to Logistics Manager and Fleet Coordinator.'
                  : 'Kênh liên lạc sự cố khẩn cấp: Báo cáo này sẽ được ưu tiên phát cảnh báo đỏ ngay lập tức đến màn hình của Logistics Manager và Fleet Coordinator để kích hoạt phương án cứu hộ.'
              )}
            </div>

            <div>
              <label htmlFor="health-incident-notes" className="font-bold text-[#181A17] block mb-1.5">
                {t('driver.health.incidentDescLabel', language === 'en' ? 'Incident details *' : 'Mô tả tình huống sự cố *')}
              </label>
              <textarea
                id="health-incident-notes"
                rows={4}
                required
                value={incidentNotes}
                onChange={(e) => setIncidentNotes(e.target.value)}
                placeholder={t(
                  'driver.health.incidentDescPlaceholder',
                  language === 'en'
                    ? 'Describe urgent medical symptoms, AC failure, or prolonged traffic stop...'
                    : 'Ghi rõ loại sự cố: Hỏng điều hòa khoang xe, tắc đường kẹt xe vượt quá 2 giờ, ngựa sốt cao đột ngột...'
                )}
                className="w-full p-3 border border-[#D8CEBE] rounded-xl outline-none focus:border-[#9E3B3B] text-xs"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#EAE5DA]">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={closeIncidentModal}
                className="min-h-[44px] border-[#D8CEBE]"
              >
                {t('common.close', language === 'en' ? 'Close' : 'Đóng')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || !selectedShipmentId}
                className="min-h-[44px] px-5 bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold"
              >
                {isSubmitting
                  ? t('common.sending', language === 'en' ? 'Sending...' : 'Đang gửi...')
                  : t('driver.health.sendUrgentAlertBtn', language === 'en' ? 'Send Urgent Alert' : 'Gửi cảnh báo khẩn cấp')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
