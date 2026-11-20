'use client';

import React from 'react';
import { Plane, Truck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface RouteDisplayProps {
  origin?: string;
  destination?: string;
  mode?: 'air' | 'road' | 'multimodal';
  variant?: 'compact' | 'ticket' | 'hero';
  className?: string;
}

interface HubInfo {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  isIntl: boolean;
}

export function inferHubInfo(rawLoc?: string, isEn: boolean = false): HubInfo {
  if (!rawLoc) {
    return {
      code: 'DEP',
      name: isEn ? 'Departure Point' : 'Điểm xuất phát',
      country: isEn ? 'Global' : 'Quốc tế',
      countryCode: 'GL',
      flag: 'GL',
      isIntl: false,
    };
  }

  const s = rawLoc.toLowerCase().trim();

  const codeMatch = rawLoc.match(/\(([A-Z]{3})\)/);
  if (codeMatch && codeMatch[1]) {
    const c = codeMatch[1];
    if (c === 'DXB')
      return { code: 'DXB', name: 'Dubai Meydan Hub', country: isEn ? 'UAE' : 'UAE', countryCode: 'AE', flag: 'AE', isIntl: true };
    if (c === 'SGN')
      return { code: 'SGN', name: isEn ? 'Ho Chi Minh City' : 'TP. Hồ Chí Minh', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
    if (c === 'SIN')
      return { code: 'SIN', name: 'Singapore Kranji', country: 'Singapore', countryCode: 'SG', flag: 'SG', isIntl: true };
    if (c === 'HAN')
      return { code: 'HAN', name: isEn ? 'Hanoi (Noi Bai)' : 'Hà Nội (Nội Bài)', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
    if (c === 'SYD')
      return { code: 'SYD', name: 'Sydney (Randwick)', country: isEn ? 'Australia' : 'Úc', countryCode: 'AU', flag: 'AU', isIntl: true };
    return { code: c, name: rawLoc.replace(/\([A-Z]{3}\)/, '').trim(), country: isEn ? 'Global' : 'Quốc tế', countryCode: 'INTL', flag: 'INTL', isIntl: true };
  }

  if (s.includes('ho chi minh') || s.includes('hcm') || s.includes('sai gon') || s.includes('sài gòn') || s.includes('cu chi') || s.includes('củ chi') || s.includes('tan son nhat') || s.includes('tân sơn nhất')) {
    return { code: 'SGN', name: isEn ? 'Ho Chi Minh City' : 'TP. Hồ Chí Minh', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
  }
  if (s.includes('singapore') || s.includes('changi') || s.includes('kranji') || s.includes('turf club')) {
    return { code: 'SIN', name: 'Singapore Turf Club', country: 'Singapore', countryCode: 'SG', flag: 'SG', isIntl: true };
  }
  if (s.includes('ha noi') || s.includes('hà nội') || s.includes('hanoi') || s.includes('noi bai') || s.includes('nội bài') || s.includes('soc son') || s.includes('sóc sơn')) {
    return { code: 'HAN', name: isEn ? 'Hanoi (Soc Son)' : 'Hà Nội (Sóc Sơn)', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
  }
  if (s.includes('dubai') || s.includes('meydan') || s.includes('uae')) {
    return { code: 'DXB', name: 'Dubai (Meydan Stables)', country: 'UAE', countryCode: 'AE', flag: 'AE', isIntl: true };
  }
  if (s.includes('sydney') || s.includes('australia') || s.includes('randwick')) {
    return { code: 'SYD', name: 'Sydney (Royal Randwick)', country: isEn ? 'Australia' : 'Úc', countryCode: 'AU', flag: 'AU', isIntl: true };
  }
  if (s.includes('bangkok') || s.includes('thai') || s.includes('thái') || s.includes('suvarnabhumi')) {
    return { code: 'BKK', name: 'Bangkok (Suvarnabhumi)', country: isEn ? 'Thailand' : 'Thái Lan', countryCode: 'TH', flag: 'TH', isIntl: true };
  }
  if (s.includes('kuala lumpur') || s.includes('malaysia') || s.includes('selangor')) {
    return { code: 'KUL', name: 'Selangor Turf Club', country: 'Malaysia', countryCode: 'MY', flag: 'MY', isIntl: true };
  }
  if (s.includes('hong kong') || s.includes('hồng kông') || s.includes('sha tin')) {
    return { code: 'HKG', name: 'Hong Kong (Sha Tin)', country: isEn ? 'Hong Kong' : 'Hồng Kông', countryCode: 'HK', flag: 'HK', isIntl: true };
  }
  if (s.includes('moc bai') || s.includes('mộc bài') || s.includes('tay ninh') || s.includes('tây ninh')) {
    return { code: 'MCB', name: isEn ? 'Moc Bai Border Gate' : 'Cửa khẩu Mộc Bài', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
  }
  if (s.includes('da nang') || s.includes('đà nẵng') || s.includes('hoa xuan') || s.includes('hòa xuân')) {
    return { code: 'DAD', name: isEn ? 'Da Nang (Hoa Xuan)' : 'Đà Nẵng (Hòa Xuân)', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
  }
  if (s.includes('binh duong') || s.includes('bình dương') || s.includes('dai nam') || s.includes('đại nam')) {
    return { code: 'BDG', name: isEn ? 'Binh Duong (Dai Nam)' : 'Bình Dương (Đại Nam)', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
  }
  if (s.includes('da lat') || s.includes('đà lạt') || s.includes('lam dong') || s.includes('lâm đồng')) {
    return { code: 'DLI', name: isEn ? 'Da Lat (Lam Dong)' : 'Đà Lạt (Lâm Đồng)', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
  }
  if (s.includes('can tho') || s.includes('cần thơ')) {
    return { code: 'VCA', name: isEn ? 'Can Tho Hub' : 'Cần Thơ', country: isEn ? 'Vietnam' : 'Việt Nam', countryCode: 'VN', flag: 'VN', isIntl: false };
  }

  const clean = rawLoc.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const fallbackCode = clean.length >= 3 ? clean.substring(0, 3) : 'LOC';
  return {
    code: fallbackCode,
    name: rawLoc,
    country: isEn ? 'Global' : 'Quốc tế',
    countryCode: 'VN',
    flag: 'VN',
    isIntl: false,
  };
}

export function FlightyRouteDisplay({
  origin,
  destination,
  mode,
  variant = 'compact',
  className = '',
}: RouteDisplayProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const orig = inferHubInfo(origin, isEn);
  const dest = inferHubInfo(destination, isEn);

  const isAirTransport = mode === 'air' || (mode !== 'road' && (orig.isIntl || dest.isIntl));
  const modeLabel =
    mode === 'multimodal'
      ? isEn
        ? 'Multimodal'
        : 'Đa chặng'
      : isAirTransport
        ? isEn
          ? 'Air Cargo'
          : 'Hàng không'
        : isEn
          ? 'Overland'
          : 'Đường bộ';

  const transportIcon = isAirTransport ? (
    <Plane className="w-3 h-3 text-[#A67C2E] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  ) : (
    <Truck className="w-3 h-3 text-[#287653] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  );

  if (variant === 'ticket' || variant === 'hero') {
    return (
      <div
        className={`group inline-flex max-w-full items-center gap-2.5 sm:gap-3 px-3 py-2 rounded-xl bg-white border border-[#D8CEBE] shadow-sm hover:border-[#C5B6A0] transition-all ${className}`}
        title={`${orig.name} (${orig.code}) -> ${dest.name} (${dest.code})`}
      >
        <div className="flex flex-col items-start min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="px-1 py-0.5 rounded bg-[#F0EEE8] border border-[#E8E2D8] font-mono text-[9px] font-bold text-[#5F6977] leading-none"
            >
              {orig.countryCode}
            </span>
            <span className="font-mono text-sm font-black text-[#273244] tracking-wider">
              {orig.code}
            </span>
          </div>
          <span className="text-[11px] text-[#5F6977] font-medium truncate max-w-[95px]">
            {orig.name}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center px-1 shrink-0">
          <div className="relative flex items-center justify-center w-14 sm:w-20 h-5">
            <div className="w-full h-[2px] flight-track-animated rounded-full transition-all" />
            <div className="absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center w-5 h-5 rounded-full bg-white border border-[#D8CEBE] shadow-sm group-hover:translate-x-1.5 group-hover:scale-110 group-hover:border-[#C5B6A0] transition-all duration-150 ease-out">
              {transportIcon}
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#5F6977] font-semibold mt-0.5 group-hover:text-[#A67C2E] transition-colors">
            {modeLabel}
          </span>
        </div>

        <div className="flex flex-col items-end min-w-0 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <span className="font-mono text-sm font-black text-[#273244] tracking-wider">
              {dest.code}
            </span>
            <span
              aria-hidden="true"
              className="px-1 py-0.5 rounded bg-[#F0EEE8] border border-[#E8E2D8] font-mono text-[9px] font-bold text-[#5F6977] leading-none"
            >
              {dest.countryCode}
            </span>
          </div>
          <span className="text-[11px] text-[#5F6977] font-medium truncate max-w-[95px]">
            {dest.name}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group inline-flex max-w-full items-center gap-2 py-1 ${className}`}
      title={`${orig.name} (${orig.code}) -> ${dest.name} (${dest.code})`}
    >
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="px-1 py-[1px] rounded bg-[#F0EEE8] font-mono text-[9px] font-bold text-[#5F6977] leading-none shrink-0"
          >
            {orig.countryCode}
          </span>
          <span className="font-mono text-xs sm:text-[13px] font-black text-[#273244] tracking-tight">
            {orig.code}
          </span>
        </div>
        <span className="text-[10.5px] text-[#5F6977] truncate max-w-[90px] leading-tight">
          {orig.name}
        </span>
      </div>

      <div className="flex items-center relative w-12 sm:w-16 shrink-0 h-4">
        <div className="w-full h-[1.5px] flight-track-animated rounded-full transition-all" />
        <div className="absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center w-4 h-4 rounded-full bg-[#F0EEE8] group-hover:bg-[#FAF8F4] border border-[#D8CEBE] group-hover:border-[#C5B6A0] group-hover:translate-x-1 group-hover:scale-110 transition-all duration-150 ease-out">
          {transportIcon}
        </div>
      </div>

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs sm:text-[13px] font-black text-[#273244] tracking-tight">
            {dest.code}
          </span>
          <span
            aria-hidden="true"
            className="px-1 py-[1px] rounded bg-[#F0EEE8] font-mono text-[9px] font-bold text-[#5F6977] leading-none shrink-0"
          >
            {dest.countryCode}
          </span>
        </div>
        <span className="text-[10.5px] text-[#5F6977] truncate max-w-[90px] leading-tight">
          {dest.name}
        </span>
      </div>
    </div>
  );
}
