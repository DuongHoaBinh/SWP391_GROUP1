'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, dictionaries } from './translations';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
  translateStatus: (status?: string | null) => string;
  translateDocType: (type?: string | null, customTitle?: string | null) => string;
  translateVehicleType: (type?: string | null) => string;
  translateGender: (gender?: string | null) => string;
  translateBreed: (breed?: string | null) => string;
  translateCondition: (condition?: string | null) => string;
  translateIncident: (type?: string | null) => string;
  translateSeverity: (severity?: string | null) => string;
  translateStopType: (type?: string | null) => string;
  translateRole: (role?: string | null) => string;
  translateUrgency: (urgency?: string | null) => string;
  translateTransportType: (type?: string | null) => string;
  translatePaymentStatus: (status?: string | null) => string;
  translateHealthStatus: (status?: string | null) => string;
  translateTimeAgo: (dateString?: string | null) => string;
  translateCountry: (country?: string | null) => string;
  translateAirportCity: (codeOrCity?: string | null) => string;
  translateColor: (color?: string | null) => string;
  translateRejectionReason: (reason?: string | null) => string;
  translateNotification: (title?: string | null, message?: string | null) => { title: string; message: string; actionText?: string };
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'equitransit_lang';

// ─── STATUS DICTIONARY & NORMALIZER ──────────────────────────────────────────
const STATUS_DATA: Record<string, { en: string; vi: string }> = {
  requested: { en: 'Pending Approval', vi: 'Chờ phê duyệt' },
  awaiting_payment: { en: 'Awaiting Payment', vi: 'Chờ thanh toán' },
  paid_pending_review: { en: 'Paid · Pending Review', vi: 'Đã thanh toán · Chờ duyệt' },
  paid_pending_feasibility: { en: 'Paid · Pending Feasibility', vi: 'Đã thanh toán · Chờ duyệt khả thi' },
  refund_requested: { en: 'Refund Requested', vi: 'Chờ hoàn tiền' },
  refunded: { en: 'Refunded', vi: 'Đã hoàn tiền' },
  change_requested: { en: 'Change Requested', vi: 'Yêu cầu chỉnh sửa' },
  under_review: { en: 'Under Review', vi: 'Đang xem xét' },
  in_review: { en: 'Under Review', vi: 'Đang thẩm định' },
  approved: { en: 'Approved', vi: 'Đã phê duyệt' },
  rejected: { en: 'Rejected', vi: 'Bị từ chối' },
  planning: { en: 'In Planning', vi: 'Đang lập tuyến' },
  scheduled: { en: 'Scheduled', vi: 'Đã lên lịch' },
  ready_to_depart: { en: 'Ready to Depart', vi: 'Sẵn sàng xuất phát' },
  ready: { en: 'Ready to Depart', vi: 'Sẵn sàng xuất phát' },
  confirmed: { en: 'Confirmed Plan', vi: 'Đã xác nhận chuyến' },
  in_transit: { en: 'In Transit', vi: 'Đang vận chuyển' },
  return_pending: { en: 'Return Leg Pending', vi: 'Chờ chặng về' },
  return_in_transit: { en: 'Return In Transit', vi: 'Đang chạy chặng về' },
  incident_reported: { en: 'Incident Reported', vi: 'Có sự cố phát sinh' },
  incident_hold: { en: 'Incident Hold', vi: 'Tạm dừng do sự cố' },
  delayed: { en: 'Delayed', vi: 'Bị trễ chuyến' },
  arrived: { en: 'Arrived', vi: 'Đã đến đích' },
  delivered: { en: 'Delivered', vi: 'Đã giao ngựa' },
  completed: { en: 'Completed', vi: 'Hoàn tất' },
  cancelled: { en: 'Cancelled', vi: 'Đã hủy' },
  cancelled_operational: { en: 'Cancelled (Operational)', vi: 'Đã hủy vận hành' },
  payment_overdue: { en: 'Payment Overdue', vi: 'Quá hạn thanh toán' },
  draft: { en: 'Draft Plan', vi: 'Bản nháp' },
  submitted: { en: 'Submitted', vi: 'Đã nộp' },
  expired: { en: 'Expired', vi: 'Hết hạn' },
  compliant: { en: 'Compliant', vi: 'Hợp lệ' },
  waiting_authority: { en: 'Awaiting Authority', vi: 'Chờ cơ quan thẩm quyền' },
  available: { en: 'Available', vi: 'Sẵn sàng' },
  in_use: { en: 'In Use', vi: 'Đang di chuyển' },
  reserved: { en: 'Reserved', vi: 'Đang giữ chỗ' },
  maintenance: { en: 'Maintenance', vi: 'Bảo trì / Kiểm định' },
  open: { en: 'Open Incident', vi: 'Đang xử lý' },
  resolved: { en: 'Resolved', vi: 'Đã giải quyết' },
  closed: { en: 'Closed', vi: 'Đã đóng' },
  pending_approval: { en: 'Pending Approval', vi: 'Chờ Manager duyệt' },
  needs_attention: { en: 'Needs Attention', vi: 'Cần chú ý' },
  healthy: { en: 'Healthy', vi: 'Khỏe mạnh' },
  stable: { en: 'Stable', vi: 'Ổn định' },
};

// Common aliases mapping to normalized keys
const STATUS_ALIASES: Record<string, string> = {
  // Vietnamese aliases
  'chờ duyệt': 'requested',
  'chờ phê duyệt': 'requested',
  'chờ quản lý duyệt': 'pending_approval',
  'chờ manager duyệt': 'pending_approval',
  'đang xem xét': 'under_review',
  'yêu cầu chỉnh sửa': 'change_requested',
  'cần chỉnh sửa': 'change_requested',
  'đang thẩm định': 'under_review',
  'đã phê duyệt': 'approved',
  'đã duyệt': 'approved',
  'manager đã duyệt': 'approved',
  'bị từ chối': 'rejected',
  'từ chối': 'rejected',
  'bị trả về': 'rejected',
  'đang lập tuyến': 'planning',
  'đang lập kế hoạch': 'planning',
  'đã lên lịch': 'scheduled',
  'sẵn sàng xuất phát': 'ready_to_depart',
  'sẵn sàng': 'available',
  'đã xác nhận nhận chuyến': 'confirmed',
  'tài xế đã xác nhận': 'confirmed',
  'đang vận chuyển': 'in_transit',
  'đang di chuyển': 'in_transit',
  'đang chạy': 'in_use',
  'bảo trì': 'maintenance',
  'hoàn thành': 'completed',
  'đã hoàn thành': 'completed',
  'hoàn tất': 'completed',
  'đã giao ngựa': 'delivered',
  'đã hủy': 'cancelled',
  'bản nháp': 'draft',
  'chờ dựng chi tiết': 'draft',
  'chờ tải lên': 'draft',
  'chưa nộp': 'draft',
  'hết hạn': 'expired',
  'đã nộp': 'submitted',
  
  // English aliases
  'pending approval': 'requested',
  'pending': 'requested',
  'under review': 'under_review',
  'change requested': 'change_requested',
  'approved': 'approved',
  'rejected': 'rejected',
  'planning': 'planning',
  'in planning': 'planning',
  'scheduled': 'scheduled',
  'ready to depart': 'ready_to_depart',
  'ready': 'ready_to_depart',
  'confirmed': 'confirmed',
  'in transit': 'in_transit',
  'completed': 'completed',
  'delivered': 'delivered',
  'cancelled': 'cancelled',
  'draft': 'draft',
  'submitted': 'submitted',
  'expired': 'expired',
  'available': 'available',
  'in use': 'in_use',
  'maintenance': 'maintenance',
};

// ─── DOCUMENT TYPE DICTIONARY ────────────────────────────────────────────────
const DOC_TYPE_DATA: Record<string, { en: string; vi: string }> = {
  horse_passport: { en: 'FEI Equine International Passport', vi: 'Hộ chiếu ngựa quốc tế FEI' },
  passport: { en: 'FEI Equine International Passport', vi: 'Hộ chiếu ngựa quốc tế FEI' },
  health_certificate: { en: 'International Veterinary Health Certificate', vi: 'Giấy chứng nhận kiểm dịch thú y quốc tế' },
  health_cert: { en: 'International Veterinary Health Certificate', vi: 'Giấy chứng nhận kiểm dịch thú y' },
  vaccination_certificate: { en: 'Equine Influenza Vaccination Certificate', vi: 'Chứng nhận tiêm phòng cúm ngựa' },
  vaccination_record: { en: 'Equine Influenza Vaccination Certificate', vi: 'Chứng nhận tiêm phòng cúm ngựa' },
  quarantine_certificate: { en: 'Quarantine Isolation Clearance Certificate', vi: 'Chứng nhận cách ly kiểm dịch xuất khẩu' },
  import_permit: { en: 'Live Animal Import & Transit Permit', vi: 'Giấy phép nhập cảnh & hải quan ngựa' },
  export_permit: { en: 'Live Animal Export Quarantine Permit', vi: 'Giấy phép kiểm dịch xuất khẩu' },
  coggins_test: { en: 'Equine Infectious Anemia (Coggins) Certificate', vi: 'Chứng nhận xét nghiệm máu Coggins (EIA)' },
  ownership_certificate: { en: 'Equine Ownership & Registration Certificate', vi: 'Chứng nhận sở hữu & đăng ký chiến mã' },
  customs_declaration: { en: 'Live Animal Customs Transit Declaration', vi: 'Tờ khai hải quan quá cảnh ngựa' },
};

// ─── VEHICLE TYPE DICTIONARY ─────────────────────────────────────────────────
const VEHICLE_TYPE_DATA: Record<string, { en: string; vi: string }> = {
  truck: { en: 'Climate-Controlled Equine Truck', vi: 'Xe thùng chuyên dụng điều hòa' },
  van: { en: 'Specialized Equine Van', vi: 'Xe van chuyên dụng vận chuyển ngựa' },
  heavy_truck: { en: 'Heavy-Duty Climate-Controlled Truck', vi: 'Xe tải hạng nặng điều hòa' },
  container: { en: 'Dedicated Equine Road Container', vi: 'Thùng container đường bộ chuyên dụng' },
  aircraft_stall: { en: 'Air Cargo Flying Stall (IATA LAR)', vi: 'Chuồng bay chuyên dụng máy bay' },
};

// ─── URGENCY & TRANSPORT TYPE ────────────────────────────────────────────────
const URGENCY_DATA: Record<string, { en: string; vi: string }> = {
  standard: { en: 'Standard', vi: 'Tiêu chuẩn' },
  urgent: { en: 'Urgent', vi: 'Khẩn cấp' },
  express: { en: 'Express Priority', vi: 'Hỏa tốc ưu tiên' },
};

const TRANSPORT_TYPE_DATA: Record<string, { en: string; vi: string }> = {
  international: { en: 'International Cross-Border', vi: 'Vận chuyển quốc tế xuyên biên giới' },
  domestic: { en: 'Domestic Transit', vi: 'Vận chuyển nội địa' },
};

const PAYMENT_STATUS_DATA: Record<string, { en: string; vi: string }> = {
  pending: { en: 'Pending Payment', vi: 'Chờ thanh toán' },
  paid: { en: 'Paid', vi: 'Đã thanh toán' },
  completed: { en: 'Completed', vi: 'Hoàn tất' },
  failed: { en: 'Payment Failed', vi: 'Thanh toán thất bại' },
  refunded: { en: 'Refunded', vi: 'Đã hoàn tiền' },
};

const HEALTH_STATUS_DATA: Record<string, { en: string; vi: string }> = {
  available: { en: 'Ready / Healthy', vi: 'Sẵn sàng / Khỏe mạnh' },
  ready: { en: 'Ready', vi: 'Sẵn sàng' },
  in_transit: { en: 'In Transit', vi: 'Đang vận chuyển' },
  quarantined: { en: 'In Quarantine', vi: 'Đang cách ly kiểm dịch' },
  sick: { en: 'Medical Care', vi: 'Đang chăm sóc thú y' },
  retired: { en: 'Retired / Resting', vi: 'Nghỉ dưỡng' },
};

// ─── HORSE GENDER & STATUS ───────────────────────────────────────────────────
const GENDER_DATA: Record<string, { en: string; vi: string }> = {
  male: { en: 'Male', vi: 'Đực' },
  stallion: { en: 'Male', vi: 'Đực' },
  female: { en: 'Female', vi: 'Cái' },
  mare: { en: 'Female', vi: 'Cái' },
  other: { en: 'Other', vi: 'Khác' },
  gelding: { en: 'Gelding', vi: 'Thiến' },
};

// ─── INCIDENT TYPES & SEVERITIES ─────────────────────────────────────────────
const INCIDENT_TYPE_DATA: Record<string, { en: string; vi: string }> = {
  vehicle_breakdown: { en: 'Vehicle Breakdown', vi: 'Sự cố hỏng hóc phương tiện' },
  traffic_delay: { en: 'Traffic & Corridor Delay', vi: 'Ùn tắc giao thông trên tuyến' },
  horse_medical: { en: 'Horse Medical Emergency', vi: 'Sự cố y tế / Cấp cứu ngựa' },
  weather: { en: 'Severe Weather Disruption', vi: 'Thời tiết xấu / Bão lũ' },
  border_issue: { en: 'Border Clearance Issue', vi: 'Vướng mắc thủ tục cửa khẩu' },
  emergency_sos: { en: 'Emergency SOS Alert', vi: 'Cảnh báo cứu hộ khẩn cấp SOS' },
  other: { en: 'Other Operational Incident', vi: 'Sự cố vận hành khác' },
};

const SEVERITY_DATA: Record<string, { en: string; vi: string }> = {
  critical: { en: 'Critical', vi: 'Nghiêm trọng' },
  high: { en: 'High', vi: 'Cao' },
  medium: { en: 'Medium', vi: 'Trung bình' },
  low: { en: 'Low', vi: 'Thấp' },
};

// ─── STOP & MILESTONE TYPES ──────────────────────────────────────────────────
const STOP_TYPE_DATA: Record<string, { en: string; vi: string }> = {
  origin: { en: 'Departure Point', vi: 'Điểm xuất phát' },
  destination: { en: 'Destination Point', vi: 'Điểm đến' },
  rest: { en: 'Rest Station', vi: 'Trạm Nghỉ' },
  quarantine: { en: 'Quarantine Station', vi: 'Trạm Kiểm Dịch' },
  refuel: { en: 'Technical & Refuel Stop', vi: 'Trạm Tiếp Nhiên Liệu' },
  border_check: { en: 'Border Gate Checkpoint', vi: 'Cửa Khẩu Quốc Tế' },
  transfer_hub: { en: 'Intermodal Transfer Hub', vi: 'Trung Tâm Chuyển Tiếp' },
  airport: { en: 'International Cargo Airport', vi: 'Sân Bay Quốc Tế' },
};

// ─── ROLE TRANSLATIONS ───────────────────────────────────────────────────────
const ROLE_DATA: Record<string, { en: string; vi: string }> = {
  customer: { en: 'Customer', vi: 'Khách hàng' },
  logistics_manager: { en: 'Logistics Manager', vi: 'Quản lý Logistics' },
  fleet_route_coordinator: { en: 'Route & Fleet Coordinator', vi: 'Điều phối viên Tuyến & Đội xe' },
  coordinator: { en: 'Route Coordinator', vi: 'Điều phối viên Tuyến' },
  transport_specialist: { en: 'Transport & Quarantine Specialist', vi: 'Chuyên viên Kiểm dịch & Vận tải' },
  specialist: { en: 'Quarantine Specialist', vi: 'Chuyên viên Kiểm dịch' },
  driver: { en: 'Vehicle Driver', vi: 'Tài xế lái xe' },
  driver_escort: { en: 'Veterinarian / Escort', vi: 'Bác sĩ Thú y / Hộ tống' },
  escort: { en: 'Veterinarian / Escort', vi: 'Bác sĩ Thú y / Hộ tống' },
  admin: { en: 'System Administrator', vi: 'Quản trị viên hệ thống' },
};

const COUNTRY_DATA: Record<string, { en: string; vi: string }> = {
  vietnam: { en: 'Vietnam', vi: 'Việt Nam' },
  singapore: { en: 'Singapore', vi: 'Singapore' },
  australia: { en: 'Australia', vi: 'Úc' },
  uae: { en: 'United Arab Emirates', vi: 'Các Tiểu Vương Quốc Ả Rập Thống Nhất' },
  united_arab_emirates: { en: 'United Arab Emirates', vi: 'Các Tiểu Vương Quốc Ả Rập Thống Nhất' },
  dubai: { en: 'Dubai, UAE', vi: 'Dubai, UAE' },
  hong_kong: { en: 'Hong Kong', vi: 'Hồng Kông' },
  hongkong: { en: 'Hong Kong', vi: 'Hồng Kông' },
  thailand: { en: 'Thailand', vi: 'Thái Lan' },
  japan: { en: 'Japan', vi: 'Nhật Bản' },
  france: { en: 'France', vi: 'Pháp' },
  germany: { en: 'Germany', vi: 'Đức' },
  usa: { en: 'United States', vi: 'Mỹ' },
  united_states: { en: 'United States', vi: 'Mỹ' },
  malaysia: { en: 'Malaysia', vi: 'Malaysia' },
  qatar: { en: 'Qatar', vi: 'Qatar' },
  saudi_arabia: { en: 'Saudi Arabia', vi: 'Ả Rập Xê Út' },
  uk: { en: 'United Kingdom', vi: 'Vương Quốc Anh' },
  united_kingdom: { en: 'United Kingdom', vi: 'Vương Quốc Anh' },
  ireland: { en: 'Ireland', vi: 'Ireland' },
};

const CITY_DATA: Record<string, { en: string; vi: string }> = {
  sgn: { en: 'Ho Chi Minh City (SGN)', vi: 'TP. Hồ Chí Minh (SGN)' },
  dxb: { en: 'Dubai (DXB)', vi: 'Dubai (DXB)' },
  sin: { en: 'Singapore (SIN)', vi: 'Singapore (SIN)' },
  hkg: { en: 'Hong Kong (HKG)', vi: 'Hồng Kông (HKG)' },
  bkk: { en: 'Bangkok (BKK)', vi: 'Bangkok (BKK)' },
  han: { en: 'Hanoi (HAN)', vi: 'Hà Nội (HAN)' },
  dad: { en: 'Da Nang (DAD)', vi: 'Đà Nẵng (DAD)' },
  kul: { en: 'Kuala Lumpur (KUL)', vi: 'Kuala Lumpur (KUL)' },
  mel: { en: 'Melbourne (MEL)', vi: 'Melbourne (MEL)' },
  syd: { en: 'Sydney (SYD)', vi: 'Sydney (SYD)' },
  nrt: { en: 'Tokyo Narita (NRT)', vi: 'Tokyo Narita (NRT)' },
  cdg: { en: 'Paris (CDG)', vi: 'Paris (CDG)' },
};

const COLOR_DATA: Record<string, { en: string; vi: string }> = {
  bay: { en: 'Bay', vi: 'Nâu đỏ' },
  chestnut: { en: 'Chestnut', vi: 'Hạt dẻ' },
  black: { en: 'Black', vi: 'Hắc mã' },
  grey: { en: 'Grey', vi: 'Bạch mã' },
  gray: { en: 'Grey', vi: 'Bạch mã' },
  palomino: { en: 'Palomino', vi: 'Vàng ánh kim' },
  roan: { en: 'Roan', vi: 'Xám đốm' },
  brown: { en: 'Brown', vi: 'Nâu đậm' },
  white: { en: 'White', vi: 'Bạch mã' },
  dun: { en: 'Dun', vi: 'Vàng cát' },
  pinto: { en: 'Pinto', vi: 'Khoang' },
  buckskin: { en: 'Buckskin', vi: 'Da hoẵng' },
  dark_bay: { en: 'Dark Bay', vi: 'Nâu sẫm' },
  'dark bay': { en: 'Dark Bay', vi: 'Nâu sẫm' },
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('vi');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === 'en' || stored === 'vi') {
        setLanguageState(stored);
      } else {
        setLanguageState('vi');
        localStorage.setItem(STORAGE_KEY, 'vi');
        document.cookie = `${STORAGE_KEY}=vi; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {
      // ignore
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'en' ? 'vi' : 'en';
      try {
        localStorage.setItem(STORAGE_KEY, next);
        document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string, fallback?: string, params?: Record<string, string | number>): string => {
      let text = '';
      if (language === 'en') {
        text = dictionaries.en?.[key] || '';
        if (!text) {
          // If fallback is provided and does not contain Vietnamese diacritics, use it
          if (fallback && !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(fallback)) {
            text = fallback;
          } else {
            // Synthesize readable English from the key: e.g. "driver.status.startTripBtn" -> "Start Trip"
            const parts = key.split('.');
            const lastPart = parts[parts.length - 1];
            text = lastPart
              .replace(/Btn$|Title$|Desc$|Label$/, '')
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (s) => s.toUpperCase())
              .trim();
          }
        }
      } else {
        text = dictionaries.vi?.[key] || fallback || dictionaries.en?.[key] || key;
      }

      if (params) {
        Object.entries(params).forEach(([paramKey, paramValue]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        });
      }

      return text;
    },
    [language]
  );

  // 1. Universal Status Translator
  const translateStatus = useCallback(
    (status?: string | null): string => {
      if (!status) return '';
      const raw = String(status).trim();

      // Clean bilingual parentheses: e.g. "Đang vận chuyển (In Transit)"
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        const first = parenMatch[1].trim();
        const second = parenMatch[2].trim();
        if (language === 'en') {
          if (/^[A-Za-z0-9\s_-]+$/.test(second)) return second;
          if (/^[A-Za-z0-9\s_-]+$/.test(first)) return first;
        } else {
          if (!/^[A-Za-z0-9\s_-]+$/.test(first)) return first;
          if (!/^[A-Za-z0-9\s_-]+$/.test(second)) return second;
        }
      }

      // Normalized key search
      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      if (STATUS_DATA[lower]) {
        return STATUS_DATA[lower][language];
      }

      // Alias lookup
      const aliasKey = lower.replace(/_+/g, ' ');
      if (STATUS_ALIASES[aliasKey] && STATUS_DATA[STATUS_ALIASES[aliasKey]]) {
        return STATUS_DATA[STATUS_ALIASES[aliasKey]][language];
      }

      // Reverse lookup in STATUS_DATA
      for (const item of Object.values(STATUS_DATA)) {
        if (item.vi.toLowerCase() === raw.toLowerCase() || item.en.toLowerCase() === raw.toLowerCase()) {
          return item[language];
        }
      }

      // Check standard t('status.' + camelCase)
      const camel = lower.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const dictVal = dictionaries[language]?.[`status.${camel}`];
      if (dictVal) return dictVal;

      return raw;
    },
    [language]
  );

  // 2. Document Type Translator
  const translateDocType = useCallback(
    (docType?: string | null, customTitle?: string | null): string => {
      if (!docType && !customTitle) return '';
      const raw = String(docType || customTitle).trim();

      // Clean bilingual parentheses
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        const first = parenMatch[1].trim();
        const second = parenMatch[2].trim();
        if (language === 'en') {
          if (/^[A-Za-z0-9\s_&/-]+$/.test(first)) return first;
          if (/^[A-Za-z0-9\s_&/-]+$/.test(second)) return second;
        } else {
          if (!/^[A-Za-z0-9\s_&/-]+$/.test(second)) return second;
          if (!/^[A-Za-z0-9\s_&/-]+$/.test(first)) return first;
        }
      }

      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      for (const [k, v] of Object.entries(DOC_TYPE_DATA)) {
        if (lower.includes(k) || raw.toLowerCase().includes(v.en.toLowerCase()) || raw.toLowerCase().includes(v.vi.toLowerCase())) {
          return v[language];
        }
      }

      // Specific known Vietnamese keywords
      if (raw.toLowerCase().includes('hộ chiếu') || raw.toLowerCase().includes('passport')) {
        return DOC_TYPE_DATA.horse_passport[language];
      }
      if (raw.toLowerCase().includes('tiêm phòng') || raw.toLowerCase().includes('cúm') || raw.toLowerCase().includes('vaccin')) {
        return DOC_TYPE_DATA.vaccination_certificate[language];
      }
      if (raw.toLowerCase().includes('coggins') || raw.toLowerCase().includes('eia')) {
        return DOC_TYPE_DATA.coggins_test[language];
      }
      if (raw.toLowerCase().includes('kiểm dịch') && raw.toLowerCase().includes('xuất')) {
        return DOC_TYPE_DATA.export_permit[language];
      }
      if (raw.toLowerCase().includes('kiểm dịch') && raw.toLowerCase().includes('nhập')) {
        return DOC_TYPE_DATA.import_permit[language];
      }
      if (raw.toLowerCase().includes('kiểm dịch') || raw.toLowerCase().includes('thú y')) {
        return DOC_TYPE_DATA.health_certificate[language];
      }
      if (raw.toLowerCase().includes('hải quan') || raw.toLowerCase().includes('customs')) {
        return DOC_TYPE_DATA.customs_declaration[language];
      }

      return customTitle || raw;
    },
    [language]
  );

  // 3. Vehicle Type Translator
  const translateVehicleType = useCallback(
    (vehType?: string | null): string => {
      if (!vehType) return '';
      const raw = String(vehType).trim();

      // Clean bilingual parentheses: e.g. "Truck (Xe tải)"
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        const first = parenMatch[1].trim();
        const second = parenMatch[2].trim();
        if (language === 'en') {
          if (/^[A-Za-z0-9\s_-]+$/.test(first)) return first;
          if (/^[A-Za-z0-9\s_-]+$/.test(second)) return second;
        } else {
          if (!/^[A-Za-z0-9\s_-]+$/.test(second)) return second;
          if (!/^[A-Za-z0-9\s_-]+$/.test(first)) return first;
        }
      }

      const lower = raw.toLowerCase();
      if (lower.includes('van') || lower.includes('2-4')) return VEHICLE_TYPE_DATA.van[language];
      if (lower.includes('hạng nặng') || lower.includes('6-8') || lower.includes('heavy')) return VEHICLE_TYPE_DATA.heavy_truck[language];
      if (lower.includes('container')) return VEHICLE_TYPE_DATA.container[language];
      if (lower.includes('air cargo') || lower.includes('chuồng bay') || lower.includes('aircraft')) return VEHICLE_TYPE_DATA.aircraft_stall[language];
      if (lower.includes('truck') || lower.includes('xe thùng') || lower.includes('điều hòa') || lower.includes('chuyên dụng') || lower.includes('specialized')) return VEHICLE_TYPE_DATA.truck[language];

      return raw;
    },
    [language]
  );

  // 4. Horse Gender Translator
  const translateGender = useCallback(
    (gender?: string | null): string => {
      if (!gender) return '';
      const raw = String(gender).trim();
      const lower = raw.toLowerCase();
      if (GENDER_DATA[lower]) return GENDER_DATA[lower][language];
      if (lower.includes('đực') || lower.includes('stallion') || lower === 'male') return GENDER_DATA.male[language];
      if (lower.includes('cái') || lower.includes('mare') || lower === 'female') return GENDER_DATA.female[language];
      if (lower.includes('thiến') || lower.includes('gelding')) return GENDER_DATA.gelding[language];
      if (lower.includes('khác') || lower.includes('other')) return GENDER_DATA.other[language];
      return gender;
    },
    [language]
  );

  // 5. Horse Breed Translator
  const translateBreed = useCallback(
    (breed?: string | null): string => {
      if (!breed) return '';
      const raw = String(breed).trim();

      // Clean bilingual parentheses
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        const first = parenMatch[1].trim();
        const second = parenMatch[2].trim();
        if (language === 'en') {
          if (/^[A-Za-z0-9\s_-]+$/.test(first)) return first;
          if (/^[A-Za-z0-9\s_-]+$/.test(second)) return second;
        } else {
          if (!/^[A-Za-z0-9\s_-]+$/.test(second)) return second;
          if (!/^[A-Za-z0-9\s_-]+$/.test(first)) return first;
        }
      }

      const lower = raw.toLowerCase();
      if (lower.includes('thoroughbred') || lower.includes('thuần chủng')) {
        return language === 'en' ? 'Thoroughbred' : 'Thuần chủng đua';
      }
      if (lower.includes('arabian') || lower.includes('ả rập')) {
        return language === 'en' ? 'Arabian' : 'Ngựa Ả Rập';
      }
      if (lower.includes('warmblood')) {
        return language === 'en' ? 'Warmblood' : 'Ngựa Warmblood';
      }
      if (lower.includes('quarter')) {
        return language === 'en' ? 'Quarter Horse' : 'Ngựa Quarter';
      }
      if (lower.includes('hanoverian')) {
        return language === 'en' ? 'Hanoverian' : 'Ngựa Hanoverian';
      }
      if (lower.includes('irish')) {
        return language === 'en' ? 'Irish Sport Horse' : 'Ngựa thể thao Ireland';
      }
      if (lower.includes('appaloosa')) {
        return language === 'en' ? 'Appaloosa' : 'Ngựa Appaloosa';
      }
      if (lower.includes('friesian')) {
        return language === 'en' ? 'Friesian' : 'Ngựa Friesian';
      }
      if (lower.includes('andalusian')) {
        return language === 'en' ? 'Andalusian' : 'Ngựa Andalusian';
      }
      if (lower.includes('standardbred')) {
        return language === 'en' ? 'Standardbred' : 'Ngựa kéo kiệu';
      }
      if (lower.includes('paint')) {
        return language === 'en' ? 'Paint Horse' : 'Ngựa lang';
      }
      return raw;
    },
    [language]
  );

  // 6. Horse Health / Condition Translator
  const translateCondition = useCallback(
    (condition?: string | null): string => {
      if (!condition) return '';
      const raw = String(condition).trim();

      // Clean bilingual parentheses: e.g. "Stable (Ổn định)"
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        const first = parenMatch[1].trim();
        const second = parenMatch[2].trim();
        if (language === 'en') {
          if (/^[A-Za-z0-9\s_&-]+$/.test(first)) return first;
          if (/^[A-Za-z0-9\s_&-]+$/.test(second)) return second;
        } else {
          if (!/^[A-Za-z0-9\s_&-]+$/.test(second)) return second;
          if (!/^[A-Za-z0-9\s_&-]+$/.test(first)) return first;
        }
      }

      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      const condMap: Record<string, { en: string; vi: string }> = {
        stable: { en: 'Stable & Healthy', vi: 'Ổn định & Khỏe mạnh' },
        healthy: { en: 'Healthy', vi: 'Khỏe mạnh' },
        not_eating: { en: 'Not Eating / Anorexia', vi: 'Bỏ ăn / Kém ăn' },
        stressed: { en: 'Stressed', vi: 'Căng thẳng' },
        climate_change: { en: 'Climate Discomfort', vi: 'Ảnh hưởng nhiệt độ' },
        minor_issue: { en: 'Minor Issue', vi: 'Vấn đề nhỏ' },
        needs_attention: { en: 'Medical Attention Required', vi: 'Cần bác sĩ can thiệp' },
        other: { en: 'Other Clinical Observation', vi: 'Quan sát lâm sàng khác' },
      };

      if (condMap[lower]) return condMap[lower][language];

      const rawLower = raw.toLowerCase();
      if (rawLower.includes('ổn định') || rawLower.includes('stable')) return condMap.stable[language];
      if (rawLower.includes('khỏe') || rawLower.includes('healthy')) return condMap.healthy[language];
      if (rawLower.includes('bỏ ăn') || rawLower.includes('chán ăn') || rawLower.includes('not_eating') || rawLower.includes('anorexia')) return condMap.not_eating[language];
      if (rawLower.includes('căng thẳng') || rawLower.includes('bồn chồn') || rawLower.includes('stress')) return condMap.stressed[language];
      if (rawLower.includes('nhiệt độ') || rawLower.includes('khí hậu') || rawLower.includes('climate')) return condMap.climate_change[language];
      if (rawLower.includes('vấn đề nhỏ') || rawLower.includes('minor')) return condMap.minor_issue[language];
      if (rawLower.includes('can thiệp') || rawLower.includes('attention')) return condMap.needs_attention[language];

      return condition;
    },
    [language]
  );

  // 7. Incident Type Translator
  const translateIncident = useCallback(
    (type?: string | null): string => {
      if (!type) return '';
      const raw = String(type).trim();

      // Clean bilingual parentheses
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        const first = parenMatch[1].trim();
        const second = parenMatch[2].trim();
        if (language === 'en') {
          if (/^[A-Za-z0-9\s_&-]+$/.test(first)) return first;
          if (/^[A-Za-z0-9\s_&-]+$/.test(second)) return second;
        } else {
          if (!/^[A-Za-z0-9\s_&-]+$/.test(second)) return second;
          if (!/^[A-Za-z0-9\s_&-]+$/.test(first)) return first;
        }
      }

      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      if (INCIDENT_TYPE_DATA[lower]) {
        return INCIDENT_TYPE_DATA[lower][language];
      }

      const rawLower = raw.toLowerCase();
      if (rawLower.includes('hỏng') || rawLower.includes('breakdown')) return INCIDENT_TYPE_DATA.vehicle_breakdown[language];
      if (rawLower.includes('tắc') || rawLower.includes('kẹt') || rawLower.includes('traffic')) return INCIDENT_TYPE_DATA.traffic_delay[language];
      if (rawLower.includes('thú y') || rawLower.includes('y tế') || rawLower.includes('cấp cứu') || rawLower.includes('medical')) return INCIDENT_TYPE_DATA.horse_medical[language];
      if (rawLower.includes('thời tiết') || rawLower.includes('bão') || rawLower.includes('weather')) return INCIDENT_TYPE_DATA.weather[language];
      if (rawLower.includes('cửa khẩu') || rawLower.includes('hải quan') || rawLower.includes('kiểm dịch') || rawLower.includes('border')) return INCIDENT_TYPE_DATA.border_issue[language];
      if (rawLower.includes('sos') || rawLower.includes('cứu hộ') || rawLower.includes('khẩn cấp')) return INCIDENT_TYPE_DATA.emergency_sos[language];
      if (rawLower.includes('khác') || rawLower.includes('other')) return INCIDENT_TYPE_DATA.other[language];

      return type;
    },
    [language]
  );

  // 8. Severity Translator
  const translateSeverity = useCallback(
    (sev?: string | null): string => {
      if (!sev) return '';
      const raw = String(sev).trim();
      const lower = raw.toLowerCase();
      if (SEVERITY_DATA[lower]) return SEVERITY_DATA[lower][language];

      if (lower.includes('nghiêm trọng') || lower.includes('critical')) return SEVERITY_DATA.critical[language];
      if (lower.includes('cao') || lower.includes('high')) return SEVERITY_DATA.high[language];
      if (lower.includes('trung bình') || lower.includes('medium')) return SEVERITY_DATA.medium[language];
      if (lower.includes('thấp') || lower.includes('low')) return SEVERITY_DATA.low[language];

      return sev;
    },
    [language]
  );

  // 9. Stop Type Translator
  const translateStopType = useCallback(
    (type?: string | null): string => {
      if (!type) return '';
      const raw = String(type).trim();

      // Clean bilingual parentheses
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        const first = parenMatch[1].trim();
        const second = parenMatch[2].trim();
        if (language === 'en') {
          if (/^[A-Za-z0-9\s_&-]+$/.test(first)) return first;
          if (/^[A-Za-z0-9\s_&-]+$/.test(second)) return second;
        } else {
          if (!/^[A-Za-z0-9\s_&-]+$/.test(second)) return second;
          if (!/^[A-Za-z0-9\s_&-]+$/.test(first)) return first;
        }
      }

      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      if (STOP_TYPE_DATA[lower]) {
        return STOP_TYPE_DATA[lower][language];
      }

      const rawLower = raw.toLowerCase();
      if (rawLower.includes('rest') || rawLower.includes('nghỉ')) return STOP_TYPE_DATA.rest[language];
      if (rawLower.includes('quarantine') || rawLower.includes('kiểm dịch')) return STOP_TYPE_DATA.quarantine[language];
      if (rawLower.includes('border') || rawLower.includes('cửa khẩu')) return STOP_TYPE_DATA.border_check[language];
      if (rawLower.includes('airport') || rawLower.includes('sân bay')) return STOP_TYPE_DATA.airport[language];
      if (rawLower.includes('origin') || rawLower.includes('xuất phát')) return STOP_TYPE_DATA.origin[language];
      if (rawLower.includes('dest') || rawLower.includes('đến')) return STOP_TYPE_DATA.destination[language];
      if (rawLower.includes('refuel') || rawLower.includes('nhiên liệu')) return STOP_TYPE_DATA.refuel[language];
      if (rawLower.includes('transfer') || rawLower.includes('chuyển tiếp')) return STOP_TYPE_DATA.transfer_hub[language];

      return type;
    },
    [language]
  );

  // 10. Role Translator
  const translateRole = useCallback(
    (role?: string | null): string => {
      if (!role) return '';
      const raw = String(role).trim();
      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      if (ROLE_DATA[lower]) return ROLE_DATA[lower][language];

      const rawLower = raw.toLowerCase();
      if (rawLower.includes('escort') || rawLower.includes('thú y') || rawLower.includes('vet')) return ROLE_DATA.escort[language];
      if (rawLower.includes('driver') || rawLower.includes('tài xế') || rawLower.includes('lái xe')) return ROLE_DATA.driver[language];
      if (rawLower.includes('manager') || rawLower.includes('quản lý')) return ROLE_DATA.logistics_manager[language];
      if (rawLower.includes('coordinator') || rawLower.includes('điều phối')) return ROLE_DATA.coordinator[language];
      if (rawLower.includes('specialist') || rawLower.includes('chuyên viên')) return ROLE_DATA.transport_specialist[language];
      if (rawLower.includes('customer') || rawLower.includes('khách hàng')) return ROLE_DATA.customer[language];

      return role;
    },
    [language]
  );

  // 11. Urgency Translator
  const translateUrgency = useCallback(
    (urgency?: string | null): string => {
      if (!urgency) return '';
      const lower = String(urgency).trim().toLowerCase();
      return URGENCY_DATA[lower]?.[language] || urgency;
    },
    [language]
  );

  // 12. Transport Type Translator
  const translateTransportType = useCallback(
    (type?: string | null): string => {
      if (!type) return '';
      const lower = String(type).trim().toLowerCase();
      if (lower.includes('inter') || lower.includes('quốc tế')) return TRANSPORT_TYPE_DATA.international[language];
      if (lower.includes('dom') || lower.includes('nội địa')) return TRANSPORT_TYPE_DATA.domestic[language];
      return type;
    },
    [language]
  );

  // 13. Payment Status Translator
  const translatePaymentStatus = useCallback(
    (status?: string | null): string => {
      if (!status) return '';
      const lower = String(status).trim().toLowerCase();
      return PAYMENT_STATUS_DATA[lower]?.[language] || status;
    },
    [language]
  );

  // 14. Health / Availability Status Translator
  const translateHealthStatus = useCallback(
    (status?: string | null): string => {
      if (!status) return '';
      const lower = String(status).trim().toLowerCase().replace(/[\s-]+/g, '_');
      return HEALTH_STATUS_DATA[lower]?.[language] || status;
    },
    [language]
  );

  // 15. Time Ago Translator
  const translateTimeAgo = useCallback(
    (dateString?: string | null): string => {
      if (!dateString) return '';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const now = new Date();
      const diffMs = Math.max(0, now.getTime() - date.getTime());
      const mins = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMs / 3600000);
      const days = Math.floor(diffMs / 86400000);

      if (mins < 1) return language === 'en' ? 'Just now' : 'Vừa xong';
      if (mins < 60) return language === 'en' ? `${mins}m ago` : `${mins} phút trước`;
      if (hours < 24) return language === 'en' ? `${hours}h ago` : `${hours} giờ trước`;
      return language === 'en' ? `${days}d ago` : `${days} ngày trước`;
    },
    [language]
  );

  // 16. Country Translator
  const translateCountry = useCallback(
    (country?: string | null): string => {
      if (!country) return '';
      const raw = String(country).trim();
      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      if (COUNTRY_DATA[lower]) return COUNTRY_DATA[lower][language];
      for (const [k, v] of Object.entries(COUNTRY_DATA)) {
        if (lower.includes(k) || raw.toLowerCase().includes(v.vi.toLowerCase()) || raw.toLowerCase().includes(v.en.toLowerCase())) {
          return v[language];
        }
      }
      return raw;
    },
    [language]
  );

  // 17. Airport / City Translator
  const translateAirportCity = useCallback(
    (codeOrCity?: string | null): string => {
      if (!codeOrCity) return '';
      const raw = String(codeOrCity).trim();
      const lower = raw.toLowerCase();
      for (const [code, val] of Object.entries(CITY_DATA)) {
        if (lower.includes(code) || lower.includes(val.en.toLowerCase()) || lower.includes(val.vi.toLowerCase())) {
          return val[language];
        }
      }
      return raw;
    },
    [language]
  );

  // 18. Horse Color Translator
  const translateColor = useCallback(
    (color?: string | null): string => {
      if (!color) return '';
      const raw = String(color).trim();
      const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
      if (parenMatch) {
        return language === 'en' ? parenMatch[1].trim() : parenMatch[2].trim();
      }
      const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
      if (COLOR_DATA[lower]) return COLOR_DATA[lower][language];
      for (const [k, v] of Object.entries(COLOR_DATA)) {
        if (lower.includes(k) || raw.toLowerCase().includes(v.vi.toLowerCase()) || raw.toLowerCase().includes(v.en.toLowerCase())) {
          return v[language];
        }
      }
      return raw;
    },
    [language]
  );

  // 19. Document Rejection Reason Translator
  const translateRejectionReason = useCallback(
    (reason?: string | null): string => {
      if (!reason) return '';
      const raw = String(reason).trim();
      const lower = raw.toLowerCase();
      if (lower.includes('lacked veterinary seal') || lower.includes('thiếu con dấu') || lower.includes('thiếu mộc')) {
        return language === 'en'
          ? 'Previous document lacked official veterinary authority seal.'
          : 'Chứng từ trước đó thiếu con dấu của cơ quan thú y xuất cảnh.';
      }
      if (lower.includes('mộc đỏ') || lower.includes('cơ quan thú y')) {
        return language === 'en'
          ? 'Official scanned copy with veterinary stamp required before flight dispatch.'
          : 'Cần nộp bổ sung bản scan có mộc đỏ của cơ quan thú y xuất cảnh trước khi điều phối chuyến bay.';
      }
      if (lower.includes('hết hạn') || lower.includes('expired')) {
        return language === 'en'
          ? 'Document expired, please re-upload current certificate.'
          : 'Chứng từ đã hết hiệu lực, vui lòng tải lên bản sao mới nhất.';
      }
      if (lower.includes('mờ') || lower.includes('blur') || lower.includes('unreadable')) {
        return language === 'en'
          ? 'Document scan is unreadable, please re-upload high resolution copy.'
          : 'Bản chụp chứng từ bị mờ hoặc không đọc rõ, vui lòng nộp lại bản rõ nét.';
      }
      return raw;
    },
    [language]
  );

  // 20. Notification Translator
  const translateNotification = useCallback(
    (title?: string | null, message?: string | null): { title: string; message: string; actionText?: string } => {
      const sanitizeText = (text: string): string => {
        if (!text) return '';
        const isEn = language === 'en';
        let out = text;
        const replacements: Array<[RegExp, string, string]> = [
          [/\bhealth_certificate\b/gi, 'Health Certificate', 'Giấy kiểm dịch y tế'],
          [/\bhorse_passport\b/gi, 'FEI Horse Passport', 'Hộ chiếu ngựa FEI'],
          [/\bimport_permit\b/gi, 'Import Permit', 'Giấy phép nhập khẩu'],
          [/\bexport_permit\b/gi, 'Export Permit', 'Giấy phép xuất khẩu'],
          [/\bcustoms_declaration\b/gi, 'Customs Declaration', 'Tờ khai hải quan'],
          [/\bcoggins_test\b/gi, 'Coggins Test (EIA)', 'Xét nghiệm Coggins (EIA)'],
          [/\bawaiting_payment\b/gi, 'Awaiting Payment', 'Chờ thanh toán'],
          [/\bpaid_pending_review\b/gi, 'Pending Feasibility Review', 'Chờ duyệt khả thi'],
          [/\brefund_requested\b/gi, 'Refund Requested', 'Chờ hoàn tiền'],
          [/\bready_to_depart\b/gi, 'Ready to Depart', 'Sẵn sàng xuất phát'],
          [/\bin_transit\b/gi, 'In Transit', 'Đang vận chuyển'],
          [/Chuyên viên kiểm dịch/g, 'Logistics Manager', 'Quản lý vận hành'],
          [/Quarantine Specialist/g, 'Logistics Manager', 'Quản lý vận hành'],
        ];
        for (const [rx, enVal, viVal] of replacements) {
          out = out.replace(rx, isEn ? enVal : viVal);
        }
        if (!isEn) {
          out = out.replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
        }
        return out;
      };

      const rawTitle = sanitizeText((title || '').trim());
      const rawMsg = sanitizeText((message || '').trim());
      const full = (rawTitle + ' ' + rawMsg).toLowerCase();

      // Missing Document
      if (full.includes('missing document') || full.includes('cần nộp bổ sung') || full.includes('hồ sơ còn thiếu')) {
        const codeMatch = (rawTitle + ' ' + rawMsg).match(/(?:TR|REQ)-\d+(?:-\d+)?/i);
        const code = codeMatch ? codeMatch[0] : '';
        return {
          title: language === 'en' ? `Missing Document${code ? ` (${code})` : ''}` : `Hồ sơ kiểm dịch còn thiếu${code ? ` (${code})` : ''}`,
          message: language === 'en'
            ? `Additional mandatory veterinary documentation required for shipment ${code || 'request'}.`
            : `Cần nộp bổ sung chứng nhận kiểm dịch thú y cho đơn vận chuyển ${code || ''}.`,
          actionText: language === 'en' ? 'Upload Document →' : 'Nộp bổ sung ngay →',
        };
      }

      // Departure Update / Takeoff
      if (full.includes('departure update') || full.includes('khởi hành') || full.includes('departed') || full.includes('cất cánh')) {
        const codeMatch = (rawTitle + ' ' + rawMsg).match(/(?:TR|REQ)-\d+(?:-\d+)?/i);
        const flightMatch = (rawTitle + ' ' + rawMsg).match(/[A-Z]{2,3}-\d{2,4}/i);
        const code = codeMatch ? codeMatch[0] : (flightMatch ? flightMatch[0] : '');
        return {
          title: language === 'en' ? `Departure Update${code ? ` (${code})` : ''}` : `Cập nhật khởi hành${code ? ` (${code})` : ''}`,
          message: language === 'en'
            ? `Flight / Trip ${code || ''} has officially departed and is currently en route with satellite tracking enabled.`
            : `Chuyến vận chuyển ${code || ''} đã chính thức cất cánh/khởi hành và đang di chuyển theo lịch trình vệ tinh.`,
          actionText: language === 'en' ? 'Track Live Flight →' : 'Theo dõi trực tiếp →',
        };
      }

      // Request Approved / Trip Planning Approved
      if (full.includes('approved') || full.includes('phê duyệt') || full.includes('đã duyệt')) {
        const codeMatch = (rawTitle + ' ' + rawMsg).match(/(?:TR|REQ)-\d+(?:-\d+)?/i);
        const code = codeMatch ? codeMatch[0] : '';
        return {
          title: language === 'en' ? `Request Approved${code ? ` (${code})` : ''}` : `Đơn vận chuyển đã phê duyệt${code ? ` (${code})` : ''}`,
          message: language === 'en'
            ? `Your transport request ${code || ''} has been reviewed and approved by management.`
            : `Yêu cầu vận chuyển ${code || ''} của bạn đã được phê duyệt thành công bởi ban quản lý.`,
          actionText: language === 'en' ? 'View Details →' : 'Xem chi tiết đơn →',
        };
      }

      // Handover / Arrival
      if (full.includes('bàn giao') || full.includes('handover') || full.includes('giao ngựa') || full.includes('hạ cánh')) {
        return {
          title: language === 'en' ? 'Handover Complete' : 'Bàn giao hoàn tất',
          message: language === 'en'
            ? 'Horse has arrived safely and passed post-arrival quarantine inspection.'
            : 'Chiến mã đã hạ cánh an toàn, hoàn tất thủ tục bàn giao và kiểm tra sinh trắc.',
          actionText: language === 'en' ? 'View Details →' : 'Xem chi tiết →',
        };
      }

      // Vaccination Alert
      if (full.includes('tiêm chủng') || full.includes('vaccin') || full.includes('chủng ngừa')) {
        return {
          title: language === 'en' ? 'Vaccination Expiry Alert' : 'Cảnh báo: Tiêm chủng sắp hết hạn',
          message: language === 'en'
            ? 'Equine vaccination certificate expires in less than 15 days. Revaccination recommended prior to departure.'
            : 'Chứng chỉ tiêm chủng sắp hết hạn trong vòng 15 ngày. Vui lòng tái chủng ngừa trước chuyến bay.',
          actionText: language === 'en' ? 'Update Certificate →' : 'Cập nhật chứng chỉ →',
        };
      }

      return {
        title: rawTitle,
        message: rawMsg,
      };
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t,
        translateStatus,
        translateDocType,
        translateVehicleType,
        translateGender,
        translateBreed,
        translateCondition,
        translateIncident,
        translateSeverity,
        translateStopType,
        translateRole,
        translateUrgency,
        translateTransportType,
        translatePaymentStatus,
        translateHealthStatus,
        translateTimeAgo,
        translateCountry,
        translateAirportCity,
        translateColor,
        translateRejectionReason,
        translateNotification,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: 'vi' as Language,
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, fallback?: string, params?: Record<string, string | number>) => {
        let text = fallback || key;
        if (params) {
          Object.entries(params).forEach(([pk, pv]) => {
            text = text.replace(new RegExp(`\\{${pk}\\}`, 'g'), String(pv));
          });
        }
        return text;
      },
      translateStatus: (s?: string | null) => s || '',
      translateDocType: (d?: string | null, c?: string | null) => c || d || '',
      translateVehicleType: (v?: string | null) => v || '',
      translateGender: (g?: string | null) => g || '',
      translateBreed: (b?: string | null) => b || '',
      translateCondition: (c?: string | null) => c || '',
      translateIncident: (i?: string | null) => i || '',
      translateSeverity: (s?: string | null) => s || '',
      translateStopType: (st?: string | null) => st || '',
      translateRole: (r?: string | null) => r || '',
      translateUrgency: (u?: string | null) => u || '',
      translateTransportType: (tt?: string | null) => tt || '',
      translatePaymentStatus: (p?: string | null) => p || '',
      translateHealthStatus: (h?: string | null) => h || '',
      translateTimeAgo: (d?: string | null) => d || '',
      translateCountry: (c?: string | null) => c || '',
      translateAirportCity: (ac?: string | null) => ac || '',
      translateColor: (col?: string | null) => col || '',
      translateRejectionReason: (rr?: string | null) => rr || '',
      translateNotification: (title?: string | null, message?: string | null): { title: string; message: string; actionText?: string } => ({ title: title || '', message: message || '' }),
    };
  }
  return context;
}

export const useTranslation = useLanguage;
