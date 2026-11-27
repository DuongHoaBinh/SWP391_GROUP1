'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  ChangeRequestItem,
  IncidentDetailItem,
  incidentsApi,
} from '@/features/incidents/api/incidents.api';
import {
  DeliveryHandoverItem,
  trackingApi,
} from '@/features/tracking/api/tracking.api';
import { openAuthenticatedApiFile } from '@/lib/api-client';

interface Props {
  mode: 'manager' | 'coordinator';
  hideDisputes?: boolean;
}

export function IncidentChangeRequestsPanel({ mode, hideDisputes = false }: Props) {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [incidents, setIncidents] = useState<IncidentDetailItem[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [disputedHandovers, setDisputedHandovers] = useState<DeliveryHandoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Proposal form for Coordinator
  const [proposeIncidentId, setProposeIncidentId] = useState<number | null>(null);
  const [changeType, setChangeType] = useState<'route' | 'cost' | 'schedule' | 'vehicle' | 'other'>('route');
  const [oldValue, setOldValue] = useState('');
  const [newValue, setNewValue] = useState('');
  const [extraCost, setExtraCost] = useState('0');
  const [costAllocation, setCostAllocation] = useState<'none' | 'operating_cost' | 'emergency_vet_covered' | 'customer_addendum'>('none');
  const [crossesNewBorder, setCrossesNewBorder] = useState(false);
  const [reason, setReason] = useState('');

  // Manager dispute resolution state
  const [resolveTargetId, setResolveTargetId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [compensationAmount, setCompensationAmount] = useState('0');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, crRes, dispRes] = await Promise.allSettled([
        incidentsApi.listIncidents(),
        incidentsApi.listChangeRequests(),
        mode === 'manager' ? trackingApi.listHandovers('disputed') : Promise.resolve([]),
      ]);
      if (incRes.status === 'fulfilled' && Array.isArray(incRes.value)) {
        setIncidents(incRes.value);
      }
      if (crRes.status === 'fulfilled' && Array.isArray(crRes.value)) {
        setChangeRequests(crRes.value);
      }
      if (dispRes.status === 'fulfilled' && Array.isArray(dispRes.value)) {
        setDisputedHandovers(dispRes.value);
      }
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSubmitProposal = async (e: React.FormEvent, incId: number) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error(isEn ? 'Change reason is required.' : 'Vui lòng nhập lý do đề xuất thay đổi.');
      return;
    }
    setBusyKey(`propose-${incId}`);
    try {
      await incidentsApi.createChangeRequest(incId, {
        changeType,
        oldValue: oldValue.trim() || undefined,
        newValue: newValue.trim() || undefined,
        reason: reason.trim(),
        estimatedExtraCost: Number(extraCost || 0),
        costAllocation,
        crossesNewBorder,
      });
      toast.success(
        isEn
          ? 'Change proposal submitted for Logistics Manager approval.'
          : 'Đã gửi đề xuất thay đổi chờ Logistics Manager phê duyệt.',
      );
      setProposeIncidentId(null);
      setOldValue('');
      setNewValue('');
      setExtraCost('0');
      setCostAllocation('none');
      setCrossesNewBorder(false);
      setReason('');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to submit proposal.' : 'Không thể tạo đề xuất thay đổi.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleReviewProposal = async (changeId: number, decision: 'approved' | 'rejected') => {
    setBusyKey(`review-${changeId}`);
    try {
      await incidentsApi.reviewChangeRequest(changeId, { decision });
      toast.success(
        decision === 'approved'
          ? isEn ? `Change #${changeId} approved.` : `Đã phê duyệt đề xuất #${changeId}.`
          : isEn ? `Change #${changeId} rejected.` : `Đã từ chối đề xuất #${changeId}.`,
      );
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Review failed.' : 'Không thể duyệt đề xuất.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePublishProposal = async (changeId: number) => {
    setBusyKey(`publish-${changeId}`);
    try {
      await incidentsApi.publishChangeRequest(changeId);
      toast.success(
        isEn
          ? `Approved change #${changeId} published & customers notified.`
          : `Đã xuất bản phương án #${changeId} và thông báo tới các đơn liên quan.`,
      );
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Publish failed.' : 'Không thể xuất bản phương án.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleResolveDispute = async (e: React.FormEvent, handoverId: number) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      toast.error(isEn ? 'Resolution notes required.' : 'Vui lòng nhập kết luận xử lý tranh chấp.');
      return;
    }
    setBusyKey(`dispute-${handoverId}`);
    try {
      await trackingApi.resolveHandoverDispute(handoverId, {
        resolutionNotes: resolutionNotes.trim(),
        compensationAmount: Number(compensationAmount || 0),
      });
      toast.success(
        isEn
          ? `Disputed handover #${handoverId} resolved & closed.`
          : `Đã giải quyết tranh chấp bàn giao #${handoverId}.`,
      );
      setResolveTargetId(null);
      setResolutionNotes('');
      setCompensationAmount('0');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Unable to resolve dispute.' : 'Không thể xử lý tranh chấp.'));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-[#181A17] flex items-center gap-2 m-0">
            <GitBranch size={18} className="text-[#A67C2E]" aria-hidden="true" />
            <span>
              {mode === 'manager'
                ? isEn
                  ? 'Route/Cost Change Approvals & Dispute Resolution'
                  : 'Phê Duyệt Đổi Tuyến / Chi Phí & Tranh Chấp Bàn Giao'
                : isEn
                ? 'Incident Change Proposals & Publishing'
                : 'Đề Xuất Điều Chỉnh Lộ Trình & Chi Phí Sự Cố'}
            </span>
          </h2>
          <p className="text-xs text-[#5F6977] mt-1 mb-0">
            {isEn
              ? '2-step optional workflow: changes never overwrite completed legs or base invoices.'
              : 'Luồng tùy chọn 2 bước: không xóa lịch sử đã chạy và tách biệt hoàn toàn khỏi hóa đơn gốc.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C6658] hover:text-[#181A17] bg-transparent border-0 cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          {isEn ? 'Refresh' : 'Làm mới'}
        </button>
      </div>

      {/* Manager & Coordinator: Open Incidents eligible for Change Proposals */}
      {(mode === 'coordinator' || mode === 'manager') && incidents.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#5F6977] m-0">
            {isEn ? 'Active Field Incidents (Propose Route/Schedule/Cost Change)' : 'Sự cố thực địa (Lập đề xuất đổi tuyến / chi phí)'}
          </h3>
          <div className="space-y-2">
            {incidents.slice(0, 6).map((inc) => (
              <div key={inc.id} className="p-3.5 rounded-xl border border-[#E8E2D8] bg-[#FAF9F5] space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-[#181A17]">
                    #{inc.id} • {inc.requestCode} ({inc.incidentType}) —{' '}
                    <span className="uppercase text-[#A67C2E]">{inc.status}</span>
                  </div>
                  {inc.status !== 'resolved' && inc.status !== 'closed' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setProposeIncidentId(proposeIncidentId === inc.id ? null : inc.id)}
                      className="text-xs rounded-xl"
                    >
                      {isEn ? 'Propose Change' : 'Lập đề xuất thay đổi'}
                    </Button>
                  )}
                </div>
                <p className="m-0 text-[#5F6977]">{inc.description}</p>

                {proposeIncidentId === inc.id && (
                  <form onSubmit={(e) => void handleSubmitProposal(e, inc.id)} className="mt-2 p-3 rounded-xl bg-white border border-[#D8CEBE] flex flex-col gap-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={changeType}
                        onChange={(e) => setChangeType(e.target.value as any)}
                        className="h-9 px-2.5 rounded-lg border border-[#D8CEBE]"
                      >
                        <option value="route">{isEn ? 'Route detour' : 'Đổi lộ trình (route)'}</option>
                        <option value="schedule">{isEn ? 'Schedule shift' : 'Điều chỉnh lịch (schedule)'}</option>
                        <option value="cost">{isEn ? 'Extra operating/vet cost' : 'Phát sinh chi phí (cost)'}</option>
                        <option value="vehicle">{isEn ? 'Replacement vehicle' : 'Đổi phương tiện (vehicle)'}</option>
                        <option value="other">{isEn ? 'Other' : 'Khác (other)'}</option>
                      </select>
                      <select
                        value={costAllocation}
                        onChange={(e) => setCostAllocation(e.target.value as any)}
                        className="h-9 px-2.5 rounded-lg border border-[#D8CEBE]"
                      >
                        <option value="none">{isEn ? 'No extra cost' : 'Không phát sinh chi phí'}</option>
                        <option value="operating_cost">{isEn ? 'Operating Cost (Company)' : 'Hạch toán Chi phí Vận hành'}</option>
                        <option value="emergency_vet_covered">{isEn ? 'Emergency Vet (Standard ≤20M / Premium)' : 'Cấp cứu Thú y (Tiêu chuẩn ≤20tr / Toàn diện)'}</option>
                        <option value="customer_addendum">{isEn ? 'Customer Addendum' : 'Phụ lục tính phí khách'}</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder={isEn ? 'Old route/value' : 'Giá trị/lộ trình cũ'}
                        value={oldValue}
                        onChange={(e) => setOldValue(e.target.value)}
                        className="h-9 px-2.5 rounded-lg border border-[#D8CEBE]"
                      />
                      <input
                        type="text"
                        placeholder={isEn ? 'Proposed new route/value' : 'Phương án/lộ trình mới'}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        className="h-9 px-2.5 rounded-lg border border-[#D8CEBE]"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder={isEn ? 'Extra cost (VND)' : 'Chi phí dự kiến (VND)'}
                        value={extraCost}
                        onChange={(e) => setExtraCost(e.target.value)}
                        className="h-9 px-2.5 rounded-lg border border-[#D8CEBE]"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 font-semibold text-[#181A17] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crossesNewBorder}
                        onChange={(e) => setCrossesNewBorder(e.target.checked)}
                      />
                      {isEn
                        ? 'Detour crosses a new border gate/country (notify Specialist)'
                        : 'Chuyển hướng qua cửa khẩu / quốc gia mới (cảnh báo Specialist Flow 2)'}
                    </label>
                    <textarea
                      rows={2}
                      required
                      placeholder={isEn ? 'Detailed justification *' : 'Lý do đề xuất thay đổi bắt buộc *'}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="p-2.5 rounded-lg border border-[#D8CEBE]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setProposeIncidentId(null)}>
                        {isEn ? 'Cancel' : 'Hủy'}
                      </Button>
                      <Button type="submit" size="sm" variant="primary" disabled={busyKey === `propose-${inc.id}`}>
                        {busyKey === `propose-${inc.id}` && <Loader2 size={12} className="animate-spin mr-1" />}
                        {isEn ? 'Send to Manager' : 'Trình Manager Duyệt'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change Requests Ledger */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#5F6977] m-0">
          {isEn ? 'Change Requests Ledger' : 'Danh Sách Đề Xuất Thay Đổi'} ({changeRequests.length})
        </h3>
        {changeRequests.length === 0 ? (
          <p className="text-xs text-[#7E867B] m-0">
            {isEn ? 'No emergency change proposals recorded yet.' : 'Chưa có đề xuất thay đổi lộ trình hoặc chi phí sự cố nào.'}
          </p>
        ) : (
          <div className="space-y-2">
            {changeRequests.map((cr) => (
              <div key={cr.id} className="p-3.5 rounded-xl border border-[#D8CEBE] bg-[#FAF9F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-[#181A17]">
                      #{cr.id} • {cr.requestCode} [{cr.changeType}]
                    </strong>
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                        cr.status === 'approved'
                          ? 'bg-[#E8F2EB] text-[#287653]'
                          : cr.status === 'rejected'
                          ? 'bg-[#F8EAEA] text-[#B33E3E]'
                          : 'bg-[#F8F0DF] text-[#966516]'
                      }`}
                    >
                      {cr.status}
                    </span>
                    {cr.crossesNewBorder && (
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-[#9E3B3B] font-bold text-[10px]">
                        NEW BORDER GATE
                      </span>
                    )}
                    {cr.publishedAt && (
                      <span className="px-2 py-0.5 rounded bg-[#181A17] text-[#C4B38E] font-bold text-[10px]">
                        PUBLISHED ({cr.rippleNotifiedCount} orders)
                      </span>
                    )}
                  </div>
                  <p className="m-0 text-[#3C403A]">{cr.reason}</p>
                  <p className="m-0 text-[#5F6977]">
                    {cr.oldValue || '—'} → <strong className="text-[#181A17]">{cr.newValue || '—'}</strong> •{' '}
                    {cr.estimatedExtraCost > 0
                      ? `${cr.estimatedExtraCost.toLocaleString('vi-VN')} VND (${cr.costAllocation})`
                      : isEn ? 'No extra cost' : '0 VND'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {mode === 'manager' && cr.status === 'pending' && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={busyKey === `review-${cr.id}`}
                        onClick={() => void handleReviewProposal(cr.id, 'approved')}
                        className="rounded-xl text-xs"
                      >
                        <CheckCircle2 size={13} className="mr-1" aria-hidden="true" />
                        {isEn ? 'Approve' : 'Phê duyệt'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyKey === `review-${cr.id}`}
                        onClick={() => void handleReviewProposal(cr.id, 'rejected')}
                        className="rounded-xl text-xs text-[#B33E3E]"
                      >
                        <XCircle size={13} className="mr-1" aria-hidden="true" />
                        {isEn ? 'Reject' : 'Từ chối'}
                      </Button>
                    </>
                  )}
                  {(mode === 'coordinator' || mode === 'manager') && cr.status === 'approved' && !cr.publishedAt && (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={busyKey === `publish-${cr.id}`}
                      onClick={() => void handlePublishProposal(cr.id)}
                      className="rounded-xl text-xs bg-[#287653] hover:bg-[#1f5e42]"
                    >
                      <Send size={13} className="mr-1" aria-hidden="true" />
                      {isEn ? 'Publish Change' : 'Xuất bản đổi tuyến'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manager Flow 6 Disputed Handovers Queue (hidden when parent already renders Tab 3 Disputes) */}
      {mode === 'manager' && !hideDisputes && disputedHandovers.length > 0 && (
        <div className="space-y-2.5 pt-3 border-t border-[#EAE5DA]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#B33E3E] flex items-center gap-1.5 m-0">
            <ShieldAlert size={14} aria-hidden="true" />
            {isEn ? 'Disputed Handovers Requiring Resolution' : 'Tranh Chấp Bàn Giao Ngựa Cần Xử Lý'} ({disputedHandovers.length})
          </h3>
          <div className="space-y-3">
            {disputedHandovers.map((h) => (
              <div key={h.id} className="p-4 rounded-xl border border-[#E5B8B8] bg-[#F8EAEA]/60 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-[#181A17]">
                    Handover #{h.id} • {h.requestCode} • {h.horseName} (Max Cover:{' '}
                    {h.maxCompensation.toLocaleString('vi-VN')} VND)
                  </strong>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setResolveTargetId(resolveTargetId === h.id ? null : h.id);
                      setCompensationAmount('0');
                    }}
                    className="rounded-xl text-xs"
                  >
                    <AlertTriangle size={12} className="mr-1" aria-hidden="true" />
                    {isEn ? 'Resolve Dispute' : 'Giải quyết tranh chấp'}
                  </Button>
                </div>
                <p className="m-0 text-[#9E3B3B] font-semibold">
                  {isEn ? 'Dispute reason:' : 'Lý do khiếu nại:'} {h.disputeReason}
                </p>
                {h.evidenceUrls?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {h.evidenceUrls.map((u, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => void openAuthenticatedApiFile(u)}
                        className="text-[#A67C2E] font-bold hover:underline bg-transparent border-0 p-0 cursor-pointer"
                      >
                        {isEn ? `Evidence #${idx + 1}` : `Bằng chứng #${idx + 1}`}
                      </button>
                    ))}
                  </div>
                )}

                {resolveTargetId === h.id && (
                  <form onSubmit={(e) => void handleResolveDispute(e, h.id)} className="mt-2 p-3 rounded-xl bg-white border border-[#D8CEBE] flex flex-col gap-2">
                    <input
                      type="number"
                      min={0}
                      max={h.maxCompensation}
                      placeholder={isEn ? 'Compensation amount (VND)' : 'Mức bồi thường / xử lý (VND)'}
                      value={compensationAmount}
                      onChange={(e) => setCompensationAmount(e.target.value)}
                      className="h-9 px-3 rounded-lg border border-[#D8CEBE]"
                    />
                    <textarea
                      rows={2}
                      required
                      placeholder={isEn ? 'Final resolution notes *' : 'Kết luận xử lý tranh chấp bắt buộc *'}
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="p-2.5 rounded-lg border border-[#D8CEBE]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setResolveTargetId(null)}>
                        {isEn ? 'Close' : 'Đóng'}
                      </Button>
                      <Button type="submit" size="sm" variant="primary" disabled={busyKey === `dispute-${h.id}`}>
                        {isEn ? 'Confirm & Close Dispute' : 'Xác nhận đóng tranh chấp'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
