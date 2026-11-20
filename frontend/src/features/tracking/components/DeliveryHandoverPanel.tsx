'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { openAuthenticatedApiFile } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { DeliveryHandoverItem, trackingApi } from '@/features/tracking/api/tracking.api';

interface HorseOption {
  id: number;
  shipmentHorseId?: number;
  name: string;
  microchipNo?: string;
  passportNo?: string;
}

interface Props {
  role: 'driver' | 'customer' | 'manager';
  shipmentId: number;
  shipmentStatus: string;
  assignedHorses?: HorseOption[];
}

export function DeliveryHandoverPanel({
  role,
  shipmentId,
  shipmentStatus,
  assignedHorses = [],
}: Props) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [handovers, setHandovers] = useState<DeliveryHandoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Driver create form
  const [selectedShipmentHorseId, setSelectedShipmentHorseId] = useState<string>('');
  const [receivedByName, setReceivedByName] = useState('');
  const [handoverLocation, setHandoverLocation] = useState('');
  const [condition, setCondition] = useState<'healthy' | 'minor_issue' | 'needs_attention'>('healthy');
  const [identityVerified, setIdentityVerified] = useState(true);
  const [documentsHandedOver, setDocumentsHandedOver] = useState(true);
  const [driverNotes, setDriverNotes] = useState('');
  const [driverFiles, setDriverFiles] = useState<File[]>([]);

  // Customer dispute form per handover ID
  const [disputeTargetId, setDisputeTargetId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);

  // Manager dispute resolution form per handover ID
  const [resolveTargetId, setResolveTargetId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [compensationInput, setCompensationInput] = useState('0');

  const loadHandovers = useCallback(async () => {
    if (!Number.isInteger(shipmentId) || shipmentId <= 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await trackingApi.getShipmentHandovers(shipmentId);
      setHandovers(Array.isArray(list) ? list : []);
    } catch {
      setHandovers([]);
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadHandovers();
  }, [loadHandovers]);

  const statusLower = String(shipmentStatus || '').toLowerCase();
  const isDeliveryEligible = statusLower === 'in_transit' || statusLower === 'completed';

  if (role !== 'driver' && !loading && handovers.length === 0 && !isDeliveryEligible) {
    return null;
  }

  const submittedHorseIds = new Set(handovers.map((h) => Number(h.shipmentHorseId)));
  const remainingHorses = assignedHorses.filter(
    (h) => h.shipmentHorseId && !submittedHorseIds.has(Number(h.shipmentHorseId)),
  );

  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const shId = Number(selectedShipmentHorseId || remainingHorses[0]?.shipmentHorseId || 0);
    if (!shId || !receivedByName.trim()) {
      toast.error(isEn ? 'Select horse and receiver name.' : 'Chọn ngựa và nhập tên người nhận bàn giao.');
      return;
    }
    setBusyKey('create');
    try {
      await trackingApi.createHandover(shipmentId, {
        shipmentHorseId: shId,
        receivedByName: receivedByName.trim(),
        handoverLocation: handoverLocation.trim() || undefined,
        horseConditionAtHandover: condition,
        identityVerified,
        documentsHandedOver,
        notes: driverNotes.trim() || undefined,
        files: driverFiles,
      });
      toast.success(
        isEn
          ? 'Per-horse handover record created & sent to customer.'
          : 'Đã lập biên bản bàn giao cá thể ngựa và gửi khách hàng nghiệm thu.',
      );
      setSelectedShipmentHorseId('');
      setReceivedByName('');
      setHandoverLocation('');
      setDriverNotes('');
      setDriverFiles([]);
      await loadHandovers();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to create handover.' : 'Không thể lập biên bản bàn giao.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirm = async (handoverId: number) => {
    setBusyKey(`confirm-${handoverId}`);
    try {
      await trackingApi.respondHandover(handoverId, { action: 'confirm' });
      toast.success(isEn ? 'Handover confirmed & signed.' : 'Đã ký xác nhận nghiệm thu bàn giao an toàn!');
      await loadHandovers();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Confirmation failed.' : 'Không thể xác nhận bàn giao.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDisputeSubmit = async (e: React.FormEvent, handoverId: number) => {
    e.preventDefault();
    if (!disputeReason.trim() || disputeFiles.length === 0) {
      toast.error(
        isEn
          ? 'Dispute reason and at least 1 evidence file are mandatory.'
          : 'Tranh chấp bàn giao bắt buộc nhập lý do và đính kèm tối thiểu 1 tệp bằng chứng.',
      );
      return;
    }
    setBusyKey(`dispute-${handoverId}`);
    try {
      await trackingApi.respondHandover(handoverId, {
        action: 'dispute',
        disputeReason: disputeReason.trim(),
        files: disputeFiles,
      });
      toast.success(
        isEn
          ? 'Dispute opened with evidence for Manager review.'
          : 'Đã gửi khiếu nại kèm bằng chứng tới Logistics Manager xem xét.',
      );
      setDisputeTargetId(null);
      setDisputeReason('');
      setDisputeFiles([]);
      await loadHandovers();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Dispute submission failed.' : 'Không thể gửi tranh chấp.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent, item: DeliveryHandoverItem) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      toast.error(isEn ? 'Resolution notes are required.' : 'Bắt buộc nhập kết luận giải quyết tranh chấp.');
      return;
    }
    const comp = Math.max(0, Math.round(Number(compensationInput || 0)));
    if (comp > item.maxCompensation) {
      toast.error(
        isEn
          ? `Compensation exceeds max cover (${item.maxCompensation.toLocaleString('vi-VN')} VND).`
          : `Số tiền bồi thường vượt trần bảo hiểm (${item.maxCompensation.toLocaleString('vi-VN')} VND).`,
      );
      return;
    }
    setBusyKey(`resolve-${item.id}`);
    try {
      await trackingApi.resolveHandoverDispute(item.id, {
        resolutionNotes: resolutionNotes.trim(),
        compensationAmount: comp,
      });
      toast.success(isEn ? 'Dispute resolved and handover confirmed.' : 'Đã chốt giải quyết tranh chấp bàn giao!');
      setResolveTargetId(null);
      setResolutionNotes('');
      setCompensationInput('0');
      await loadHandovers();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to resolve dispute.' : 'Không thể giải quyết tranh chấp.'));
    } finally {
      setBusyKey(null);
    }
  };

  if (role === 'driver' && !isDeliveryEligible && handovers.length === 0) {
    return null;
  }

  return (
    <section className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-6 shadow-sm flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
          <ClipboardCheck size={18} className="text-[#287653]" aria-hidden="true" />
          <span>
            {isEn
              ? 'Per-Horse Handover & Acceptance Checklist'
              : 'Biên Bản Bàn Giao & Ký Nghiệm Thu Theo Cá Thể Ngựa'}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => void loadHandovers()}
          className="text-xs font-semibold text-[#5C6658] hover:text-[#181A17] inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          {isEn ? 'Refresh' : 'Làm mới'}
        </button>
      </div>

      {/* Driver Form for un-submitted horses */}
      {role === 'driver' && isDeliveryEligible && remainingHorses.length > 0 && (
        <form onSubmit={handleDriverSubmit} className="p-4 rounded-xl border border-[#E8E2D8] bg-[#FAF9F5] flex flex-col gap-3 text-xs">
          <strong className="text-[#181A17]">
            {isEn ? 'Create Individual Horse Handover Record' : 'Lập biên bản bàn giao cho ngựa đến đích'}
          </strong>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={selectedShipmentHorseId || String(remainingHorses[0]?.shipmentHorseId || '')}
              onChange={(e) => setSelectedShipmentHorseId(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#D8CEBE] bg-white font-semibold"
            >
              {remainingHorses.map((h) => (
                <option key={h.shipmentHorseId} value={h.shipmentHorseId}>
                  {h.name} {h.microchipNo ? `(Microchip: ${h.microchipNo})` : ''}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder={isEn ? 'Receiver full name *' : 'Họ tên người nhận bàn giao *'}
              value={receivedByName}
              onChange={(e) => setReceivedByName(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#D8CEBE] bg-white"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              placeholder={isEn ? 'Handover location' : 'Địa điểm bàn giao thực tế'}
              value={handoverLocation}
              onChange={(e) => setHandoverLocation(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#D8CEBE] bg-white"
            />
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as any)}
              className="h-10 px-3 rounded-xl border border-[#D8CEBE] bg-white"
            >
              <option value="healthy">{isEn ? 'Healthy' : 'Khỏe mạnh (healthy)'}</option>
              <option value="minor_issue">{isEn ? 'Minor Issue' : 'Lưu ý nhỏ (minor_issue)'}</option>
              <option value="needs_attention">{isEn ? 'Needs Attention' : 'Cần theo dõi (needs_attention)'}</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
              <input type="checkbox" checked={identityVerified} onChange={(e) => setIdentityVerified(e.target.checked)} />
              {isEn ? 'Microchip & Passport matched' : 'Khớp Microchip & Hộ chiếu'}
            </label>
            <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
              <input type="checkbox" checked={documentsHandedOver} onChange={(e) => setDocumentsHandedOver(e.target.checked)} />
              {isEn ? 'Original documents handed over' : 'Đã giao đủ hồ sơ gốc'}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setDriverFiles(Array.from(e.target.files || []).slice(0, 5))}
              className="text-xs"
            />
            <input
              type="text"
              placeholder={isEn ? 'Notes (optional)' : 'Ghi chú bàn giao (tùy chọn)'}
              value={driverNotes}
              onChange={(e) => setDriverNotes(e.target.value)}
              className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-[#D8CEBE] bg-white"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="primary" disabled={busyKey === 'create'} className="rounded-xl">
              {busyKey === 'create' && <Loader2 size={12} className="animate-spin mr-1" />}
              {isEn ? 'Submit Handover Record' : 'Gửi Biên Bản Bàn Giao'}
            </Button>
          </div>
        </form>
      )}

      {/* Existing Handover Records */}
      {handovers.length === 0 ? (
        <p className="text-xs text-[#747D88] m-0">
          {isEn
            ? 'No individual horse handover checklists recorded yet.'
            : 'Chưa có biên bản bàn giao chi tiết theo từng ngựa.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {handovers.map((h) => (
            <div key={h.id} className="p-4 rounded-xl border border-[#D8CEBE] bg-[#FAF9F5] space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-sm text-[#181A17]">{h.horseName}</strong>
                  <span className="ml-2 text-[#5F6977] font-mono">
                    {h.microchipNo ? `MC:${h.microchipNo}` : ''} {h.passportNo ? `PP:${h.passportNo}` : ''}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                    h.status === 'confirmed'
                      ? 'bg-[#E8F2EB] text-[#287653]'
                      : h.status === 'disputed'
                      ? 'bg-[#F8EAEA] text-[#B33E3E]'
                      : 'bg-[#F8F0DF] text-[#966516]'
                  }`}
                >
                  {h.status}
                </span>
              </div>

              <div className="text-[#5C6658] flex flex-wrap gap-x-4 gap-y-1">
                <span>{isEn ? 'Receiver:' : 'Người nhận:'} <strong className="text-[#181A17]">{h.receivedByName}</strong></span>
                <span>{isEn ? 'Condition:' : 'Tình trạng:'} <strong className="text-[#181A17]">{h.horseConditionAtHandover}</strong></span>
                <span>
                  {isEn ? 'Identity & Docs:' : 'Định danh & Hồ sơ:'}{' '}
                  <strong>{h.identityVerified && h.documentsHandedOver ? 'OK' : 'Check'}</strong>
                </span>
                <span>
                  {isEn ? 'Max Insurance Cover:' : 'Hạn mức BH:'}{' '}
                  <strong>{h.maxCompensation.toLocaleString('vi-VN')} VND</strong>
                </span>
              </div>

              {h.disputeReason && (
                <p className="m-0 text-[#B33E3E] font-semibold">
                  {isEn ? 'Dispute reason:' : 'Lý do tranh chấp:'} {h.disputeReason}
                </p>
              )}
              {h.resolutionNotes && (
                <div className="p-2.5 rounded-lg bg-[#E8F2EB] text-[#287653] font-semibold flex items-center gap-1.5">
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>
                    {h.resolutionNotes} (Bồi thường: {h.compensationAmount.toLocaleString('vi-VN')} VND)
                  </span>
                </div>
              )}

              {h.evidenceUrls?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {h.evidenceUrls.map((u, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void openAuthenticatedApiFile(u)}
                      className="inline-flex items-center gap-1 text-[#A67C2E] font-bold hover:underline bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <ExternalLink size={11} aria-hidden="true" />
                      {isEn ? `Evidence #${idx + 1}` : `Bằng chứng #${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}

              {role === 'manager' && h.status === 'disputed' && (
                <div className="pt-2 border-t border-[#EAE5DA] space-y-2">
                  {resolveTargetId === h.id ? (
                    <form onSubmit={(e) => void handleResolveSubmit(e, h)} className="p-3 rounded-xl bg-white border border-[#D8CEBE] flex flex-col gap-2">
                      <textarea
                        rows={2}
                        required
                        placeholder={isEn ? 'Resolution notes & compensation summary *' : 'Phương án giải quyết & ghi chú bồi thường *'}
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        className="p-2.5 rounded-lg border border-[#D8CEBE]"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 font-semibold text-[#181A17]">
                          <span>{isEn ? 'Compensation (VND):' : 'Bồi thường (VND):'}</span>
                          <input
                            type="number"
                            min={0}
                            max={h.maxCompensation}
                            value={compensationInput}
                            onChange={(e) => setCompensationInput(e.target.value)}
                            className="w-36 h-9 px-2.5 rounded-lg border border-[#D8CEBE]"
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setResolveTargetId(null)}>
                            {isEn ? 'Cancel' : 'Hủy'}
                          </Button>
                          <Button type="submit" size="sm" variant="primary" disabled={busyKey === `resolve-${h.id}`} className="bg-[#287653] hover:bg-[#1f5e42]">
                            {isEn ? 'Confirm Resolution' : 'Chốt Giải Quyết'}
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setResolveTargetId(h.id);
                        setResolutionNotes('');
                        setCompensationInput('0');
                      }}
                      className="rounded-xl text-xs bg-[#287653] hover:bg-[#1f5e42]"
                    >
                      <ShieldCheck size={13} className="mr-1" aria-hidden="true" />
                      {isEn ? 'Resolve Handover Dispute' : 'Giải Quyết Tranh Chấp Bàn Giao'}
                    </Button>
                  )}
                </div>
              )}

              {role === 'customer' && h.status === 'pending' && (
                <div className="pt-2 border-t border-[#EAE5DA] space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={busyKey === `confirm-${h.id}`}
                      onClick={() => void handleConfirm(h.id)}
                      className="rounded-xl text-xs bg-[#287653] hover:bg-[#1f5e42]"
                    >
                      <CheckCircle2 size={13} className="mr-1" aria-hidden="true" />
                      {isEn ? 'Confirm Safe Acceptance' : 'Ký Xác Nhận Nghiệm Thu'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => setDisputeTargetId(disputeTargetId === h.id ? null : h.id)}
                      className="rounded-xl text-xs"
                    >
                      <AlertTriangle size={13} className="mr-1" aria-hidden="true" />
                      {isEn ? 'Report Dispute (Evidence Required)' : 'Mở Tranh Chấp (Cần Bằng Chứng)'}
                    </Button>
                  </div>

                  {disputeTargetId === h.id && (
                    <form onSubmit={(e) => void handleDisputeSubmit(e, h.id)} className="p-3 rounded-xl bg-white border border-[#E5B8B8] flex flex-col gap-2">
                      <textarea
                        rows={2}
                        required
                        placeholder={isEn ? 'Describe injury/missing document exception *' : 'Mô tả chi tiết ngoại lệ / trầy xước / thiếu giấy *'}
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        className="p-2.5 rounded-lg border border-[#D8CEBE]"
                      />
                      <label className="font-semibold text-[#B33E3E]">
                        {isEn ? 'Mandatory Photo / Report Evidence *' : 'Tệp ảnh / biên bản bằng chứng bắt buộc *'}
                        <input
                          type="file"
                          multiple
                          required
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => setDisputeFiles(Array.from(e.target.files || []).slice(0, 5))}
                          className="block mt-1"
                        />
                      </label>
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setDisputeTargetId(null)}>
                          {isEn ? 'Cancel' : 'Hủy'}
                        </Button>
                        <Button type="submit" size="sm" variant="danger" disabled={busyKey === `dispute-${h.id}`}>
                          {isEn ? 'Submit Dispute' : 'Gửi Tranh Chấp'}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
