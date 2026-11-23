'use client';

import React from 'react';
import { TimelineItem, VerticalTimelineProps } from './timeline-types';
import { TimelineItemCard } from './TimelineItemCard';
import { Calendar, Navigation, RotateCcw, Award, LucideIcon } from 'lucide-react';

const GROUP_CONFIG: Record<
  TimelineItem['group'],
  { title: string; subtitle: string; icon: LucideIcon }
> = {
  pre_trip: {
    title: 'Trước chuyến đi',
    subtitle: 'Thanh toán cước, phê duyệt hợp đồng, hồ sơ thú y & xác nhận phương tiện',
    icon: Calendar,
  },
  outbound: {
    title: 'Hành trình Chặng đi',
    subtitle: 'Lộ trình từ điểm xuất phát đến điểm giao đích',
    icon: Navigation,
  },
  return: {
    title: 'Hành trình Chặng về (Khứ hồi)',
    subtitle: 'Lộ trình đón trả ngựa quay về điểm xuất phát ban đầu',
    icon: RotateCcw,
  },
  post_trip: {
    title: 'Sau chuyến đi',
    subtitle: 'Biên bản bàn giao, kiểm định sức khỏe sau vận chuyển & thanh lý',
    icon: Award,
  },
};

export const VerticalTimeline: React.FC<VerticalTimelineProps> = ({
  items = [],
  viewer,
  compact = false,
  showGroups = true,
  emptyText,
  renderCurrentActions,
  onItemClick,
  className = '',
}) => {
  if (!items || items.length === 0) {
    return (
      <div className={`p-8 text-center bg-white rounded-2xl border border-[#E5DDD0] ${className}`}>
        <p className="text-sm text-[#747D88] m-0">
          {emptyText || 'Chưa có thông tin tiến độ nào được ghi nhận cho chuyến đi này.'}
        </p>
      </div>
    );
  }

  if (!showGroups) {
    return (
      <div className={`w-full ${className}`}>
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

  // Partition into ordered groups
  const groups: Array<TimelineItem['group']> = ['pre_trip', 'outbound', 'return', 'post_trip'];
  const groupedItems = groups.map((g) => ({
    group: g,
    meta: GROUP_CONFIG[g],
    items: items.filter((it) => it.group === g),
  })).filter((g) => g.items.length > 0);

  return (
    <div className={`w-full flex flex-col gap-6 ${className}`}>
      {groupedItems.map((g, gIdx) => {
        const GroupIcon = g.meta.icon;
        const isLastGroup = gIdx === groupedItems.length - 1;

        return (
          <section
            key={g.group}
            aria-labelledby={`timeline-group-${g.group}`}
            className="flex flex-col gap-3"
          >
            {/* Group Header */}
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E5DDD0]">
              <div className="w-7 h-7 rounded-lg bg-[#FAF8F4] border border-[#D8CEBE] text-[#A67C2E] flex items-center justify-center shrink-0">
                <GroupIcon size={14} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3
                  id={`timeline-group-${g.group}`}
                  className="text-xs font-black uppercase tracking-[0.08em] text-[#181A17] m-0"
                >
                  {g.meta.title}
                </h3>
                {!compact && (
                  <p className="text-[11px] text-[#747D88] m-0 truncate">
                    {g.meta.subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Group Ordered List */}
            <ol className="list-none p-0 m-0 pt-1">
              {g.items.map((item, idx) => {
                const isLastInGroup = idx === g.items.length - 1;
                // An item is considered absolute last if it's the last item in the last group
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
