'use client';

import React, { useState } from 'react';
import { TimelineItem, VerticalTimelineProps } from './timeline-types';
import { TimelineItemCard } from './TimelineItemCard';
import { Calendar, Navigation, RotateCcw, Award, ChevronDown, ChevronRight, CheckCircle2, LucideIcon } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const GROUP_CONFIG: Record<
  TimelineItem['group'],
  { titleVi: string; titleEn: string; subtitleVi: string; subtitleEn: string; icon: LucideIcon }
> = {
  pre_trip: {
    titleVi: 'Trước chuyến đi',
    titleEn: 'Pre-Trip Preparation',
    subtitleVi: 'Thanh toán cước, phê duyệt hợp đồng, hồ sơ thú y & xác nhận phương tiện',
    subtitleEn: 'Freight payment, plan approval, quarantine dossier & vehicle dispatch',
    icon: Calendar,
  },
  outbound: {
    titleVi: 'Hành trình Chặng đi',
    titleEn: 'Outbound Journey',
    subtitleVi: 'Lộ trình từ điểm xuất phát đến điểm giao đích',
    subtitleEn: 'Transit route from pickup origin to destination',
    icon: Navigation,
  },
  return: {
    titleVi: 'Hành trình Chặng về (Khứ hồi)',
    titleEn: 'Return Journey (Round-Trip)',
    subtitleVi: 'Lộ trình đón trả ngựa quay về điểm xuất phát ban đầu',
    subtitleEn: 'Return leg transporting horses back to origin',
    icon: RotateCcw,
  },
  post_trip: {
    titleVi: 'Sau chuyến đi',
    titleEn: 'Post-Trip & Handover',
    subtitleVi: 'Biên bản bàn giao, kiểm định sức khỏe sau vận chuyển & hoàn tất',
    subtitleEn: 'Delivery handover checklist, post-transit check & completion',
    icon: Award,
  },
};

export const VerticalTimeline: React.FC<VerticalTimelineProps> = ({
  items = [],
  viewer,
  compact = false,
  showGroups = true,
  collapsePreTripWhenDone = false,
  emptyText,
  renderCurrentActions,
  onItemClick,
  className = '',
}) => {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [preTripExpanded, setPreTripExpanded] = useState(false);

  if (!items || items.length === 0) {
    return (
      <div className={`p-8 text-center bg-white rounded-2xl border border-[#E5DDD0] ${className}`}>
        <p className="text-sm text-[#747D88] m-0">
          {emptyText ||
            (isEn
              ? 'No transit progress recorded for this trip yet.'
              : 'Chưa có thông tin tiến độ nào được ghi nhận cho chuyến đi này.')}
        </p>
      </div>
    );
  }

  if (!showGroups) {
    return (
      <div className={`w-full min-w-0 ${className}`}>
        <ol className="list-none p-0 m-0">
          {items.map((item, idx) => (
            <TimelineItemCard
              key={item.id}
              item={item}
              viewer={viewer}
              compact={compact}
              isLastItem={idx === items.length - 1}
              renderCurrentActions={renderCurrentActions}
              onItemClick={onItemClick}
            />
          ))}
        </ol>
      </div>
    );
  }

  const groups: Array<TimelineItem['group']> = ['pre_trip', 'outbound', 'return', 'post_trip'];
  const groupedItems = groups
    .map((g) => ({
      group: g,
      meta: GROUP_CONFIG[g],
      items: items.filter((it) => it.group === g),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={`w-full min-w-0 flex flex-col gap-6 ${className}`}>
      {groupedItems.map((g, gIdx) => {
        const GroupIcon = g.meta.icon;
        const isLastGroup = gIdx === groupedItems.length - 1;
        const allPreTripDone =
          g.group === 'pre_trip' &&
          collapsePreTripWhenDone &&
          g.items.every((it) => it.status === 'done');

        const title = isEn ? g.meta.titleEn : g.meta.titleVi;
        const subtitle = isEn ? g.meta.subtitleEn : g.meta.subtitleVi;

        if (allPreTripDone) {
          return (
            <section
              key={g.group}
              aria-labelledby={`timeline-group-${g.group}`}
              className="flex flex-col gap-3 min-w-0"
            >
              <button
                type="button"
                aria-expanded={preTripExpanded}
                onClick={() => setPreTripExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2.5 p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] hover:border-[#A67C2E] transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#E8F2EB] border border-[#287653]/25 text-[#287653] flex items-center justify-center shrink-0">
                    <CheckCircle2 size={14} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3
                      id={`timeline-group-${g.group}`}
                      className="text-xs font-black uppercase tracking-[0.06em] text-[#181A17] m-0 flex flex-wrap items-center gap-1.5"
                    >
                      <span>{title}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#E8F2EB] text-[#287653] text-[10px] font-bold normal-case tracking-normal">
                        {isEn
                          ? `${g.items.length}/${g.items.length} done`
                          : `${g.items.length}/${g.items.length} hoàn tất`}
                      </span>
                    </h3>
                    <p className="text-[11px] text-[#747D88] m-0 truncate">
                      {isEn ? 'Tap to expand pre-trip records' : 'Bấm để xem chi tiết thủ tục trước chuyến'}
                    </p>
                  </div>
                </div>
                <span className="text-[#5F6977] shrink-0">
                  {preTripExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </button>

              {preTripExpanded && (
                <ol className="list-none p-0 m-0 pt-1">
                  {g.items.map((item, idx) => (
                    <TimelineItemCard
                      key={item.id}
                      item={item}
                      viewer={viewer}
                      compact={compact}
                      isLastItem={idx === g.items.length - 1}
                      renderCurrentActions={renderCurrentActions}
                      onItemClick={onItemClick}
                    />
                  ))}
                </ol>
              )}
            </section>
          );
        }

        return (
          <section
            key={g.group}
            aria-labelledby={`timeline-group-${g.group}`}
            className="flex flex-col gap-3 min-w-0"
          >
            {/* Group Header */}
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E5DDD0] min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#FAF8F4] border border-[#D8CEBE] text-[#A67C2E] flex items-center justify-center shrink-0">
                <GroupIcon size={14} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id={`timeline-group-${g.group}`}
                  className="text-xs font-black uppercase tracking-[0.08em] text-[#181A17] m-0"
                >
                  {title}
                </h3>
                {!compact && (
                  <p className="text-[11px] text-[#747D88] m-0 break-words">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Group Ordered List */}
            <ol className="list-none p-0 m-0 pt-1">
              {g.items.map((item, idx) => {
                const isLastInGroup = idx === g.items.length - 1;
                const isOverallLast = isLastGroup && isLastInGroup;

                return (
                  <TimelineItemCard
                    key={item.id}
                    item={item}
                    viewer={viewer}
                    compact={compact}
                    isLastItem={isOverallLast}
                    renderCurrentActions={renderCurrentActions}
                    onItemClick={onItemClick}
                  />
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
};
