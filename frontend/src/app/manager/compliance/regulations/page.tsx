'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Edit2,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  documentsApi,
  RegulationTemplatePreset,
} from '@/features/documents/api/documents.api';
import toast from 'react-hot-toast';

const PER_HORSE_DOC_TYPES = new Set([
  'horse_passport',
  'vaccination_certificate',
  'blood_test',
  'health_certificate',
  'coggins_test',
  'microchip',
  'eva_test',
  'eia_test',
]);

function inferScopeFromDocType(docType?: string): 'per_horse' | 'per_shipment' {
  const norm = (docType || '').toLowerCase().trim();
  if (
    PER_HORSE_DOC_TYPES.has(norm) ||
    norm.includes('horse') ||
    norm.includes('passport') ||
    norm.includes('vaccin') ||
    norm.includes('blood')
  ) {
    return 'per_horse';
  }
  return 'per_shipment';
}

interface DisplayRegulation {
  id: number;
  country: string;
  borderGate?: string | null;
  transportMode: 'road' | 'air' | 'both';
  docTier: 'A' | 'B';
  leadTimeDays: number;
  requiresAuthorityApproval: boolean;
  minValidityBufferHours: number;
  scope: 'per_horse' | 'per_shipment';
  isMandatory: boolean;
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
  const { language, translateDocType, translateStatus, translateCountry } = useLanguage();
  const languageRef = useRef(language);
  languageRef.current = language;

  const [regulations, setRegulations] = useState<DisplayRegulation[]>([]);
  const [presets, setPresets] = useState<RegulationTemplatePreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
  const [newBorderGate, setNewBorderGate] = useState('');
  const [newTransportMode, setNewTransportMode] = useState<'road' | 'air' | 'both'>('both');
  const [newDocTier, setNewDocTier] = useState<'A' | 'B'>('A');
  const [newLeadTimeDays, setNewLeadTimeDays] = useState('5');
  const [newRequiresAuth, setNewRequiresAuth] = useState(false);
  const [newBufferHours, setNewBufferHours] = useState('48');
  const [newDocType, setNewDocType] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEffectiveDate, setNewEffectiveDate] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Apply Regional Preset Modal state
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('asean');
  const [targetPresetCountry, setTargetPresetCountry] = useState<string>('Malaysia');
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);

  // Edit Protocol Modal state
  const [editingReg, setEditingReg] = useState<DisplayRegulation | null>(null);
  const [editCountry, setEditCountry] = useState('');
  const [editBorderGate, setEditBorderGate] = useState('');
  const [editTransportMode, setEditTransportMode] = useState<'road' | 'air' | 'both'>('both');
  const [editDocTier, setEditDocTier] = useState<'A' | 'B'>('A');
  const [editLeadTimeDays, setEditLeadTimeDays] = useState('5');
  const [editRequiresAuth, setEditRequiresAuth] = useState(false);
  const [editBufferHours, setEditBufferHours] = useState('48');
  const [editDocType, setEditDocType] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editEffectiveDate, setEditEffectiveDate] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Deleting / Confirmation state
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    id: number;
    docType: string;
    title: string;
    country: string;
  } | null>(null);

  const handleOpenEditModal = (reg: DisplayRegulation) => {
    setEditingReg(reg);
    setEditCountry(reg.country);
    setEditBorderGate(reg.borderGate || '');
    setEditTransportMode(reg.transportMode || 'both');
    setEditDocTier(reg.docTier || 'A');
    setEditLeadTimeDays(String(reg.leadTimeDays ?? 5));
    setEditRequiresAuth(Boolean(reg.requiresAuthorityApproval));
    setEditBufferHours(String(reg.minValidityBufferHours ?? 24));
    setEditDocType(reg.docType);
    setEditDesc(reg.title);
    setEditEffectiveDate(/^\d{4}-\d{2}-\d{2}$/.test(reg.updated) ? reg.updated : '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReg || isSavingEdit) return;
    if (!editCountry.trim() || !editDocType.trim()) {
      toast.error(language === 'en' ? 'Country and document type are required.' : 'Vui lòng nhập đầy đủ quốc gia và mã loại chứng từ.');
      return;
    }
    setIsSavingEdit(true);
    try {
      const updated = await documentsApi.updateRegulation(editingReg.id, {
        country: editCountry.trim(),
        borderGate: editBorderGate.trim() || null,
        transportMode: editTransportMode,
        docTier: editDocTier,
        leadTimeDays: Math.max(0, Number(editLeadTimeDays) || 0),
        requiresAuthorityApproval: editRequiresAuth,
        minValidityBufferHours: Math.max(0, Number(editBufferHours) || 0),
        documentType: editDocType.trim(),
        description: editDesc.trim() || undefined,
        effectiveDate: editEffectiveDate.trim() || undefined,
      });
      setRegulations((prev) =>
        prev.map((r) => {
          if (r.id !== editingReg.id) return r;
          const cLower = (updated.country || editCountry).toLowerCase().trim();
          const regionInfo = COUNTRY_TO_REGION[cLower] || { key: 'OTHER', name: 'Other Region' };
          return {
            ...r,
            country: updated.country || editCountry.trim(),
            borderGate: updated.borderGate ?? (editBorderGate.trim() || null),
            transportMode: updated.transportMode || editTransportMode,
            docTier: updated.docTier || editDocTier,
            leadTimeDays: updated.leadTimeDays ?? Number(editLeadTimeDays || 5),
            requiresAuthorityApproval: updated.requiresAuthorityApproval ?? editRequiresAuth,
            minValidityBufferHours: updated.minValidityBufferHours ?? Number(editBufferHours || 24),
            docType: updated.documentType || editDocType.trim(),
            scope: inferScopeFromDocType(updated.documentType || editDocType.trim()),
            title: updated.description || editDesc.trim() || updated.documentType,
            updated: updated.effectiveDate || r.updated,
            regionKey: regionInfo.key,
          };
        })
      );
      toast.success(
        language === 'en'
          ? `Updated regulation #${editingReg.id} successfully.`
          : `Đã cập nhật quy định #${editingReg.id} thành công!`
      );
      setEditingReg(null);
    } catch (err: any) {
      toast.error(err?.message || (language === 'en' ? 'Failed to update regulation.' : 'Không thể cập nhật quy định.'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const fetchRegulations = useCallback(async () => {
    const lang = languageRef.current;
    setIsLoading(true);
    setFetchError(null);
    try {
      const [regsData, presetsData] = await Promise.allSettled([
        documentsApi.getRegulations(),
        documentsApi.getPresetTemplates(),
      ]);

      if (regsData.status === 'fulfilled' && regsData.value) {
        const mapped: DisplayRegulation[] = (regsData.value as any[]).map((r) => {
          const cLower = (r.country || '').toLowerCase().trim();
          const regionInfo = COUNTRY_TO_REGION[cLower] || {
            key: 'OTHER',
            name: lang === 'en' ? 'Other Region' : 'Khu vực khác',
          };
          const resolvedScope: 'per_horse' | 'per_shipment' =
            r.scope === 'per_horse'
              ? 'per_horse'
              : r.scope === 'per_shipment'
              ? 'per_shipment'
              : inferScopeFromDocType(r.documentType);
          return {
            id: r.id,
            country: r.country,
            borderGate: r.borderGate || null,
            transportMode: r.transportMode || 'both',
            docTier: r.docTier || 'A',
            leadTimeDays: r.leadTimeDays !== undefined ? Number(r.leadTimeDays) : 5,
            requiresAuthorityApproval: Boolean(r.requiresAuthorityApproval),
            minValidityBufferHours: r.minValidityBufferHours !== undefined ? Number(r.minValidityBufferHours) : 24,
            scope: resolvedScope,
            isMandatory: r.isMandatory !== undefined ? Boolean(r.isMandatory) : true,
            title: r.description || r.documentType,
            docType: r.documentType,
            status: 'Active',
            updated:
              r.effectiveDate ||
              (r.createdAt ? new Date(r.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN') : 'Active'),
            regionKey: regionInfo.key,
          };
        });
        setRegulations(mapped);
      } else if (regsData.status === 'rejected') {
        const msg =
          regsData.reason?.message ||
          (lang === 'en'
            ? 'Unable to connect to quarantine regulations server.'
            : 'Không thể kết nối đến máy chủ quản lý quy chuẩn kiểm dịch.');
        setFetchError(msg);
      }

      if (presetsData.status === 'fulfilled' && presetsData.value) {
        setPresets(presetsData.value);
      }
    } catch (err: any) {
      console.warn('Could not fetch regulations:', err);
      setFetchError(
        err?.message ||
          (lang === 'en'
            ? 'Unknown error loading quarantine protocols data.'
            : 'Lỗi không xác định khi tải dữ liệu quy chế kiểm dịch.')
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegulations();
  }, [fetchRegulations]);

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
        (reg.borderGate && reg.borderGate.toLowerCase().includes(q)) ||
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
    if (isSubmitting) return;
    if (!newCountry.trim() || !newDocType.trim() || !newDesc.trim()) {
      toast.error(
        language === 'en'
          ? 'Please fill in country, document type, and description.'
          : 'Vui lòng điền đầy đủ quốc gia, loại chứng từ và tiêu đề mô tả.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await documentsApi.createRegulation({
        country: newCountry.trim(),
        borderGate: newBorderGate.trim() || undefined,
        transportMode: newTransportMode,
        docTier: newDocTier,
        leadTimeDays: Math.max(0, Number(newLeadTimeDays) || 0),
        requiresAuthorityApproval: newRequiresAuth,
        minValidityBufferHours: Math.max(0, Number(newBufferHours) || 0),
        documentType: newDocType.trim().toLowerCase().replace(/\s+/g, '_'),
        description: newDesc.trim(),
        effectiveDate: newEffectiveDate.trim() || new Date().toISOString().split('T')[0],
      });

      toast.success(
        language === 'en'
          ? `Successfully added protocol for "${newCountry.trim()}"!`
          : `Đã thêm quy định cho "${newCountry.trim()}" thành công!`
      );
      setIsModalOpen(false);
      setNewCountry('Singapore');
      setNewBorderGate('');
      setNewTransportMode('both');
      setNewDocTier('A');
      setNewLeadTimeDays('5');
      setNewRequiresAuth(false);
      setNewBufferHours('48');
      setNewDocType('');
      setNewDesc('');
      setNewEffectiveDate(new Date().toISOString().split('T')[0]);
      fetchRegulations();
    } catch (err: any) {
      toast.error(err.message || (language === 'en' ? 'Failed to create regulation' : 'Không thể tạo quy định'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Apply Preset Template
  const handleApplyPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPresetCountry.trim() || !selectedPresetKey) {
      toast.error(
        language === 'en'
          ? 'Please select a preset template and enter country name.'
          : 'Vui lòng chọn bộ mẫu và nhập tên quốc gia.'
      );
      return;
    }

    setIsApplyingPreset(true);
    try {
      await documentsApi.applyPresetTemplate({
        country: targetPresetCountry.trim(),
        templateKey: selectedPresetKey,
      });

      toast.success(
        language === 'en'
          ? `Successfully applied protocol preset for "${targetPresetCountry}"!`
          : `Đã áp dụng trọn bộ quy định cho "${targetPresetCountry}" thành công!`
      );
      setIsPresetModalOpen(false);
      fetchRegulations();
    } catch (err: any) {
      toast.error(err.message || (language === 'en' ? 'Failed to apply template preset' : 'Không thể áp dụng bộ mẫu quy định'));
    } finally {
      setIsApplyingPreset(false);
    }
  };

  // Handle Confirm Delete Regulation
  const handleConfirmDelete = async () => {
    if (!deleteConfirmItem) return;
    const { id } = deleteConfirmItem;
    setDeletingId(id);
    try {
      await documentsApi.deleteRegulation(id);
      toast.success(
        language === 'en'
          ? `Successfully deleted protocol #${id}!`
          : `Đã xóa quy định #${id} thành công!`
      );
      setRegulations((prev) => prev.filter((r) => r.id !== id));
      setDeleteConfirmItem(null);
    } catch (err: any) {
      toast.error(err.message || (language === 'en' ? 'Failed to delete regulation' : 'Không thể xóa quy định'));
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

  const getRegionLabel = (key: string) => {
    switch (key) {
      case 'ALL':
        return language === 'en' ? 'All' : 'Tất cả';
      case 'ASEAN':
        return language === 'en' ? 'Southeast Asia' : 'Đông Nam Á';
      case 'EAST_ASIA':
        return language === 'en' ? 'East Asia' : 'Đông Á';
      case 'MIDDLE_EAST':
        return language === 'en' ? 'Middle East' : 'Trung Đông';
      case 'EUROPE':
        return language === 'en' ? 'Europe' : 'Châu Âu';
      case 'AMERICAS_OCEANIA':
        return language === 'en' ? 'Americas & Oceania' : 'Châu Mỹ & Úc';
      case 'BASELINE':
        return language === 'en' ? 'WOAH Baseline' : 'Chuẩn WOAH';
      default:
        return key;
    }
  };

  const handleModalClose = () => {
    if (isSubmitting) return;
    setNewCountry('Singapore');
    setNewDocType('');
    setNewDesc('');
    setNewEffectiveDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Header with integrated metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-1.5 bg-[#F3EFE4] text-[#181A17] rounded-lg">
              <ShieldCheck size={20} />
            </span>
            <h1 className="text-2xl font-bold text-slate-900 m-0">
              {language === 'en' ? 'International Quarantine Protocols & Regulations' : 'Danh mục Quy định & Kiểm dịch Quốc tế'}
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA]">
              <Layers size={12} /> {regulations.length} {language === 'en' ? 'records' : 'mục hồ sơ'}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Globe size={12} />{' '}
              {
                Array.from(new Set(regulations.map((r) => r.country))).filter(
                  (c) => c !== 'Global Baseline'
                ).length
              }{' '}
              {language === 'en' ? 'countries' : 'quốc gia'}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA]">
              <ShieldCheck size={12} /> {language === 'en' ? 'WOAH Baseline Active' : 'Chuẩn WOAH Đang Kích Hoạt'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {language === 'en'
              ? 'Manage veterinary paperwork, FEI passports, and customs clearance across continents, nations, and border checkpoints.'
              : 'Quản lý giấy tờ thú y, hộ chiếu FEI và kiểm dịch hải quan theo từng châu lục, quốc gia và cửa khẩu biên giới.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsPresetModalOpen(true);
            }}
            className="bg-[#181A17] hover:bg-[#242722] text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles size={14} /> {language === 'en' ? 'Apply Regional Preset' : 'Áp dụng mẫu khu vực'}
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} /> {language === 'en' ? 'Add Custom Protocol' : 'Thêm quy định lẻ'}
          </button>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* ROW 0: Key Jurisdictions Quick Jump (UAE, Singapore, Thailand, Vietnam) */}
        <div className="p-3 bg-[#F0EEE8] border-b border-[#D9DDE2] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>✈️</span> {language === 'en' ? 'Key Corridors:' : 'Tuyến trọng điểm:'}
            </span>
            {[
              { code: 'UAE', name: 'United Arab Emirates', flag: '🇦🇪', authority: 'Dubai MOCCAE' },
              { code: 'SIN', name: 'Singapore', flag: '🇸🇬', authority: 'SFA / Turf Club' },
              { code: 'THA', name: 'Thailand', flag: '🇹🇭', authority: 'DLD Bangkok' },
              { code: 'VNM', name: 'Vietnam', flag: '🇻🇳', authority: language === 'en' ? 'DAH Vet Dept' : 'Cục Thú Y DAH' },
            ].map((c) => {
              const isSelected = selectedCountry.toLowerCase() === c.name.toLowerCase();
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCountry('ALL');
                    } else {
                      setSelectedCountry(c.name);
                      setSelectedRegion('ALL');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#181A17] text-white shadow-sm'
                      : 'bg-white hover:bg-[#FAF8F4] text-slate-800 border border-slate-200/90'
                  }`}
                >
                  <span>{c.flag}</span>
                  <span>{translateCountry(c.name)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${isSelected ? 'bg-[#A67C2E] text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {c.authority}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{language === 'en' ? 'Click to filter quarantine protocols by jurisdiction' : 'Click để lọc nhanh quy chuẩn kiểm dịch theo quốc gia'}</span>
          </div>
        </div>

        {/* ROW 1: Continent / Region Filter Tabs */}
        <div className="border-b border-slate-200 bg-slate-50/70 p-3 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1.5 pl-1">
              <Globe size={14} className="text-slate-400" /> {language === 'en' ? 'Continent / Region:' : 'Châu lục / Khu vực:'}
            </span>
            {REGION_TABS.map((tab) => {
              const count = regionCounts[tab.key] || 0;
              const isActive = selectedRegion === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleRegionTabChange(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#181A17] text-white shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-200/60 border border-slate-200/80'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{getRegionLabel(tab.key)}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive
                        ? 'bg-[#A67C2E] text-white'
                        : 'bg-slate-100 text-slate-600'
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
        <div className="p-3.5 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full flex-1">
            {/* Search Input */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full sm:w-80 focus-within:border-[#C4B38E] focus-within:bg-white transition-all shadow-sm">
              <Search size={16} className="text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                aria-label={language === 'en' ? 'Search regulations' : 'Tìm kiếm quy định kiểm dịch'}
                placeholder={language === 'en' ? 'Search by ID #, doc title, border gate...' : 'Tìm mã #, tên tài liệu, cửa khẩu...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-none outline-none text-sm w-full bg-transparent"
              />
            </div>

            {/* Specific Country Dropdown */}
            <div className="flex items-center gap-1.5 w-full sm:w-64">
              <Filter size={15} className="text-slate-400 shrink-0 hidden sm:block" />
              <select
                aria-label={language === 'en' ? 'Filter by country' : 'Lọc theo quốc gia'}
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium outline-none focus:border-[#C4B38E] focus:bg-white transition-all cursor-pointer shadow-sm"
              >
                <option value="ALL">
                  -- {language === 'en' ? 'All Countries' : 'Tất cả quốc gia'} ({availableCountriesInRegion.length}) --
                </option>
                {availableCountriesInRegion.map((country) => {
                  const cCount = regulations.filter((r) => r.country === country).length;
                  return (
                    <option key={country} value={country}>
                      {country === 'Global Baseline' ? (language === 'en' ? '🌐 WOAH Baseline' : '🌐 Chuẩn WOAH') : translateCountry(country)} ({cCount})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Reset Filters button if any filter is active */}
          {(searchQuery || selectedRegion !== 'ALL' || selectedCountry !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedRegion('ALL');
                setSelectedCountry('ALL');
              }}
              className="text-xs font-semibold text-slate-500 hover:text-[#A67C2E] flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
            >
              <RotateCcw size={13} /> {language === 'en' ? 'Reset filters' : 'Đặt lại bộ lọc'}
            </button>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-[#F0EEE8] border-b border-[#D8CEBE] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-6 py-4 w-[12%]">{language === 'en' ? 'Code' : 'Mã'}</th>
                <th className="px-6 py-4 w-[24%]">{language === 'en' ? 'Country / Border Gate' : 'Quốc gia / Cửa khẩu'}</th>
                <th className="px-6 py-4 w-[38%]">{language === 'en' ? 'Requirement Title & Detailed Description' : 'Tiêu đề yêu cầu & Mô tả chi tiết'}</th>
                <th className="px-6 py-4 w-[14%] text-center">{language === 'en' ? 'Status' : 'Trạng thái'}</th>
                <th className="px-6 py-4 w-[12%] text-center">{language === 'en' ? 'Actions' : 'Thao tác'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E2D8]">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#181A17] border-t-transparent mb-2"></div>
                    <div>{language === 'en' ? 'Loading quarantine protocols from database...' : 'Đang tải dữ liệu quy định từ cơ sở dữ liệu...'}</div>
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center">
                      <AlertTriangle size={36} className="text-red-500 mb-2" />
                      <h3 className="text-sm font-bold text-slate-800 mb-1">
                        {language === 'en' ? 'Unable to load regulations list' : 'Không thể tải danh mục quy chế'}
                      </h3>
                      <p className="text-xs text-slate-500 mb-4">{fetchError}</p>
                      <button
                        type="button"
                        onClick={fetchRegulations}
                        className="px-4 py-2 bg-[#181A17] hover:bg-[#242722] text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <RotateCcw size={14} /> {language === 'en' ? 'Retry Now' : 'Thử lại ngay'}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : paginatedRegulations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <Info size={32} className="mx-auto text-slate-300 mb-2" />
                    {language === 'en' ? 'No regulations found matching the selected filters.' : 'Không tìm thấy quy định nào phù hợp với bộ lọc đã chọn.'}
                  </td>
                </tr>
              ) : (
                paginatedRegulations.map((reg) => {
                  const isBaseline = reg.country === 'Global Baseline';
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-600">
                        #{reg.id}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          {isBaseline ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FAF8F4] text-[#181A17] border border-[#EAE5DA] text-xs font-bold">
                              🌐 {language === 'en' ? 'Global Baseline (WOAH)' : 'Toàn cầu (WOAH)'}
                            </span>
                          ) : (
                            <span>{translateCountry(reg.country)}</span>
                          )}
                        </div>
                        {reg.borderGate && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
                            <span className="text-[#A67C2E]">📍</span>
                            <span className="truncate max-w-[220px]" title={reg.borderGate}>
                              {reg.borderGate}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800 leading-snug">{translateDocType(reg.docType, reg.title)}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {translateStatus(reg.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(reg)}
                            title={language === 'en' ? 'Edit regulation' : 'Chỉnh sửa quy định'}
                            aria-label={language === 'en' ? `Edit regulation #${reg.id}` : `Chỉnh sửa quy định #${reg.id}`}
                            className="p-2 text-slate-500 hover:text-[#181A17] hover:bg-[#FAF8F4] rounded-lg transition-colors cursor-pointer border border-transparent hover:border-[#C4B38E]/50"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirmItem({
                                id: reg.id,
                                docType: reg.docType,
                                title: reg.title,
                                country: reg.country,
                              })
                            }
                            disabled={deletingId === reg.id}
                            title={language === 'en' ? 'Delete regulation' : 'Xóa quy định'}
                            aria-label={language === 'en' ? `Delete regulation #${reg.id}` : `Xóa quy định #${reg.id}`}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer border border-transparent hover:border-red-200"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* BOTTOM PAGINATION CONTROLLER */}
        {!isLoading && !fetchError && totalItems > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-slate-600 flex-wrap">
            {/* Left: Summary */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span>
                {language === 'en' ? (
                  <>
                    Showing <strong className="text-slate-900 font-bold">{(validPage - 1) * pageSize + 1}</strong> -{' '}
                    <strong className="text-slate-900 font-bold">{Math.min(validPage * pageSize, totalItems)}</strong> of{' '}
                    <strong className="text-slate-900 font-bold">{totalItems}</strong> regulations
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </span>

              {/* Rows per page selector */}
              <div className="flex items-center gap-1.5 sm:ml-3">
                <label htmlFor="regs-page-size" className="text-slate-500">{language === 'en' ? 'Rows/page:' : 'Số dòng/trang:'}</label>
                <select
                  id="regs-page-size"
                  aria-label={language === 'en' ? 'Rows per page' : 'Số dòng mỗi trang'}
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
            <div className="flex items-center gap-1 flex-wrap">
              {/* Previous Button */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage <= 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ChevronLeft size={14} /> {language === 'en' ? 'Prev' : 'Trước'}
              </button>

              {/* Page Number Chips */}
              <div className="flex items-center gap-1 mx-1 flex-wrap">
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
                      type="button"
                      key={`page-${p}`}
                      aria-current={isCurrent ? 'page' : undefined}
                      onClick={() => setCurrentPage(Number(p))}
                      className={`min-w-8 h-8 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[#181A17] text-white shadow-sm'
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
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {language === 'en' ? 'Next' : 'Sau'} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Áp dụng bộ mẫu quy định khu vực (Regional Presets) */}
      {isPresetModalOpen && (
        <Modal
          isOpen={isPresetModalOpen}
          onClose={() => {
            if (!isApplyingPreset) setIsPresetModalOpen(false);
          }}
          closeDisabled={isApplyingPreset}
          title={language === 'en' ? 'Apply Regional Quarantine Preset' : 'Áp dụng mẫu quy chuẩn khu vực'}
          subtitle={
            language === 'en'
              ? 'Automatically initialize a complete set of international veterinary & customs certificates with 1 click.'
              : 'Tự động khởi tạo trọn bộ chứng chỉ kiểm dịch thú y & hải quan chuẩn quốc tế chỉ với 1 click.'
          }
          maxWidth="720px"
        >
          <form onSubmit={handleApplyPreset} className="flex flex-col gap-5 pt-1">
            {/* Template Selector Cards */}
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                {language === 'en' ? '1. Select regional protocol template:' : '1. Chọn bộ quy chuẩn khu vực:'}
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {presets.map((preset) => {
                  const isSelected = selectedPresetKey === preset.key;
                  return (
                    <button
                      type="button"
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
                      className={`p-3.5 rounded-xl border text-left w-full cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#A67C2E] bg-[#FAF8F4] shadow-sm ring-1 ring-[#A67C2E]/30'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {preset.name}
                        </span>
                        {isSelected && (
                          <CheckCircle2 size={16} className="text-[#A67C2E] shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {preset.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#181A17]">
                        <span>
                          {preset.items.length}{' '}
                          {language === 'en' ? 'mandatory document types' : 'loại chứng từ bắt buộc'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Country Input */}
            <div>
              <label htmlFor="preset-target-country" className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                {language === 'en' ? '2. Target country or destination route:' : '2. Quốc gia hoặc Tuyến đích áp dụng:'}
              </label>
              <input
                id="preset-target-country"
                type="text"
                placeholder={
                  language === 'en'
                    ? 'Enter country name, e.g. Qatar, Japan, Malaysia...'
                    : 'Nhập tên quốc gia, VD: Qatar, Nhật Bản, Malaysia...'
                }
                value={targetPresetCountry}
                onChange={(e) => setTargetPresetCountry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E] font-semibold"
                required
              />

              {/* Recommended chips for this preset */}
              {selectedPresetObj?.recommendedCountries && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] font-medium text-slate-400">
                    {language === 'en' ? 'Quick suggestions:' : 'Gợi ý nhanh:'}
                  </span>
                  {selectedPresetObj.recommendedCountries.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTargetPresetCountry(c)}
                      className={`text-xs px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        targetPresetCountry === c
                          ? 'bg-[#181A17] text-white font-bold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {translateCountry(c)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live Document Preview Box */}
            {selectedPresetObj && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between flex-wrap gap-1">
                  <span>
                    {language === 'en'
                      ? `Preview documents to be created (${selectedPresetObj.items.length}):`
                      : `Xem trước danh mục chứng chỉ sẽ tạo (${selectedPresetObj.items.length}):`}
                  </span>
                  <span className="text-[11px] font-normal text-slate-500">
                    {language === 'en' ? 'Applied to: ' : 'Áp dụng cho: '}
                    <strong>{targetPresetCountry ? translateCountry(targetPresetCountry) : (language === 'en' ? 'Selected country' : 'Quốc gia đã chọn')}</strong>
                  </span>
                </div>
                <div className="space-y-1.5">
                  {selectedPresetObj.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-white p-2 rounded-lg border border-slate-100 flex items-start gap-2"
                    >
                      <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0 font-semibold">
                        {translateDocType(item.documentType)}
                      </span>
                      <span className="text-slate-700 leading-snug">
                        {translateDocType(item.documentType, item.description)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={isApplyingPreset}
                onClick={() => setIsPresetModalOpen(false)}
              >
                {language === 'en' ? 'Cancel' : 'Hủy bỏ'}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isApplyingPreset || !targetPresetCountry.trim()}
              >
                {isApplyingPreset
                  ? language === 'en'
                    ? 'Applying...'
                    : 'Đang tạo...'
                  : language === 'en'
                  ? 'Apply Preset Template'
                  : 'Áp dụng bộ mẫu vào hệ thống'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Thêm quy định đơn lẻ (Custom Protocol) */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          closeDisabled={isSubmitting}
          title={language === 'en' ? 'Add Custom Quarantine Protocol' : 'Thêm Quy định Kiểm dịch Riêng lẻ'}
          subtitle={
            language === 'en'
              ? 'Create custom regulatory document requirements by destination country and effective date.'
              : 'Tạo thêm yêu cầu chứng từ pháp lý đặc thù theo quốc gia đích và ngày có hiệu lực.'
          }
          maxWidth="560px"
        >
          <form onSubmit={handleAddRegulation} className="flex flex-col gap-4">
            <div>
              <label htmlFor="add-reg-country" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Destination Country' : 'Quốc gia đích'} <span className="text-red-500">*</span>
              </label>
              <input
                id="add-reg-country"
                type="text"
                placeholder={
                  language === 'en'
                    ? 'e.g. Singapore, Qatar, Malaysia, Hong Kong, Vietnam'
                    : 'VD: Singapore, Qatar, Malaysia, Hong Kong, Vietnam'
                }
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E] font-medium"
                required
              />
            </div>

            <div>
              <label htmlFor="add-reg-doctype" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Document Type Identifier' : 'Mã loại chứng từ'} <span className="text-red-500">*</span>
              </label>
              <input
                id="add-reg-doctype"
                type="text"
                placeholder={language === 'en' ? 'e.g. horse_passport, import_permit, coggins_test' : 'VD: horse_passport, import_permit, coggins_test'}
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E] font-mono text-[#181A17]"
                required
              />
            </div>

            <div>
              <label htmlFor="add-reg-desc" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Title & Detailed Requirement' : 'Tiêu đề & Yêu cầu chi tiết'} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="add-reg-desc"
                rows={3}
                placeholder={
                  language === 'en'
                    ? 'e.g. Equine influenza vaccination certificate issued by official vet authority within 60 days...'
                    : 'VD: Giấy chứng nhận tiêm phòng Cúm ngựa do cơ quan thú y cấp trong vòng 60 ngày...'
                }
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E] resize-none font-medium"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="add-reg-border-gate" className="text-xs font-semibold text-slate-800 block mb-1">
                  {language === 'en' ? 'Border Gate / Airport Code' : 'Cửa khẩu / Mã sân bay'}
                </label>
                <input
                  id="add-reg-border-gate"
                  type="text"
                  placeholder="SIN, Mộc Bài..."
                  value={newBorderGate}
                  onChange={(e) => setNewBorderGate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E]"
                />
              </div>
              <div>
                <label htmlFor="add-reg-mode" className="text-xs font-semibold text-slate-800 block mb-1">
                  {language === 'en' ? 'Transport Mode' : 'Phương thức'}
                </label>
                <select
                  id="add-reg-mode"
                  value={newTransportMode}
                  onChange={(e) => setNewTransportMode(e.target.value as 'road' | 'air' | 'both')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E] bg-white"
                >
                  <option value="both">{language === 'en' ? 'Both (Road & Air)' : 'Cả đường bộ & hàng không'}</option>
                  <option value="road">{language === 'en' ? 'Road Only' : 'Đường bộ'}</option>
                  <option value="air">{language === 'en' ? 'Air Only' : 'Hàng không'}</option>
                </select>
              </div>
              <div>
                <label htmlFor="add-reg-tier" className="text-xs font-semibold text-slate-800 block mb-1">
                  {language === 'en' ? 'Document Tier' : 'Tầng hồ sơ'}
                </label>
                <select
                  id="add-reg-tier"
                  value={newDocTier}
                  onChange={(e) => setNewDocTier(e.target.value as 'A' | 'B')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E] bg-white"
                >
                  <option value="A">{language === 'en' ? 'Tier A (Long-term / Permits)' : 'Tầng A (Giấy phép dài hạn)'}</option>
                  <option value="B">{language === 'en' ? 'Tier B (Short-term Quarantine D-1)' : 'Tầng B (Kiểm dịch ngắn hạn D-1)'}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="add-reg-lead" className="text-xs font-semibold text-slate-800 block mb-1">
                    {language === 'en' ? 'Lead (days)' : 'Lead (ngày)'}
                  </label>
                  <input
                    id="add-reg-lead"
                    type="number"
                    min={0}
                    max={180}
                    value={newLeadTimeDays}
                    onChange={(e) => setNewLeadTimeDays(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E]"
                  />
                </div>
                <div>
                  <label htmlFor="add-reg-buffer" className="text-xs font-semibold text-slate-800 block mb-1">
                    {language === 'en' ? 'Buffer (hrs)' : 'Biên (giờ)'}
                  </label>
                  <input
                    id="add-reg-buffer"
                    type="number"
                    min={0}
                    max={720}
                    value={newBufferHours}
                    onChange={(e) => setNewBufferHours(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E]"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newRequiresAuth}
                onChange={(e) => setNewRequiresAuth(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>
                {language === 'en'
                  ? 'Requires 2-Tier Authority Approval (AVS / Veterinary / Customs)'
                  : 'Bắt buộc phê duyệt Tầng 2 từ Cơ quan chức năng (AVS / Cục Thú y / Hải quan)'}
              </span>
            </label>

            <div>
              <label htmlFor="add-reg-effective-date" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Effective Date' : 'Ngày bắt đầu có hiệu lực'}
              </label>
              <input
                id="add-reg-effective-date"
                type="date"
                value={newEffectiveDate}
                onChange={(e) => setNewEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#C4B38E]"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 mt-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={handleModalClose}>
                {language === 'en' ? 'Cancel' : 'Hủy bỏ'}
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting
                  ? language === 'en'
                    ? 'Saving...'
                    : 'Đang lưu...'
                  : language === 'en'
                  ? 'Save Protocol'
                  : 'Lưu quy định'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Chỉnh sửa quy định kiểm dịch */}
      {editingReg && (
        <Modal
          isOpen={!!editingReg}
          onClose={() => {
            if (!isSavingEdit) setEditingReg(null);
          }}
          closeDisabled={isSavingEdit}
          title={language === 'en' ? `Edit Regulation #${editingReg.id}` : `Chỉnh sửa quy định #${editingReg.id}`}
          subtitle={language === 'en' ? 'Update country, document identifier, requirement details, or effective date.' : 'Cập nhật quốc gia, mã chứng từ, mô tả yêu cầu hoặc ngày hiệu lực.'}
          maxWidth="540px"
        >
          <form onSubmit={handleSaveEdit} className="flex flex-col gap-4 pt-1">
            <div>
              <label htmlFor="edit-reg-country" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Country' : 'Quốc gia'} <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-reg-country"
                type="text"
                value={editCountry}
                onChange={(e) => setEditCountry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17]"
                required
              />
            </div>

            <div>
              <label htmlFor="edit-reg-doctype" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Document Type Identifier' : 'Mã loại chứng từ'} <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-reg-doctype"
                type="text"
                value={editDocType}
                onChange={(e) => setEditDocType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17] font-mono"
                required
              />
            </div>

            <div>
              <label htmlFor="edit-reg-desc" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Title & Detailed Requirement' : 'Tiêu đề & Yêu cầu chi tiết'}
              </label>
              <textarea
                id="edit-reg-desc"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17] resize-none font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-reg-border-gate" className="text-xs font-semibold text-slate-800 block mb-1">
                  {language === 'en' ? 'Border Gate / Airport Code' : 'Cửa khẩu / Mã sân bay'}
                </label>
                <input
                  id="edit-reg-border-gate"
                  type="text"
                  placeholder="SIN, Mộc Bài..."
                  value={editBorderGate}
                  onChange={(e) => setEditBorderGate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17]"
                />
              </div>
              <div>
                <label htmlFor="edit-reg-mode" className="text-xs font-semibold text-slate-800 block mb-1">
                  {language === 'en' ? 'Transport Mode' : 'Phương thức'}
                </label>
                <select
                  id="edit-reg-mode"
                  value={editTransportMode}
                  onChange={(e) => setEditTransportMode(e.target.value as 'road' | 'air' | 'both')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17] bg-white"
                >
                  <option value="both">{language === 'en' ? 'Both' : 'Cả hai'}</option>
                  <option value="road">{language === 'en' ? 'Road' : 'Đường bộ'}</option>
                  <option value="air">{language === 'en' ? 'Air' : 'Hàng không'}</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-reg-tier" className="text-xs font-semibold text-slate-800 block mb-1">
                  {language === 'en' ? 'Document Tier' : 'Tầng hồ sơ'}
                </label>
                <select
                  id="edit-reg-tier"
                  value={editDocTier}
                  onChange={(e) => setEditDocTier(e.target.value as 'A' | 'B')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17] bg-white"
                >
                  <option value="A">Tier A</option>
                  <option value="B">Tier B</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="edit-reg-lead" className="text-xs font-semibold text-slate-800 block mb-1">
                    {language === 'en' ? 'Lead (days)' : 'Lead (ngày)'}
                  </label>
                  <input
                    id="edit-reg-lead"
                    type="number"
                    min={0}
                    max={180}
                    value={editLeadTimeDays}
                    onChange={(e) => setEditLeadTimeDays(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17]"
                  />
                </div>
                <div>
                  <label htmlFor="edit-reg-buffer" className="text-xs font-semibold text-slate-800 block mb-1">
                    {language === 'en' ? 'Buffer (hrs)' : 'Biên (giờ)'}
                  </label>
                  <input
                    id="edit-reg-buffer"
                    type="number"
                    min={0}
                    max={720}
                    value={editBufferHours}
                    onChange={(e) => setEditBufferHours(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17]"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editRequiresAuth}
                onChange={(e) => setEditRequiresAuth(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>
                {language === 'en'
                  ? 'Requires 2-Tier Authority Approval'
                  : 'Bắt buộc phê duyệt Tầng 2 từ Cơ quan chức năng'}
              </span>
            </label>

            <div>
              <label htmlFor="edit-reg-effective-date" className="text-sm font-semibold text-slate-800 block mb-1">
                {language === 'en' ? 'Effective Date' : 'Ngày hiệu lực'}
              </label>
              <input
                id="edit-reg-effective-date"
                type="date"
                value={editEffectiveDate}
                onChange={(e) => setEditEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-[#181A17]"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setEditingReg(null)} disabled={isSavingEdit}>
                {language === 'en' ? 'Cancel' : 'Hủy bỏ'}
              </Button>
              <Button type="submit" variant="primary" disabled={isSavingEdit} className="bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E]">
                {isSavingEdit ? (language === 'en' ? 'Saving...' : 'Đang lưu...') : (language === 'en' ? 'Save Changes' : 'Lưu thay đổi')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Modal for Delete Regulation (Replacing window.confirm) */}
      {deleteConfirmItem && (
        <Modal
          isOpen={!!deleteConfirmItem}
          onClose={() => {
            if (deletingId !== deleteConfirmItem.id) setDeleteConfirmItem(null);
          }}
          closeDisabled={deletingId === deleteConfirmItem.id}
          title={language === 'en' ? 'Confirm Delete Quarantine Protocol' : 'Xác nhận xóa quy chế kiểm dịch'}
          subtitle={
            language === 'en'
              ? 'This action will remove the regulation from the quarantine directory and cannot be undone.'
              : 'Hành động này sẽ loại bỏ quy định khỏi danh mục kiểm dịch và không thể hoàn tác.'
          }
          maxWidth="460px"
        >
          <div className="flex flex-col gap-4 pt-1">
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5">
              <AlertTriangle size={18} className="shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold m-0 text-red-900">
                  {language === 'en'
                    ? `Are you sure you want to delete protocol #${deleteConfirmItem.id}?`
                    : `Bạn có chắc chắn muốn xóa quy chế #${deleteConfirmItem.id}?`}
                </p>
                <p className="mt-1 m-0 text-slate-700">
                  <strong>{language === 'en' ? 'Country:' : 'Quốc gia:'}</strong> {translateCountry(deleteConfirmItem.country)}
                </p>
                <p className="mt-0.5 m-0 text-slate-700">
                  <strong>{language === 'en' ? 'Content:' : 'Nội dung:'}</strong> {translateDocType(deleteConfirmItem.docType, deleteConfirmItem.title)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={deletingId === deleteConfirmItem.id}
                onClick={() => setDeleteConfirmItem(null)}
              >
                {language === 'en' ? 'Cancel' : 'Hủy bỏ'}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={deletingId === deleteConfirmItem.id}
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {deletingId === deleteConfirmItem.id
                  ? language === 'en'
                    ? 'Deleting...'
                    : 'Đang xóa...'
                  : language === 'en'
                  ? 'Confirm Delete'
                  : 'Xác nhận xóa quy chế'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
