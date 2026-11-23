'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  FileCheck2,
  MapPin,
  Building,
  Coffee,
  Flag,
  Stethoscope,
  Plane,
  Ship,
  Repeat,
  PackageCheck,
  RotateCcw,
  UserX,
  RefreshCw,
  Handshake,
  Check,
  AlertTriangle,
  Clock,
  Radio,
  Image as ImageIcon,
  X,
  Activity,
  Heart,
} from 'lucide-react';
import { TimelineItem, TimelineKind } from './timeline-types';
import { formatTimelineDateTime } from './build-timeline';

interface TimelineItemCardProps {
  item: TimelineItem;
  viewer: 'customer' | 'manager' | 'driver';
  compact?: boolean;
  isLastItem?: boolean;
  renderCurrentActions?: (item: TimelineItem) => React.ReactNode;
  onItemClick?: (item: TimelineItem) => void;
}

export function getMilestoneIcon(kind: TimelineKind) {
  switch (kind) {
    case 'payment':
      return CreditCard;
    case 'approval':
      return ShieldCheck;
    case 'documents':
      return FileCheck2;
    case 'pickup':
      return MapPin;
    case 'depot':
      return Building;
    case 'rest':
      return Coffee;
    case 'border':
      return Flag;
    case 'quarantine':
      return Stethoscope;
    case 'airport':
      return Plane;
    case 'seaport':
      return Ship;
    case 'transfer':
      return Repeat;
    case 'delivery':
      return PackageCheck;
    case 'handover':
      return Handshake;
    case 'return_start':
      return RotateCcw;
    case 'no_show':
      return UserX;
    case 'refund':
      return RefreshCw;
    default:
      return MapPin;
  }
}

export const TimelineItemCard: React.FC<TimelineItemCardProps> = ({
  item,
  viewer,
  compact = false,
  isLastItem = false,
  renderCurrentActions,
  onItemClick,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const IconComponent = getMilestoneIcon(item.kind);
  const plannedTime = formatTimelineDateTime(item.plannedAt);
  const actualTime = formatTimelineDateTime(item.actualAt);

  const isDone = item.status === 'done';
  const isCurrent = item.status === 'current';
  const isUpcoming = item.status === 'upcoming';
  const isSkipped = item.status === 'skipped';
  const isFailed = item.status === 'failed';

  const progressPct = Math.max(0, Math.min(100, item.progressPercent ?? 0));

  return (
    <li
      className={`relative flex items-start gap-4 pb-7 ${isLastItem ? 'pb-2' : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* Connector Line (drawn downwards to next milestone) */}
      {!isLastItem && (
        <div
          className="absolute left-[17px] top-[34px] -bottom-[2px] w-[3px] -translate-x-1/2"
          aria-hidden="true"
        >
          {isDone ? (
            <div className="w-full h-full bg-[#A67C2E] rounded-full" />
          ) : isCurrent ? (
            <div className="w-full h-full bg-[#E5DDD0] rounded-full relative overflow-hidden">
              <div
                className="w-full bg-[#A67C2E] transition-all duration-500 rounded-full"
                style={{ height: `${progressPct}%` }}
              />
            </div>
          ) : (
            <div className="w-full h-full border-l-2 border-dashed border-[#D8CEBE]" />
          )}
        </div>
      )}

      {/* Status Dot / Icon Container */}
      <div className="relative z-10 shrink-0 flex items-center justify-center">
        {/* Pulsing ring for current milestone */}
        {isCurrent && (
          <span
            className="absolute w-10 h-10 rounded-full bg-[#A67C2E]/30 motion-safe:animate-ping"
            aria-hidden="true"
          />
        )}

        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-all ${
            isDone
              ? 'bg-[#287653] text-white ring-4 ring-[#E8F2EB]'
              : isCurrent
              ? 'bg-[#181A17] text-[#C4B38E] ring-4 ring-[#F5EFE2] border-2 border-[#A67C2E]'
              : isFailed
              ? 'bg-[#B33E3E] text-white ring-4 ring-[#F8EAEA]'
              : isSkipped
              ? 'bg-[#E5DDD0] text-[#747D88]'
              : 'border-2 border-[#D8CEBE] bg-white text-[#8A8478]'
          }`}
        >
          {isDone ? (
            <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <IconComponent size={16} aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Screen Reader Label */}
      <span className="sr-only">
        {isDone
          ? 'Đã hoàn thành: '
          : isCurrent
          ? 'Đang diễn ra: '
          : isFailed
          ? 'Không thành công: '
          : isSkipped
          ? 'Bỏ qua: '
          : 'Sắp tới: '}
        {item.title}
      </span>

      {/* Milestone Card Body */}
      <div
        className={`flex-1 rounded-2xl border transition-all p-4 ${
          isCurrent
            ? 'bg-[#FAF8F4] border-[#A67C2E] shadow-sm'
            : isDone
            ? 'bg-white border-[#E5DDD0]'
            : isFailed
            ? 'bg-[#FDF6F6] border-[#B33E3E]/40'
            : isSkipped
            ? 'bg-[#F9F8F6] border-[#E5DDD0] opacity-75'
            : 'bg-white border-[#E5DDD0] opacity-80'
        }`}
        onClick={() => onItemClick?.(item)}
      >
        {/* Header: Title + Badges */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                className={`font-bold text-sm text-[#181A17] m-0 ${
                  isSkipped ? 'line-through text-[#747D88]' : ''
                }`}
              >
                {item.title}
              </h4>

              {/* Status Badge */}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isDone
                    ? 'bg-[#E8F2EB] text-[#287653]'
                    : isCurrent
                    ? 'bg-[#181A17] text-[#C4B38E]'
                    : isFailed
                    ? 'bg-[#F8EAEA] text-[#B33E3E]'
                    : isSkipped
                    ? 'bg-[#F0EEE8] text-[#747D88]'
                    : 'bg-[#F0EEE8] text-[#5F6977]'
                }`}
              >
                {isDone
                  ? 'Đã xong'
                  : isCurrent
                  ? 'Đang xử lý'
                  : isFailed
                  ? 'Gặp sự cố'
                  : isSkipped
                  ? 'Đã bỏ qua'
                  : 'Sắp tới'}
              </span>

              {/* Location Source Badge */}
              {item.locationSource && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                    item.locationSource === 'gps'
                      ? 'bg-sky-50 text-sky-800 border border-sky-200'
                      : item.locationSource === 'simulated'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : item.flagged
                      ? 'bg-rose-50 text-rose-800 border border-rose-300'
                      : 'bg-stone-100 text-stone-700 border border-stone-200'
                  }`}
                >
                  <Radio size={10} aria-hidden="true" />
                  {item.locationSource === 'gps'
                    ? 'GPS'
                    : item.locationSource === 'simulated'
                    ? 'Giả lập'
                    : item.locationSource === 'override'
                    ? 'Điều phối can thiệp'
                    : 'Thủ công'}
                  {item.flagged && (
                    <AlertTriangle size={10} className="text-rose-600" aria-label="Cảnh báo can thiệp" />
                  )}
                </span>
              )}
            </div>

            {item.subtitle && (
              <p className="text-xs text-[#5F6977] mt-1 mb-0 flex items-center gap-1.5">
                <MapPin size={12} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                <span className="truncate">{item.subtitle}</span>
              </p>
            )}
          </div>

          {/* Time & Delay Section */}
          <div className="flex flex-wrap sm:flex-col sm:items-end gap-1.5 text-xs text-[#5F6977] shrink-0 mt-1 sm:mt-0">
            {item.actualAt ? (
              <div className="flex items-center gap-1 font-semibold text-[#181A17]">
                <Clock size={13} className="text-[#287653] shrink-0" aria-hidden="true" />
                <span>
                  Thực tế: <strong>{actualTime.time}</strong> ({actualTime.date})
                </span>
              </div>
            ) : item.plannedAt ? (
              <div className="flex items-center gap-1">
                <Clock size={13} className="text-[#8A8478] shrink-0" aria-hidden="true" />
                <span>
                  Kế hoạch: <strong>{plannedTime.time}</strong> ({plannedTime.date})
                </span>
              </div>
            ) : null}

            {/* Delay/Early Badge */}
            {typeof item.delayMinutes === 'number' && item.delayMinutes !== 0 && (
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  item.delayMinutes > 60
                    ? 'bg-[#F8EAEA] text-[#B33E3E] border border-[#B33E3E]/30'
                    : item.delayMinutes > 0
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-[#E8F2EB] text-[#287653] border border-[#287653]/30'
                }`}
              >
                {item.delayMinutes > 0 ? (
                  <>
                    <AlertTriangle size={11} aria-hidden="true" />
                    Trễ {item.delayMinutes} phút
                  </>
                ) : (
                  <>
                    <Check size={11} aria-hidden="true" />
                    Sớm {Math.abs(item.delayMinutes)} phút
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Current Milestone Distance Progress Bar */}
        {isCurrent && typeof item.progressPercent === 'number' && (
          <div className="mt-3 pt-2 border-t border-[#E5DDD0]/70">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#5F6977] mb-1">
              <span>Tiến độ đoạn đường hiện tại</span>
              <span className="text-[#181A17] font-bold">{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full bg-[#E5DDD0] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#A67C2E] rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Vitals Chip */}
        {item.vitals && item.vitals.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-[#E5DDD0]/70 flex flex-wrap gap-2">
            {item.vitals.map((v, idx) => (
              <span
                key={idx}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 border ${
                  v.tier === 'red'
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : v.tier === 'amber_escalatable' || v.tier === 'amber_observational'
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <Activity size={12} aria-hidden="true" />
                <span>
                  <strong>{v.horseName}:</strong> {v.text}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Note */}
        {item.note && (
          <p className="text-xs text-[#5F6977] italic mt-2.5 mb-0 bg-white/70 p-2 rounded-lg border border-[#E5DDD0]/60">
            &ldquo;{item.note}&rdquo;
          </p>
        )}

        {/* Actor Label (shown to manager & driver, hidden for customer) */}
        {viewer !== 'customer' && item.actorLabel && (
          <div className="text-[11px] text-[#747D88] mt-2 flex items-center gap-1">
            <span>Cập nhật bởi:</span>
            <span className="font-semibold text-[#181A17]">{item.actorLabel}</span>
          </div>
        )}

        {/* Photos Thumbnail List */}
        {!compact && item.photos && item.photos.length > 0 && (
          <div className="mt-3 pt-2 border-t border-[#E5DDD0]/70 flex flex-wrap gap-2">
            {item.photos.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedPhoto(p.url)}
                className="w-14 h-14 rounded-lg overflow-hidden border border-[#D8CEBE] hover:border-[#A67C2E] transition-all relative group"
                aria-label={`Xem ảnh: ${p.alt || `Ảnh ${idx + 1}`}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.alt || `Ảnh minh chứng ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <ImageIcon size={14} className="text-white" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Driver Quick Actions Slot */}
        {viewer === 'driver' && isCurrent && renderCurrentActions && (
          <div className="mt-4 pt-3 border-t border-[#E5DDD0]">
            {renderCurrentActions(item)}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {selectedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors"
              aria-label="Đóng ảnh"
            >
              <X size={16} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto}
              alt="Ảnh phóng to"
              className="max-h-[80vh] w-auto rounded-xl object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </li>
  );
};
