'use client';

import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { TimelineItem, TimelineKind } from './timeline-types';
import { formatTimelineDateTime } from './build-timeline';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { fetchAuthenticatedApiBlobUrl } from '@/lib/api-client';

interface TimelineItemCardProps {
  item: TimelineItem;
  viewer: 'customer' | 'manager' | 'driver';
  compact?: boolean;
  isLastItem?: boolean;
  renderCurrentActions?: (item: TimelineItem) => React.ReactNode;
  onItemClick?: (item: TimelineItem) => void;
}

function useAuthenticatedImageUrl(rawUrl: string | null): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    if (!rawUrl) return null;
    if (rawUrl.startsWith('/api/')) return null;
    return rawUrl;
  });

  useEffect(() => {
    if (!rawUrl) {
      setResolvedUrl(null);
      return;
    }
    if (!rawUrl.startsWith('/api/')) {
      setResolvedUrl(rawUrl);
      return;
    }
    let active = true;
    let blobUrl: string | null = null;
    void fetchAuthenticatedApiBlobUrl(rawUrl).then((url) => {
      if (!active) {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      blobUrl = url;
      setResolvedUrl(url);
    });
    return () => {
      active = false;
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [rawUrl]);

  return resolvedUrl;
}

function TimelinePhotoThumb({
  url,
  alt,
  index,
  onSelect,
  isEn,
}: {
  url: string;
  alt: string;
  index: number;
  onSelect: (resolvedUrl: string) => void;
  isEn: boolean;
}) {
  const resolved = useAuthenticatedImageUrl(url);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (resolved) onSelect(resolved);
      }}
      disabled={!resolved}
      className="w-14 h-14 rounded-lg overflow-hidden border border-[#D8CEBE] hover:border-[#A67C2E] transition-all relative group bg-[#FAF8F4] flex items-center justify-center cursor-pointer disabled:opacity-60"
      aria-label={
        isEn
          ? `View photo: ${alt || `Photo ${index + 1}`}`
          : `Xem ảnh: ${alt || `Ảnh ${index + 1}`}`
      }
    >
      {resolved ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={alt || (isEn ? `Evidence photo ${index + 1}` : `Ảnh minh chứng ${index + 1}`)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        />
      ) : (
        <ImageIcon size={16} className="text-[#8A8478]" aria-hidden="true" />
      )}
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <ImageIcon size={14} className="text-white" />
      </div>
    </button>
  );
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
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const IconComponent = getMilestoneIcon(item.kind);
  const locale = isEn ? 'en-US' : 'vi-VN';
  const plannedTime = formatTimelineDateTime(item.plannedAt, locale);
  const actualTime = formatTimelineDateTime(item.actualAt, locale);

  const isDone = item.status === 'done';
  const isCurrent = item.status === 'current';
  const isSkipped = item.status === 'skipped';
  const isFailed = item.status === 'failed';

  const progressPct = Math.max(0, Math.min(100, item.progressPercent ?? 0));

  const statusText = isDone
    ? isEn ? 'Completed' : 'Đã xong'
    : isCurrent
    ? isEn ? 'In Progress' : 'Đang xử lý'
    : isFailed
    ? isEn ? 'Issue / Failed' : 'Gặp sự cố'
    : isSkipped
    ? isEn ? 'Skipped' : 'Đã bỏ qua'
    : isEn ? 'Upcoming' : 'Sắp tới';

  const locationSourceText =
    item.locationSource === 'gps'
      ? 'GPS'
      : item.locationSource === 'simulated'
      ? isEn ? 'Simulated' : 'Giả lập'
      : item.locationSource === 'override'
      ? isEn ? 'Coordinator Override' : 'Điều phối can thiệp'
      : isEn ? 'Manual' : 'Thủ công';

  const showActionsSlot =
    (viewer === 'driver' || viewer === 'manager') &&
    isCurrent &&
    Boolean(renderCurrentActions);

  return (
    <li
      className={`relative flex items-start gap-3 sm:gap-4 pb-6 min-w-0 ${isLastItem ? 'pb-2' : ''}`}
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
        {statusText}: {item.title}
      </span>

      {/* Milestone Card Body */}
      <div
        className={`flex-1 min-w-0 rounded-2xl border transition-all p-3.5 sm:p-4 ${
          isCurrent
            ? 'bg-[#FAF8F4] border-[#A67C2E] shadow-sm'
            : isDone
            ? 'bg-white border-[#E5DDD0]'
            : isFailed
            ? 'bg-[#FDF6F6] border-[#B33E3E]/40'
            : isSkipped
            ? 'bg-[#F9F8F6] border-[#E5DDD0] opacity-75'
            : 'bg-white border-[#E5DDD0] opacity-85'
        }`}
        onClick={() => onItemClick?.(item)}
      >
        {/* Header: Title + Badges */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
              <h4
                className={`font-bold text-sm text-[#181A17] m-0 break-words leading-snug ${
                  isSkipped ? 'line-through text-[#747D88]' : ''
                }`}
              >
                {item.title}
              </h4>

              {/* Status Badge */}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
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
                {statusText}
              </span>

              {/* Location Source Badge */}
              {item.locationSource && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
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
                  {locationSourceText}
                  {item.flagged && (
                    <AlertTriangle
                      size={10}
                      className="text-rose-600"
                      aria-label={isEn ? 'Manual check-in flagged' : 'Cảnh báo can thiệp'}
                    />
                  )}
                </span>
              )}
            </div>

            {item.subtitle && (
              <p className="text-xs text-[#5F6977] mt-1 mb-0 flex items-start gap-1.5 min-w-0">
                <MapPin size={12} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
                <span className="break-words min-w-0">{item.subtitle}</span>
              </p>
            )}
          </div>

          {/* Time & Delay Section */}
          <div className="flex flex-wrap sm:flex-col sm:items-end gap-1.5 text-xs text-[#5F6977] shrink-0 mt-1 sm:mt-0">
            {item.actualAt ? (
              <div className="flex items-center gap-1 font-semibold text-[#181A17]">
                <Clock size={13} className="text-[#287653] shrink-0" aria-hidden="true" />
                <span>
                  {isEn ? 'Actual:' : 'Thực tế:'} <strong>{actualTime.time}</strong> ({actualTime.date})
                </span>
              </div>
            ) : item.plannedAt ? (
              <div className="flex items-center gap-1">
                <Clock size={13} className="text-[#8A8478] shrink-0" aria-hidden="true" />
                <span>
                  {isEn ? 'Planned:' : 'Kế hoạch:'} <strong>{plannedTime.time}</strong> ({plannedTime.date})
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
                    {isEn ? `Delayed ${item.delayMinutes}m` : `Trễ ${item.delayMinutes} phút`}
                  </>
                ) : (
                  <>
                    <Check size={11} aria-hidden="true" />
                    {isEn ? `Early ${Math.abs(item.delayMinutes)}m` : `Sớm ${Math.abs(item.delayMinutes)} phút`}
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Current Milestone Progress Bar */}
        {isCurrent && typeof item.progressPercent === 'number' && item.progressPercent > 0 && (
          <div className="mt-3 pt-2 border-t border-[#E5DDD0]/70">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#5F6977] mb-1">
              <span>{isEn ? 'Stop check-in progress' : 'Tiến độ tại mốc hiện tại'}</span>
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

        {/* Vitals Chips */}
        {item.vitals && item.vitals.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-[#E5DDD0]/70 flex flex-wrap gap-2">
            {item.vitals.map((v, idx) => (
              <span
                key={idx}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 border max-w-full break-words ${
                  v.tier === 'red'
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : v.tier === 'amber_escalatable' || v.tier === 'amber_observational'
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <Activity size={12} className="shrink-0" aria-hidden="true" />
                <span className="break-words">
                  <strong>{v.horseName}:</strong> {v.text}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Note */}
        {item.note && (
          <p className="text-xs text-[#5F6977] italic mt-2.5 mb-0 bg-white/70 p-2 rounded-lg border border-[#E5DDD0]/60 break-words">
            &ldquo;{item.note}&rdquo;
          </p>
        )}

        {/* Actor Label (shown to manager & driver, hidden for customer) */}
        {viewer !== 'customer' && item.actorLabel && (
          <div className="text-[11px] text-[#747D88] mt-2 flex flex-wrap items-center gap-1">
            <span>{isEn ? 'Updated by:' : 'Cập nhật bởi:'}</span>
            <span className="font-semibold text-[#181A17] break-words">{item.actorLabel}</span>
          </div>
        )}

        {/* Photos Thumbnail List */}
        {!compact && item.photos && item.photos.length > 0 && (
          <div className="mt-3 pt-2 border-t border-[#E5DDD0]/70 flex flex-wrap gap-2">
            {item.photos.map((p, idx) => (
              <TimelinePhotoThumb
                key={`${p.url}-${idx}`}
                url={p.url}
                alt={p.alt}
                index={idx}
                onSelect={(resolved) => setSelectedPhoto(resolved)}
                isEn={isEn}
              />
            ))}
          </div>
        )}

        {/* Driver & Manager Quick Actions Slot */}
        {showActionsSlot && (
          <div className="mt-4 pt-3 border-t border-[#E5DDD0]">
            {renderCurrentActions!(item)}
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
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
              aria-label={isEn ? 'Close image' : 'Đóng ảnh'}
            >
              <X size={16} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto}
              alt={isEn ? 'Evidence photo preview' : 'Ảnh phóng to'}
              className="max-h-[80vh] w-auto rounded-xl object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </li>
  );
};
