'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  ExternalLink,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { openAuthenticatedApiFile } from '@/lib/api-client';
import { trackingApi, AssignedTripSummary } from '@/features/tracking/api/tracking.api';
import { ChangeRequestItem, incidentsApi, IncidentDetailItem } from '@/features/incidents/api/incidents.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function DriverIncidentsPage() {
  const pathname = usePathname();
  const basePath = pathname?.startsWith('/escort') ? '/escort' : '/driver';
  const { t, language, translateStatus, translateIncident, translateSeverity } = useLanguage();
  const isEn = language === 'en';

  const [trips, setTrips] = useState<AssignedTripSummary[]>([]);
  const [incidents, setIncidents] = useState<IncidentDetailItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    shipmentId: 0,
    type: 'traffic_delay',
    severity: 'HIGH' as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    location: '',
    affectedBorderGate: '',
    description: '',
  });
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      setLoadError(null);

      try {
        const [myTripsRes, incRes] = await Promise.all([
          trackingApi.getMyTrips(),
          incidentsApi.listIncidents(),
        ]);
        const safeTrips = Array.isArray(myTripsRes) ? myTripsRes : [];
        const safeIncidents = Array.isArray(incRes) ? incRes : [];
        setTrips(safeTrips);
        setIncidents(safeIncidents);

        if (safeTrips.length > 0) {
          setForm((prev) =>
            prev.shipmentId === 0
              ? { ...prev, shipmentId: safeTrips[0].shipment_id }
              : prev,
          );
        }
      } catch (err: any) {
        const msg =
          err?.message ||
          t(
            'incidents.loadFailed',
            isEn ? 'Unable to load incident reports from server.' : 'Không thể tải dữ liệu sự cố từ hệ thống.',
          );
        setLoadError(msg);
        if (!silent) {
          toast.error(msg);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isEn, t],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openAddModal = () => {
    if (trips.length === 0) return;
    setForm({
      shipmentId: trips[0]?.shipment_id || 0,
      type: 'traffic_delay',
      severity: 'HIGH',
      location: '',
      affectedBorderGate: '',
      description: '',
    });
    setEvidenceFiles([]);
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    if (isSubmitting) return;
    setIsAddOpen(false);
    setEvidenceFiles([]);
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!form.description.trim()) {
      toast.error(
        t('incidents.descRequired', isEn ? 'Please describe the incident.' : 'Vui lòng nhập mô tả chi tiết sự cố gặp phải.'),
      );
      return;
    }
    if (!form.shipmentId) {
      toast.error(
        t('incidents.shipmentRequired', isEn ? 'Please select the affected trip.' : 'Vui lòng chọn chuyến đi gặp sự cố.'),
      );
      return;
    }
    if (evidenceFiles.some((f) => f.size > 5 * 1024 * 1024)) {
      toast.error(isEn ? 'Each evidence file must be <= 5MB.' : 'Mỗi tệp bằng chứng phải nhỏ hơn hoặc bằng 5MB.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedTrip = trips.find((tr) => tr.shipment_id === Number(form.shipmentId));
      const loc =
        form.location.trim() ||
        selectedTrip?.origin_location ||
        (isEn ? 'Field Location' : 'Vị trí thực địa');

      await incidentsApi.createIncident(Number(form.shipmentId), {
        incidentType: form.type,
        description: form.description.trim(),
        severity: form.severity.toLowerCase() as 'low' | 'medium' | 'high' | 'critical',
        locationText: loc,
        affectedBorderGate: form.affectedBorderGate.trim() || undefined,
        files: evidenceFiles.slice(0, 5),
      });

      toast.success(
        isEn
          ? 'Incident report submitted to Logistics Manager!'
          : 'Báo cáo sự cố thực địa đã gửi tới Quản lý Logistics!',
      );

      setIsAddOpen(false);
      setEvidenceFiles([]);
      await loadData(true);
    } catch (err: any) {
      toast.error(
        err?.message ||
          t('incidents.reportFailed', isEn ? 'Failed to send incident report.' : 'Không thể gửi báo cáo sự cố qua mạng.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIncidentIcon = (type: string) => {
    switch (type) {
      case 'traffic_delay':
        return '🚧 ';
      case 'vehicle_breakdown':
        return '🚚 ';
      case 'weather':
        return '🌧️ ';
      case 'border_issue':
        return '🛂 ';
      case 'horse_medical':
        return '🩺 ';
      default:
        return '⚠️ ';
    }
  };

  const changeTypeLabel = (ct: ChangeRequestItem['changeType']) => {
    const map: Record<string, { vi: string; en: string }> = {
      route: { vi: 'Đổi tuyến', en: 'Reroute' },
      cost: { vi: 'Điều chỉnh chi phí', en: 'Cost Adjustment' },
      schedule: { vi: 'Đổi lịch trình', en: 'Schedule Change' },
      vehicle: { vi: 'Đổi phương tiện', en: 'Vehicle Swap' },
      other: { vi: 'Thay đổi khác', en: 'Other Change' },
    };
    const m = map[ct];
    return m ? (isEn ? m.en : m.vi) : ct;
  };

  const changeStatusLabel = (st: ChangeRequestItem['status']) => {
    if (st === 'approved') return isEn ? 'Approved' : 'Đã duyệt';
    if (st === 'rejected') return isEn ? 'Rejected' : 'Từ chối';
    return isEn ? 'Pending approval' : 'Chờ duyệt';
  };

  const renderChangeRequestSummary = (cr: ChangeRequestItem) => (
    <span
      key={cr.id}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
        cr.status === 'approved'
          ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
          : cr.status === 'rejected'
          ? 'bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8]'
          : 'bg-[#FAF5EB] text-[#966516] border-[#D4C5A3]'
      }`}
    >
      #{cr.id} · {changeTypeLabel(cr.changeType)} — {changeStatusLabel(cr.status)}
      {cr.publishedAt ? (isEn ? ' · Published' : ' · Đã áp dụng') : ''}
    </span>
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#181A17] m-0">
          {t('driver.incidents.title', isEn ? 'Incident Reports' : 'Báo Cáo Sự Cố')}
        </h1>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={isRefreshing}
            className="min-h-[44px] px-4 rounded-xl border-[#D8CEBE] font-bold"
          >
            <RefreshCw size={15} className={`mr-1.5 text-[#A67C2E] ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('common.refresh', isEn ? 'Refresh' : 'Làm mới')}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isLoading || trips.length === 0}
            onClick={openAddModal}
            title={trips.length === 0 ? (isEn ? 'No assigned trips to report' : 'Chưa có chuyến đi nào được gán') : undefined}
            className="min-h-[44px] px-5 rounded-xl bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold shadow-sm disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <AlertTriangle size={17} className="mr-1.5" aria-hidden="true" />
            {t('driver.incidents.newIncidentBtn', isEn ? 'Report New Incident' : 'Báo Cáo Sự Cố Mới')}
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
            onClick={() => void loadData()}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw size={26} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <p className="text-xs font-semibold text-[#57564E] m-0">
            {t('driver.incidents.loading', isEn ? 'Loading field incident reports...' : 'Đang tải danh sách sự cố trên các chuyến đi được phân công...')}
          </p>
        </div>
      ) : incidents.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#E8F2EB] text-[#2D5A3F] flex items-center justify-center border border-[#2D5A3F]/20">
            <ShieldCheck size={28} aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-[#181A17] m-0">
            {t('driver.incidents.noIncidentsTitle', isEn ? 'No Incidents Recorded' : 'Chưa Có Sự Cố Nào Được Ghi Nhận')}
          </h2>
          <p className="text-xs text-[#57564E] max-w-md m-0 leading-relaxed">
            {trips.length === 0
              ? isEn
                ? 'You have no assigned shipments yet. Incident reporting unlocks automatically when a trip is assigned.'
                : 'Bạn hiện chưa có chuyến đi nào được phân công. Chức năng báo cáo sự cố sẽ mở khi có chuyến được giao.'
              : t(
                  'driver.incidents.noIncidentsDesc',
                  isEn
                    ? 'All your assigned shipments are operating safely. Tap "Report New Incident" if obstacles occur on the road.'
                    : 'Tất cả các chuyến đi được phân công của bạn hiện đang vận hành bình thường. Bấm "Báo Cáo Sự Cố Mới" nếu phát sinh trở ngại thực địa.',
                )}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {incidents.map((inc) => {
            const sevUpper = String(inc.severity || 'HIGH').toUpperCase();
            return (
              <div
                key={inc.id}
                className="bg-white rounded-2xl border border-[#D8CEBE] p-5 shadow-sm flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE5DA] pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-[#181A17] text-sm">
                      {inc.requestCode || `REQ-${String(inc.shipmentId).padStart(3, '0')}`}
                    </span>
                    <span className="font-bold text-[#181A17] text-sm">
                      • {getIncidentIcon(inc.incidentType)}
                      {translateIncident(inc.incidentType)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                        sevUpper === 'CRITICAL'
                          ? 'bg-rose-100 text-[#9E3B3B] border border-[#9E3B3B]/30'
                          : sevUpper === 'HIGH'
                          ? 'bg-[#FAF5EB] text-[#966516] border border-[#D4C5A3]'
                          : 'bg-[#F3EFE4] text-[#181A17] border border-[#D8CEBE]'
                      }`}
                    >
                      {translateSeverity(inc.severity)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        inc.status === 'resolved' || inc.status === 'closed'
                          ? 'bg-[#E8F2EB] text-[#2D5A3F] border border-[#2D5A3F]/25'
                          : 'bg-[#FAF5EB] text-[#966516] border border-[#D4C5A3]'
                      }`}
                    >
                      {translateStatus(inc.status)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-[#747D88]">
                    <Clock size={13} aria-hidden="true" />
                    <span>
                      {inc.reportedAt
                        ? new Date(inc.reportedAt).toLocaleString(isEn ? 'en-US' : 'vi-VN')
                        : '—'}
                    </span>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-[#3C403A] m-0 leading-relaxed font-medium break-words">
                  {inc.description}
                </p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#57564E]">
                  {inc.locationText && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={13} className="text-[#8A8478]" aria-hidden="true" />
                      {inc.locationText}
                    </span>
                  )}
                  {inc.affectedBorderGate && (
                    <span className="font-semibold text-[#966516]">
                      {isEn ? 'Border Gate:' : 'Cửa khẩu:'} {inc.affectedBorderGate}
                    </span>
                  )}
                </div>

                {inc.evidenceUrls && inc.evidenceUrls.length > 0 && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {inc.evidenceUrls.map((u, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => void openAuthenticatedApiFile(u)}
                        className="inline-flex items-center gap-1 text-[#A67C2E] font-bold hover:underline bg-transparent border-0 p-0 cursor-pointer"
                      >
                        <ExternalLink size={12} aria-hidden="true" />
                        {isEn ? `Evidence #${idx + 1}` : `Bằng chứng #${idx + 1}`}
                      </button>
                    ))}
                  </div>
                )}

                {inc.changeRequests && inc.changeRequests.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[#EAE5DA]">
                    {inc.changeRequests.map(renderChangeRequestSummary)}
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t border-[#EAE5DA]">
                  <Link
                    href={`${basePath}/status?shipmentId=${inc.shipmentId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A67C2E] hover:text-[#181A17] hover:underline no-underline"
                  >
                    <span>{isEn ? 'Open Trip Console' : 'Mở bảng điều hành chuyến'}</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REPORT NEW INCIDENT MODAL */}
      <Modal
        isOpen={isAddOpen}
        onClose={closeAddModal}
        closeDisabled={isSubmitting}
        title={t('driver.incidents.modalTitle', isEn ? 'Report New Route Incident' : 'Báo Cáo Sự Cố Tuyến Đường Mới')}
        maxWidth="540px"
      >
        <form onSubmit={handleReport} className="flex flex-col gap-4 text-xs">
          <div className="p-3.5 bg-rose-50 border border-[#9E3B3B]/30 rounded-xl text-rose-900 leading-relaxed">
            <strong className="block text-xs uppercase font-extrabold text-[#9E3B3B] mb-0.5">
              {isEn ? 'Emergency Rescue & Reroute Approval' : 'Quy trình Cứu hộ & Điều chỉnh Lộ trình'}
            </strong>
            {isEn
              ? 'Creates a live incident record for Logistics Manager to issue detour, backup vehicle, or veterinary support.'
              : 'Tạo hồ sơ sự cố thực địa gửi Quản lý Logistics để điều phối xe dự phòng, hỗ trợ thú y hoặc duyệt phương án đổi tuyến.'}
          </div>

          <div>
            <label htmlFor="inc-trip-select" className="font-bold text-[#181A17] block mb-1.5">
              {t('driver.incidents.affectedTripLabel', isEn ? 'Affected Trip *' : 'Chuyến đi gặp sự cố *')}
            </label>
            <select
              id="inc-trip-select"
              value={form.shipmentId}
              onChange={(e) => setForm({ ...form, shipmentId: Number(e.target.value) })}
              required
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] text-xs font-semibold bg-white outline-none focus:border-[#181A17]"
            >
              {trips.length === 0 ? (
                <option value={0}>
                  {t('driver.incidents.noTripsAssignedOption', isEn ? 'No assigned trips' : 'Chưa có chuyến đi nào được gán')}
                </option>
              ) : (
                trips.map((tr) => (
                  <option key={tr.shipment_id} value={tr.shipment_id}>
                    #{tr.customer_request_code || tr.request_code} — {tr.origin_location} → {tr.destination_location}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col justify-between">
              <label htmlFor="inc-type-select" className="font-bold text-[#181A17] block mb-1.5">
                {t('driver.incidents.classificationLabel', isEn ? 'Incident Type *' : 'Phân loại sự cố *')}
              </label>
              <select
                id="inc-type-select"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] text-xs font-semibold bg-white outline-none focus:border-[#181A17]"
              >
                <option value="traffic_delay">{translateIncident('traffic_delay')}</option>
                <option value="vehicle_breakdown">{translateIncident('vehicle_breakdown')}</option>
                <option value="weather">{translateIncident('weather')}</option>
                <option value="border_issue">{translateIncident('border_issue')}</option>
                <option value="horse_medical">{translateIncident('horse_medical')}</option>
                <option value="other">{translateIncident('other')}</option>
              </select>
            </div>

            <div className="flex flex-col justify-between">
              <label htmlFor="inc-severity-select" className="font-bold text-[#181A17] block mb-1.5">
                {t('incidents.severity', isEn ? 'Severity' : 'Mức độ nghiêm trọng')} <span className="text-[#9E3B3B]">*</span>
              </label>
              <select
                id="inc-severity-select"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as any })}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D8CEBE] text-xs font-semibold bg-white outline-none focus:border-[#181A17]"
              >
                <option value="CRITICAL">{translateSeverity('critical')}</option>
                <option value="HIGH">{translateSeverity('high')}</option>
                <option value="MEDIUM">{translateSeverity('medium')}</option>
                <option value="LOW">{translateSeverity('low')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col justify-between">
              <label htmlFor="inc-location-input" className="font-bold text-[#181A17] block mb-1.5">
                {t('driver.incidents.currentLocationLabel', isEn ? 'Field Location (Km / Highway)' : 'Vị trí thực địa (Km / Quốc lộ)')}
              </label>
              <input
                id="inc-location-input"
                type="text"
                placeholder={isEn ? 'e.g. Km 84+200 Highway 1A' : 'VD: Km 84+200 Quốc lộ 1A'}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#181A17]"
              />
            </div>

            <div className="flex flex-col justify-between">
              <label htmlFor="inc-border-input" className="font-bold text-[#181A17] block mb-1.5">
                {isEn ? 'Affected Border Gate (if detouring)' : 'Cửa khẩu ảnh hưởng (nếu có)'}
              </label>
              <input
                id="inc-border-input"
                type="text"
                placeholder={isEn ? 'e.g. Moc Bai / Lao Bao Gate' : 'VD: Cửa khẩu Mộc Bài / Lao Bảo'}
                value={form.affectedBorderGate}
                onChange={(e) => setForm({ ...form, affectedBorderGate: e.target.value })}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#181A17]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="inc-desc-textarea" className="font-bold text-[#181A17] block mb-1.5">
              {t('driver.incidents.situationDescLabel', isEn ? 'Detailed Situation *' : 'Mô tả chi tiết tình huống *')}
            </label>
            <textarea
              id="inc-desc-textarea"
              rows={3}
              required
              placeholder={
                isEn
                  ? 'Describe vehicle condition, congestion cause, or horse symptoms...'
                  : 'Nêu rõ tình trạng xe, nguyên nhân ùn tắc hoặc biểu hiện bất thường của ngựa để Quản lý lên phương án...'
              }
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-3 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#181A17] font-medium leading-relaxed"
            />
          </div>

          <div>
            <label htmlFor="inc-files-input" className="font-bold text-[#181A17] block mb-1.5">
              {isEn ? 'Field Evidence Photos / Reports (Max 5, <= 5MB each)' : 'Ảnh / Biên bản bằng chứng thực địa (Tối đa 5 tệp, <= 5MB/tệp)'}
            </label>
            <input
              id="inc-files-input"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={(e) => setEvidenceFiles(Array.from(e.target.files || []).slice(0, 5))}
              className="block w-full text-xs text-[#57564E]"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#EAE5DA]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeAddModal}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 rounded-xl border-[#D8CEBE]"
            >
              {t('common.cancel', isEn ? 'Cancel' : 'Hủy')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || !form.shipmentId}
              className="min-h-[44px] px-5 rounded-xl bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white font-bold cursor-pointer"
            >
              {isSubmitting
                ? t('common.sending', isEn ? 'Sending...' : 'Đang gửi...')
                : t('driver.incidents.sendReportBtn', isEn ? 'Submit Incident Report' : 'Gửi Báo Cáo Sự Cố')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
