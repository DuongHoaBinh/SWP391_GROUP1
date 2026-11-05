'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  Plus,
  Search,
  Filter,
  Sparkles,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  Info,
  Layers,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  documentsApi,
  RegulationTemplatePreset,
} from '@/features/documents/api/documents.api';
import toast from 'react-hot-toast';

interface DisplayRegulation {
  id: number;
  country: string;
  title: string;
  docType: string;
  status: string;
  updated: string;
  regionKey: string;
}

// Bảng ánh xạ quốc gia vào Châu lục / Khu vực
const COUNTRY_TO_REGION: Record<string, { key: string; name: string }> = {
  // ASEAN
  singapore: { key: 'ASEAN', name: 'Đông Nam Á' },
  malaysia: { key: 'ASEAN', name: 'Đông Nam Á' },
  vietnam: { key: 'ASEAN', name: 'Đông Nam Á' },
  thailand: { key: 'ASEAN', name: 'Đông Nam Á' },
  indonesia: { key: 'ASEAN', name: 'Đông Nam Á' },
  philippines: { key: 'ASEAN', name: 'Đông Nam Á' },
  cambodia: { key: 'ASEAN', name: 'Đông Nam Á' },
  laos: { key: 'ASEAN', name: 'Đông Nam Á' },

  // East Asia
  japan: { key: 'EAST_ASIA', name: 'Đông Á' },
  'hong kong': { key: 'EAST_ASIA', name: 'Đông Á' },
  'south korea': { key: 'EAST_ASIA', name: 'Đông Á' },
  china: { key: 'EAST_ASIA', name: 'Đông Á' },
  taiwan: { key: 'EAST_ASIA', name: 'Đông Á' },

  // Middle East
  'united arab emirates': { key: 'MIDDLE_EAST', name: 'Trung Đông' },
  qatar: { key: 'MIDDLE_EAST', name: 'Trung Đông' },
  'saudi arabia': { key: 'MIDDLE_EAST', name: 'Trung Đông' },
  bahrain: { key: 'MIDDLE_EAST', name: 'Trung Đông' },
  oman: { key: 'MIDDLE_EAST', name: 'Trung Đông' },
  kuwait: { key: 'MIDDLE_EAST', name: 'Trung Đông' },
  morocco: { key: 'MIDDLE_EAST', name: 'Trung Đông' },

  // Europe
  france: { key: 'EUROPE', name: 'Châu Âu' },
  germany: { key: 'EUROPE', name: 'Châu Âu' },
  'united kingdom': { key: 'EUROPE', name: 'Châu Âu' },
  ireland: { key: 'EUROPE', name: 'Châu Âu' },
  netherlands: { key: 'EUROPE', name: 'Châu Âu' },
  belgium: { key: 'EUROPE', name: 'Châu Âu' },
  italy: { key: 'EUROPE', name: 'Châu Âu' },

  // Americas & Oceania
  australia: { key: 'AMERICAS_OCEANIA', name: 'Châu Mỹ & Úc' },
  'new zealand': { key: 'AMERICAS_OCEANIA', name: 'Châu Mỹ & Úc' },
  'united states': { key: 'AMERICAS_OCEANIA', name: 'Châu Mỹ & Úc' },
  canada: { key: 'AMERICAS_OCEANIA', name: 'Châu Mỹ & Úc' },

  // Baseline
  'global baseline': { key: 'BASELINE', name: 'Toàn cầu (WOAH)' },
};

const REGION_TABS = [
  { key: 'ALL', label: 'Tất cả', icon: '🌐' },
  { key: 'ASEAN', label: 'Đông Nam Á', icon: '🌏' },
  { key: 'EAST_ASIA', label: 'Đông Á', icon: '🏯' },
  { key: 'MIDDLE_EAST', label: 'Trung Đông', icon: '🏜️' },
  { key: 'EUROPE', label: 'Châu Âu', icon: '🏰' },
  { key: 'AMERICAS_OCEANIA', label: 'Châu Mỹ & Úc', icon: '🗽' },
  { key: 'BASELINE', label: 'Chuẩn WOAH', icon: '🛡️' },
];

export default function RegulationsPage() {
  const [regulations, setRegulations] = useState<DisplayRegulation[]>([]);
  const [presets, setPresets] = useState<RegulationTemplatePreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedCountry, setSelectedCountry] = useState('ALL');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add Custom Protocol Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCountry, setNewCountry] = useState('Singapore');
  const [newDocType, setNewDocType] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEffectiveDate, setNewEffectiveDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Apply Regional Preset Modal state
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('asean');
  const [targetPresetCountry, setTargetPresetCountry] = useState<string>('Malaysia');
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);

  // Deleting state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchRegulations = async () => {
    setIsLoading(true);
    try {
      const [regsData, presetsData] = await Promise.allSettled([
        documentsApi.getRegulations(),
        documentsApi.getPresetTemplates(),
      ]);

      if (regsData.status === 'fulfilled' && regsData.value) {
        const mapped: DisplayRegulation[] = regsData.value.map((r) => {
          const cLower = r.country.toLowerCase().trim();
          const regionInfo = COUNTRY_TO_REGION[cLower] || {
            key: 'OTHER',
            name: 'Khu vực khác',
          };
          return {
            id: r.id,
            country: r.country,
            title: r.description || r.documentType,
            docType: r.documentType,
            status: 'Active',
            updated:
              r.effectiveDate ||
              (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Active'),
            regionKey: regionInfo.key,
          };
        });
        setRegulations(mapped);
      }

      if (presetsData.status === 'fulfilled' && presetsData.value) {
        setPresets(presetsData.value);
      }
    } catch (err) {
      console.warn('Could not fetch regulations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegulations();
  }, []);

  // Reset pagination when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRegion, selectedCountry, pageSize]);

  // Handle Region Tab Change
  const handleRegionTabChange = (regionKey: string) => {
    setSelectedRegion(regionKey);
    setSelectedCountry('ALL'); // reset specific country filter
  };

  // List of countries available under current selected region
  const availableCountriesInRegion = useMemo(() => {
    const list = regulations
      .filter((r) => selectedRegion === 'ALL' || r.regionKey === selectedRegion)
      .map((r) => r.country);
    return Array.from(new Set(list)).sort();
  }, [regulations, selectedRegion]);

  // Counts per region
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: regulations.length };
    for (const r of regulations) {
      counts[r.regionKey] = (counts[r.regionKey] || 0) + 1;
    }
    return counts;
  }, [regulations]);

  // Filtered Regulations list
  const filteredRegulations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return regulations.filter((reg) => {
      // Search matches
      const matchesSearch =
        !q ||
        String(reg.id).includes(q) ||
        reg.country.toLowerCase().includes(q) ||
        reg.title.toLowerCase().includes(q) ||
        reg.docType.toLowerCase().includes(q);

      // Region matches
      const matchesRegion =
        selectedRegion === 'ALL' || reg.regionKey === selectedRegion;

      // Country matches
      const matchesCountry =
        selectedCountry === 'ALL' ||
        reg.country.toLowerCase() === selectedCountry.toLowerCase();

      return matchesSearch && matchesRegion && matchesCountry;
    });
  }, [regulations, searchQuery, selectedRegion, selectedCountry]);

  // Pagination calculation
  const totalItems = filteredRegulations.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRegulations = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredRegulations.slice(start, start + pageSize);
  }, [filteredRegulations, validPage, pageSize]);

  // Handle Submit New Single Regulation
  const handleAddRegulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountry.trim() || !newDocType.trim() || !newDesc.trim()) {
      toast.error('Vui lòng điền đầy đủ quốc gia, loại chứng từ và tiêu đề mô tả.');
      return;
    }

    setIsSubmitting(true);
    try {
      await documentsApi.createRegulation({
        country: newCountry.trim(),
        documentType: newDocType.trim().toLowerCase().replace(/\s+/g, '_'),
        description: newDesc.trim(),
        effectiveDate: newEffectiveDate || undefined,
      });

      toast.success(`Đã thêm quy định cho "${newCountry}" thành công!`);
      setIsModalOpen(false);
      setNewDocType('');
      setNewDesc('');
      fetchRegulations();
    } catch (err: any) {
      toast.error(err.message || 'Không thể tạo quy định');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Apply Preset Template
  const handleApplyPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPresetCountry.trim() || !selectedPresetKey) {
      toast.error('Vui lòng chọn bộ mẫu và nhập tên quốc gia.');
      return;
    }

    setIsApplyingPreset(true);
    try {
      await documentsApi.applyPresetTemplate({
        country: targetPresetCountry.trim(),
        templateKey: selectedPresetKey,
      });

      toast.success(
        `Đã áp dụng trọn bộ quy định cho "${targetPresetCountry}" thành công!`
      );
      setIsPresetModalOpen(false);
      fetchRegulations();
    } catch (err: any) {
      toast.error(err.message || 'Không thể áp dụng bộ mẫu quy định');
    } finally {
      setIsApplyingPreset(false);
    }
  };

  // Handle Delete Regulation
  const handleDeleteRegulation = async (id: number, title: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa quy định #${id} ("${title}")?`)) {
      return;
    }

    setDeletingId(id);
    try {
      await documentsApi.deleteRegulation(id);
      toast.success(`Đã xóa quy định #${id}`);
      setRegulations((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast.error(err.message || 'Không thể xóa quy định');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedPresetObj = presets.find((p) => p.key === selectedPresetKey);

  // Generate pagination page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (validPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (validPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', validPage - 1, validPage, validPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Header with integrated metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <ShieldCheck size={20} />
            </span>
            <h1 className="text-lg font-bold text-slate-900 m-0">
              Danh mục Quy định & Kiểm dịch Quốc tế
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
              <Layers size={12} /> {regulations.length} mục hồ sơ
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Globe size={12} />{' '}
              {
                Array.from(new Set(regulations.map((r) => r.country))).filter(
                  (c) => c !== 'Global Baseline'
                ).length
              }{' '}
              quốc gia
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
              <ShieldCheck size={12} /> WOAH Baseline Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý giấy tờ thú y, hộ chiếu FEI và kiểm dịch hải quan theo từng châu lục và quốc gia đến.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setIsPresetModalOpen(true);
            }}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 hover:shadow-xs cursor-pointer"
          >
            <Sparkles size={14} /> Áp dụng mẫu khu vực
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-2 rounded-lg text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} /> Thêm quy định lẻ
          </button>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* ROW 1: Continent / Region Filter Tabs */}
        <div className="border-b border-slate-200 bg-slate-50/70 p-3 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1.5 pl-1">
              <Globe size={14} className="text-slate-400" /> Châu lục / Khu vực:
            </span>
            {REGION_TABS.map((tab) => {
              const count = regionCounts[tab.key] || 0;
              const isActive = selectedRegion === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleRegionTabChange(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-200/60 border border-slate-200/80'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-blue-500/80 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ROW 2: Search & Country Dropdown */}
        <div className="p-3.5 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
            {/* Search Input */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full sm:w-80 focus-within:border-blue-500 focus-within:bg-white transition-all shadow-2xs">
              <Search size={16} className="text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Tìm mã #, tên tài liệu, loại chứng từ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-none outline-none text-sm w-full bg-transparent"
              />
            </div>

            {/* Specific Country Dropdown */}
            <div className="flex items-center gap-1.5 w-full sm:w-64">
              <Filter size={15} className="text-slate-400 shrink-0 hidden sm:block" />
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer shadow-2xs"
              >
                <option value="ALL">
                  -- Tất cả quốc gia ({availableCountriesInRegion.length}) --
                </option>
                {availableCountriesInRegion.map((country) => {
                  const cCount = regulations.filter((r) => r.country === country).length;
                  return (
                    <option key={country} value={country}>
                      {country === 'Global Baseline' ? '🌐 WOAH Baseline' : country} ({cCount})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Reset Filters button if any filter is active */}
          {(searchQuery || selectedRegion !== 'ALL' || selectedCountry !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedRegion('ALL');
                setSelectedCountry('ALL');
              }}
              className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw size={13} /> Đặt lại bộ lọc
            </button>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 w-20">Mã</th>
                <th className="p-4 w-44">Quốc gia / Khu vực</th>
                <th className="p-4">Tiêu đề yêu cầu & Mô tả chi tiết</th>
                <th className="p-4 w-48">Mã loại chứng từ</th>
                <th className="p-4 w-28">Trạng thái</th>
                <th className="p-4 w-20 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mb-2"></div>
                    <div>Đang tải dữ liệu quy định từ cơ sở dữ liệu...</div>
                  </td>
                </tr>
              ) : paginatedRegulations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <Info size={32} className="mx-auto text-slate-300 mb-2" />
                    Không tìm thấy quy định nào phù hợp với bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                paginatedRegulations.map((reg) => {
                  const isBaseline = reg.country === 'Global Baseline';
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-mono text-xs font-bold text-slate-600">
                        #{reg.id}
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          {isBaseline ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100 text-xs font-bold">
                              🌐 Toàn cầu (WOAH)
                            </span>
                          ) : (
                            reg.country
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-slate-800 leading-snug">{reg.title}</div>
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono text-slate-700 border border-slate-200">
                          {reg.docType}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {reg.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleDeleteRegulation(reg.id, reg.title)}
                          disabled={deletingId === reg.id}
                          title="Xóa quy định"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* BOTTOM PAGINATION CONTROLLER */}
        {!isLoading && totalItems > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-600">
            {/* Left: Summary */}
            <div className="flex items-center gap-2 text-xs">
              <span>
                Hiển thị{' '}
                <strong className="text-slate-900 font-bold">
                  {(validPage - 1) * pageSize + 1}
                </strong>{' '}
                -{' '}
                <strong className="text-slate-900 font-bold">
                  {Math.min(validPage * pageSize, totalItems)}
                </strong>{' '}
                trên tổng số{' '}
                <strong className="text-slate-900 font-bold">{totalItems}</strong> quy chế
              </span>

              {/* Rows per page selector */}
              <div className="flex items-center gap-1.5 ml-3">
                <span className="text-slate-400">Số dòng/trang:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Right: Page Buttons */}
            <div className="flex items-center gap-1">
              {/* Previous Button */}
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage <= 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ChevronLeft size={14} /> Trước
              </button>

              {/* Page Number Chips */}
              <div className="flex items-center gap-1 mx-1">
                {getPageNumbers().map((p, idx) => {
                  if (p === '...') {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-2 text-xs text-slate-400">
                        ...
                      </span>
                    );
                  }
                  const isCurrent = p === validPage;
                  return (
                    <button
                      key={`page-${p}`}
                      onClick={() => setCurrentPage(Number(p))}
                      className={`min-w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              {/* Next Button */}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              >
                Sau <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Áp dụng bộ mẫu quy định khu vực (Regional Presets) */}
      {isPresetModalOpen && (
        <Modal
          isOpen={isPresetModalOpen}
          onClose={() => setIsPresetModalOpen(false)}
          title="Áp dụng mẫu quy chuẩn khu vực"
          subtitle="Tự động khởi tạo trọn bộ chứng chỉ kiểm dịch thú y & hải quan chuẩn quốc tế chỉ với 1 click."
          maxWidth="720px"
        >
          <form onSubmit={handleApplyPreset} className="flex flex-col gap-5 pt-1">
            {/* Template Selector Cards */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                1. Chọn bộ quy chuẩn khu vực:
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {presets.map((preset) => {
                  const isSelected = selectedPresetKey === preset.key;
                  return (
                    <div
                      key={preset.key}
                      onClick={() => {
                        setSelectedPresetKey(preset.key);
                        if (
                          preset.recommendedCountries &&
                          preset.recommendedCountries.length > 0
                        ) {
                          setTargetPresetCountry(preset.recommendedCountries[0]);
                        }
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">
                          {preset.name}
                        </span>
                        {isSelected && (
                          <CheckCircle2 size={16} className="text-blue-600" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {preset.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-blue-700">
                        <span>{preset.items.length} loại chứng từ bắt buộc</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target Country Input */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                2. Quốc gia hoặc Tuyến đích áp dụng:
              </label>
              <input
                type="text"
                placeholder="Nhập tên quốc gia, VD: Qatar, Nhật Bản, Malaysia..."
                value={targetPresetCountry}
                onChange={(e) => setTargetPresetCountry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 font-semibold"
                required
              />

              {/* Recommended chips for this preset */}
              {selectedPresetObj?.recommendedCountries && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] font-medium text-slate-400">Gợi ý nhanh:</span>
                  {selectedPresetObj.recommendedCountries.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTargetPresetCountry(c)}
                      className={`text-xs px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        targetPresetCountry === c
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live Document Preview Box */}
            {selectedPresetObj && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                  <span>Xem trước danh mục chứng chỉ sẽ tạo ({selectedPresetObj.items.length}):</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Áp dụng cho: <strong>{targetPresetCountry || 'Quốc gia đã chọn'}</strong>
                  </span>
                </div>
                <div className="space-y-1.5">
                  {selectedPresetObj.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-white p-2 rounded-lg border border-slate-100 flex items-start gap-2"
                    >
                      <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0 font-semibold">
                        {item.documentType}
                      </span>
                      <span className="text-slate-700 leading-snug">{item.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPresetModalOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isApplyingPreset || !targetPresetCountry.trim()}
              >
                {isApplyingPreset ? 'Đang tạo...' : 'Áp dụng bộ mẫu vào hệ thống'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Thêm quy định đơn lẻ (Custom Protocol) */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setNewCountry('');
            setNewDocType('');
            setNewDesc('');
            setNewEffectiveDate(new Date().toISOString().split('T')[0]);
            setIsModalOpen(false);
          }}
          title="Thêm Quy định Kiểm dịch Riêng lẻ"
          subtitle="Tạo thêm yêu cầu chứng từ pháp lý đặc thù cho một quốc gia cụ thể."
          maxWidth="520px"
        >
          <form onSubmit={handleAddRegulation} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Quốc gia đích <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: Singapore, Qatar, Malaysia, Hong Kong"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Mã loại chứng từ (Key identifier) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: horse_passport, import_permit, coggins_test"
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Tiêu đề & Yêu cầu chi tiết <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="VD: Giấy chứng nhận tiêm phòng Cúm ngựa do cơ quan thú y cấp trong vòng 60 ngày..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 resize-none"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Ngày bắt đầu có hiệu lực
              </label>
              <input
                type="date"
                value={newEffectiveDate}
                onChange={(e) => setNewEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewCountry('');
                  setNewDocType('');
                  setNewDesc('');
                  setNewEffectiveDate(new Date().toISOString().split('T')[0]);
                  setIsModalOpen(false);
                }}
              >
                Hủy bỏ
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : 'Lưu quy định'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
