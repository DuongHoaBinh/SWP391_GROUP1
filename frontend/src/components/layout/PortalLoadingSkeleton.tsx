import React from 'react';

export function PortalLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading..."
      className="w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in-only"
    >
      {/* Hero Banner Skeleton */}
      <div className="rounded-2xl bg-[#181A17] border border-[#2C2F2A] p-6 sm:p-8 space-y-4">
        <div className="h-4 w-40 rounded-full bg-white/10" />
        <div className="h-8 w-64 sm:w-80 rounded-xl bg-white/15" />
        <div className="h-4 w-72 sm:w-96 rounded-lg bg-white/10" />
      </div>

      {/* KPI Row Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="rounded-2xl bg-white border border-[#D8CEBE] p-5 space-y-3 shadow-sm"
          >
            <div className="h-3 w-24 rounded skeleton-shimmer" />
            <div className="h-8 w-20 rounded-lg skeleton-shimmer" />
            <div className="h-3 w-36 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Main Content Card Skeleton */}
      <div className="rounded-2xl bg-white border border-[#D8CEBE] p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E8E2D8]">
          <div className="h-5 w-48 rounded-lg skeleton-shimmer" />
          <div className="h-9 w-36 rounded-xl skeleton-shimmer" />
        </div>
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="h-14 w-full rounded-xl skeleton-shimmer"
          />
        ))}
      </div>
    </div>
  );
}
