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

type HandoverFilter = 'disputed' | 'pending' | 'confirmed' | 'all';

export function ManagerHandoverDisputesPanel() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [filter, setFilter] = useState<HandoverFilter>('disputed');
  const [handovers, setHandovers] = useState<DeliveryHandoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [compensationInput, setCompensationInput] = useState('0');
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadHandovers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await trackingApi.listHandovers(filter === 'all' ? undefined : filter);
      setHandovers(Array.isArray(list) ? list : []);
    } catch {
      setHandovers([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadHandovers();
  }, [loadHandovers]);

  const openResolveForm = (item: DeliveryHandoverItem) => {
    setResolvingId(item.id);
    setResolutionNotes('');
    setCompensationInput('0');
  };

  const handleResolveDispute = async (e: React.FormEvent, item: DeliveryHandoverItem) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      toast.error(isEn ? 'Resolution notes are required.' : 'Bắt buộc nhập phương án xử lý tranh chấp.');
      return;
    }
    const comp = Math.max(0, Math.round(Number(compensationInput || 0)));
    if (comp > item.maxCompensation) {
      toast.error(
        isEn
          ? `Compensation exceeds max insurance cover (${item.maxCompensation.toLocaleString('vi-VN')} VND).`
          : `Mức bồi thường vượt trần bảo hiểm tối đa (${item.maxCompensation.toLocaleString('vi-VN')} VND).`,
      );
      return;
    }

    setBusyId(item.id);
    try {
      await trackingApi.resolveHandoverDispute(item.id, {
        resolutionNotes: resolutionNotes.trim(),
        compensationAmount: comp,
      });
      toast.success(
        isEn
          ? `Resolved handover dispute #${item.id} cleanly.`
          : `Đã giải quyết tranh chấp bàn giao #${item.id} và chốt nghiệm thu.`,
      );
      setResolvingId(null);
      setResolutionNotes('');
      setCompensationInput('0');
      await loadHandovers();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to resolve dispute.' : 'Không thể giải quyết tranh chấp.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-[#D8CEBE] p-5 sm:p-6 shadow-sm flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
            <ClipboardCheck size={18} className="text-[#A67C2E]" aria-hidden="true" />
            <span>
              {isEn
                ? 'Per-Horse Handover & Dispute Resolution'
                : 'Nghiệm Thu Bàn Giao & Giải Quyết Tranh Chấp Theo Ngựa'}
            </span>
          </h2>
          <p className="text-xs text-[#5C6658] mt-1 mb-0">
            {isEn
              ? 'Review customer handover disputes against per-horse max insurance cover caps and close cases cleanly.'
              : 'Rà soát khiếu nại bàn giao từng cá thể ngựa, đối chiếu trần bảo hiểm tối đa và chốt phương án bồi thường.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['disputed', 'pending', 'confirmed', 'all'] as HandoverFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                filter === key
                  ? 'bg-[#181A17] text-[#FBF9F5] border-[#181A17]'
                  : 'bg-[#FAF9F5] text-[#5C6658] border-[#D8CEBE] hover:border-[#181A17]'
              }`}
            >
              {key === 'disputed'
                ? isEn ? 'Disputed' : 'Đang tranh chấp'
                : key === 'pending'
                ? isEn ? 'Pending' : 'Chờ ký nhận'
                : key === 'confirmed'
                ? isEn ? 'Confirmed' : 'Đã nghiệm thu'
                : isEn ? 'All' : 'Tất cả'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadHandovers()}
            className="text-xs font-semibold text-[#5C6658] hover:text-[#181A17] inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer ml-1"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {isEn ? 'Refresh' : 'Làm mới'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-[#5C6658]">
          <Loader2 size={16} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
          <span>{isEn ? 'Loading handover records...' : 'Đang tải danh sách biên bản bàn giao...'}</span>
        </div>
      ) : handovers.length === 0 ? (
        <div className="p-6 rounded-xl bg-[#FAF9F5] border border-[#EAE5DA] text-center text-xs text-[#5C6658]">
          {filter === 'disputed'
            ? isEn
              ? 'No active delivery handover disputes.'
              : 'Hiện không có tranh chấp bàn giao nào cần xử lý.'
            : isEn
            ? 'No delivery handover records match this filter.'
            : 'Chưa có biên bản bàn giao nào trong bộ lọc này.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {handovers.map((h) => (
            <div
              key={h.id}
              className="rounded-xl border border-[#D8CEBE] bg-[#FAF9F5] p-4 flex flex-col gap-2.5 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-black text-[#181A17]">{h.requestCode}</span>
                  <span className="font-bold text-[#181A17]">
                    {h.horseName} {h.microchipNo ? `(${h.microchipNo})` : ''}
                  </span>
                  <span className="text-[11px] font-semibold text-[#5C6658]">
                    • {h.insurancePackage.toUpperCase()}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    h.status === 'confirmed'
                      ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                      : h.status === 'disputed'
                      ? 'bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8]'
                      : 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]'
                  }`}
                >
                  {h.status === 'confirmed'
                    ? isEn ? 'Confirmed' : 'Đã nghiệm thu'
                    : h.status === 'disputed'
                    ? isEn ? 'Disputed' : 'Đang tranh chấp'
                    : isEn ? 'Pending' : 'Chờ ký nhận'}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[#5C6658]">
                <span>{isEn ? 'Receiver:' : 'Người nhận:'} <strong className="text-[#181A17]">{h.receivedByName}</strong></span>
                <span>{isEn ? 'Condition:' : 'Tình trạng:'} <strong className="text-[#181A17]">{h.horseConditionAtHandover}</strong></span>
                <span>
                  {isEn ? 'Max Cover:' : 'Trần bảo hiểm:'}{' '}
                  <strong className="text-[#181A17]">{h.maxCompensation.toLocaleString('vi-VN')} VND</strong>
                </span>
              </div>

              {h.disputeReason && (
                <div className="p-2.5 rounded-lg bg-[#F8EAEA] border border-[#E5B8B8] text-[#B33E3E] font-semibold flex items-start gap-1.5">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{h.disputeReason}</span>
                </div>
              )}

              {h.resolutionNotes && (
                <div className="p-2.5 rounded-lg bg-[#E8F2EB] border border-[#B7DBC4] text-[#287653] font-semibold flex items-center gap-1.5">
                  <ShieldCheck size={14} className="shrink-0" aria-hidden="true" />
                  <span>
                    {h.resolutionNotes} ({isEn ? 'Compensation:' : 'Bồi thường:'}{' '}
                    {h.compensationAmount.toLocaleString('vi-VN')} VND)
                  </span>
                </div>
              )}

              {h.evidenceUrls?.length > 0 && (
                <div className="flex flex-wrap gap-3">
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

              {h.status === 'disputed' && (
                <div className="pt-2 border-t border-[#EAE5DA]">
                  {resolvingId === h.id ? (
                    <form onSubmit={(e) => void handleResolveDispute(e, h)} className="p-3 rounded-xl bg-white border border-[#D8CEBE] flex flex-col gap-2.5">
                      <textarea
                        rows={2}
                        required
                        placeholder={isEn ? 'Final dispute resolution decision & veterinary/compensation terms *' : 'Phương án giải quyết cuối cùng & căn cứ bảo hiểm *'}
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        className="p-2.5 rounded-lg border border-[#D8CEBE]"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 font-semibold text-[#181A17]">
                          <span>{isEn ? 'Compensation (VND):' : 'Mức bồi thường (VND):'}</span>
                          <input
                            type="number"
                            min={0}
                            max={h.maxCompensation}
                            value={compensationInput}
                            onChange={(e) => setCompensationInput(e.target.value)}
                            className="w-40 h-9 px-2.5 rounded-lg border border-[#D8CEBE]"
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setResolvingId(null)}>
                            {isEn ? 'Cancel' : 'Hủy'}
                          </Button>
                          <Button type="submit" size="sm" variant="primary" disabled={busyId === h.id} className="bg-[#287653] hover:bg-[#1f5e42]">
                            <CheckCircle2 size={13} className="mr-1" aria-hidden="true" />
                            {isEn ? 'Resolve & Close' : 'Chốt Giải Quyết'}
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => openResolveForm(h)}
                      className="rounded-xl text-xs bg-[#287653] hover:bg-[#1f5e42]"
                    >
                      <ShieldCheck size={13} className="mr-1" aria-hidden="true" />
                      {isEn ? 'Resolve Dispute' : 'Giải Quyết Tranh Chấp'}
                    </Button>
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
