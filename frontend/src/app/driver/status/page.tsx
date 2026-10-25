'use client';

import React, { useState, useEffect } from 'react';
import { 
  Crosshair, CheckCircle2, Clock, MapPin, AlertCircle, 
  Truck, Stethoscope, RefreshCw, AlertTriangle, ArrowRight, ShieldCheck, Flag, Plane
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { getCurrentUser } from '@/lib/auth';
import { 
  trackingApi, 
  AssignedTripSummary, 
  TripTrackingDetails, 
  TrackingMilestoneItem 
} from '@/features/tracking/api/tracking.api';
import toast from 'react-hot-toast';
import { useTracking } from '@/features/tracking/useTracking';
import { TrackingLoadState } from '@/features/tracking/components/TrackingLoadState';
import { JourneyHistory } from '@/features/tracking/components/JourneyHistory';
import { TrackingTelemetry } from '@/features/tracking/components/TrackingTelemetry';

export default function DriverStatusPage() {
  const { t } = useTranslation();
  const { currentUser, trips, selectedShipmentId, setSelectedShipmentId, trackingDetails, loading: isLoading, detailLoading, error: trackingError, refresh } = useTracking(15000);
  const loadDetails = async (_id: number) => { await refresh(); };
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check-in modal
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState<TrackingMilestoneItem | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState('');
  const [vehicleTemp, setVehicleTemp] = useState('');

  // Emergency Incident Modal Placeholder (Flow 5)
  const [isIncidentOpen, setIsIncidentOpen] = useState(false);


  const isEscort =
    currentUser?.specialization === 'escort';

  useEffect(() => { setIsCheckInOpen(false); setActiveMilestone(null); }, [selectedShipmentId]);

  const handleOpenCheckin = (milestone: TrackingMilestoneItem) => {
    setActiveMilestone(milestone);
    const defaultAction = milestone.allowedActions[0] || 'arrive_stop';
    setSelectedAction(defaultAction);
    setCheckInNotes('');
    setVehicleTemp('');
    setIsCheckInOpen(true);
  };

  const handleConfirmCheckin = async () => {
    if (!activeMilestone || !selectedShipmentId || !trackingDetails?.milestones.some(m => m.id === activeMilestone.id && m.allowedActions.includes(selectedAction))) {
      toast.error('Mốc đã thay đổi. Vui lòng tải lại hành trình.'); return;
    }

    setIsSubmitting(true);
    try {
      if (activeMilestone.itemType === 'leg_start') {
        await trackingApi.checkInLegStart(selectedShipmentId, activeMilestone.legId, {
          notes: checkInNotes,
        });
        toast.success(`Đã xác nhận xuất phát chặng!`);
      } else if (activeMilestone.itemType === 'stop') {
        const actionMap: Record<string, 'arrived' | 'departed' | 'customs_cleared'> = {
          arrive_stop: 'arrived',
          depart_stop: 'departed',
          clear_customs: 'customs_cleared',
        };
        const action = actionMap[selectedAction];
        if (!action) throw new Error('Thao tác không hợp lệ');
        await trackingApi.checkInStop(selectedShipmentId, activeMilestone.stopId!, {
          action,
          notes: checkInNotes,
          vehicleTemperatureC: vehicleTemp === '' ? undefined : Number(vehicleTemp),
        });
        toast.success(`Đã cập nhật mốc: ${activeMilestone.title}!`);
      } else if (activeMilestone.itemType === 'leg_end') {
        await trackingApi.checkInLegArrival(selectedShipmentId, activeMilestone.legId, {
          notes: checkInNotes,
        });
        toast.success(`Đã hoàn thành chặng đến nơi an toàn!`);
      }

      setIsCheckInOpen(false);
      loadDetails(selectedShipmentId);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể cập nhật mốc');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentTrip = trips.find((t) => t.shipment_id === selectedShipmentId);
  const milestones = trackingDetails?.milestones || [];
  const nextMilestone = milestones.find((m) => m.status === 'CURRENT');

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Role Banner */}
      <div className={`p-4 rounded-xl border flex flex-wrap gap-3 items-center justify-between text-xs transition-all ${
        !isEscort ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}>
        <div className="flex items-center gap-2.5">
          {!isEscort ? (
            <Truck size={20} className="text-blue-600 shrink-0" />
          ) : (
            <Stethoscope size={20} className="text-emerald-600 shrink-0" />
          )}
          <div>
            <span className="font-bold block text-sm">
              {!isEscort ? '🚚 Quyền cập nhật mốc: Tài Xế Lái Xe (Driver)' : '🩺 Quyền cập nhật: Bác Sĩ Thú Y / Hộ Tống (Escort/Vet)'}
            </span>
            <p className="m-0 mt-0.5 opacity-90 text-xs">
              {!isEscort
                ? 'Bạn trực tiếp điều khiển xe vận tải và xác nhận các trạm dừng, mốc kiểm tra thực địa của chặng đường bộ.'
                : 'Bạn phụ trách quan sát sức khỏe ngựa, xác nhận các mốc tại sân bay / chặng bay và phối hợp cùng tài xế.'}
            </p>
          </div>
        </div>

        {/* Nút Báo sự cố dẫn sang Flow 5 */}
        <button
          onClick={() => setIsIncidentOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shrink-0"
        >
          <AlertTriangle size={14} /> Liên hệ khi có sự cố
        </button>
      </div>

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">
            {t('driver.checkInTitle', 'Cập nhật hành trình')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Chuyến: <strong className="text-blue-600">#{currentTrip?.request_code || 'Chưa chọn'}</strong> • Tuyến: {currentTrip?.origin_location} → {currentTrip?.destination_location}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {/* Trip Selector */}
          <select
            value={selectedShipmentId || ''}
            onChange={(e) => setSelectedShipmentId(Number(e.target.value))}
            aria-label="Chọn chuyến đi" className="min-w-0 max-w-full flex-1 px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-semibold bg-white outline-none focus:border-blue-500 shadow-sm"
          >
            {selectedShipmentId == null && <option value="" disabled>Chọn chuyến đi</option>}
            {trips.map((s) => (
              <option key={s.shipment_id} value={s.shipment_id}>
                #{s.request_code} ({s.shipment_status.toUpperCase()})
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            onClick={() => selectedShipmentId && loadDetails(selectedShipmentId)}
            className="text-slate-600"
            title="Làm mới dữ liệu từ máy chủ" aria-label="Làm mới hành trình"
          >
            <RefreshCw size={15} />
          </Button>
        </div>
      </div>

      {/* Trip Information Cards */}
      {trackingDetails && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 bg-white border border-slate-200 rounded-xl">
            <span className="text-slate-400 font-semibold block uppercase text-[10px]">Trạng thái chuyến đi</span>
            <span className={`inline-block mt-1 font-bold px-2 py-0.5 rounded text-xs ${
              trackingDetails.shipmentStatus === 'in_transit' ? 'bg-blue-100 text-blue-800' :
              trackingDetails.shipmentStatus === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {trackingDetails.shipmentStatus === 'in_transit' ? 'Đang trên đường (In transit)' :
               trackingDetails.shipmentStatus === 'ready_to_depart' ? 'Sẵn sàng xuất phát' : trackingDetails.shipmentStatus}
            </span>
          </div>

          <div className="p-3.5 bg-white border border-slate-200 rounded-xl">
            <span className="text-slate-400 font-semibold block uppercase text-[10px]">Phương tiện & Tài xế</span>
            <span className="font-bold text-slate-800 block mt-1 break-words">
              {trackingDetails.assignedVehicle} • {trackingDetails.assignedDriver || 'Chưa gán'}
            </span>
          </div>

          <div className="p-3.5 bg-white border border-slate-200 rounded-xl">
            <span className="text-slate-400 font-semibold block uppercase text-[10px]">Hộ tống y tế (Escort/Vet)</span>
            <span className="font-bold text-slate-800 block mt-1 break-words">
              {trackingDetails.assignedEscort || 'Chưa gán'}
            </span>
          </div>

          <div className="p-3.5 bg-white border border-slate-200 rounded-xl">
            <span className="text-slate-400 font-semibold block uppercase text-[10px]">Chiến mã phụ trách</span>
            <span className="font-bold text-slate-800 block mt-1 break-words">
              {trackingDetails.assignedHorses.map((h) => h.name).join(', ') || 'Chiến mã'} ({trackingDetails.assignedHorses.length} con)
            </span>
          </div>
        </div>
      )}

      <TrackingLoadState loading={isLoading || detailLoading} error={trackingError} retry={refresh} />
      {!isLoading && !trackingError && trips.length === 0 && <p className="p-6 border rounded-xl">Bạn chưa được phân công chuyến đi.</p>}
      {trips.some(trip => trip.shipment_id === selectedShipmentId && !trip.is_confirmed) && <p className="p-4 border rounded-xl text-sm">Bạn cần <a className="text-blue-700 underline" href="/driver/trips">xác nhận nhận chuyến</a> trước khi check-in.</p>}
      {trackingDetails && <TrackingTelemetry details={trackingDetails} />}
      <JourneyHistory details={trackingDetails} />

      {/* Timeline of Real Legs and Stops */}
      {trackingDetails && <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 justify-between items-center mb-6">
          <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
            <Crosshair size={20} className="text-blue-600" /> Mốc hành trình
          </h3>
          <span className="text-xs font-bold text-slate-500">
            {milestones.filter((m) => m.status === 'COMPLETED').length} / {milestones.length} Mốc hoàn thành
          </span>
        </div>

        <div className="relative border-l-2 border-slate-200 ml-4 pl-6 flex flex-col gap-8">
          {milestones.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">Chuyến chưa có lộ trình. Vui lòng liên hệ điều phối viên.</p>
          ) : (
            milestones.map((m) => {
              const isCurrent = m.status === 'CURRENT';
              const isCompleted = m.status === 'COMPLETED';

              return (
                <div key={m.id} className="relative">
                  {/* Dot Indicator */}
                  <div
                    className={`absolute -left-[33px] top-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                      isCompleted
                        ? 'border-emerald-500 text-emerald-600'
                        : isCurrent
                        ? 'border-blue-600 text-blue-600 animate-pulse'
                        : 'border-slate-300 text-slate-300'
                    }`}
                  >
                    {isCompleted && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                    {isCurrent && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          #{m.seq}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-1.5">
                          {m.legType === 'flight' ? <Plane size={14} className="text-purple-600" /> : <Truck size={14} className="text-blue-600" />}
                          {m.title}
                        </h4>
                        {m.isCustomsBorder && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                            Hải quan / Kiểm dịch
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-700'
                              : isCurrent
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {isCompleted ? 'Đã hoàn tất' : isCurrent ? (m.actualTime ? 'Đã đến · chờ xác nhận tiếp' : 'Mốc tiếp theo') : 'Chờ tới lượt'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1 mt-1 m-0">
                        <MapPin size={12} className="text-slate-400" /> {m.location}
                        {m.actualTime ? (
                          <span className="text-emerald-700 font-semibold ml-2">
                            • Giờ thực tế: {new Date(m.actualTime).toLocaleTimeString('vi-VN')} ({new Date(m.actualTime).toLocaleDateString('vi-VN')})
                          </span>
                        ) : m.plannedTime ? (
                          <span className="text-slate-400 ml-2">
                            • Dự kiến: {new Date(m.plannedTime).toLocaleTimeString('vi-VN')}
                          </span>
                        ) : null}
                      </p>

                      {m.notes && (
                        <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600">
                          <strong>Ghi chú:</strong> {m.notes}
                          {m.updatedBy && <span className="text-slate-400 ml-2">• Cập nhật bởi: {m.updatedBy}</span>}
                        </div>
                      )}
                    </div>

                    {/* Action Button for Current Milestone */}
                    {isCurrent && m.allowedActions.length > 0 && (
                      <Button
                        variant="primary"
                        onClick={() => handleOpenCheckin(m)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 shadow-sm"
                      >
                        <CheckCircle2 size={15} className="mr-1.5" /> Báo cáo mốc này
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      }
      {/* Check-in Modal with Action Selection */}
      {isCheckInOpen && activeMilestone && (
        <Modal
          isOpen={isCheckInOpen}
          onClose={() => { if (!isSubmitting) setIsCheckInOpen(false); }}
          title={`Báo cáo mốc di chuyển - #${activeMilestone.seq}`}
          maxWidth="520px"
        >
          <form onSubmit={e => { e.preventDefault(); void handleConfirmCheckin(); }} className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed">
              <strong className="block text-sm mb-1">{activeMilestone.title}</strong>
              <p className="m-0 text-slate-600">
                Địa điểm: <strong>{activeMilestone.location}</strong> • Vai trò phụ trách:{' '}
                <strong>{activeMilestone.responsibleRole === 'driver' ? 'Tài xế lái xe' : 'Hộ tống y tế/bay'}</strong>
              </p>
            </div>

            {activeMilestone.itemType === 'stop' && <label className="font-semibold text-slate-700">Nhiệt độ thùng xe (°C, tùy chọn)
              <input aria-label="Nhiệt độ thùng xe" type="number" min="-30" max="70" step="0.1" value={vehicleTemp} onChange={e => setVehicleTemp(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
            </label>}
            {/* Action Select for Stops */}
            {activeMilestone.itemType === 'stop' && (
              <div>
                <label className="font-bold text-slate-700 block mb-1.5 uppercase tracking-wider text-[11px]">
                  Chọn thao tác báo cáo mốc: <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col gap-2">
                  {activeMilestone.allowedActions.map((act) => {
                    const labelMap: Record<string, string> = {
                      arrive_stop: '📍 Đã tới điểm dừng (Nghỉ ngựa / Thú y)',
                      clear_customs: '🛂 Đã hoàn thành thông quan & kiểm dịch thú y',
                      depart_stop: '🚛 Đã rời điểm dừng để tiếp tục hành trình',
                    };
                    return (
                      <label
                        key={act}
                        className={`p-3 rounded-lg border flex items-center gap-2.5 cursor-pointer font-bold ${
                          selectedAction === act
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="milestone_action"
                          checked={selectedAction === act}
                          onChange={() => setSelectedAction(act)}
                          className="text-blue-600"
                        />
                        <span>{labelMap[act] || act}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action for Leg Start / Leg End */}
            {activeMilestone.itemType === 'leg_start' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 font-semibold">
                🚀 Bạn đang bấm xác nhận <strong>"ĐÃ XUẤT PHÁT"</strong> chặng đường này. Giờ thực tế sẽ được tự động ghi nhận và thông báo sẽ gửi tới Khách hàng.
              </div>
            )}

            {activeMilestone.itemType === 'leg_end' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 font-semibold">
                🏁 Bạn đang bấm xác nhận <strong>"ĐÃ ĐẾN NƠI"</strong> chặng này an toàn.
              </div>
            )}

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Ghi chú thực địa của Tài xế / Hộ tống viên:
              </label>
              <textarea
                aria-label="Ghi chú check-in" maxLength={2000} rows={3}
                placeholder="Ví dụ: Xe đã qua trạm an toàn, nhiệt độ thùng xe ổn định 18°C, các chiến mã được uống nước đầy đủ..."
                value={checkInNotes}
                onChange={(e) => setCheckInNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-xs font-medium"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsCheckInOpen(false)} disabled={isSubmitting}>
                Hủy
              </Button>
              <Button
                type="submit" variant="primary"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {isSubmitting ? 'Đang lưu...' : 'Xác nhận Báo cáo Mốc'}
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
          <p className="text-sm text-slate-700">Kênh báo sự cố trực tuyến chưa được kết nối. Vui lòng liên hệ trực tiếp điều phối viên và bác sĩ thú y để xử lý khẩn cấp.</p>
          <Button className="mt-4" onClick={() => setIsIncidentOpen(false)}>Đóng</Button>
        </Modal>
      )}
    </div>
  );
}
