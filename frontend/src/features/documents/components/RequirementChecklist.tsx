'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  FolderOpen,
  HelpCircle,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  ComplianceRequirementsResponse,
  HorseRequirementGroup,
  HorseRequirementItem,
  RequirementStatus,
} from '../requirements-api';

interface RequirementChecklistProps {
  requirements: ComplianceRequirementsResponse | null;
  isLoading?: boolean;
  onUploadClick: (horseId: number, documentTypeCode: string) => void;
  onSelectDepartureDate?: (dateStr: string) => void;
  submittedLaterKeys?: Set<string>; // key: `${horseId}_${documentTypeCode}`
  onToggleSubmitLater?: (horseId: number, documentTypeCode: string) => void;
}

type PopupFilter = 'all' | 'action_needed' | 'handled';

const STATUS_BADGE: Record<RequirementStatus, { labelVi: string; labelEn: string; className: string; icon: React.ReactNode }> = {
  reusable: {
    labelVi: 'Dùng lại được',
    labelEn: 'Reusable',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: <CheckCircle2 size={12} className="text-emerald-600" />,
  },
  pending_review: {
    labelVi: 'Chờ duyệt',
    labelEn: 'Pending Review',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: <Clock size={12} className="text-blue-600" />,
  },
  expiring: {
    labelVi: 'Sắp hết hạn',
    labelEn: 'Expiring Soon',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: <Clock size={12} className="text-amber-600" />,
  },
  expired: {
    labelVi: 'Hết hạn',
    labelEn: 'Expired',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: <ShieldAlert size={12} className="text-rose-600" />,
  },
  issued_too_early: {
    labelVi: 'Cấp quá sớm',
    labelEn: 'Issued Too Early',
    className: 'bg-orange-50 text-orange-800 border-orange-200',
    icon: <AlertTriangle size={12} className="text-orange-600" />,
  },
  missing: {
    labelVi: 'Chưa có',
    labelEn: 'Missing',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: <HelpCircle size={12} className="text-slate-500" />,
  },
};

function isReadyStatus(status: RequirementStatus) {
  // 'expiring' means already approved & valid for the full trip (only expires within 30d AFTER trip end)
  return status === 'reusable' || status === 'pending_review' || status === 'expiring';
}

function computeHorseStats(horseGroup: HorseRequirementGroup, submittedLaterKeys: Set<string>) {
  const total = horseGroup.requirements.length;
  let ready = 0;
  let deferred = 0;
  const deferrableRemaining: HorseRequirementItem[] = [];
  const deferrableChecked: HorseRequirementItem[] = [];

  for (const req of horseGroup.requirements) {
    const key = `${horseGroup.horseId}_${req.documentTypeCode}`;
    if (isReadyStatus(req.status)) {
      ready += 1;
      continue;
    }
    if (submittedLaterKeys.has(key)) {
      deferred += 1;
      deferrableChecked.push(req);
    } else {
      deferrableRemaining.push(req);
    }
  }

  const handled = ready + deferred;
  const remaining = total - handled;
  const progressPct = total > 0 ? Math.round((handled / total) * 100) : 100;

  return {
    total,
    ready,
    deferred,
    handled,
    remaining,
    deferrableRemaining,
    deferrableChecked,
    progressPct,
  };
}

export function RequirementChecklist({
  requirements,
  isLoading,
  onUploadClick,
  onSelectDepartureDate,
  submittedLaterKeys = new Set(),
  onToggleSubmitLater,
}: RequirementChecklistProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [activeHorseId, setActiveHorseId] = useState<number | null>(null);
  const [popupFilter, setPopupFilter] = useState<PopupFilter>('all');

  const activeHorseGroup = useMemo(() => {
    if (!requirements || activeHorseId === null) return null;
    return requirements.horses.find((h) => h.horseId === activeHorseId) ?? null;
  }, [requirements, activeHorseId]);

  if (isLoading && !requirements) {
    return (
      <div className="p-8 text-center rounded-2xl border border-dashed border-[#E5DDD0] bg-[#FAF8F4] animate-pulse">
        <FileCheck2 size={32} className="mx-auto text-[#A67C2E] mb-2 animate-bounce" />
        <p className="text-sm font-semibold text-[#181A17]">
          {isEn ? 'Checking country quarantine regulations...' : 'Đang kiểm tra quy chế kiểm dịch theo quốc gia...'}
        </p>
        <p className="text-xs text-[#747D88]">
          {isEn ? 'Cross-checking horse dossier validity for this journey' : 'Đối chiếu kho hồ sơ của ngựa và thời hạn hiệu lực cho chuyến đi'}
        </p>
      </div>
    );
  }

  if (!requirements) return null;

  const { country, usingGlobalBaseline, horses, summary } =
    requirements;

  const handleBulkSubmitLater = (horseGroup: HorseRequirementGroup) => {
    if (!onToggleSubmitLater) return;
    const stats = computeHorseStats(horseGroup, submittedLaterKeys);
    const targets = stats.deferrableRemaining.length > 0 ? stats.deferrableRemaining : stats.deferrableChecked;
    const uniqueCodes = Array.from(new Set(targets.map((req) => req.documentTypeCode)));
    uniqueCodes.forEach((docCode) => {
      onToggleSubmitLater(horseGroup.horseId, docCode);
    });
  };

  const renderPopupContent = (horseGroup: HorseRequirementGroup) => {
    const stats = computeHorseStats(horseGroup, submittedLaterKeys);

    const filteredReqs = horseGroup.requirements.filter((req) => {
      const key = `${horseGroup.horseId}_${req.documentTypeCode}`;
      const isHandled = isReadyStatus(req.status) || submittedLaterKeys.has(key);
      if (popupFilter === 'action_needed') return !isHandled;
      if (popupFilter === 'handled') return isHandled;
      return true;
    });

    const hasDeferrable = stats.deferrableRemaining.length + stats.deferrableChecked.length > 0;

    return (
      <div className="space-y-4">
        {/* Progress & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#EFEAE0]">
          <div className="inline-flex rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] p-0.5">
            {(
              [
                { id: 'all', label: isEn ? `All (${stats.total})` : `Tất cả (${stats.total})` },
                { id: 'action_needed', label: isEn ? `Action needed (${stats.remaining})` : `Cần xử lý (${stats.remaining})` },
                { id: 'handled', label: isEn ? `Handled (${stats.handled})` : `Đã xử lý (${stats.handled})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPopupFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  popupFilter === tab.id
                    ? 'bg-white text-[#181A17] shadow-xs'
                    : 'text-[#5F6977] hover:text-[#181A17]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {onToggleSubmitLater && hasDeferrable && (
            <button
              type="button"
              onClick={() => handleBulkSubmitLater(horseGroup)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                stats.deferrableRemaining.length > 0
                  ? 'border-[#DFCA9A] bg-[#FAF8F4] text-[#8C6621] hover:bg-[#F3EBD8]'
                  : 'border-[#D8CEBE] bg-white text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {stats.deferrableRemaining.length > 0
                ? (isEn ? `Submit all later (${stats.deferrableRemaining.length})` : `Nộp sau tất cả (${stats.deferrableRemaining.length})`)
                : (isEn ? 'Clear submit-later' : 'Bỏ chọn nộp sau tất cả')}
            </button>
          )}
        </div>

        {/* Unified List of Required Pre-Departure Documents */}
        {filteredReqs.length === 0 ? (
          <div className="py-8 text-center rounded-xl border border-dashed border-[#E5DDD0] bg-[#FAF8F4]/60">
            <CheckCircle2 size={24} className="mx-auto text-emerald-600 mb-1.5" />
            <p className="text-sm font-bold text-[#181A17] m-0">
              {isEn ? 'No items in this filter' : 'Không có mục nào trong bộ lọc này'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5F6977]">
                {isEn ? 'Mandatory Pre-Departure Documents' : 'Giấy tờ bắt buộc trước khi xuất phát'}
              </span>
              <span className="text-[11px] text-[#747D88]">
                {isEn
                  ? `${filteredReqs.length} items · May be supplemented prior to departure`
                  : `${filteredReqs.length} danh mục · Có thể nộp bổ sung trước ngày khởi hành`}
              </span>
            </div>

            <div className="rounded-xl border border-[#E5DDD0] bg-white divide-y divide-[#EFEBE4] overflow-hidden">
              {filteredReqs.map((req) => {
                const badge = STATUS_BADGE[req.status];
                const key = `${horseGroup.horseId}_${req.documentTypeCode}`;
                const isSubmittingLater = submittedLaterKeys.has(key);
                const isReady = isReadyStatus(req.status);
                const showDetailedReason =
                  req.status === 'expired' ||
                  req.status === 'expiring' ||
                  req.status === 'issued_too_early';

                return (
                  <div
                    key={req.regulationId}
                    className="px-4 py-3 hover:bg-[#FAF8F4]/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText size={15} className="text-[#A67C2E] shrink-0" />
                        <span className="font-bold text-[13px] text-[#181A17] leading-snug">
                          {req.documentTypeName}
                        </span>
                        {isSubmittingLater && !isReady ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-semibold border bg-amber-50 text-amber-800 border-amber-200">
                            <Clock size={11} className="text-amber-600" />
                            {isEn ? 'Submit Later' : 'Nộp bổ sung sau'}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-semibold border ${badge.className}`}
                          >
                            {badge.icon}
                            {isEn ? badge.labelEn : badge.labelVi}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#747D88] pl-5">
                        {req.requiresAuthorityApproval && (
                          <span className="text-amber-800 font-semibold">
                            • {isEn ? 'Requires Veterinary Authority approval' : 'Cần cơ quan thú y phê duyệt'}
                          </span>
                        )}
                      </div>

                      {showDetailedReason && req.reasonVi && (
                        <p className="text-[11px] text-rose-700 m-0 pl-5">{req.reasonVi}</p>
                      )}
                    </div>

                    {/* Action Column */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {req.status === 'reusable' ? null : req.status === 'expiring' ? (
                        <button
                          type="button"
                          onClick={() => onUploadClick(horseGroup.horseId, req.documentTypeCode)}
                          className="px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:border-[#A67C2E] text-[#181A17] text-xs font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Upload size={11} className="text-[#A67C2E]" />
                          {isEn ? 'Renew' : 'Gia hạn'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onUploadClick(horseGroup.horseId, req.documentTypeCode)}
                            className="px-3 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2A2E28] text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload size={12} className="text-[#C4B38E]" />
                            {isEn ? 'Upload' : 'Tải lên'}
                          </button>

                          {!isReady && onToggleSubmitLater && (
                            <label
                              className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none px-2.5 py-1.5 rounded-lg border transition-colors border-[#E5DDD0] bg-white text-[#5F6977] hover:border-[#A67C2E]"
                            >
                              <input
                                type="checkbox"
                                checked={isSubmittingLater}
                                onChange={() => onToggleSubmitLater(horseGroup.horseId, req.documentTypeCode)}
                                className="w-3.5 h-3.5 rounded text-[#A67C2E] focus:ring-[#A67C2E]"
                              />
                              <span>{isEn ? 'Submit later' : 'Nộp sau'}</span>
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Popup Footer */}
        <div className="pt-3 border-t border-[#EFEAE0] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#5F6977]">
            {isEn ? 'Progress:' : 'Tiến độ:'}{' '}
            <strong className="text-[#181A17]">
              {isEn ? `${stats.handled}/${stats.total} handled` : `${stats.handled}/${stats.total} mục đã xử lý`}
            </strong>
            <span className="ml-1.5 text-[#747D88]">
              · {isEn ? 'Full dossier required before departure' : 'Bắt buộc đủ hồ sơ trước khi xuất phát'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveHorseId(null)}
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2E28] text-[#FAF8F4] text-xs font-bold cursor-pointer transition-colors"
          >
            {isEn ? 'Done & Close' : 'Xong & Đóng'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${isLoading ? 'opacity-75 transition-opacity' : ''}`}>
      {/* 1. Global baseline info if applicable */}
      {usingGlobalBaseline && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          <span>
            {isEn ? (
              <>Country <strong>{country}</strong> uses the WOAH/FEI international baseline checklist.</>
            ) : (
              <>Quốc gia <strong>{country}</strong> hiện áp dụng Tiêu chuẩn Quốc tế Cơ bản WOAH/FEI.</>
            )}
          </span>
        </div>
      )}

      {/* 3. Inline Compact Summary Strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] text-xs">
        <span className="text-emerald-800 font-semibold">
          {isEn ? 'Reusable' : 'Dùng lại'}: <strong>{summary.reusable}</strong>
        </span>
        <span className="text-[#D8CEBE]">·</span>
        <span className="text-blue-800 font-semibold">
          {isEn ? 'Pending' : 'Chờ duyệt'}: <strong>{summary.pendingReview}</strong>
        </span>
        <span className="text-[#D8CEBE]">·</span>
        <span className="text-amber-800 font-semibold">
          {isEn ? 'Missing' : 'Cần bổ sung'}: <strong>{summary.missing}</strong>
        </span>
        {summary.expired > 0 && (
          <>
            <span className="text-[#D8CEBE]">·</span>
            <span className="text-rose-800 font-semibold">
              {isEn ? 'Expired' : 'Hết hạn'}: <strong>{summary.expired}</strong>
            </span>
          </>
        )}
      </div>

      {/* 4. Compact Per-Horse Summary Cards (click to open Popup) */}
      <div className="space-y-3">
        {horses.map((horseGroup) => {
          const stats = computeHorseStats(horseGroup, submittedLaterKeys);
          const isAllDone = stats.remaining === 0;

          return (
            <div
              key={horseGroup.horseId}
              className={`rounded-2xl border p-4 transition-all ${
                isAllDone
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : 'border-[#E5DDD0] bg-[#FAF8F4]/50 hover:border-[#C4B38E]'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Horse identity & single progress badge */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-[#A67C2E]/15 text-[#8C6621] flex items-center justify-center font-extrabold text-sm shrink-0">
                    {horseGroup.horseName.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-sm text-[#181A17] m-0">{horseGroup.horseName}</h4>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          isAllDone
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {isAllDone ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                        {stats.handled}/{stats.total}{' '}
                        {stats.deferred > 0
                          ? `(${stats.deferred} ${isEn ? 'later' : 'nộp sau'})`
                          : isAllDone
                            ? (isEn ? 'ready' : 'đủ')
                            : (isEn ? 'handled' : 'đã xử lý')}
                      </span>
                    </div>
                    {(horseGroup.microchipNo || horseGroup.passportNo) && (
                      <div className="text-[11px] text-[#747D88] truncate">
                        {horseGroup.microchipNo && `Chip: ${horseGroup.microchipNo}`}
                        {horseGroup.microchipNo && horseGroup.passportNo && ' · '}
                        {horseGroup.passportNo && `${isEn ? 'Passport' : 'Hộ chiếu'}: ${horseGroup.passportNo}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                  {onToggleSubmitLater && stats.deferrableRemaining.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkSubmitLater(horseGroup)}
                      className="px-3 py-2 rounded-xl border border-[#DFCA9A] bg-white hover:bg-[#FAF8F4] text-xs font-bold text-[#8C6621] transition-colors cursor-pointer"
                    >
                      {isEn ? `Submit all later (${stats.deferrableRemaining.length})` : `Nộp sau tất cả (${stats.deferrableRemaining.length})`}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setPopupFilter('all');
                      setActiveHorseId(horseGroup.horseId);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2E28] text-[#FAF8F4] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <FolderOpen size={14} className="text-[#C4B38E]" />
                    <span>{isEn ? 'Documents' : 'Hồ sơ'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Horse Documents Detail Popup Modal */}
      <Modal
        isOpen={Boolean(activeHorseGroup)}
        onClose={() => setActiveHorseId(null)}
        title={activeHorseGroup ? `${isEn ? 'Quarantine Dossier' : 'Hồ sơ kiểm dịch'} · ${activeHorseGroup.horseName}` : undefined}
        subtitle={
          activeHorseGroup
            ? [
                activeHorseGroup.microchipNo ? `Microchip: ${activeHorseGroup.microchipNo}` : null,
                activeHorseGroup.passportNo ? `${isEn ? 'Passport' : 'Hộ chiếu'}: ${activeHorseGroup.passportNo}` : null,
                `${isEn ? 'Destination' : 'Quốc gia đến'}: ${country}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        maxWidth="max-w-3xl"
      >
        {activeHorseGroup && renderPopupContent(activeHorseGroup)}
      </Modal>
    </div>
  );
}
