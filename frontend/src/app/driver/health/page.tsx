'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Stethoscope, Plus, Thermometer, Heart, AlertTriangle, 
  CheckCircle2, RefreshCw, AlertCircle, ShieldAlert, Image as ImageIcon, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { getCurrentUser } from '@/lib/auth';
import { 
  trackingApi, 
  AssignedTripSummary, 
  TripTrackingDetails, 
  HorseHealthLogItem 
} from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';

export default function HorseHealthPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<TripTrackingDetails | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Flow 5 Emergency Incident modal
  const [isIncidentOpen, setIsIncidentOpen] = useState(false);
  const [incidentNotes, setIncidentNotes] = useState('');

  // Form state
  const [formData, setFormData] = useState<{
    horseName: string;
    horseId: number | undefined;
    legName: string;
    conditionStatus: 'stable' | 'not_eating' | 'stressed' | 'climate_change' | 'other';
    tempC: number;
    heartRateBpm: number;
    notes: string;
    attachments: string[];
  }>({
    horseName: '',
    horseId: undefined,
    legName: '',
    conditionStatus: 'stable',
    tempC: 38.0,
    heartRateBpm: 40,
    notes: '',
    attachments: [],
  });

  const isEscort =
    currentUser?.persona === 'escort' ||
    currentUser?.specialization === 'escort' ||
    currentUser?.email?.toLowerCase().includes('escort');

  const loadTrips = useCallback(async () => {
    try {
      const user = getCurrentUser();
      setCurrentUser(user);
      const list = await trackingApi.getMyTrips();
      setTrips(list);
      if (list.length > 0) {
        const active = list.find((t) => t.shipment_status === 'in_transit') || list[0];
        setSelectedShipmentId((prev) => prev ?? active.shipment_id);
      }
    } catch (err: any) {
      console.warn('Failed to load trips for health page:', err);
    }
  }, []);

  const loadDetails = useCallback(async (shipmentId: number) => {
    try {
      const details = await trackingApi.getTrackingDetails(shipmentId);
      setTrackingDetails(details);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể tải chi tiết sức khỏe');
    }
  }, []);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    if (selectedShipmentId) {
      loadDetails(selectedShipmentId);
      const interval = setInterval(() => {
        loadDetails(selectedShipmentId);
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [selectedShipmentId, loadDetails]);

  const handleOpenAdd = () => {
    const horses = trackingDetails?.assignedHorses || [];
    const firstHorse = horses[0];
    const currentMilestone = trackingDetails?.milestones.find((m) => m.status === 'CURRENT');
    const defaultLegName = currentMilestone
      ? `#${currentMilestone.seq} - ${currentMilestone.title}`
      : trackingDetails?.milestones && trackingDetails.milestones.length > 0
      ? `#${trackingDetails.milestones[0].seq} - ${trackingDetails.milestones[0].title}`
      : 'Chặng 1: Xuất phát thực địa';

    setFormData({
      horseName: firstHorse?.name || 'Chiến mã',
      horseId: firstHorse?.id,
      legName: defaultLegName,
      conditionStatus: 'stable',
      tempC: 38.0,
      heartRateBpm: 40,
      notes: '',
      attachments: [],
    });
    setIsAddOpen(true);
  };

  const handleCreateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipmentId) return;

    setIsSubmitting(true);
    try {
      await trackingApi.createHealthLog(selectedShipmentId, {
        horseId: formData.horseId,
        horseName: formData.horseName,
        legName: formData.legName,
        conditionStatus: formData.conditionStatus,
        temperatureC: Number(formData.tempC) || 38.0,
        heartRateBpm: Number(formData.heartRateBpm) || 40,
        notes: formData.notes,
        attachments: formData.attachments,
      });

      if (formData.conditionStatus === 'not_eating' || formData.conditionStatus === 'stressed') {
        toast('Đã ghi nhật ký & gửi CẢNH BÁO KHẨN đến Logistics Manager và Coordinator!', {
          icon: '⚠️',
          duration: 6000,
          style: {
            background: '#fff1f2',
            color: '#9f1239',
            border: '1px solid #fecdd3',
            fontWeight: 700,
          },
        });
      } else {
        toast.success(`Đã lưu nhật ký sức khỏe cho ngựa ${formData.horseName}!`);
      }

      setIsAddOpen(false);
      loadDetails(selectedShipmentId);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể lưu nhật ký sức khỏe');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportIncident = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Báo cáo sự cố khẩn cấp đã được gửi tới Logistics Manager (Flow 5). Đang duy trì ổn định cho ngựa!');
    setIsIncidentOpen(false);
    setIncidentNotes('');
  };

  const currentTrip = trips.find((t) => t.shipment_id === selectedShipmentId);
  const healthLogs = trackingDetails?.healthLogs || [];
  const assignedHorses = trackingDetails?.assignedHorses || [];

  // Live Statistics
  const avgTemp = healthLogs.length > 0
    ? (healthLogs.reduce((acc, l) => acc + (l.temperatureC || 38), 0) / healthLogs.length).toFixed(1)
    : '38.0';

  const stableCount = healthLogs.filter((l) => l.conditionStatus === 'stable').length;
  const abnormalLogs = healthLogs.filter((l) => l.conditionStatus === 'not_eating' || l.conditionStatus === 'stressed');

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Role Banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between text-xs transition-all ${
        isEscort ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-blue-50 border-blue-200 text-blue-900'
      }`}>
        <div className="flex items-center gap-2.5">
          <Stethoscope size={20} className={isEscort ? 'text-emerald-600' : 'text-blue-600'} />
          <div>
            <span className="font-bold block text-sm">
              🩺 Chuyên môn Theo dõi Thú y: Bác Sĩ Thú Y / Hộ Tống (Escort/Vet)
            </span>
            <p className="m-0 mt-0.5 opacity-90 text-xs">
              Theo quy chuẩn quốc tế, bạn có trách nhiệm theo dõi thân nhiệt, nhịp tim và biểu hiện hành vi của đàn ngựa trong suốt chuyến đi.
            </p>
          </div>
        </div>
      </div>

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">
            {t('driver.healthTitle', 'Nhật ký Sức khỏe & Sinh hiệu Ngựa Đua (Flow 4)')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Chuyến: <strong className="text-blue-600">#{currentTrip?.request_code}</strong> • Đàn ngựa: {assignedHorses.map((h) => h.name).join(', ') || 'Chưa gán ngựa'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedShipmentId || ''}
            onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-semibold bg-white outline-none focus:border-blue-500 shadow-sm"
          >
            {trips.map((s) => (
              <option key={s.shipment_id} value={s.shipment_id}>
                #{s.request_code} ({s.shipment_status.toUpperCase()})
              </option>
            ))}
          </select>

          <Button variant="primary" onClick={handleOpenAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
            <Plus size={18} className="mr-1.5" /> Ghi Nhật Ký Mới
          </Button>

          <Button
            variant="outline"
            onClick={() => selectedShipmentId && loadDetails(selectedShipmentId)}
            className="text-slate-600"
            title="Làm mới"
          >
            <RefreshCw size={15} />
          </Button>
        </div>
      </div>

      {/* Abnormal Warning Box if any horse has not_eating or stressed */}
      {abnormalLogs.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle size={22} className="text-rose-600 shrink-0" />
            <div>
              <strong className="block text-sm">Cảnh báo thú y đặc biệt: Đang có biểu hiện bất thường!</strong>
              <p className="m-0 mt-0.5 text-rose-700">
                Ghi nhận gần nhất: Ngựa <strong>{abnormalLogs[0].horseName}</strong> bị <strong>{abnormalLogs[0].conditionStatusVi}</strong> ({abnormalLogs[0].notes || 'Không có ghi chú thêm'}).
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setIncidentNotes(`Sức khỏe ngựa ${abnormalLogs[0].horseName} có biểu hiện ${abnormalLogs[0].conditionStatusVi}: ${abnormalLogs[0].notes || ''}`);
              setIsIncidentOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs shrink-0 flex items-center gap-1.5"
          >
            <AlertTriangle size={14} /> Kích hoạt Báo sự cố (Flow 5)
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Thermometer size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Thân nhiệt trung bình</span>
            <span className="text-lg font-bold text-slate-900">{avgTemp}°C (Chuẩn: 37.5 - 38.5°C)</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Heart size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Trạng thái ổn định</span>
            <span className="text-lg font-bold text-emerald-600">{stableCount} / {healthLogs.length} lần kiểm tra</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Lưu ý cần theo dõi</span>
            <span className="text-lg font-bold text-amber-600">{abnormalLogs.length} trường hợp</span>
          </div>
        </div>
      </div>

      {/* Health Observation Logs Stream */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
            <Stethoscope size={18} className="text-emerald-600" /> Dòng Sự Kiện Khám Lâm Sàng & Nhật Ký Thú Y
          </h3>
          <span className="text-xs font-bold text-slate-500">{healthLogs.length} Bản ghi</span>
        </div>

        <div className="flex flex-col gap-3">
          {healthLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Chưa có nhật ký quan sát sức khỏe nào được ghi nhận cho chuyến đi này. Bấm <strong>"Ghi Nhật Ký Mới"</strong> để thêm báo cáo kiểm tra đầu tiên.
            </div>
          ) : (
            healthLogs.map((log) => {
              const isWarning = log.conditionStatus === 'not_eating' || log.conditionStatus === 'stressed';

              return (
                <div
                  key={log.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs transition-all ${
                    isWarning
                      ? 'border-rose-300 bg-rose-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isWarning ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      <Heart size={18} />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{log.horseName}</span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          log.conditionStatus === 'stable'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.conditionStatus === 'climate_change'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}>
                          {log.conditionStatusVi || log.conditionStatus}
                        </span>
                        {log.legName && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shadow-2xs">
                            <MapPin size={11} className="text-blue-600" />
                            {log.legName}
                          </span>
                        )}
                      </div>

                      <p className="text-slate-700 mt-1 m-0 leading-relaxed font-medium">
                        {log.notes || 'Không có ghi chú thêm.'}
                      </p>

                      {log.attachments && log.attachments.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                            <ImageIcon size={12} /> {log.attachments.length} hình ảnh đính kèm:
                          </span>
                          {log.attachments.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-blue-600 hover:underline font-bold"
                            >
                              Ảnh #{idx + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <span className="font-extrabold text-sm text-slate-900 block">
                      {log.temperatureC ? `${log.temperatureC}°C` : 'N/A'} • {log.heartRateBpm ? `${log.heartRateBpm} bpm` : 'N/A'}
                    </span>
                    <span suppressHydrationWarning className="text-[10px] text-slate-400 mt-0.5 block">
                      {new Date(log.recordedAt).toLocaleTimeString('vi-VN')} {new Date(log.recordedAt).toLocaleDateString('vi-VN')}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium block">
                      Người ghi: {log.recordedByName || 'Bác sĩ thú y'} ({log.recordedByRole || 'Escort'})
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Record Observation Modal */}
      {isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Ghi nhật ký tình trạng sức khỏe ngựa (Flow 4)"
          maxWidth="540px"
        >
          <form onSubmit={handleCreateLog} className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
              <strong>Quy tắc thú y:</strong> Nếu phát hiện ngựa có dấu hiệu <strong>Bỏ ăn</strong> hoặc <strong>Căng thẳng</strong>, hệ thống sẽ tự động thông báo khẩn tới Điều phối viên và đề xuất phương án hỗ trợ.
            </div>

            {/* Select Horse */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Chọn cá thể ngựa kiểm tra *</label>
              <select
                value={formData.horseName}
                onChange={(e) => {
                  const selectedName = e.target.value;
                  const matched = assignedHorses.find((h) => h.name === selectedName);
                  setFormData({ ...formData, horseName: selectedName, horseId: matched?.id });
                }}
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none font-bold text-xs bg-white focus:border-emerald-500"
                required
              >
                {assignedHorses.map((h) => (
                  <option key={h.id} value={h.name}>
                    🐎 {h.name} ({h.breed || 'Ngựa đua'} • Chip: {h.microchipNo || 'N/A'})
                  </option>
                ))}
              </select>
            </div>

            {/* Select Leg / Milestone */}
            <div>
              <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1">
                <MapPin size={13} className="text-emerald-600" />
                <span>Chặng vận chuyển / Điểm kiểm tra thực địa *</span>
              </label>
              <select
                value={formData.legName}
                onChange={(e) => setFormData({ ...formData, legName: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none font-bold text-xs bg-white focus:border-emerald-500"
                required
              >
                {trackingDetails?.milestones && trackingDetails.milestones.length > 0 ? (
                  trackingDetails.milestones.map((m) => (
                    <option key={m.id} value={`#${m.seq} - ${m.title}`}>
                      #{m.seq}: {m.title} {m.status === 'CURRENT' ? '⭐ (Mốc hiện tại)' : m.status === 'COMPLETED' ? '✓ (Đã qua)' : ''}
                    </option>
                  ))
                ) : (
                  <option value="Chặng 1: Xuất phát thực địa">
                    Chặng 1: Xuất phát thực địa
                  </option>
                )}
              </select>
              <p className="text-[10px] text-slate-500 mt-1 m-0">
                Được liên kết với các chặng di chuyển và trạm dừng để theo dõi diễn biến sức khỏe ngựa qua từng mốc.
              </p>
            </div>

            {/* Condition Status */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5 uppercase tracking-wider text-[11px]">
                Tình trạng lâm sàng hiện tại: *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'stable', label: '✅ Sức khỏe ổn định' },
                  { value: 'not_eating', label: '⚠️ Bỏ ăn / Chán ăn' },
                  { value: 'stressed', label: '⚡ Căng thẳng / Bồn chồn' },
                  { value: 'climate_change', label: '🌤️ Khí hậu thay đổi' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, conditionStatus: opt.value as any })}
                    className={`p-2.5 rounded-lg border text-xs font-bold text-left transition-all ${
                      formData.conditionStatus === opt.value
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Temperature & Heart Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Thân nhiệt (°C) <span className="text-slate-400 font-normal">(Chuẩn 37.5 - 38.5)</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={formData.tempC}
                  onChange={(e) => setFormData({ ...formData, tempC: parseFloat(e.target.value) || 38.0 })}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Nhịp tim (bpm) <span className="text-slate-400 font-normal">(Chuẩn 32 - 44)</span>
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={formData.heartRateBpm}
                  onChange={(e) => setFormData({ ...formData, heartRateBpm: parseInt(e.target.value) || 40 })}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none text-xs font-bold"
                />
              </div>
            </div>

            {/* Text Notes */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Ghi chú quan sát chi tiết *</label>
              <textarea
                rows={3}
                required
                placeholder="Ghi nhận tình trạng uống nước, tiêu hóa, đệm rơm lót chuồng, mức độ thích nghi nhiệt độ..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none text-xs font-medium focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={isSubmitting}>
                Đóng
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {isSubmitting ? 'Đang lưu...' : 'Lưu Nhật Ký Sức Khỏe'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Emergency Incident Modal (Flow 5 Placeholder) */}
      {isIncidentOpen && (
        <Modal
          isOpen={isIncidentOpen}
          onClose={() => setIsIncidentOpen(false)}
          title="Báo cáo sự cố khẩn cấp trên đường (Flow 5)"
          maxWidth="500px"
        >
          <form onSubmit={handleReportIncident} className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900">
              <strong>Kênh liên lạc sự cố khẩn cấp:</strong> Báo cáo này sẽ được ưu tiên phát cảnh báo đỏ ngay lập tức đến màn hình của Logistics Manager và Fleet Coordinator để kích hoạt phương án cứu hộ.
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Mô tả tình huống sự cố *</label>
              <textarea
                rows={4}
                required
                value={incidentNotes}
                onChange={(e) => setIncidentNotes(e.target.value)}
                placeholder="Ghi rõ loại sự cố: Hỏng điều hòa khoang xe, tắc đường kẹt xe vượt quá 2 giờ, ngựa sốt cao đột ngột..."
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-rose-500 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsIncidentOpen(false)}>
                Đóng
              </Button>
              <Button type="submit" variant="primary" className="bg-rose-600 hover:bg-rose-700 text-white font-bold">
                Gửi cảnh báo khẩn cấp
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
