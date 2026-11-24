'use client';

import React from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  HelpCircle,
  ShieldAlert,
  Upload,
} from 'lucide-react';
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

const STATUS_BADGE: Record<RequirementStatus, { label: string; className: string; icon: React.ReactNode }> = {
  reusable: {
    label: 'Dùng lại được',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: <CheckCircle2 size={13} className="text-emerald-600" />,
  },
  pending_review: {
    label: 'Đang chờ duyệt',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: <Clock size={13} className="text-blue-600" />,
  },
  expiring: {
    label: 'Sắp hết hạn',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: <Clock size={13} className="text-amber-600" />,
  },
  expired: {
    label: 'Đã hết hạn',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: <ShieldAlert size={13} className="text-rose-600" />,
  },
  issued_too_early: {
    label: 'Cấp quá sớm',
    className: 'bg-orange-50 text-orange-800 border-orange-200',
    icon: <AlertTriangle size={13} className="text-orange-600" />,
  },
  missing: {
    label: 'Chưa có hồ sơ',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: <HelpCircle size={13} className="text-slate-500" />,
  },
};

export function RequirementChecklist({
  requirements,
  isLoading,
  onUploadClick,
  onSelectDepartureDate,
  submittedLaterKeys = new Set(),
  onToggleSubmitLater,
}: RequirementChecklistProps) {
  if (isLoading && !requirements) {
    return (
      <div className="p-8 text-center rounded-2xl border border-dashed border-[#E5DDD0] bg-[#FAF8F4] animate-pulse">
        <FileCheck2 size={32} className="mx-auto text-[#A67C2E] mb-2 animate-bounce" />
        <p className="text-sm font-semibold text-[#181A17]">Đang kiểm tra quy chế kiểm dịch theo quốc gia...</p>
        <p className="text-xs text-[#747D88]">Đối chiếu kho hồ sơ của ngựa và thời hạn hiệu lực cho chuyến đi</p>
      </div>
    );
  }

  if (!requirements) return null;

  const { isDepartureFeasible, earliestFeasibleDeparture, country, mode, usingGlobalBaseline, horses, summary } =
    requirements;

  return (
    <div className={`space-y-6 ${isLoading ? 'opacity-75 transition-opacity' : ''}`}>
      {/* 1. Feasibility Warning Banner */}
      {!isDepartureFeasible && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldAlert size={22} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">
                Không kịp chuẩn bị giấy tờ cho {country}
              </p>
              <p className="text-xs text-rose-800 mt-0.5">
                Các chứng từ bắt buộc cần tối thiểu thời gian chuẩn bị và phê duyệt kiểm dịch. Ngày khởi hành sớm nhất khả thi là{' '}
                <span className="font-bold underline">{earliestFeasibleDeparture}</span>.
              </p>
            </div>
          </div>
          {onSelectDepartureDate && (
            <button
              type="button"
              onClick={() => onSelectDepartureDate(earliestFeasibleDeparture)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shrink-0 cursor-pointer shadow-sm"
            >
              Chọn ngày từ {earliestFeasibleDeparture}
            </button>
          )}
        </div>
      )}

      {/* 2. Global baseline info if applicable */}
      {usingGlobalBaseline && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            Quốc gia <strong>{country}</strong> hiện áp dụng Tiêu chuẩn Quốc tế Cơ bản WOAH/FEI. Vui lòng kiểm tra kỹ yêu cầu kiểm dịch.
          </span>
        </div>
      )}

      {/* 3. Summary stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Dùng lại được</span>
          <span className="text-xl font-extrabold text-emerald-950 mt-1 block">{summary.reusable}</span>
          <span className="text-[10px] text-emerald-700">Đã sẵn sàng trên hồ sơ</span>
        </div>
        <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">Đang chờ duyệt</span>
          <span className="text-xl font-extrabold text-blue-950 mt-1 block">{summary.pendingReview}</span>
          <span className="text-[10px] text-blue-700">Chuyên viên đang thẩm định</span>
        </div>
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">Cần bổ sung / cấp lại</span>
          <span className="text-xl font-extrabold text-amber-950 mt-1 block">{summary.missing}</span>
          <span className="text-[10px] text-amber-700">Thiếu hoặc cấp quá sớm</span>
        </div>
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/60">
          <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">Hết hạn</span>
          <span className="text-xl font-extrabold text-rose-950 mt-1 block">{summary.expired}</span>
          <span className="text-[10px] text-rose-700">Không đủ biên an toàn</span>
        </div>
      </div>

      {/* 4. Horse Requirement Cards */}
      <div className="space-y-5">
        {horses.map((horseGroup) => (
          <div
            key={horseGroup.horseId}
            className="rounded-2xl border border-[#E5DDD0] bg-white overflow-hidden shadow-sm"
          >
            {/* Horse Header */}
            <div className="px-5 py-3.5 bg-[#FAF8F4] border-b border-[#E5DDD0] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#A67C2E]/15 text-[#A67C2E] flex items-center justify-center font-bold text-sm">
                  {horseGroup.horseName.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#181A17]">{horseGroup.horseName}</h4>
                  <div className="flex items-center gap-3 text-[11px] text-[#747D88]">
                    {horseGroup.microchipNo && <span>Microchip: <strong>{horseGroup.microchipNo}</strong></span>}
                    {horseGroup.passportNo && <span>Hộ chiếu: <strong>{horseGroup.passportNo}</strong></span>}
                  </div>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-[#181A17] text-[#C4B38E] font-semibold">
                {horseGroup.requirements.length} danh mục kiểm dịch
              </span>
            </div>

            {/* Document Rows */}
            <div className="divide-y divide-[#EFEBE4]">
              {horseGroup.requirements.map((req) => {
                const badge = STATUS_BADGE[req.status];
                const key = `${horseGroup.horseId}_${req.documentTypeCode}`;
                const isSubmittingLater = submittedLaterKeys.has(key);

                return (
                  <div key={req.regulationId} className="p-4 hover:bg-[#FAF8F4]/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <FileText size={18} className="text-[#A67C2E] shrink-0 mt-0.5" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-[#181A17]">{req.documentTypeName}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                req.tier === 'A'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-sky-50 text-sky-700 border border-sky-200'
                              }`}
                            >
                              Tầng {req.tier} ({req.tier === 'A' ? 'Bắt buộc trước xuất phát' : 'Kiểm dịch sát ngày'})
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${badge.className}`}
                            >
                              {badge.icon}
                              {badge.label}
                            </span>
                          </div>

                          <p className="text-xs text-[#5F6977] mt-1">{req.reasonVi}</p>

                          <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#747D88] mt-1.5">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} /> Hạn nộp: <strong className="text-[#181A17]">{req.submitDeadline}</strong>
                            </span>
                            {req.earliestIssueDate && (
                              <span>
                                Cấp từ ngày: <strong className="text-[#181A17]">{req.earliestIssueDate}</strong>
                              </span>
                            )}
                            {req.requiresAuthorityApproval && (
                              <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Cần phê duyệt cơ quan chức năng (AVS/Cục Thú y)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action column */}
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        {req.status === 'reusable' ? (
                          <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            Dùng lại giấy này
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onUploadClick(horseGroup.horseId, req.documentTypeCode)}
                              className="px-3.5 py-1.5 rounded-xl bg-[#181A17] hover:bg-[#2A2E28] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <Upload size={13} className="text-[#C4B38E]" />
                              Tải lên
                            </button>

                            {req.canSubmitLater && onToggleSubmitLater && (
                              <label className="flex items-center gap-1.5 text-xs text-[#5F6977] cursor-pointer select-none px-2.5 py-1.5 rounded-xl border border-[#E5DDD0] hover:bg-white">
                                <input
                                  type="checkbox"
                                  checked={isSubmittingLater}
                                  onChange={() => onToggleSubmitLater(horseGroup.horseId, req.documentTypeCode)}
                                  className="w-3.5 h-3.5 rounded text-[#A67C2E] focus:ring-[#A67C2E]"
                                />
                                <span>Nộp sau</span>
                              </label>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
