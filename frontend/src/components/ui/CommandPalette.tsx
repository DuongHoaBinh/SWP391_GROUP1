'use client';

import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  Plane,
  Truck,
  Plus,
  ShieldCheck,
  MapPin,
  X,
  ChevronRight,
  FileText,
  Activity,
  Users,
  Calendar,
  AlertTriangle,
  BarChart3,
  Stethoscope,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface PaletteItem {
  id: string;
  category: 'shipments' | 'horses' | 'actions';
  title: string;
  subtitle: string;
  badge?: string;
  icon: React.ReactNode;
  url: string;
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const listboxId = useId();
  const titleId = `${listboxId}-label`;

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const allItems: PaletteItem[] = useMemo(() => {
    if (pathname.startsWith('/manager')) {
      return [
        {
          id: 'mgr-dash',
          category: 'actions',
          title: t('nav.dashboard', isEn ? 'Operations Overview' : 'Tổng quan điều hành'),
          subtitle: isEn ? 'Logistics Manager command console' : 'Bảng điều khiển Quản lý Logistics',
          icon: <BarChart3 className="w-4 h-4 text-[#A67C2E]" />,
          url: '/manager',
        },
        {
          id: 'mgr-req',
          category: 'actions',
          title: t('nav.requests', isEn ? 'Approve & Quote Shipments' : 'Duyệt & Báo giá đơn vận chuyển'),
          subtitle: isEn
            ? 'Review requests, issue quotations & export PDFs'
            : 'Phê duyệt yêu cầu, báo giá cước & xuất phiếu PDF',
          icon: <FileText className="w-4 h-4 text-[#B49A68]" />,
          url: '/manager/requests',
        },
        {
          id: 'mgr-plan',
          category: 'actions',
          title: isEn ? 'Trip Planning & Crew Dispatch' : 'Lập kế hoạch & Phân công chuyến đi',
          subtitle: isEn
            ? 'Set strategic frameworks, approve routes & assign crews'
            : 'Thiết lập khung chiến lược, duyệt lộ trình & phân công nhân sự',
          icon: <MapPin className="w-4 h-4 text-[#287653]" />,
          url: '/manager/planning',
        },
        {
          id: 'mgr-staff',
          category: 'actions',
          title: isEn ? 'Staff & Duty Roster' : 'Quản lý nhân sự vận tải',
          subtitle: isEn
            ? 'Directory of specialists, coordinators, drivers & vets'
            : 'Danh bạ chuyên viên, điều phối viên, tài xế & thú y',
          icon: <Users className="w-4 h-4 text-[#A67C2E]" />,
          url: '/manager/staff',
        },
        {
          id: 'mgr-inc',
          category: 'actions',
          title: isEn ? 'Incidents & Cost Adjustments' : 'Xử lý sự cố & Thay đổi chi phí',
          subtitle: isEn
            ? 'Approve emergency reroutes and incidental expenses'
            : 'Phê duyệt đổi tuyến và chi phí phát sinh khẩn cấp',
          icon: <AlertTriangle className="w-4 h-4 text-[#B33E3E]" />,
          url: '/manager/incidents',
        },
        {
          id: 'mgr-rep',
          category: 'actions',
          title: isEn ? 'Performance & Revenue Reports' : 'Báo cáo hiệu suất & Doanh thu',
          subtitle: isEn
            ? 'Revenue analytics, operating costs & on-time delivery KPIs'
            : 'Thống kê doanh thu, chi phí và tỷ lệ giao đúng hạn',
          icon: <Activity className="w-4 h-4 text-[#287653]" />,
          url: '/manager/reports',
        },
      ];
    }

    if (pathname.startsWith('/specialist')) {
      return [
        {
          id: 'spec-dash',
          category: 'actions',
          title: isEn ? 'Quarantine & Audit Desk' : 'Tổng quan kiểm dịch & Pháp lý',
          subtitle: isEn
            ? 'Inspect pending veterinary and customs documents'
            : 'Theo dõi hồ sơ đang chờ thẩm định',
          icon: <ShieldCheck className="w-4 h-4 text-[#A67C2E]" />,
          url: '/specialist',
        },
        {
          id: 'spec-orders',
          category: 'actions',
          title: isEn ? 'Compliance Orders Matrix' : 'Đơn hàng theo trạng thái pháp lý',
          subtitle: isEn
            ? 'Shipments requiring border export/import clearance'
            : 'Danh sách đơn cần hoàn tất hồ sơ xuất nhập cảnh',
          icon: <FileText className="w-4 h-4 text-[#B49A68]" />,
          url: '/specialist/compliance-orders',
        },
        {
          id: 'spec-docs',
          category: 'actions',
          title: isEn ? 'Equine Dossiers & Clearances' : 'Thẩm định chứng từ ngựa đua',
          subtitle: isEn
            ? 'Audit FEI passports, Coggins tests & health certificates'
            : 'Duyệt hộ chiếu FEI, Coggins & kiểm dịch thú y',
          icon: <ShieldCheck className="w-4 h-4 text-[#287653]" />,
          url: '/specialist/documents',
        },
        {
          id: 'spec-approval',
          category: 'actions',
          title: isEn ? 'Authority Clearance Queue' : 'Tiến độ cơ quan thẩm quyền',
          subtitle: isEn
            ? 'Track customs & veterinary authority approvals'
            : 'Theo dõi phê duyệt hải quan & chi cục thú y',
          icon: <Activity className="w-4 h-4 text-[#A67C2E]" />,
          url: '/specialist/approval',
        },
        {
          id: 'spec-reg',
          category: 'actions',
          title: isEn ? 'Country Quarantine Protocols' : 'Quy định quốc gia & Cửa khẩu',
          subtitle: isEn
            ? 'Manage mandatory checklists by corridor & country'
            : 'Quản lý danh mục yêu cầu bắt buộc theo tuyến',
          icon: <MapPin className="w-4 h-4 text-[#966516]" />,
          url: '/specialist/regulations',
        },
      ];
    }

    if (pathname.startsWith('/coordinator')) {
      return [
        {
          id: 'coord-dash',
          category: 'actions',
          title: isEn ? 'Fleet & Route Overview' : 'Tổng quan điều phối đội xe',
          subtitle: isEn
            ? 'Vehicle readiness & upcoming departures'
            : 'Trạng thái phương tiện & các chuyến sắp khởi hành',
          icon: <Truck className="w-4 h-4 text-[#A67C2E]" />,
          url: '/coordinator',
        },
        {
          id: 'coord-routes',
          category: 'actions',
          title: isEn ? 'Route Planning & Leg Builder' : 'Thiết kế lộ trình & Gán chặng',
          subtitle: isEn
            ? 'Configure checkpoints, shared stalls & air bookings'
            : 'Lập điểm dừng, chuyến ghép chuồng & booking hàng không',
          icon: <MapPin className="w-4 h-4 text-[#287653]" />,
          url: '/coordinator/routes',
        },
        {
          id: 'coord-veh',
          category: 'actions',
          title: isEn ? 'Fleet & Stall Capacity' : 'Quản lý đội xe & Sức chứa',
          subtitle: isEn
            ? 'Monitor specialized horseboxes and availability'
            : 'Theo dõi xe thùng chuyên dụng và trạng thái sẵn sàng',
          icon: <Truck className="w-4 h-4 text-[#B49A68]" />,
          url: '/coordinator/vehicles',
        },
        {
          id: 'coord-sched',
          category: 'actions',
          title: isEn ? 'Dispatch Schedule' : 'Lịch trình điều phối chuyến đi',
          subtitle: isEn ? 'Departure timeline and active legs' : 'Lịch khởi hành theo ngày và tuần',
          icon: <Calendar className="w-4 h-4 text-[#A67C2E]" />,
          url: '/coordinator/schedule',
        },
        {
          id: 'coord-mon',
          category: 'actions',
          title: isEn ? 'Live Route Monitoring' : 'Giám sát hành trình trực tuyến',
          subtitle: isEn
            ? 'Track active checkpoint progress and overrides'
            : 'Theo dõi tiến độ các chặng đang di chuyển',
          icon: <Activity className="w-4 h-4 text-[#287653]" />,
          url: '/coordinator/monitoring',
        },
      ];
    }

    if (pathname.startsWith('/driver') || pathname.startsWith('/escort')) {
      const base = pathname.startsWith('/escort') ? '/escort' : '/driver';
      return [
        {
          id: 'drv-dash',
          category: 'actions',
          title: isEn ? 'Trip Execution Dashboard' : 'Bảng điều khiển thực thi chuyến',
          subtitle: isEn
            ? 'Overview of your assigned duties today'
            : 'Tổng quan nhiệm vụ được phân công hôm nay',
          icon: <Truck className="w-4 h-4 text-[#A67C2E]" />,
          url: base,
        },
        {
          id: 'drv-trips',
          category: 'actions',
          title: isEn ? 'Assigned Trips' : 'Danh sách chuyến đi được gán',
          subtitle: isEn
            ? 'Confirm assignments & review leg manifests'
            : 'Xác nhận nhận chuyến & xem chi tiết các chặng',
          icon: <MapPin className="w-4 h-4 text-[#287653]" />,
          url: `${base}/trips`,
        },
        {
          id: 'drv-status',
          category: 'actions',
          title: isEn ? 'Checkpoint Progress & Check-in' : 'Cập nhật mốc hành trình',
          subtitle: isEn
            ? 'Check in at rest stops, borders & complete legs'
            : 'Check-in trạm dừng, cửa khẩu và hoàn thành chặng',
          icon: <Activity className="w-4 h-4 text-[#A67C2E]" />,
          url: `${base}/status`,
        },
        ...(base === '/escort'
          ? [
              {
                id: 'drv-health',
                category: 'actions' as const,
                title: isEn ? 'Equine Health Logs' : 'Nhật ký sức khỏe ngựa đua',
                subtitle: isEn
                  ? 'Record temperature, heart rate & inspection photos'
                  : 'Ghi nhận nhịp tim, thân nhiệt và ảnh kiểm tra thú y',
                icon: <Stethoscope className="w-4 h-4 text-[#287653]" />,
                url: `${base}/health`,
              },
            ]
          : []),
        {
          id: 'drv-inc',
          category: 'actions',
          title: isEn ? 'Report Emergency Incident' : 'Báo cáo sự cố khẩn cấp',
          subtitle: isEn
            ? 'Report vehicle, traffic, or equine medical emergencies'
            : 'Khai báo sự cố xe, đường sá hoặc thú y',
          icon: <AlertTriangle className="w-4 h-4 text-[#B33E3E]" />,
          url: `${base}/incidents`,
        },
      ];
    }

    return [
      {
        id: 'act-new-req',
        category: 'actions',
        title: t('customer.requests.newRequestBtn', isEn ? 'New Transport Request' : 'Tạo yêu cầu vận chuyển mới'),
        subtitle: t(
          'customer.createInternationalTripDesc',
          isEn
            ? 'Initiate a specialized cross-border transport request for your racehorses'
            : 'Khởi tạo hành lang vận chuyển chuyên dụng cho ngựa đua'
        ),
        icon: <Plus className="w-4 h-4 text-[#A67C2E]" />,
        url: '/customer/requests/new',
      },
      {
        id: 'act-requests',
        category: 'actions',
        title: t('nav.requests', isEn ? 'Transport Requests' : 'Danh sách yêu cầu vận chuyển'),
        subtitle: t(
          'customer.requests.subtitle',
          isEn
            ? 'Track approvals, quotations, and active shipment statuses'
            : 'Theo dõi tiến độ duyệt và trạng thái các chuyến vận chuyển'
        ),
        icon: <Plane className="w-4 h-4 text-[#A67C2E]" />,
        url: '/customer/requests',
      },
      {
        id: 'act-horses',
        category: 'actions',
        title: t('nav.horses', isEn ? 'My Racehorse Stable' : 'Quản lý đàn chiến mã'),
        subtitle: t(
          'horses.modal.addSubtitle',
          isEn
            ? 'Horse profiles, FEI digital passports & microchip records'
            : 'Danh sách ngựa, hộ chiếu điện tử FEI và thông tin vi mạch'
        ),
        icon: <span className="text-[#8A6D3B] font-bold text-xs">♞</span>,
        url: '/customer/horses',
      },
      {
        id: 'act-tracking',
        category: 'actions',
        title: t('nav.tracking', isEn ? 'Live GPS Tracking' : 'Theo dõi hành trình trực tiếp (GPS Tracking)'),
        subtitle: t(
          'palette.gotoTracking',
          isEn
            ? 'Monitor live GPS coordinates and horse vitals on route'
            : 'Giám sát vị trí thời gian thực và sinh hiệu chiến mã trên đường'
        ),
        icon: <Activity className="w-4 h-4 text-[#287653]" />,
        url: '/customer/tracking',
      },
      {
        id: 'act-documents',
        category: 'actions',
        title: t('nav.documents', isEn ? 'Quarantine & Legal Documents' : 'Hồ sơ kiểm dịch & Chứng chỉ thú y'),
        subtitle: t(
          'documents.modal.uploadSubtitle',
          isEn
            ? 'Submit lab results, import/export permits, and quarantine certificates'
            : 'Nộp giấy xét nghiệm, giấy phép xuất nhập cảnh và kiểm dịch'
        ),
        icon: <ShieldCheck className="w-4 h-4 text-[#966516]" />,
        url: '/customer/documents',
      },
      {
        id: 'act-reports',
        category: 'actions',
        title: t('nav.reports', isEn ? 'Reports & Analytics' : 'Báo cáo & Phân tích chi phí'),
        subtitle: isEn
          ? 'Operational history, customs expenses & financial statements'
          : 'Báo cáo vận hành, chi phí hải quan và lịch sử vận chuyển',
        icon: <FileText className="w-4 h-4 text-[#5F6977]" />,
        url: '/customer/reports',
      },
    ];
  }, [pathname, t, isEn]);

  const filteredItems = useMemo(
    () =>
      allItems.filter((item) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          (item.badge && item.badge.toLowerCase().includes(q))
        );
      }),
    [allItems, query]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleCustomOpen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleCustomOpen);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    setQuery('');
    setSelectedIndex(0);
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || filteredItems.length === 0) return;
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, selectedIndex, filteredItems.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length === 0) return;
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length === 0) return;
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        setIsOpen(false);
        router.push(selected.url);
      }
    }
  };

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const closeLabel = t('common.close', isEn ? 'Close' : 'Đóng');
  const activeOptionId = filteredItems[selectedIndex] ? `${listboxId}-${filteredItems[selectedIndex].id}` : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-6 sm:pt-20 px-4 animate-fade-in-only"
      style={{
        backgroundColor: 'rgba(24, 26, 23, 0.62)',
        backdropFilter: 'blur(3px)',
      }}
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropMouseDownRef.current && e.target === e.currentTarget) {
          setIsOpen(false);
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl bg-white rounded-2xl border border-[#D8CEBE] shadow-2xl overflow-hidden transition-all transform scale-100 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <span id={titleId} className="sr-only">
          {isEn ? 'Quick Navigation Palette' : 'Bảng điều hướng nhanh'}
        </span>

        {/* Search Bar Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#E8E2D8] bg-[#F0EEE8]/70">
          <Search className="w-5 h-5 text-[#A67C2E] mr-3 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-label={t('palette.search', isEn ? 'Quick search features or portals...' : 'Tìm kiếm nhanh chức năng, trang quản lý...')}
            placeholder={t('palette.search', isEn ? 'Quick search features or portals...' : 'Tìm kiếm nhanh chức năng, trang quản lý...')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent border-none outline-none shadow-none text-sm sm:text-base text-[#273244] placeholder:text-[#747D88] font-medium focus:ring-0 focus:shadow-none"
          />
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <kbd className="kbd-badge text-[10px] hidden sm:inline-flex" aria-hidden="true">ESC</kbd>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[#747D88] hover:text-[#273244] p-1.5 rounded-lg hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={closeLabel}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div
          id={listboxId}
          role="listbox"
          className="max-h-[60vh] sm:max-h-[380px] overflow-y-auto p-2 space-y-1"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-[#747D88] text-sm">
              {t('common.noResults', isEn ? 'No matching results found' : 'Không tìm thấy kết quả phù hợp')}
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  id={`${listboxId}-${item.id}`}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setIsOpen(false);
                    router.push(item.url);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isSelected
                      ? 'bg-[#FAF8F4] border border-[#D8CEBE] shadow-sm'
                      : 'hover:bg-[#F0EEE8] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      aria-hidden="true"
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                        isSelected
                          ? 'bg-white border-[#D8CEBE] text-[#A67C2E]'
                          : 'bg-[#F0EEE8] border-[#D8CEBE] text-[#5F6977]'
                      }`}
                    >
                      {item.icon}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs sm:text-[13.5px] text-[#273244] truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#FAF8F4] text-[#A67C2E] shrink-0 border border-[#D8CEBE]">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-[#5F6977] truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-2 shrink-0">
                    {isSelected && (
                      <span className="text-[11px] font-mono text-[#A67C2E] font-bold flex items-center gap-0.5">
                        <span className="hidden sm:inline">{t('common.viewDetails', isEn ? 'Open' : 'Đi tới')}</span>
                        <ChevronRight size={13} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="px-4 py-2.5 bg-[#F0EEE8] border-t border-[#D8CEBE] flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#5F6977] font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="kbd-badge mr-1">↑</kbd>
              <kbd className="kbd-badge mr-1">↓</kbd> {t('palette.navigation', isEn ? 'navigate' : 'điều hướng')}
            </span>
            <span>
              <kbd className="kbd-badge mr-1">↵</kbd> {t('common.confirm', isEn ? 'open' : 'chọn')}
            </span>
          </div>
          <span className="text-[#747D88] hidden sm:inline">EquiTransit Quick Search (Ctrl/⌘K)</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
