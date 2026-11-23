'use client';

import React, { useState } from 'react';
import {
  RotateCcw,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  getReturnCancellationPreview,
  cancelReturnLeg,
  companyCancelReturnLeg,
  rescheduleReturnLeg,
  ReturnCancellationPreview,
} from '../return-api';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface RoundTripPanelProps {
  order: any;
  userRole?: string;
  onRefresh?: () => void;
}

export function RoundTripPanel({ order, userRole, onRefresh }: RoundTripPanelProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isCompanyCancelModalOpen, setIsCompanyCancelModalOpen] = useState(false);

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<ReturnCancellationPreview | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const [newDepartureAt, setNewDepartureAt] = useState('');
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);

  const [companyCancelReason, setCompanyCancelReason] = useState('');
  const [isSubmittingCompanyCancel, setIsSubmittingCompanyCancel] = useState(false);

  // Check if shipment is round-trip
  const isRoundTrip = order?.trip_type === 'round_trip' || order?.tripType === 'round_trip';
  if (!isRoundTrip) return null;

  const returnStatus = order.return_status || order.returnStatus || 'scheduled';
  const returnDepartureAt = order.return_departure_at || order.returnDepartureAt;
  const returnWaitMinutes = order.return_wait_minutes || order.returnWaitMinutes || 120;
  const returnNoShow = order.return_no_show ?? order.returnNoShow ?? false;
  const returnRescheduleFee = Number(order.return_reschedule_fee || order.returnRescheduleFee || 0);

  const formatVnd = (val: number) => Math.round(val).toLocaleString('vi-VN') + ' đ';

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? isoStr : d.toLocaleString('vi-VN');
  };

  const handleOpenCancelPreview = async () => {
    setIsLoadingPreview(true);
    setIsPreviewModalOpen(true);
    try {
      const data = await getReturnCancellationPreview(order.id || order.shipment_id);
      setPreviewData(data);
    } catch (err: any) {
      toast.error(err.message || (isEn ? 'Failed to fetch refund preview' : 'Không thể xem tiền hoàn'));
      setIsPreviewModalOpen(false);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmCustomerCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error(isEn ? 'Please enter a cancellation reason' : 'Vui lòng nhập lý do hủy');
      return;
    }
    setIsSubmittingCancel(true);
    try {
      await cancelReturnLeg(order.id || order.shipment_id, cancelReason);
      toast.success(isEn ? 'Return leg cancelled successfully' : 'Đã hủy chặng về thành công');
      setIsPreviewModalOpen(false);
      setCancelReason('');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || (isEn ? 'Cancellation failed' : 'Hủy chặng về thất bại'));
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleConfirmCompanyCancel = async () => {
    if (!companyCancelReason.trim()) {
      toast.error(isEn ? 'Please enter a cancellation reason' : 'Vui lòng nhập lý do hủy của công ty');
      return;
    }
    setIsSubmittingCompanyCancel(true);
    try {
      await companyCancelReturnLeg(order.id || order.shipment_id, companyCancelReason);
      toast.success(isEn ? 'Company cancelled return leg' : 'Công ty đã hủy chặng về và khởi tạo hoàn 100%');
      setIsCompanyCancelModalOpen(false);
      setCompanyCancelReason('');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || (isEn ? 'Company cancel failed' : 'Hủy chặng về thất bại'));
    } finally {
      setIsSubmittingCompanyCancel(false);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!newDepartureAt) {
      toast.error(isEn ? 'Please select a new departure time' : 'Vui lòng chọn ngày giờ hẹn mới');
      return;
    }
    setIsSubmittingReschedule(true);
    try {
      await rescheduleReturnLeg(order.id || order.shipment_id, new Date(newDepartureAt).toISOString());
      toast.success(isEn ? 'Return departure rescheduled successfully' : 'Đã đổi ngày đón chặng về thành công');
      setIsRescheduleModalOpen(false);
      setNewDepartureAt('');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || (isEn ? 'Reschedule failed' : 'Đổi ngày về thất bại'));
    } finally {
      setIsSubmittingReschedule(false);
    }
  };

  const isCustomer = !userRole || userRole.toLowerCase().includes('customer');
  const isManagerOrAdmin = userRole && (userRole.toLowerCase().includes('manager') || userRole.toLowerCase().includes('admin'));

  // Calculate reschedule fee preview client-side for guidance
  const calculateClientRescheduleFee = () => {
    if (!newDepartureAt || !returnDepartureAt) return 0;
    const oldDep = new Date(returnDepartureAt).getTime();
    const now = Date.now();
    const hoursLeft = (oldDep - now) / 3600000;
    if (hoursLeft >= 168) return 0;
    // Estimated 10%
    const estFreight = Number(order.return_freight_total || order.returnFreightTotal || 10000000);
    return Math.ceil((estFreight * 0.1) / 1000) * 1000;
  };

  return (
    <div className="rounded-2xl border-2 border-[#A67C2E]/40 bg-[#FAF8F4] overflow-hidden shadow-sm my-5">
      {/* Header */}
      <div className="px-5 py-3.5 bg-[#F0EBE0] border-b border-[#D8CEBE] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-[#A67C2E]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#181A17]">
            {isEn ? 'Round-Trip Service Details' : 'Thông Tin Vận Chuyển Khứ Hồi'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#E5DDD0] text-[11px] font-bold text-[#6D7785]">
            {isEn ? 'Discount 10%' : 'Ưu đãi -10% Chặng về'}
          </span>
        </div>

        {/* Status Badge */}
        <div>
          {returnStatus === 'scheduled' && (
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold">
              {isEn ? 'Return Scheduled' : 'Chờ Khởi Hành Chặng Về'}
            </span>
          )}
          {returnStatus === 'in_progress' && (
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-xs font-bold animate-pulse">
              {isEn ? 'Return In Progress' : 'Đang Vận Chuyển Chặng Về'}
            </span>
          )}
          {returnStatus === 'completed' && (
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1">
              <CheckCircle2 size={13} />
              {isEn ? 'Return Completed' : 'Chặng Về Hoàn Thành'}
            </span>
          )}
          {returnStatus === 'cancelled' && (
            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-300 text-xs font-bold flex items-center gap-1">
              <XCircle size={13} />
              {isEn ? 'Return Cancelled' : 'Đã Hủy Chặng Về'}
            </span>
          )}
          {returnStatus === 'no_show' && (
            <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold flex items-center gap-1">
              <AlertTriangle size={13} />
              {isEn ? 'No-Show Recorded' : 'Khách Không Giao Ngựa (No-Show)'}
            </span>
          )}
        </div>
      </div>

      {/* Body info */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-white rounded-xl border border-[#E5DDD0]">
            <span className="text-[#6D7785] block mb-1">
              {isEn ? 'Return Departure Time:' : 'Giờ đón chặng về:'}
            </span>
            <span className="font-bold text-[#181A17] text-sm flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#A67C2E]" />
              {formatDate(returnDepartureAt)}
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-[#E5DDD0]">
            <span className="text-[#6D7785] block mb-1">
              {isEn ? 'Driver Waiting Time:' : 'Thời gian tài xế chờ tối đa:'}
            </span>
            <span className="font-bold text-[#181A17] text-sm flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#287653]" />
              {returnWaitMinutes} {isEn ? 'minutes' : 'phút (quá giờ tính no-show)'}
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-[#E5DDD0]">
            <span className="text-[#6D7785] block mb-1">
              {isEn ? 'Reschedule Fee Recorded:' : 'Phí đổi ngày đã ghi nhận:'}
            </span>
            <span className="font-bold text-[#181A17] text-sm font-mono">
              {formatVnd(returnRescheduleFee)}
            </span>
          </div>
        </div>

        {/* No-show Alert if applicable */}
        {returnNoShow && (
          <div className="p-3.5 rounded-xl border border-red-300 bg-red-50 text-xs text-red-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong>{isEn ? 'No-show Recorded: ' : 'Biên bản Khách không giao ngựa (No-show): '}</strong>
              {isEn
                ? 'The driver waited the required 120 minutes at the return pickup location, but the horses were not handed over. The return leg has been closed with no freight refund as per agreed policy.'
                : 'Tài xế đã chờ đủ 120 phút tại điểm đón nhưng không nhận được ngựa. Chuyến đi đã được đóng lại và không hoàn cước theo đúng cam kết chính sách.'}
            </div>
          </div>
        )}

        {/* Agreed Policy Snapshot Notice */}
        <div className="p-3.5 rounded-xl border border-[#E5DDD0] bg-[#F5EFE2]/60 text-xs text-[#5F6977] leading-relaxed">
          <strong>{isEn ? 'Agreed Policy Terms: ' : 'Chính sách đã cam kết: '}</strong>
          {isEn
            ? 'Return leg receives 10% freight & insurance discount. Cancellation refund tiers: ≥ 168h before departure = 80%; 72h-168h = 50%; < 72h = 0%. Reschedule ≥ 168h is free; < 168h incurs 10% fee. Company cancellation refunds 100%.'
            : 'Chặng về được giảm 10% cước và 10% bảo hiểm. Hủy chặng về: trước ≥ 168h hoàn 80%, 72h-168h hoàn 50%, < 72h hoàn 0%. Đổi ngày trước ≥ 168h miễn phí, < 168h thu phí 10% cước chặng về. Công ty hủy hoàn 100%.'}
        </div>

        {/* Action Buttons */}
        {returnStatus === 'scheduled' && (
          <div className="pt-3 border-t border-[#D8CEBE] flex flex-wrap items-center justify-end gap-3">
            {isCustomer && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRescheduleModalOpen(true)}
                  className="px-4 py-2 border-[#A67C2E] text-[#8B6724] hover:bg-[#F0EBE0] text-xs font-bold cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  {isEn ? 'Reschedule Return' : 'Đổi Ngày Về'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenCancelPreview}
                  className="px-4 py-2 border-[#B33E3E] text-[#B33E3E] hover:bg-rose-50 text-xs font-bold cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  {isEn ? 'Preview Refund & Cancel Return' : 'Xem Tiền Hoàn & Hủy Chặng Về'}
                </Button>
              </>
            )}

            {isManagerOrAdmin && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCompanyCancelModalOpen(true)}
                className="px-4 py-2 border-[#B33E3E] bg-[#FEF2F2] text-[#B33E3E] hover:bg-rose-100 text-xs font-bold cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                {isEn ? 'Company Cancel Return (100% Refund)' : 'Công Ty Hủy Chặng Về (Hoàn 100%)'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: Customer Cancel & Refund Preview */}
      <Modal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        title={isEn ? 'Cancel Return Leg & Refund Preview' : 'Xem Tiền Hoàn & Xác Nhận Hủy Chặng Về'}
      >
        <div className="p-4 space-y-4 text-xs">
          {isLoadingPreview ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#A67C2E]" />
              <span>{isEn ? 'Calculating exact refund amount...' : 'Đang tính toán số tiền hoàn chuẩn...'}</span>
            </div>
          ) : previewData ? (
            <>
              <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#6D7785]">{isEn ? 'Hours before return departure:' : 'Thời gian còn lại trước giờ đón:'}</span>
                  <span className="font-bold text-[#181A17]">{previewData.hoursUntilDeparture.toFixed(1)} {isEn ? 'hours' : 'giờ'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6D7785]">{isEn ? 'Applicable refund policy tier:' : 'Mốc chính sách áp dụng:'}</span>
                  <span className="font-bold text-[#287653]">{previewData.policyTierDescription} ({previewData.freightRefundPercent}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6D7785]">{isEn ? 'Return freight refund:' : 'Tiền cước hoàn lại:'}</span>
                  <span className="font-mono font-bold text-[#181A17]">{formatVnd(previewData.freightRefundAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6D7785]">{isEn ? 'Return insurance refund:' : 'Tiền bảo hiểm hoàn lại (100%):'}</span>
                  <span className="font-mono font-bold text-[#181A17]">{formatVnd(previewData.insuranceRefundAmount)}</span>
                </div>
                <div className="pt-2 border-t border-[#D8CEBE] flex justify-between items-baseline">
                  <span className="font-bold uppercase text-[#181A17]">{isEn ? 'Total Refund Amount:' : 'Tổng Tiền Hoàn:'}</span>
                  <span className="font-mono font-black text-base text-[#A67C2E]">{formatVnd(previewData.totalRefundAmount)}</span>
                </div>
              </div>

              {previewData.requiresDualApproval && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                  {isEn
                    ? 'Refund amount is ≥ 20,000,000 VND and requires dual approval (Manager + Admin) before disbursement.'
                    : 'Khoản hoàn ≥ 20.000.000 đ sẽ cần 2 cấp duyệt (Manager + Admin) theo nguyên tắc kiểm soát SoD trước khi chuyển khoản.'}
                </div>
              )}

              <div>
                <label className="font-bold text-[#181A17] block mb-1">
                  {isEn ? 'Cancellation Reason' : 'Lý do hủy chặng về'} <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={isEn ? 'Please describe why you need to cancel the return leg...' : 'Nhập lý do quý khách muốn hủy chặng về...'}
                  className="w-full p-2.5 rounded-xl border border-[#D8CEBE] text-xs focus:outline-none focus:border-[#A67C2E]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)}>
                  {isEn ? 'Close' : 'Đóng'}
                </Button>
                <Button
                  variant="primary"
                  disabled={isSubmittingCancel || !cancelReason.trim()}
                  onClick={handleConfirmCustomerCancel}
                  className="bg-[#B33E3E] hover:bg-[#8F2F2F] text-white font-bold"
                >
                  {isSubmittingCancel ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  {isEn ? 'Confirm Cancellation' : 'Xác Nhận Hủy Chặng Về'}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      {/* MODAL 2: Reschedule Return */}
      <Modal
        isOpen={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        title={isEn ? 'Reschedule Return Departure' : 'Đổi Ngày Đón Chặng Về'}
      >
        <div className="p-4 space-y-4 text-xs">
          <p className="text-[#5F6977]">
            {isEn
              ? 'Rescheduling is free if done ≥ 168 hours (7 days) before current return departure. Within 168 hours, a 10% late change fee is applied.'
              : 'Đổi ngày đón trước ≥ 168 giờ (7 ngày) được miễn phí hoàn toàn. Nếu đổi trong vòng 168 giờ, hệ thống sẽ áp dụng phí đổi ngày 10% cước chặng về.'}
          </p>

          <div>
            <label className="font-bold text-[#181A17] block mb-1">
              {isEn ? 'New Return Departure Time' : 'Ngày giờ đón chặng về mới'} <span className="text-red-600">*</span>
            </label>
            <input
              type="datetime-local"
              value={newDepartureAt}
              onChange={(e) => setNewDepartureAt(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#D8CEBE] text-xs focus:outline-none focus:border-[#A67C2E]"
            />
          </div>

          {newDepartureAt && (
            <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex justify-between items-center">
              <span>{isEn ? 'Estimated Change Fee:' : 'Phí đổi ngày ước tính:'}</span>
              <span className="font-mono font-bold text-sm text-[#A67C2E]">
                {formatVnd(calculateClientRescheduleFee())}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsRescheduleModalOpen(false)}>
              {isEn ? 'Cancel' : 'Hủy bỏ'}
            </Button>
            <Button
              variant="primary"
              disabled={isSubmittingReschedule || !newDepartureAt}
              onClick={handleConfirmReschedule}
              className="bg-[#287653] hover:bg-[#1E5B3F] text-white font-bold"
            >
              {isSubmittingReschedule ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {isEn ? 'Confirm Reschedule' : 'Xác Nhận Đổi Ngày'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 3: Company Cancel (Manager/Admin) */}
      <Modal
        isOpen={isCompanyCancelModalOpen}
        onClose={() => setIsCompanyCancelModalOpen(false)}
        title={isEn ? 'Company Cancel Return Leg (100% Refund)' : 'Công Ty Hủy Chặng Về (Hoàn 100%)'}
      >
        <div className="p-4 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
            <strong>{isEn ? 'Notice: ' : 'Lưu ý: '}</strong>
            {isEn
              ? 'When the company cancels due to operational constraints or force majeure, 100% of the return freight and 100% of return insurance will be refunded to the customer.'
              : 'Khi công ty chủ động hủy vì lý do vận hành hoặc bất khả kháng, hệ thống sẽ hoàn 100% cước chặng về và 100% bảo hiểm chặng về cho khách hàng.'}
          </div>

          <div>
            <label className="font-bold text-[#181A17] block mb-1">
              {isEn ? 'Reason for Company Cancellation' : 'Lý do công ty hủy chặng về'} <span className="text-red-600">*</span>
            </label>
            <textarea
              rows={3}
              value={companyCancelReason}
              onChange={(e) => setCompanyCancelReason(e.target.value)}
              placeholder={isEn ? 'e.g. Severe weather conditions, operational vehicle breakdown...' : 'VD: Thời tiết bão nguy hiểm, phương tiện gặp sự cố kỹ thuật...'}
              className="w-full p-2.5 rounded-xl border border-[#D8CEBE] text-xs focus:outline-none focus:border-[#A67C2E]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsCompanyCancelModalOpen(false)}>
              {isEn ? 'Close' : 'Đóng'}
            </Button>
            <Button
              variant="primary"
              disabled={isSubmittingCompanyCancel || !companyCancelReason.trim()}
              onClick={handleConfirmCompanyCancel}
              className="bg-[#B33E3E] hover:bg-[#8F2F2F] text-white font-bold"
            >
              {isSubmittingCompanyCancel ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {isEn ? 'Confirm Company Cancel' : 'Xác Nhận Hủy (Hoàn 100%)'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
