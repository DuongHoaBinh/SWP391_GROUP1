'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle,
  Download,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Plus,
  Filter,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { useDocumentStore, SpecialistDossier } from '@/lib/document-store';
import { documentsApi } from '@/features/documents/api/documents.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

interface ExportHorseIdentity {
  horseName: string;
  microchipNo: string;
  passportNo: string;
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function TransportDocumentsPage() {
  const { t, language, translateDocType } = useLanguage();
  const isEn = language === 'en';
  const { dossiers, createDossier, pendingDocs } = useDocumentStore();

  const [realDossiers, setRealDossiers] = useState<SpecialistDossier[]>([]);
  const [hasLoadedApi, setHasLoadedApi] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'In Progress' | 'Complete'>('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [reqCode, setReqCode] = useState('');
  const [horse, setHorse] = useState('');
  const [destination, setDestination] = useState('');
  const [totalDocs, setTotalDocs] = useState(4);

  // Export Modal state
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportDossier, setExportDossier] = useState<SpecialistDossier | null>(null);
  const [exportedDocsList, setExportedDocsList] = useState<any[]>([]);
  const [exportedHorsesList, setExportedHorsesList] = useState<ExportHorseIdentity[]>([]);
  const [isLoadingExportDocs, setIsLoadingExportDocs] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('search');
      if (q) setSearchQuery(q);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!showFilterMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFilterMenu(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showFilterMenu]);

  const fetchRealData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const orders = await documentsApi.getComplianceOrders();
      setHasLoadedApi(true);
      if (Array.isArray(orders)) {
        const mapped: SpecialistDossier[] = orders.map((o) => {
          const total = o.totalRequiredDocs || 0;
          const approved = o.approvedDocsCount || 0;
          return {
            id: `DOS-${o.requestCode}`,
            orderId: o.orderId,
            reqCode: o.requestCode,
            horse: o.horseNames || '—',
            destination: o.destinationLocation || o.destinationCountry || '—',
            status: o.isFullyCompliant ? 'Complete' : 'In Progress',
            approvedDocs: approved,
            totalDocs: total,
            docs: `${approved}/${total}`,
            lastUpdated: o.createdAt,
          } as SpecialistDossier & { orderId?: number };
        });
        setRealDossiers(mapped);
      }
    } catch (err: any) {
      setFetchError(
        err?.message ||
          (isEn ? 'Failed to load transport dossiers from server.' : 'Không thể tải danh sách túi hồ sơ từ máy chủ.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  const activeDossiers = hasLoadedApi ? realDossiers : dossiers;

  const filteredDossiers = activeDossiers.filter((dos) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      dos.id.toLowerCase().includes(q) ||
      dos.horse.toLowerCase().includes(q) ||
      dos.destination.toLowerCase().includes(q) ||
      dos.reqCode.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || dos.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getDocBreakdown = (dos: SpecialistDossier) => {
    const approved = dos.approvedDocs || 0;
    const pending = (pendingDocs || []).filter((p) => {
      if ((dos as any).orderId && (p as any).orderId) return (p as any).orderId === (dos as any).orderId;
      if (dos.reqCode && p.reqCode) return p.reqCode.toLowerCase() === dos.reqCode.toLowerCase();
      return p.horseName?.toLowerCase() === dos.horse?.toLowerCase();
    }).length;
    const missing = Math.max(0, (dos.totalDocs || 0) - approved - pending);
    return { approved, pending, missing };
  };

  const resetCreateForm = () => {
    setReqCode('');
    setHorse('');
    setDestination('');
    setTotalDocs(4);
  };

  const handleCloseCreateModal = () => {
    setIsCreateOpen(false);
    resetCreateForm();
  };

  const handleCreateDossier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqCode.trim() || !horse.trim() || !destination.trim()) {
      toast.error(isEn ? 'Please fill in all required fields.' : 'Vui lòng điền đầy đủ các thông tin bắt buộc.');
      return;
    }

    const created = createDossier({
      reqCode: reqCode.trim().toUpperCase(),
      horse: horse.trim(),
      destination: destination.trim(),
      totalDocs: Number(totalDocs) || 4,
    });

    setRealDossiers((prev) => [created, ...prev]);

    toast.success(
      isEn
        ? `Successfully created transport dossier DOS-${reqCode.trim().toUpperCase()}!`
        : `Đã tạo hồ sơ vận chuyển DOS-${reqCode.trim().toUpperCase()} thành công!`
    );
    handleCloseCreateModal();
  };

  const buildFallbackHorses = (dos: SpecialistDossier): ExportHorseIdentity[] => {
    const names = (dos.horse || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return (names.length > 0 ? names : [isEn ? 'Transport Horse' : 'Ngựa vận chuyển']).map((horseName) => ({
      horseName,
      microchipNo: '',
      passportNo: '',
    }));
  };

  const handleOpenExport = async (dos: SpecialistDossier) => {
    setExportDossier(dos);
    setIsExportOpen(true);
    setIsLoadingExportDocs(true);
    setExportError(null);
    setExportedDocsList([]);
    setExportedHorsesList([]);

    try {
      let orderId = (dos as any).orderId;
      if (!orderId) {
        const match = dos.reqCode.match(/-(\d+)$/);
        if (match) {
          orderId = parseInt(match[1], 10);
        } else {
          const parts = dos.reqCode.split('-');
          const last = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(last)) orderId = last;
        }
      }

      if (orderId && !isNaN(orderId)) {
        const checklist = await documentsApi.getOrderComplianceChecklist(orderId);
        const compiled: any[] = [];
        const horsesIdentity: ExportHorseIdentity[] = [];
        if (checklist?.horses && Array.isArray(checklist.horses)) {
          checklist.horses.forEach((h: any) => {
            const microchipNo = h.microchipNo ? String(h.microchipNo).trim() : '';
            const passportNo = h.passportNo ? String(h.passportNo).trim() : '';
            horsesIdentity.push({
              horseName: h.horseName || dos.horse,
              microchipNo,
              passportNo,
            });
            const hDocs = h.documents || [];
            hDocs.forEach((d: any) => {
              const docStatus = (d.status || 'submitted').toLowerCase();
              compiled.push({
                horseName: h.horseName,
                microchipNo,
                passportNo,
                docType: d.docType,
                title: d.regulationTitle || translateDocType(d.regulationDocType || d.docType),
                docNumber: docStatus === 'approved' ? (d.docNumber ? String(d.docNumber).trim() : '') : '',
                status: docStatus,
              });
            });
            const hMissing = h.missingRegulations || [];
            hMissing.forEach((m: any) => {
              compiled.push({
                horseName: h.horseName,
                microchipNo,
                passportNo,
                docType: m.documentType,
                title: m.description || translateDocType(m.documentType),
                docNumber: '',
                status: 'missing',
              });
            });
          });
        }
        setExportedHorsesList(horsesIdentity.length > 0 ? horsesIdentity : buildFallbackHorses(dos));
        setExportedDocsList(compiled);
        if (compiled.length === 0) {
          setExportError(
            isEn
              ? 'This dossier has no submitted or required regulatory documents to extract.'
              : 'Túi hồ sơ hiện chưa có chứng từ kiểm dịch nào để trích xuất.'
          );
        }
      } else {
        setExportedHorsesList(buildFallbackHorses(dos));
        setExportedDocsList([]);
        setExportError(
          isEn
            ? 'Unable to resolve linked transport order ID for this dossier.'
            : 'Không xác định được mã đơn vận chuyển liên kết với hồ sơ này.'
        );
      }
    } catch (err: any) {
      setExportedHorsesList(buildFallbackHorses(dos));
      setExportedDocsList([]);
      setExportError(
        err?.message ||
          (isEn
            ? 'Failed to retrieve verified compliance checklist from server.'
            : 'Không thể tải danh mục kiểm dịch xác thực từ máy chủ.')
      );
    } finally {
      setIsLoadingExportDocs(false);
    }
  };

  const getDocStatusMeta = (status?: string) => {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return {
          modalLabel: isEn ? '✓ APPROVED' : '✓ ĐÃ DUYỆT',
          modalClass: 'bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]',
          pdfLabel: isEn ? '✓ APPROVED' : '✓ ĐÃ DUYỆT',
          pdfClass: 'badge-approved',
          txtLabel: 'APPROVED',
        };
      case 'submitted':
        return {
          modalLabel: isEn ? '⏳ PENDING' : '⏳ CHỜ DUYỆT',
          modalClass: 'bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]',
          pdfLabel: isEn ? '⏳ PENDING' : '⏳ CHỜ DUYỆT',
          pdfClass: 'badge-pending',
          txtLabel: 'PENDING REVIEW',
        };
      case 'rejected':
        return {
          modalLabel: isEn ? '✕ REJECTED' : '✕ TỪ CHỐI',
          modalClass: 'bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]',
          pdfLabel: isEn ? '✕ REJECTED' : '✕ TỪ CHỐI',
          pdfClass: 'badge-rejected',
          txtLabel: 'REJECTED',
        };
      case 'expired':
        return {
          modalLabel: isEn ? '⚠ EXPIRED' : '⚠ HẾT HẠN',
          modalClass: 'bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]',
          pdfLabel: isEn ? '⚠ EXPIRED' : '⚠ HẾT HẠN',
          pdfClass: 'badge-rejected',
          txtLabel: 'EXPIRED',
        };
      default:
        return {
          modalLabel: isEn ? '○ MISSING' : '○ CHƯA NỘP',
          modalClass: 'bg-[#F0EEE8] text-[#5C6658] border border-[#D8CEBE]',
          pdfLabel: isEn ? '○ MISSING' : '○ CHƯA NỘP',
          pdfClass: 'badge-missing',
          txtLabel: 'MISSING',
        };
    }
  };

  const getResolvedExportData = (dos: SpecialistDossier) => {
    const horsesToRender = exportedHorsesList.length > 0 ? exportedHorsesList : buildFallbackHorses(dos);
    const primaryHorse = horsesToRender[0] || { horseName: dos.horse, microchipNo: '', passportNo: '' };
    const docsToRender = exportedDocsList;

    const approvedCount = docsToRender.filter((d) => d.status === 'approved').length;
    const totalCount = docsToRender.length;
    const isFullyApproved = totalCount > 0 && approvedCount >= totalCount;

    const metaMicrochipDisplay =
      horsesToRender.length <= 1
        ? primaryHorse.microchipNo || '—'
        : horsesToRender.some((h) => Boolean(h.microchipNo))
        ? horsesToRender.map((h) => `${h.horseName}: ${h.microchipNo || '—'}`).join(' | ')
        : '—';

    const metaPassportDisplay =
      horsesToRender.length <= 1
        ? primaryHorse.passportNo || '—'
        : horsesToRender.some((h) => Boolean(h.passportNo))
        ? horsesToRender.map((h) => `${h.horseName}: ${h.passportNo || '—'}`).join(' | ')
        : '—';

    return {
      horsesToRender,
      docsToRender,
      approvedCount,
      totalCount,
      isFullyApproved,
      metaMicrochipDisplay,
      metaPassportDisplay,
    };
  };

  const handleExportPDF = () => {
    if (!exportDossier) return;
    if (exportedDocsList.length === 0) {
      toast.error(
        isEn
          ? 'Safety warning: Cannot export PDF when dossier has no documents!'
          : 'Cảnh báo an toàn: Không thể xuất file PDF khi hồ sơ không có chứng từ thực tế!'
      );
      return;
    }

    const printWindow = window.open('', '_blank', 'width=950,height=850');
    if (!printWindow) {
      toast.error(
        isEn
          ? 'Please allow popups to view and save the PDF file.'
          : 'Vui lòng cho phép trình duyệt mở cửa sổ bật lên để xem và lưu file PDF.'
      );
      return;
    }

    const {
      docsToRender,
      approvedCount,
      totalCount,
      isFullyApproved,
      metaMicrochipDisplay,
      metaPassportDisplay,
    } = getResolvedExportData(exportDossier);
    const specialistName = getCurrentUser()?.name || (isEn ? 'Quarantine Specialist' : 'Chuyên viên kiểm dịch');

    const htmlContent = `
<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'vi'}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(exportDossier.id)}_Official_Equine_Transport_Dossier</title>
  <style>
    @page { size: A4; margin: 12mm 15mm; }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      color: #181A17;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.45;
    }
    .print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #FAF8F4;
      border: 1px solid #D8CEBE;
      border-radius: 8px;
      padding: 10px 16px;
      margin-bottom: 24px;
    }
    .btn-print {
      background: #181A17;
      color: #FAF8F4;
      border: none;
      border-radius: 6px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2.5px solid #A67C2E;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .brand-wrap { display: flex; align-items: center; gap: 12px; }
    .brand-logo {
      width: 44px; height: 44px; background: #181A17; color: #B49A68;
      border: 1px solid #B49A68; border-radius: 8px; display: flex;
      align-items: center; justify-content: center; font-size: 22px; font-weight: 900;
    }
    .brand-text h1 { font-size: 18px; font-weight: 800; color: #181A17; margin: 0; text-transform: uppercase; }
    .brand-text p { font-size: 11px; color: #5C6658; font-weight: 600; margin: 2px 0 0 0; }
    .badge-dossier {
      background: #FAF8F4; border: 1.5px solid #B49A68; color: #181A17;
      padding: 6px 14px; border-radius: 8px; text-align: right;
    }
    .doc-headline { text-align: center; margin: 16px 0 20px 0; }
    .doc-headline h2 { font-size: 18px; font-weight: 800; color: #181A17; text-transform: uppercase; margin: 0; }
    .doc-headline p { font-size: 11.5px; color: #5C6658; margin: 4px 0 0 0; }
    .meta-box {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px;
      background: #FAF8F4; border: 1px solid #D8CEBE; border-radius: 8px;
      padding: 12px 18px; margin-bottom: 20px; font-size: 12px;
    }
    .meta-item { display: flex; align-items: baseline; gap: 8px; }
    .meta-item .lbl { color: #5C6658; font-weight: 600; min-width: 140px; }
    .meta-item .val { color: #181A17; font-weight: bold; }
    .table-container { margin-bottom: 24px; }
    .table-title { font-size: 13px; font-weight: 700; color: #242722; text-transform: uppercase; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th { background: #F0EEE8; color: #242722; font-weight: 700; text-align: left; padding: 8px 10px; border: 1px solid #D8CEBE; }
    td { padding: 7px 10px; border: 1px solid #D8CEBE; vertical-align: middle; }
    tr:nth-child(even) td { background: #FAF9F5; }
    .badge-approved { display: inline-block; padding: 2px 7px; border-radius: 4px; background: #E8F2EB; color: #287653; font-size: 10.5px; font-weight: 700; border: 1px solid #B7DBC4; }
    .badge-pending { display: inline-block; padding: 2px 7px; border-radius: 4px; background: #F8F0DF; color: #966516; font-size: 10.5px; font-weight: 700; border: 1px solid #DFCA9A; }
    .badge-rejected { display: inline-block; padding: 2px 7px; border-radius: 4px; background: #F8EAEA; color: #B33E3E; font-size: 10.5px; font-weight: 700; border: 1px solid #E5B8B8; }
    .badge-missing { display: inline-block; padding: 2px 7px; border-radius: 4px; background: #F0EEE8; color: #5C6658; font-size: 10.5px; font-weight: 700; border: 1px solid #D8CEBE; }
    .legal-auth {
      background: #FAF8F4; border: 1px solid #D8CEBE; border-left: 4px solid #A67C2E;
      border-radius: 4px; padding: 10px 14px; font-size: 11px; color: #242722; margin-bottom: 24px;
    }
    .footer-seal-wrap { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 10px; }
    .seal-stamp { border: 2px dashed #287653; background: #E8F2EB; color: #287653; padding: 10px 16px; border-radius: 8px; text-align: center; max-width: 260px; }
    .seal-stamp .seal-hd { font-weight: 900; font-size: 12px; text-transform: uppercase; }
    .seal-stamp .seal-sub { font-size: 9.5px; margin-top: 3px; }
    .sign-box { text-align: center; min-width: 220px; font-size: 11.5px; }
    .sign-space { height: 48px; }
    @media print { .print-bar { display: none !important; } body { padding: 0 !important; } }
  </style>
</head>
<body>
  <div class="print-bar">
    <span style="font-size: 13px; color: #5C6658; font-weight: 600;">
      EquiTransit Dossier Manifest (${escapeHtml(exportDossier.id)}) - ${isEn ? 'Ready to print or save as A4 PDF' : 'Sẵn sàng in hoặc lưu PDF chuẩn A4'}
    </span>
    <button class="btn-print" onclick="window.print()">${isEn ? 'Print / Save PDF (Ctrl + P)' : 'In / Lưu file PDF (Ctrl + P)'}</button>
  </div>

  <div class="header">
    <div class="brand-wrap">
      <div class="brand-logo">♞</div>
      <div class="brand-text">
        <h1>EquiTransit Logistics</h1>
        <p>Cross-Border Equine Transport • Veterinary & Quarantine Compliance</p>
      </div>
    </div>
    <div class="badge-dossier">
      <div style="font-size: 14px; font-weight: 800; color: #A67C2E;">${escapeHtml(exportDossier.id)}</div>
      <div style="font-size: 10.5px; font-weight: 600; color: #5C6658;">${isEn ? 'LEGAL & QUARANTINE DOSSIER' : 'HỒ SƠ PHÁP LÝ & KIỂM DỊCH'}</div>
    </div>
  </div>

  <div class="doc-headline">
    <h2>${isEn ? 'Official Cross-Border Equine Transport Dossier' : 'Hồ Sơ Vận Chuyển Ngựa Đua Xuyên Quốc Gia'}</h2>
    <p>${isEn ? 'Quarantine & Customs Compliance Package for International Racehorse Transport' : 'Gói Hồ Sơ Kiểm Dịch & Thủ Tục Hải Quan Vận Chuyển Ngựa Đua Xuyên Quốc Gia'}</p>
  </div>

  <div class="meta-box">
    <div class="meta-item"><span class="lbl">${isEn ? 'Transport Order Code:' : 'Mã đơn vận chuyển:'}</span><span class="val">${escapeHtml(exportDossier.reqCode)}</span></div>
    <div class="meta-item"><span class="lbl">${isEn ? 'Issue Date:' : 'Ngày phát hành:'}</span><span class="val">${escapeHtml(new Date().toLocaleDateString(isEn ? 'en-US' : 'vi-VN'))}</span></div>
    <div class="meta-item"><span class="lbl">${isEn ? 'Transported Horse:' : 'Chiến mã vận chuyển:'}</span><span class="val">${escapeHtml(exportDossier.horse)}</span></div>
    <div class="meta-item"><span class="lbl">${isEn ? 'Quarantine Specialist:' : 'Chuyên viên kiểm dịch:'}</span><span class="val">${escapeHtml(specialistName)}</span></div>
    <div class="meta-item"><span class="lbl">${isEn ? 'Microchip ID:' : 'Mã số Microchip:'}</span><span class="val">${escapeHtml(metaMicrochipDisplay)}</span></div>
    <div class="meta-item"><span class="lbl">${isEn ? 'Passport Number:' : 'Số hộ chiếu FEI:'}</span><span class="val">${escapeHtml(metaPassportDisplay)}</span></div>
    <div class="meta-item"><span class="lbl">${isEn ? 'Route & Destination:' : 'Tuyến đường & Đích đến:'}</span><span class="val">${escapeHtml(exportDossier.destination)}</span></div>
    <div class="meta-item">
      <span class="lbl">${isEn ? 'Dossier Status:' : 'Trạng thái hồ sơ:'}</span>
      <span class="val" style="color: ${isFullyApproved ? '#287653' : '#966516'};">
        ${isFullyApproved ? (isEn ? `COMPLETE (${approvedCount}/${totalCount} approved)` : `HOÀN TẤT (${approvedCount}/${totalCount} hợp lệ)`) : (isEn ? `IN PROGRESS (${approvedCount}/${totalCount} approved)` : `ĐANG THẨM ĐỊNH (${approvedCount}/${totalCount} đã duyệt)`)}
      </span>
    </div>
  </div>

  <div class="table-container">
    <div class="table-title">${isEn ? `Verified Legal & Quarantine Document Manifest (${escapeHtml(docsToRender.length)} documents):` : `Danh mục văn bản kiểm dịch & pháp lý (${escapeHtml(docsToRender.length)} văn bản):`}</div>
    <table>
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">${isEn ? 'No.' : 'STT'}</th>
          <th style="width: 140px;">${isEn ? 'Equine Subject' : 'Cá thể ngựa'}</th>
          <th>${isEn ? 'Document / Certificate Name' : 'Tên văn bản / Giấy chứng nhận kiểm dịch'}</th>
          <th style="width: 130px;">${isEn ? 'Document Number' : 'Số hiệu văn bản'}</th>
          <th style="width: 100px; text-align: center;">${isEn ? 'Status' : 'Trạng thái'}</th>
        </tr>
      </thead>
      <tbody>
        ${docsToRender.map((doc, idx) => {
          const statusMeta = getDocStatusMeta(doc.status);
          return `
          <tr>
            <td style="text-align: center; font-weight: bold; color: #5C6658;">${idx + 1}</td>
            <td style="font-weight: 600; color: #181A17;">${escapeHtml(doc.horseName || exportDossier.horse)}</td>
            <td style="color: #181A17;">${escapeHtml(doc.title)}</td>
            <td style="font-family: monospace; font-size: 11px; color: #5C6658;">${escapeHtml(doc.docNumber || '—')}</td>
            <td style="text-align: center;"><span class="${statusMeta.pdfClass}">${escapeHtml(statusMeta.pdfLabel)}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="legal-auth">
    <strong>${isEn ? 'TRANSIT & DEPARTURE AUTHORIZATION:' : 'XÁC NHẬN ĐỦ ĐIỀU KIỆN KHỞI HÀNH:'}</strong><br />
    ${isEn
      ? 'This compiled transport dossier summarizes the quarantine, veterinary, and customs compliance documents verified under WOAH, FEI, and destination regulatory frameworks.'
      : 'Bộ hồ sơ vận chuyển này tổng hợp tình trạng kiểm dịch thú y, tiêm chủng dịch tễ và khai báo hải quan động vật sống theo quy chuẩn WOAH, FEI và cơ quan kiểm dịch nước nhập cảnh.'
    }
    <br /><br />
    <strong>${isFullyApproved
      ? (isEn ? 'CONCLUSION: CLEARED FOR EMBARKATION AND CROSS-BORDER TRANSPORT.' : 'KẾT LUẬN: ĐỦ ĐIỀU KIỆN XUẤT CẢNH VÀ THỰC HIỆN HÀNH TRÌNH VẬN CHUYỂN.')
      : (isEn ? `CONCLUSION: IN COMPLIANCE REVIEW (${approvedCount}/${totalCount} APPROVED).` : `KẾT LUẬN: ĐANG HOÀN THIỆN THẨM ĐỊNH (${approvedCount}/${totalCount} CHỨNG TỪ ĐÃ DUYỆT).`)}</strong>
  </div>

  <div class="footer-seal-wrap">
    <div class="seal-stamp" style="${isFullyApproved ? '' : 'border-color:#966516;background:#F8F0DF;color:#966516;'}">
      <div class="seal-hd">${isFullyApproved ? '★ EQUITRANSIT VERIFIED ★' : (isEn ? 'COMPLIANCE IN REVIEW' : 'ĐANG THẨM ĐỊNH HỒ SƠ')}</div>
      <div class="seal-sub">${isEn ? 'OFFICIAL QUARANTINE COMPLIANCE<br />LEGAL & BIOSECURITY DEPT' : 'CHỨNG THỰC HỒ SƠ KIỂM DỊCH<br />BỘ PHẬN PHÁP LÝ & AN TOÀN SINH HỌC'}</div>
    </div>

    <div class="sign-box">
      <div style="color: #5C6658;">${isEn ? `Date: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : `Ngày ${escapeHtml(new Date().getDate())} tháng ${escapeHtml(new Date().getMonth() + 1)} năm ${escapeHtml(new Date().getFullYear())}`}</div>
      <div style="font-weight: bold; margin-top: 4px; color: #181A17;">${isEn ? 'AUTHORIZED SPECIALIST SIGNATURE' : 'CHUYÊN VIÊN KIỂM DỊCH KÝ DUYỆT'}</div>
      <div class="sign-space"></div>
      <div style="font-weight: 700; color: #181A17;">${escapeHtml(specialistName)}</div>
      <div style="font-size: 10px; color: #5C6658;">${isEn ? 'Transport Compliance Specialist' : 'Chuyên viên kiểm dịch'}</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExportTXT = () => {
    if (!exportDossier) return;
    if (exportedDocsList.length === 0) {
      toast.error(
        isEn
          ? 'Safety warning: Cannot export Manifest when dossier has no documents!'
          : 'Cảnh báo an toàn: Không thể xuất file Manifest khi hồ sơ không có chứng từ hợp lệ!'
      );
      return;
    }
    toast.success(
      isEn
        ? `Downloading manifest file for ${exportDossier.horse} (${exportDossier.id})...`
        : `Đang tải file văn bản cho ${exportDossier.horse} (${exportDossier.id})...`
    );

    const {
      docsToRender,
      approvedCount,
      totalCount,
      isFullyApproved,
      metaMicrochipDisplay,
      metaPassportDisplay,
    } = getResolvedExportData(exportDossier);
    const specialistName = getCurrentUser()?.name || (isEn ? 'Quarantine Specialist' : 'Chuyên viên kiểm dịch');

    const manifestContent = isEn
      ? `================================================================================
EQUITRANSIT LOGISTICS - OFFICIAL CROSS-BORDER EQUINE TRANSPORT DOSSIER
================================================================================
Dossier Reference ID : ${exportDossier.id}
Transport Order Code : ${exportDossier.reqCode}
Target Equine        : ${exportDossier.horse}
Microchip IDs        : ${metaMicrochipDisplay}
FEI Passports        : ${metaPassportDisplay}
Destination Route    : ${exportDossier.destination}
Compliance Status    : ${isFullyApproved ? 'COMPLETE' : 'IN COMPLIANCE REVIEW'} (${approvedCount}/${totalCount} Approved Documents)
Issued Date          : ${new Date().toLocaleDateString('en-US')}
Certified By         : ${specialistName}

--------------------------------------------------------------------------------
LEGAL & QUARANTINE DOCUMENT CHECKLIST (${docsToRender.length} DOCUMENTS):
--------------------------------------------------------------------------------
${docsToRender.map((d, i) => `${i + 1}. [${getDocStatusMeta(d.status).txtLabel}] [${d.horseName}] ${d.title} (Doc No: ${d.docNumber || '—'})`).join('\n')}

--------------------------------------------------------------------------------
TRANSIT & DEPARTURE AUTHORIZATION:
--------------------------------------------------------------------------------
${isFullyApproved
  ? 'STATUS: CLEARED FOR EMBARKATION AND CROSS-BORDER TRANSPORT.'
  : `STATUS: IN COMPLIANCE REVIEW (${approvedCount}/${totalCount} documents approved).`}
================================================================================`
      : `================================================================================
EQUITRANSIT LOGISTICS - HỒ SƠ VẬN CHUYỂN NGỰA ĐUA XUYÊN QUỐC GIA
================================================================================
Mã túi hồ sơ         : ${exportDossier.id}
Mã đơn vận chuyển    : ${exportDossier.reqCode}
Chiến mã vận chuyển  : ${exportDossier.horse}
Mã Microchip         : ${metaMicrochipDisplay}
Hộ chiếu FEI         : ${metaPassportDisplay}
Tuyến đích           : ${exportDossier.destination}
Trạng thái hồ sơ     : ${isFullyApproved ? 'HOÀN TẤT' : 'ĐANG THẨM ĐỊNH'} (${approvedCount}/${totalCount} văn bản đã duyệt)
Ngày phát hành       : ${new Date().toLocaleDateString('vi-VN')}
Chuyên viên phụ trách: ${specialistName}

--------------------------------------------------------------------------------
DANH MỤC CHỨNG TỪ PHÁP LÝ & KIỂM DỊCH (${docsToRender.length} VĂN BẢN):
--------------------------------------------------------------------------------
${docsToRender.map((d, i) => `${i + 1}. [${getDocStatusMeta(d.status).pdfLabel}] [${d.horseName}] ${d.title} (Số hiệu: ${d.docNumber || '—'})`).join('\n')}

--------------------------------------------------------------------------------
KẾT LUẬN THẨM ĐỊNH:
--------------------------------------------------------------------------------
${isFullyApproved
  ? 'TRẠNG THÁI: ĐỦ ĐIỀU KIỆN XUẤT CẢNH VÀ VẬN CHUYỂN.'
  : `TRẠNG THÁI: ĐANG THẨM ĐỊNH HỒ SƠ (${approvedCount}/${totalCount} chứng từ đã duyệt).`}
================================================================================`;

    try {
      const blob = new Blob([manifestContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exportDossier.id}_Dossier_Manifest.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const approvedExportCount = exportedDocsList.filter((d) => d.status === 'approved').length;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {isEn ? 'Transport Dossiers' : 'Túi Hồ Sơ Vận Chuyển'}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17] border border-[#D8CEBE]">
              {activeDossiers.length} {isEn ? 'Total' : 'Tổng số'}
            </span>
          </div>
          <p className="text-sm text-[#5C6658] mt-1 mb-0">
            {isEn
              ? 'Compile and manage legal, veterinary, and customs document packages for transport shipments.'
              : 'Tổng hợp và quản lý bộ chứng từ pháp lý, kiểm dịch cho các đơn vận chuyển.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchRealData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-[#242722] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            {isEn ? 'Refresh' : 'Làm mới'}
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="bg-[#181A17] hover:bg-[#242722] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2 cursor-pointer border-0"
          >
            <Plus size={16} /> {isEn ? 'Create New Dossier' : 'Tạo túi hồ sơ mới'}
          </button>
        </div>
      </div>

      {fetchError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-[#B33E3E] text-xs font-semibold flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{fetchError}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={fetchRealData}>
            {isEn ? 'Retry' : 'Thử lại'}
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#D8CEBE] shadow-sm">
        <div className="p-4 border-b border-[#D8CEBE] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-[#FAF9F5] rounded-t-xl">
          <div className="flex items-center bg-white border border-[#D8CEBE] rounded-lg px-3 py-1.5 w-full sm:w-72 shadow-sm focus-within:border-[#A67C2E]">
            <Search size={16} className="text-[#7E867B] mr-2 shrink-0" />
            <input
              type="text"
              aria-label={isEn ? 'Search dossiers' : 'Tìm hồ sơ'}
              placeholder={isEn ? 'Search by horse name, order code...' : 'Tìm theo tên ngựa, mã đơn...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-sm w-full bg-transparent text-[#181A17]"
            />
          </div>
          <div className="relative self-end sm:self-auto">
            <button
              type="button"
              aria-expanded={showFilterMenu}
              aria-haspopup="menu"
              onClick={() => setShowFilterMenu((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                statusFilter !== 'ALL'
                  ? 'border-[#A67C2E] text-[#7A591C] bg-[#FAF8F4]'
                  : 'border-[#D8CEBE] text-[#242722] bg-white hover:bg-[#FAF8F4]'
              }`}
            >
              <Filter size={14} />{' '}
              {statusFilter === 'ALL'
                ? isEn
                  ? 'Filter status'
                  : 'Lọc trạng thái'
                : statusFilter === 'Complete'
                ? t('specialist.completeCompliance', 'Hoàn tất')
                : t('specialist.inProgressCompliance', 'Đang thẩm định')}
            </button>
            {showFilterMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 bg-white border border-[#D8CEBE] rounded-xl shadow-lg p-2 z-20"
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-0 ${
                      statusFilter === 'ALL'
                        ? 'bg-[#FAF8F4] text-[#7A591C]'
                        : 'text-[#242722] bg-transparent hover:bg-[#F0EEE8]'
                    }`}
                  >
                    {isEn ? 'All Statuses' : 'Tất cả trạng thái'}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setStatusFilter('In Progress');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-0 ${
                      statusFilter === 'In Progress'
                        ? 'bg-[#FAF8F4] text-[#7A591C]'
                        : 'text-[#242722] bg-transparent hover:bg-[#F0EEE8]'
                    }`}
                  >
                    {t('specialist.inProgressCompliance', 'Đang thẩm định')}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setStatusFilter('Complete');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-0 ${
                      statusFilter === 'Complete'
                        ? 'bg-[#FAF8F4] text-[#7A591C]'
                        : 'text-[#242722] bg-transparent hover:bg-[#F0EEE8]'
                    }`}
                  >
                    {t('specialist.completeCompliance', 'Hoàn tất')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[880px]">
            <thead>
              <tr className="bg-[#F0EEE8] border-b border-[#D8CEBE] text-[11px] font-bold text-[#5C6658] uppercase tracking-wider">
                <th className="p-4">{t('documents.code', 'Mã hồ sơ')}</th>
                <th className="p-4">{t('documents.horseAndOrder', 'Chiến mã / Mã đơn')}</th>
                <th className="p-4">{t('customer.requests.tableDestination', 'Điểm đến')}</th>
                <th className="p-4">{t('documents.overallProgress', 'Tiến độ tổng')}</th>
                <th className="p-4">{t('documents.category', 'Phân loại chứng từ')}</th>
                <th className="p-4">{t('common.status', 'Trạng thái')}</th>
                <th className="p-4 text-right">{t('common.actions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E2D8]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-[#5C6658] font-medium text-sm">
                    {isEn
                      ? 'Loading transport dossiers from system...'
                      : 'Đang tải danh sách túi hồ sơ vận chuyển từ hệ thống...'}
                  </td>
                </tr>
              ) : filteredDossiers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#5C6658] font-medium">
                    {isEn
                      ? 'No matching transport dossiers found.'
                      : 'Không tìm thấy bộ hồ sơ vận chuyển nào phù hợp.'}
                  </td>
                </tr>
              ) : (
                filteredDossiers.map((dos) => {
                  const progressPct =
                    dos.totalDocs > 0 ? Math.round((dos.approvedDocs / dos.totalDocs) * 100) : 0;
                  const breakdown = getDocBreakdown(dos);

                  return (
                    <tr key={dos.id} className="hover:bg-[#FAF9F5] transition-colors">
                      <td className="p-4 font-bold text-[#181A17] whitespace-nowrap">{dos.id}</td>
                      <td className="p-4">
                        <p className="font-bold text-[#181A17] m-0">{dos.horse}</p>
                        <p className="text-xs text-[#A67C2E] font-semibold m-0">{dos.reqCode}</p>
                      </td>
                      <td className="p-4 text-[#5C6658] font-medium">{dos.destination}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#181A17] text-xs min-w-[2.5rem] whitespace-nowrap">
                            {dos.docs}
                          </span>
                          <div className="w-20 bg-[#EAE5DA] h-2 rounded-full overflow-hidden shrink-0">
                            <div
                              className={`h-full rounded-full transition-all ${
                                dos.status === 'Complete' ? 'bg-[#287653]' : 'bg-[#A67C2E]'
                              }`}
                              style={{ width: `${Math.min(100, progressPct)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-[#5C6658] whitespace-nowrap">{progressPct}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E8F2EB] text-[#287653]">
                            ✓ {breakdown.approved}
                          </span>
                          {breakdown.pending > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F8F0DF] text-[#966516]">
                              ⏳ {breakdown.pending}
                            </span>
                          )}
                          {breakdown.missing > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F8EAEA] text-[#B33E3E]">
                              ! {breakdown.missing}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap ${
                            dos.status === 'Complete'
                              ? 'bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]'
                              : 'bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]'
                          }`}
                        >
                          {dos.status === 'Complete' ? (
                            <CheckCircle size={12} className="text-[#287653]" />
                          ) : (
                            <FolderOpen size={12} className="text-[#A67C2E]" />
                          )}
                          {dos.status === 'Complete'
                            ? t('specialist.completeCompliance', 'Hoàn tất')
                            : t('specialist.inProgressCompliance', 'Đang thẩm định')}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenExport(dos)}
                          className="text-[#7A591C] hover:text-[#181A17] font-semibold text-xs inline-flex items-center gap-1 cursor-pointer bg-[#FAF8F4] hover:bg-[#F3EFE4] px-3 py-1.5 rounded-lg border border-[#D8CEBE] transition-colors"
                        >
                          {isEn ? 'Export' : 'Trích xuất'} <Download size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE DOSSIER MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={handleCloseCreateModal}
        title={isEn ? 'Create New Transport Dossier' : 'Tạo Túi Hồ Sơ Vận Chuyển Mới'}
        subtitle={
          isEn
            ? 'Compile legal, veterinary, and customs documents for cross-border transport.'
            : 'Tổng hợp các chứng từ pháp lý, thú y và kiểm dịch cho vận chuyển xuyên quốc gia.'
        }
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateDossier} className="flex flex-col gap-4">
          <div>
            <label htmlFor="create-dossier-reqcode" className="text-sm font-semibold text-[#181A17] block mb-1">
              {isEn ? 'Transport Order Code' : 'Mã đơn vận chuyển'} <span className="text-[#B33E3E]">*</span>
            </label>
            <input
              id="create-dossier-reqcode"
              type="text"
              placeholder={isEn ? 'e.g. TR-2026-009' : 'VD: TR-2026-009'}
              value={reqCode}
              onChange={(e) => setReqCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] text-sm focus:border-[#A67C2E] outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="create-dossier-horse" className="text-sm font-semibold text-[#181A17] block mb-1">
              {isEn ? 'Horse Name' : 'Tên chiến mã'} <span className="text-[#B33E3E]">*</span>
            </label>
            <input
              id="create-dossier-horse"
              type="text"
              placeholder={isEn ? 'e.g. Northern Dancer, Thunder' : 'VD: Northern Dancer, Thunder'}
              value={horse}
              onChange={(e) => setHorse(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] text-sm focus:border-[#A67C2E] outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="create-dossier-dest" className="text-sm font-semibold text-[#181A17] block mb-1">
                {isEn ? 'Destination' : 'Điểm đến'} <span className="text-[#B33E3E]">*</span>
              </label>
              <input
                id="create-dossier-dest"
                type="text"
                placeholder={isEn ? 'e.g. Singapore, Dubai, Bangkok' : 'VD: Singapore, Dubai, Bangkok'}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] text-sm focus:border-[#A67C2E] outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="create-dossier-count" className="text-sm font-semibold text-[#181A17] block mb-1">
                {isEn ? 'Required Documents Count' : 'Số chứng từ yêu cầu'}
              </label>
              <input
                id="create-dossier-count"
                type="number"
                min={1}
                max={12}
                value={totalDocs}
                onChange={(e) => setTotalDocs(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] text-sm focus:border-[#A67C2E] outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 mt-4">
            <Button type="button" variant="outline" onClick={handleCloseCreateModal}>
              {isEn ? 'Cancel' : 'Hủy bỏ'}
            </Button>
            <Button type="submit" variant="primary">
              {isEn ? 'Create Dossier' : 'Tạo hồ sơ'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* EXPORT DOSSIER MODAL */}
      <Modal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title={
          isEn
            ? `Export Transport Dossier ${exportDossier?.id || ''}`
            : `Xuất gói hồ sơ vận chuyển ${exportDossier?.id || ''}`
        }
        subtitle={
          isEn
            ? 'Extract verified legal and quarantine documents for border authorities or archiving.'
            : 'Trích xuất chứng từ pháp lý & kiểm dịch đã xác minh cho cơ quan có thẩm quyền hoặc lưu trữ.'
        }
        maxWidth="max-w-xl"
      >
        {exportDossier && (
          <div className="flex flex-col gap-4">
            {/* Dossier Metadata Card */}
            <div className="bg-[#FAF9F5] border border-[#D8CEBE] rounded-xl p-3.5 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#5C6658] font-semibold">
                  {isEn ? 'Transport Order:' : 'Đơn vận chuyển:'}
                </span>
                <span className="font-bold text-[#181A17] bg-white px-2 py-0.5 rounded border border-[#D8CEBE]">
                  {exportDossier.reqCode}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#5C6658] font-semibold">
                  {isEn ? 'Transported Horse:' : 'Chiến mã vận chuyển:'}
                </span>
                <span className="font-bold text-[#181A17] text-right">{exportDossier.horse}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#5C6658] font-semibold">
                  {isEn ? 'Destination Route:' : 'Tuyến đích:'}
                </span>
                <span className="font-semibold text-[#242722] text-right">{exportDossier.destination}</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#EAE5DA]">
                <span className="text-[#5C6658] font-semibold">
                  {isEn ? 'Approved Verified Documents:' : 'Số chứng từ đã phê duyệt:'}
                </span>
                <span
                  className={`font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                    approvedExportCount > 0 && approvedExportCount === exportedDocsList.length
                      ? 'text-[#287653] bg-[#E8F2EB] border-[#B7DBC4]'
                      : 'text-[#966516] bg-[#F8F0DF] border-[#DFCA9A]'
                  }`}
                >
                  <CheckCircle2 size={12} />
                  {isLoadingExportDocs
                    ? isEn
                      ? 'Loading...'
                      : 'Đang nạp...'
                    : isEn
                    ? `${approvedExportCount}/${exportedDocsList.length} approved`
                    : `${approvedExportCount}/${exportedDocsList.length} đã duyệt`}
                </span>
              </div>
            </div>

            {exportError && (
              <div
                role="alert"
                className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-[#B33E3E] text-xs flex items-start gap-2.5"
              >
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold m-0">
                    {isEn ? 'Warning: Cannot export dossier' : 'Cảnh báo: Không thể xuất gói hồ sơ'}
                  </p>
                  <p className="mt-1 m-0 leading-relaxed">{exportError}</p>
                </div>
              </div>
            )}

            {/* Document Checklist Preview */}
            <div>
              <p className="text-xs font-bold text-[#242722] uppercase tracking-wider mb-2">
                {isEn ? 'Extracted documents checklist:' : 'Chi tiết danh mục văn bản trích xuất:'}
              </p>
              {isLoadingExportDocs ? (
                <div className="p-4 text-center text-xs text-[#5C6658] bg-[#FAF9F5] rounded-lg border border-[#D8CEBE]">
                  {isEn ? 'Loading quarantine documents checklist...' : 'Đang tải danh mục hồ sơ kiểm dịch...'}
                </div>
              ) : exportedDocsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#7E867B] bg-[#FAF9F5] rounded-lg border border-dashed border-[#D8CEBE]">
                  {isEn
                    ? 'No quarantine documents eligible for export.'
                    : 'Không có chứng từ kiểm dịch nào đủ điều kiện để trích xuất.'}
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto flex flex-col gap-1.5 pr-1">
                  {exportedDocsList.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-white border border-[#D8CEBE] rounded-lg text-xs flex items-center justify-between gap-2 shadow-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-[#7E867B] w-6 shrink-0 text-center">#{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#181A17] m-0 truncate text-[11.5px]">{doc.title}</p>
                          <p className="text-[10.5px] text-[#5C6658] m-0">
                            {isEn ? 'Doc No:' : 'Số hiệu:'}{' '}
                            <span className="font-mono text-[#181A17]">{doc.docNumber || '—'}</span> •{' '}
                            {isEn ? 'Horse:' : 'Ngựa:'}{' '}
                            <strong className="text-[#181A17]">{doc.horseName}</strong>
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          getDocStatusMeta(doc.status).modalClass
                        }`}
                      >
                        {getDocStatusMeta(doc.status).modalLabel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Export Actions: PDF & TXT */}
            <div className="pt-2 border-t border-[#EAE5DA] flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingExportDocs || exportedDocsList.length === 0 || Boolean(exportError)}
                onClick={handleExportTXT}
                className="w-full sm:w-auto text-xs py-2 px-3 font-semibold text-[#242722] disabled:opacity-40"
              >
                <Download size={14} className="mr-1.5" />
                {isEn ? 'Download TXT (.txt)' : 'Tải file TXT (.txt)'}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={isLoadingExportDocs || exportedDocsList.length === 0 || Boolean(exportError)}
                onClick={handleExportPDF}
                className="w-full sm:w-auto text-xs py-2 px-4 font-bold bg-[#181A17] hover:bg-[#242722] text-white shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Printer size={15} />
                {isEn ? 'Print / Save PDF (A4 Standard)' : 'In / Lưu file PDF (Chuẩn A4)'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
