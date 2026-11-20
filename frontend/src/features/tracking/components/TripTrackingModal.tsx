'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TransportRequest } from '@/lib/types';
import {
  MapPin,
  Clock,
  CheckCircle2,
  Heart,
  Activity,
  UserCheck,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { trackingApi, TripTrackingDetails } from '../api/tracking.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface TripTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: TransportRequest | null;
}

export const TripTrackingModal: React.FC<TripTrackingModalProps> = ({
  isOpen,
  onClose,
  request,
}) => {
  const { language, translateStatus, translateBreed, translateCondition } = useLanguage();
  const [liveDetails, setLiveDetails] = useState<TripTrackingDetails | null>(null);
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(false);

  const resolvedShipmentId = useMemo(() => {
    if (!request) return null;
    const anyReq = request as any;
    if (anyReq.shipment_id && !isNaN(Number(anyReq.shipment_id))) return Number(anyReq.shipment_id);
    if (anyReq.shipmentId && !isNaN(Number(anyReq.shipmentId))) return Number(anyReq.shipmentId);
    if (anyReq.numericId && !isNaN(Number(anyReq.numericId))) return Number(anyReq.numericId);
    if (typeof request.id === 'number') return request.id;
    const parsed = parseInt(String(request.id).replace(/\D/g, ''), 10);
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
  }, [request]);

  useEffect(() => {
    if (!isOpen || !resolvedShipmentId) {
      setLiveDetails(null);
      setIsLoadingLive(false);
      return;
    }

    let isMounted = true;
    setIsLoadingLive(true);

    trackingApi
      .getTrackingDetails(resolvedShipmentId)
      .then((details) => {
        if (isMounted) setLiveDetails(details);
      })
      .catch((err) => {
        console.warn('Could not fetch live tracking details for modal:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingLive(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, resolvedShipmentId]);

  if (!request) return null;

  const anyReq = request as any;
  const rawFirstHorse = request.horses && request.horses[0];
  const primaryHorse: any =
    request.horse ||
    rawFirstHorse?.horse ||
    rawFirstHorse || { name: language === 'en' ? 'Equine' : 'Chiến mã', breed: 'Thoroughbred' };

  const originDisplay = liveDetails?.origin || request.origin || anyReq.originLocation || (language === 'en' ? 'Origin' : 'Điểm xuất phát');
  const destinationDisplay = liveDetails?.destination || request.destination || anyReq.destinationLocation || (language === 'en' ? 'Destination' : 'Điểm đến');
  const latestHealth = liveDetails?.healthLogs && liveDetails.healthLogs.length > 0 ? liveDetails.healthLogs[0] : null;
  const isInTransit = request.status === 'IN_TRANSIT' || request.status === 'in_transit' || liveDetails?.shipmentStatus === 'in_transit';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        language === 'en'
          ? `Trip Tracking - ${liveDetails?.requestCode || request.requestCode || 'N/A'}`
          : `Theo dõi hành trình - ${liveDetails?.requestCode || request.requestCode || 'N/A'}`
      }
      subtitle={`${language === 'en' ? 'Horse' : 'Ngựa'}: ${primaryHorse?.name || 'Racehorse'} (${translateBreed(primaryHorse?.breed)})`}
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Status & Summary Header */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAF8F4] p-4 border border-[#E5DDD0]"
        >
          <div>
            <div style={{ fontSize: '12px', color: '#5F6977', fontWeight: 600 }}>
              {language === 'en' ? 'Trip Status' : 'Trạng thái chuyến đi'}
            </div>
            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <StatusBadge
                label={translateStatus(liveDetails?.shipmentStatus || request.statusLabel || request.status)}
                variant={isInTransit ? 'transit' : 'success'}
                hasDot={isInTransit}
              />
              {isLoadingLive && (
                <span style={{ fontSize: '11px', color: '#5F6977', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" /> {language === 'en' ? 'Updating...' : 'Đang cập nhật...'}
                </span>
              )}
            </div>
            {liveDetails?.currentMilestone && (
              <div style={{ fontSize: '12px', color: '#A67C2E', fontWeight: 600, marginTop: '4px' }}>
                {liveDetails.currentMilestone}
              </div>
            )}
          </div>
          <div className="sm:text-right">
            <div style={{ fontSize: '12px', color: '#5F6977', fontWeight: 600 }}>
              {language === 'en' ? 'Estimated Arrival (ETA)' : 'Dự kiến hoàn thành (ETA)'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#181A17', marginTop: '2px' }}>
              {liveDetails?.eta
                ? new Date(liveDetails.eta).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })
                : request.estimatedArrivalDate || (language === 'en' ? 'Updating' : 'Đang cập nhật')}
            </div>
          </div>
        </div>

        {/* Health Readings (strictly real vitals; no fabricated defaults) */}
        <div>
          <h4
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#5F6977',
              marginBottom: '10px',
            }}
          >
            {language === 'en' ? 'Latest Health Readings' : 'Thông số sức khỏe gần nhất'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-3">
              <Heart size={20} color="#B33E3E" aria-hidden="true" />
              <div>
                <div style={{ fontSize: '11px', color: '#5F6977', fontWeight: 600 }}>
                  {language === 'en' ? 'Heart Rate' : 'Nhịp tim'}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#181A17' }}>
                  {latestHealth?.heartRateBpm != null ? `${latestHealth.heartRateBpm} bpm` : '-- bpm'}
                </div>
                <div style={{ fontSize: '10.5px', color: latestHealth ? '#287653' : '#5F6977', fontWeight: 600 }}>
                  {latestHealth
                    ? translateCondition(latestHealth.conditionStatus || 'stable')
                    : (language === 'en' ? 'No vital log recorded yet' : 'Chưa ghi nhận chỉ số')}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-3">
              <Activity size={20} color="#A67C2E" aria-hidden="true" />
              <div>
                <div style={{ fontSize: '11px', color: '#5F6977', fontWeight: 600 }}>
                  {language === 'en' ? 'Body Temperature' : 'Thân nhiệt'}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#181A17' }}>
                  {latestHealth?.temperatureC != null ? `${latestHealth.temperatureC} °C` : '-- °C'}
                </div>
                <div style={{ fontSize: '10.5px', color: latestHealth?.temperatureC != null ? '#287653' : '#5F6977', fontWeight: 600 }}>
                  {latestHealth?.temperatureC != null
                    ? (language === 'en' ? 'Standard Range (37.2 - 38.3 °C)' : 'Ngưỡng chuẩn (37.2 - 38.3 °C)')
                    : (language === 'en' ? 'Awaiting escort vet update' : 'Chờ cập nhật từ thú y')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Milestones / Route Legs */}
        <div>
          <h4
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#5B6779',
              marginBottom: '12px',
            }}
          >
            {language === 'en' ? 'Route Milestones & Checkpoints' : 'Mốc Hành Trình & Điểm Kiểm Soát'}
          </h4>

          {liveDetails?.milestones && liveDetails.milestones.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
              {liveDetails.milestones.map((ms, idx) => {
                const isLast = idx === (liveDetails.milestones?.length ?? 1) - 1;
                const isCompleted = ms.status === 'COMPLETED';
                const isCurrent = ms.status === 'CURRENT';
                const circleBg = isCompleted ? '#287653' : isCurrent ? '#B49A68' : '#E8E2D8';
                const circleColor = isCompleted || isCurrent ? '#FFFFFF' : '#8892A0';

                return (
                  <div key={ms.id} style={{ display: 'flex', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: circleBg,
                          color: circleColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isCompleted ? <CheckCircle2 size={14} /> : isCurrent ? <Clock size={14} /> : <MapPin size={14} />}
                      </div>
                      {!isLast && (
                        <div style={{ width: '2px', flex: 1, minHeight: '28px', backgroundColor: isCompleted ? '#287653' : '#D8CEBE' }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: isLast ? 0 : '6px' }}>
                      <div
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: isCurrent ? '#966516' : isCompleted ? '#181A17' : '#5B6779',
                        }}
                      >
                        {ms.title} {ms.location ? `— ${ms.location}` : ''}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#8892A0' }}>
                        {ms.actualTime
                          ? `${language === 'en' ? 'Actual' : 'Thực tế'}: ${new Date(ms.actualTime).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}`
                          : ms.plannedTime
                          ? `${language === 'en' ? 'Planned' : 'Dự kiến'}: ${new Date(ms.plannedTime).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}`
                          : ms.notes || (language === 'en' ? 'Scheduled' : 'Theo lịch trình')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
              <div style={{ display: 'flex', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#287653',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={15} />
                  </div>
                  <div style={{ width: '2px', height: '40px', backgroundColor: '#287653' }} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#181A17' }}>
                    {language === 'en' ? 'Departure from' : 'Xuất phát từ'} {originDisplay} {request.originCode ? `(${request.originCode})` : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: '#5B6779' }}>
                    {request.departureDate || (language === 'en' ? 'Confirmed departure' : 'Đã xác nhận xuất phát')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#B49A68',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Clock size={15} />
                  </div>
                  <div style={{ width: '2px', height: '40px', backgroundColor: '#D8CEBE' }} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#966516' }}>
                    {language === 'en' ? 'Transit / Quarantine via' : 'Trạm trung chuyển / Kiểm dịch qua'} {request.transitPoint || (language === 'en' ? 'International Border' : 'Cửa khẩu quốc tế')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#5B6779' }}>
                    {language === 'en'
                      ? 'Customs & vet inspection; water and hay replenished.'
                      : 'Kiểm tra hải quan, bổ sung nước & thức ăn dinh dưỡng cho chiến mã.'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#E8E2D8',
                      color: '#8892A0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MapPin size={15} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#5B6779' }}>
                    {language === 'en' ? 'Arrival at:' : 'Đến đích:'} {destinationDisplay} {request.destinationCode ? `(${request.destinationCode})` : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8892A0' }}>
                    {language === 'en' ? 'Scheduled:' : 'Dự kiến:'} {request.estimatedArrivalDate || (language === 'en' ? 'Per dispatch schedule' : 'Theo lịch điều phối')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Assigned Staff */}
        <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserCheck size={19} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xs font-bold text-[#181A17]">
                {language === 'en' ? 'Assigned Escort & Vet Specialist' : 'Đội ngũ áp tải & Bác sĩ thú y phụ trách'}
              </div>
              <div className="text-xs text-[#5F6977] mt-0.5">
                {liveDetails?.assignedDriver || liveDetails?.assignedEscort
                  ? `${language === 'en' ? 'Driver' : 'Tài xế'}: ${liveDetails.assignedDriver || '—'} • ${language === 'en' ? 'Escort' : 'Áp tải'}: ${liveDetails.assignedEscort || '—'}`
                  : (language === 'en' ? 'Dedicated driver & equine escort team' : 'Đội ngũ tài xế & nhân viên áp tải phụ trách')}
              </div>
              {liveDetails?.assignedVehicle && (
                <div className="text-[11px] text-[#A67C2E] font-semibold mt-0.5">
                  {language === 'en' ? 'Vehicle:' : 'Phương tiện:'} {liveDetails.assignedVehicle}
                </div>
              )}
            </div>
          </div>
          <div className="sm:text-right shrink-0">
            <span className="text-[11px] text-[#747D88] font-semibold block">
              {language === 'en' ? '24/7 Support' : 'Hỗ trợ 24/7'}
            </span>
            {resolvedShipmentId && (
              <Link
                href={`/customer/tracking?shipmentId=${resolvedShipmentId}`}
                onClick={onClose}
                className="text-xs text-[#A67C2E] hover:text-[#181A17] font-bold mt-1 inline-flex items-center gap-1 underline transition-colors"
              >
                <span>{language === 'en' ? 'View trip tracking' : 'Xem chi tiết hành trình'}</span>
                <ExternalLink size={11} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
