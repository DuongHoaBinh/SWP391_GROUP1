'use client';

import React, { useState, useEffect } from 'react';
import { FolderOpen, Search, Filter, Download, CheckCircle, Printer } from 'lucide-react';
import { useDocumentStore, SpecialistDossier } from '@/lib/document-store';
import { documentsApi } from '@/features/documents/api/documents.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface ExportHorseIdentity {
  horseName: string;
  microchipNo: string;
  passportNo: string;
}

export default function TransportDocumentsPage() {
  const { dossiers } = useDocumentStore();
  const [realDossiers, setRealDossiers] = useState<SpecialistDossier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Export Modal state
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportDossier, setExportDossier] = useState<SpecialistDossier | null>(null);
  const [exportedDocsList, setExportedDocsList] = useState<any[]>([]);
  const [exportedHorsesList, setExportedHorsesList] = useState<ExportHorseIdentity[]>([]);
  const [isLoadingExportDocs, setIsLoadingExportDocs] = useState(false);

  useEffect(() => {
    const fetchRealData = async () => {
      setIsLoading(true);
      try {
        const orders = await documentsApi.getComplianceOrders();
        if (Array.isArray(orders) && orders.length > 0) {
          const mapped: SpecialistDossier[] = orders.map((o) => {
            const total = o.totalRequiredDocs || 4;
            const approved = o.approvedDocsCount || 0;
            return {
              id: `DOS-${o.requestCode}`,
              reqCode: o.requestCode,
              horse: o.horseNames || 'Ngựa vận chuyển',
              destination: o.destinationLocation || o.destinationCountry || 'Vietnam',
              status: o.isFullyCompliant ? 'Complete' : 'In Progress',
              approvedDocs: approved,
              totalDocs: total,
              docs: `${approved}/${total}`,
              lastUpdated: new Date(o.createdAt).toLocaleDateString('vi-VN'),
            };
          });
          setRealDossiers(mapped);
        }
      } catch (err) {
        console.warn('Fallback to store dossiers:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRealData();
  }, []);

  const activeDossiers = realDossiers.length > 0 ? realDossiers : dossiers;

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

  const getDocDisplayName = (docType: string, customTitle?: string) => {
    if (customTitle && customTitle.trim()) return customTitle;
    const map: Record<string, string> = {
      horse_passport: 'FEI Equine International Passport (Hộ chiếu ngựa quốc tế chuẩn ISO/FEI)',
      health_certificate: 'Official International Veterinary Health Certificate (Kiểm dịch xuất cảnh 48-72h)',
      vaccination_certificate: 'Equine Influenza Vaccination Certificate (Chứng nhận tiêm phòng cúm 6 tháng)',
      quarantine_certificate: 'Quarantine Isolation Clearance Certificate (Chứng nhận cách ly kiểm dịch xuất cảnh)',
      import_permit: 'Cross-Border Live Animal Import & Transit Permit (Giấy phép nhập cảnh & hải quan)',
      coggins_test: 'Equine Infectious Anemia (Coggins) Lab Certificate (Xét nghiệm máu Coggins)',
      ownership_certificate: 'Equine Ownership & Registration Certificate (Chứng nhận sở hữu ngựa)',
      customs_declaration: 'Live Animal Customs Transit Declaration (Tờ khai hải quan quá cảnh)',
    };
    return map[docType] || docType.replace(/_/g, ' ').toUpperCase();
  };

  const buildFallbackHorses = (dos: SpecialistDossier): ExportHorseIdentity[] => {
    const names = (dos.horse || 'Ngựa vận chuyển')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return (names.length > 0 ? names : ['Ngựa vận chuyển']).map((horseName) => ({
      horseName,
      microchipNo: '',
      passportNo: '',
    }));
  };

  const handleOpenExport = async (dos: SpecialistDossier) => {
    setExportDossier(dos);
    setIsExportOpen(true);
    setIsLoadingExportDocs(true);

    try {
      const orderId = parseInt(dos.reqCode.replace(/\D/g, ''), 10);
      if (orderId) {
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
                title: d.regulationTitle || getDocDisplayName(d.docType),
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
                title: m.description || getDocDisplayName(m.documentType),
                docNumber: '',
                status: 'missing',
              });
            });
          });
        }
        setExportedHorsesList(horsesIdentity.length > 0 ? horsesIdentity : buildFallbackHorses(dos));
        setExportedDocsList(compiled);
      } else {
        setExportedHorsesList(buildFallbackHorses(dos));
        setExportedDocsList([]);
      }
    } catch (err) {
      console.warn('Fallback error loading export docs:', err);
      setExportedHorsesList(buildFallbackHorses(dos));
      setExportedDocsList([]);
    } finally {
      setIsLoadingExportDocs(false);
    }
  };

  const getDocStatusMeta = (status?: string) => {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return {
          modalLabel: '✓ APPROVED',
          modalClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
          pdfLabel: '✓ ĐÃ DUYỆT',
          pdfClass: 'badge-approved',
          txtLabel: 'APPROVED',
        };
      case 'submitted':
        return {
          modalLabel: '⏳ CHỜ DUYỆT',
          modalClass: 'bg-amber-100 text-amber-800 border border-amber-200',
          pdfLabel: '⏳ CHỜ DUYỆT',
          pdfClass: 'badge-pending',
          txtLabel: 'PENDING REVIEW',
        };
      case 'rejected':
        return {
          modalLabel: '✕ TỪ CHỐI',
          modalClass: 'bg-red-100 text-red-800 border border-red-200',
          pdfLabel: '✕ TỪ CHỐI',
          pdfClass: 'badge-rejected',
          txtLabel: 'REJECTED',
        };
      case 'expired':
        return {
          modalLabel: '⚠️ HẾT HẠN',
          modalClass: 'bg-red-100 text-red-800 border border-red-200',
          pdfLabel: '⚠️ HẾT HẠN',
          pdfClass: 'badge-rejected',
          txtLabel: 'EXPIRED',
        };
      default:
        return {
          modalLabel: '○ CHƯA NỘP',
          modalClass: 'bg-slate-100 text-slate-600 border border-slate-200',
          pdfLabel: '○ CHƯA NỘP',
          pdfClass: 'badge-missing',
          txtLabel: 'MISSING',
        };
    }
  };

  const getResolvedExportData = (dos: SpecialistDossier) => {
    const horsesToRender = exportedHorsesList.length > 0 ? exportedHorsesList : buildFallbackHorses(dos);
    const primaryHorse = horsesToRender[0] || { horseName: dos.horse, microchipNo: '', passportNo: '' };
    const fallbackStatus = dos.status === 'Complete' ? 'approved' : 'missing';

    const docsToRender = exportedDocsList.length > 0
      ? exportedDocsList
      : horsesToRender.flatMap((h) => [
          { horseName: h.horseName, microchipNo: h.microchipNo, passportNo: h.passportNo, title: 'FEI Equine International Passport (Hộ chiếu ngựa quốc tế chuẩn ISO)', docNumber: fallbackStatus === 'approved' ? 'VN-FEI-2026-001' : '', status: fallbackStatus },
          { horseName: h.horseName, microchipNo: h.microchipNo, passportNo: h.passportNo, title: 'Official International Veterinary Health Certificate (Kiểm dịch xuất cảnh 48-72h)', docNumber: fallbackStatus === 'approved' ? 'VN-VET-7821' : '', status: fallbackStatus },
          { horseName: h.horseName, microchipNo: h.microchipNo, passportNo: h.passportNo, title: 'Equine Influenza Vaccination Certificate (Chứng nhận tiêm phòng cúm 6 tháng)', docNumber: fallbackStatus === 'approved' ? 'VN-VAC-9023' : '', status: fallbackStatus },
          { horseName: h.horseName, microchipNo: h.microchipNo, passportNo: h.passportNo, title: 'Cross-Border Live Animal Customs Permit & Transit Declaration', docNumber: fallbackStatus === 'approved' ? 'VN-CUS-1102' : '', status: fallbackStatus },
        ]);

    const approvedCount = exportedDocsList.length > 0
      ? docsToRender.filter((d) => d.status === 'approved').length
      : dos.approvedDocs;
    const totalCount = exportedDocsList.length > 0
      ? docsToRender.length
      : dos.totalDocs || docsToRender.length;
    const isFullyApproved = totalCount > 0 && approvedCount >= totalCount;
    const progressPct = Math.round((approvedCount / (totalCount || 1)) * 100);

    const metaMicrochipDisplay =
      horsesToRender.length <= 1
        ? primaryHorse.microchipNo || ''
        : horsesToRender.some((h) => Boolean(h.microchipNo))
          ? horsesToRender.map((h) => `${h.horseName}: ${h.microchipNo || ''}`).join(' | ')
          : '';

    const metaPassportDisplay =
      horsesToRender.length <= 1
        ? primaryHorse.passportNo || ''
        : horsesToRender.some((h) => Boolean(h.passportNo))
          ? horsesToRender.map((h) => `${h.horseName}: ${h.passportNo || ''}`).join(' | ')
          : '';

    return {
      horsesToRender,
      docsToRender,
      approvedCount,
      totalCount,
      isFullyApproved,
      progressPct,
      metaMicrochipDisplay,
      metaPassportDisplay,
    };
  };

  const handleExportPDF = () => {
    if (!exportDossier) return;
    const printWindow = window.open('', '_blank', 'width=950,height=850');
    if (!printWindow) {
      toast.error('Vui lòng cho phép trình duyệt mở cửa sổ bật lên (popup) để xem và lưu file PDF.');
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

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${exportDossier.id}_Official_Equine_Transport_Dossier</title>
  <style>
    @page { size: A4; margin: 12mm 15mm; }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.45;
    }
    .print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 16px;
      margin-bottom: 24px;
    }
    .btn-print {
      background: #1d4ed8;
      color: #ffffff;
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
      border-bottom: 2.5px solid #1e3a8a;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      background: #1e3a8a;
      color: #ffffff;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 900;
    }
    .brand-text h1 {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .brand-text p {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      margin: 2px 0 0 0;
    }
    .badge-dossier {
      background: #eff6ff;
      border: 1.5px solid #93c5fd;
      color: #1e40af;
      padding: 6px 14px;
      border-radius: 8px;
      text-align: right;
    }
    .doc-headline {
      text-align: center;
      margin: 16px 0 20px 0;
    }
    .doc-headline h2 {
      font-size: 18px;
      font-weight: 800;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin: 0;
    }
    .doc-headline p {
      font-size: 11.5px;
      color: #64748b;
      margin: 4px 0 0 0;
    }
    .meta-box {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 24px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 18px;
      margin-bottom: 20px;
      font-size: 12px;
    }
    .meta-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .meta-item .lbl {
      color: #64748b;
      font-weight: 600;
      min-width: 140px;
    }
    .meta-item .val {
      color: #0f172a;
      font-weight: bold;
    }
    .table-container {
      margin-bottom: 24px;
    }
    .table-title {
      font-size: 13px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    tr:nth-child(even) td {
      background: #fafaf9;
    }
    .badge-approved {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      background: #dcfce7;
      color: #15803d;
      font-size: 10.5px;
      font-weight: 700;
      border: 1px solid #86efac;
    }
    .badge-pending {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      background: #fef3c7;
      color: #b45309;
      font-size: 10.5px;
      font-weight: 700;
      border: 1px solid #fcd34d;
    }
    .badge-rejected {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      background: #fee2e2;
      color: #b91c1c;
      font-size: 10.5px;
      font-weight: 700;
      border: 1px solid #fca5a5;
    }
    .badge-missing {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      background: #f1f5f9;
      color: #475569;
      font-size: 10.5px;
      font-weight: 700;
      border: 1px solid #cbd5e1;
    }
    .legal-auth {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #1e3a8a;
      border-radius: 4px;
      padding: 10px 14px;
      font-size: 11px;
      color: #334155;
      margin-bottom: 24px;
    }
    .legal-auth strong {
      color: #0f172a;
    }
    .footer-seal-wrap {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 10px;
    }
    .seal-stamp {
      border: 2px dashed #b91c1c;
      background: #fff5f5;
      color: #b91c1c;
      padding: 10px 16px;
      border-radius: 8px;
      text-align: center;
      max-width: 260px;
    }
    .seal-stamp .seal-hd {
      font-weight: 900;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .seal-stamp .seal-sub {
      font-size: 9.5px;
      margin-top: 3px;
      color: #991b1b;
    }
    .sign-box {
      text-align: center;
      min-width: 220px;
      font-size: 11.5px;
    }
    .sign-space {
      height: 48px;
    }
    @media print {
      .print-bar { display: none !important; }
      body { padding: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <span style="font-size: 13px; color: #475569; font-weight: 600;">
      📄 EquiTransit Dossier Manifest (${exportDossier.id}) - Sẵn sàng in hoặc lưu PDF chuẩn A4
    </span>
    <button class="btn-print" onclick="window.print()">🖨️ In / Lưu file PDF (Ctrl + P)</button>
  </div>

  <div class="header">
    <div class="brand-wrap">
      <div class="brand-logo">🐎</div>
      <div class="brand-text">
        <h1>EquiTransit Logistics</h1>
        <p>Cross-Border Equine Transport • Veterinary & Quarantine Compliance</p>
      </div>
    </div>
    <div class="badge-dossier">
      <div style="font-size: 14px; font-weight: 800; color: #1e3a8a;">${exportDossier.id}</div>
      <div style="font-size: 10.5px; font-weight: 600; color: #64748b;">HỒ SƠ PHÁP LÝ & KIỂM DỊCH</div>
    </div>
  </div>

  <div class="doc-headline">
    <h2>Official Cross-Border Equine Transport Dossier</h2>
    <p>Gói Hồ Sơ Kiểm Dịch & Thủ Tục Hải Quan Vận Chuyển Ngựa Đua Xuyên Quốc Gia</p>
  </div>

  <div class="meta-box">
    <div class="meta-item">
      <span class="lbl">Mã đơn vận chuyển:</span>
      <span class="val">${exportDossier.reqCode}</span>
    </div>
    <div class="meta-item">
      <span class="lbl">Ngày phát hành:</span>
      <span class="val">${new Date().toLocaleDateString('vi-VN')}</span>
    </div>
    <div class="meta-item">
      <span class="lbl">Chiến mã vận chuyển:</span>
      <span class="val">${exportDossier.horse}</span>
    </div>
    <div class="meta-item">
      <span class="lbl">Chuyên viên kiểm dịch:</span>
      <span class="val">Sarah Jenkins (Compliance Specialist)</span>
    </div>
    <div class="meta-item">
      <span class="lbl">Microchip ID:</span>
      <span class="val">${metaMicrochipDisplay}</span>
    </div>
    <div class="meta-item">
      <span class="lbl">Passport Number:</span>
      <span class="val">${metaPassportDisplay}</span>
    </div>
    <div class="meta-item">
      <span class="lbl">Tuyến đường & Đích đến:</span>
      <span class="val">${exportDossier.destination}</span>
    </div>
    <div class="meta-item">
      <span class="lbl">Trạng thái hồ sơ:</span>
      <span class="val" style="color: ${isFullyApproved ? '#15803d' : '#b45309'};">
        ${isFullyApproved ? `HOÀN TẤT (${approvedCount}/${totalCount} văn bản hợp lệ)` : `ĐANG THẨM ĐỊNH (${approvedCount}/${totalCount} văn bản đã duyệt)`}
      </span>
    </div>
  </div>

  <div class="table-container">
    <div class="table-title">
      Danh mục toàn bộ văn bản kiểm dịch & pháp lý (${docsToRender.length} văn bản):
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">STT</th>
          <th style="width: 175px;">Cá thể ngựa</th>
          <th>Tên văn bản / Giấy chứng nhận kiểm dịch</th>
          <th style="width: 130px;">Số hiệu văn bản</th>
          <th style="width: 110px; text-align: center;">Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        ${docsToRender.map((doc, idx) => {
          const statusMeta = getDocStatusMeta(doc.status);
          return `
          <tr>
            <td style="text-align: center; font-weight: bold; color: #64748b;">${idx + 1}</td>
            <td style="color: #1e293b;">
              <div style="font-weight: 700;">${doc.horseName || exportDossier.horse}</div>
              <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">Microchip ID: <span style="font-weight: 600; color: #0f172a;">${doc.microchipNo || ''}</span></div>
              <div style="font-size: 10.5px; color: #475569;">Passport Number: <span style="font-weight: 600; color: #0f172a;">${doc.passportNo || ''}</span></div>
            </td>
            <td style="color: #0f172a;">${doc.title}</td>
            <td style="font-family: monospace; font-size: 11px; color: #475569;">${doc.status === 'approved' ? (doc.docNumber || '') : ''}</td>
            <td style="text-align: center;">
              <span class="${statusMeta.pdfClass}">${statusMeta.pdfLabel}</span>
            </td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="legal-auth">
    <strong>XÁC NHẬN ĐIỀU KIỆN KHỞI HÀNH (TRANSIT & DEPARTURE AUTHORIZATION):</strong><br />
    ${isFullyApproved
      ? `Bộ hồ sơ vận chuyển này chứng nhận các cá thể chiến mã nêu trên đã hoàn thành đầy đủ quy trình kiểm dịch thú y, tiêm chủng dịch tễ, xét nghiệm huyết thanh và khai báo hải quan động vật sống xuyên quốc gia theo đúng chuẩn mực WOAH (Tổ chức Thú y Thế giới), FEI (Liên đoàn Thể thao Cưỡi ngựa Quốc tế) và quy chuẩn kiểm dịch của nước nhập cảnh.<br /><br /><strong>KẾT LUẬN: ĐỦ ĐIỀU KIỆN XUẤT CẢNH VÀ THỰC HIỆN HÀNH TRÌNH VẬN CHUYỂN.</strong>`
      : `Bộ hồ sơ vận chuyển này hiện đã được phê duyệt ${approvedCount}/${totalCount} văn bản bắt buộc. Các chứng từ còn lại đang trong quá trình chờ thẩm định hoặc chờ bổ sung theo quy chuẩn kiểm dịch của nước nhập cảnh.<br /><br /><strong>KẾT LUẬN: HỒ SƠ ĐANG TRONG QUÁ TRÌNH THẨM ĐỊNH (CHƯA ĐỦ ĐIỀU KIỆN KHỞI HÀNH).</strong>`
    }
  </div>

  <div class="footer-seal-wrap">
    <div class="seal-stamp" style="${isFullyApproved ? '' : 'border-color: #d97706; background: #fffbeb; color: #b45309;'}">
      <div class="seal-hd">${isFullyApproved ? '★ EQUITRANSIT VERIFIED ★' : '⏳ IN COMPLIANCE REVIEW'}</div>
      <div class="seal-sub" style="${isFullyApproved ? '' : 'color: #92400e;'}">
        ${isFullyApproved ? 'CHỨNG THỰC HỒ SƠ KIỂM DỊCH HỢP LỆ' : `ĐANG THẨM ĐỊNH (${approvedCount}/${totalCount} ĐÃ DUYỆT)`}<br />BỘ PHẬN PHÁP LÝ & AN TOÀN SINH HỌC
      </div>
    </div>

    <div class="sign-box">
      <div style="color: #64748b;">Ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</div>
      <div style="font-weight: bold; margin-top: 4px; color: #0f172a;">CHUYÊN VIÊN KIỂM DỊCH KÝ DUYỆT</div>
      <div class="sign-space"></div>
      <div style="font-weight: 700; color: #1e3a8a;">Sarah Jenkins</div>
      <div style="font-size: 10px; color: #64748b;">Transport Compliance Specialist</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
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
    toast.success(`Đang tải file văn bản cho ${exportDossier.horse} (${exportDossier.id})...`);

    const {
      docsToRender,
      approvedCount,
      totalCount,
      isFullyApproved,
      metaMicrochipDisplay,
      metaPassportDisplay,
    } = getResolvedExportData(exportDossier);

    const manifestContent = `================================================================================
EQUITRANSIT LOGISTICS - OFFICIAL CROSS-BORDER EQUINE TRANSPORT DOSSIER
================================================================================
Dossier Reference ID : ${exportDossier.id}
Transport Order Code : ${exportDossier.reqCode}
Target Equine (Ngựa) : ${exportDossier.horse}
Microchip ID         : ${metaMicrochipDisplay}
Passport Number      : ${metaPassportDisplay}
Destination Route    : ${exportDossier.destination}
Compliance Status    : ${isFullyApproved ? 'COMPLETE' : 'IN PROGRESS'} (${approvedCount}/${totalCount} Approved Legal Documents)
Issued Date          : ${new Date().toLocaleDateString('vi-VN')}
Certified By         : Sarah Jenkins - Transport Specialist (Compliance Dept.)

--------------------------------------------------------------------------------
LEGAL & QUARANTINE DOCUMENT CHECKLIST (${docsToRender.length} DOCUMENTS):
--------------------------------------------------------------------------------
${docsToRender.map((d, i) => `${i + 1}. [${getDocStatusMeta(d.status).txtLabel}] [${d.horseName} | Microchip ID: ${d.microchipNo || ''} | Passport Number: ${d.passportNo || ''}] ${d.title} (Số hiệu: ${d.status === 'approved' ? (d.docNumber || '') : ''})`).join('\n')}

--------------------------------------------------------------------------------
TRANSIT & DEPARTURE AUTHORIZATION:
--------------------------------------------------------------------------------
${isFullyApproved
  ? `This compiled transport dossier certifies that the above equine subject has satisfied\nall quarantine, veterinary, and customs compliance protocols mandated by WOAH / FEI\nand the destination authority.\n\nSTATUS: CLEARED FOR EMBARKATION AND CROSS-BORDER TRANSPORT.`
  : `This transport dossier is currently under compliance review (${approvedCount}/${totalCount} documents approved).\n\nSTATUS: IN PROGRESS - PENDING FULL DOCUMENT APPROVAL BEFORE DEPARTURE.`
}
================================================================================
Digital Verification Seal: [EquiTransit Logistics Authority]
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

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">Transport Dossiers</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {activeDossiers.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage compiled legal & quarantine document sets for authorities.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search dossiers by horse or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-sm w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-semibold transition-colors ${
                statusFilter !== 'ALL'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
              }`}
            >
              <Filter size={14} /> {statusFilter === 'ALL' ? 'Filter Status' : statusFilter}
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
                <button
                  onClick={() => { setStatusFilter('ALL'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${statusFilter === 'ALL' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  All Statuses
                </button>
                <button
                  onClick={() => { setStatusFilter('In Progress'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${statusFilter === 'In Progress' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  In Progress
                </button>
                <button
                  onClick={() => { setStatusFilter('Complete'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${statusFilter === 'Complete' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  Complete
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Dossier ID</th>
                <th className="p-4">Horse / Request</th>
                <th className="p-4">Destination</th>
                <th className="p-4">Documents Progress</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 font-medium text-sm">
                    Đang tải danh sách túi hồ sơ vận chuyển từ hệ thống...
                  </td>
                </tr>
              ) : filteredDossiers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                    Không tìm thấy bộ hồ sơ vận chuyển nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredDossiers.map((dos) => {
                  const progressPct = Math.round((dos.approvedDocs / (dos.totalDocs || 1)) * 100);
                  return (
                    <tr key={dos.id} className="hover:bg-slate-50">
                      <td className="p-4 font-bold text-slate-900">{dos.id}</td>
                      <td className="p-4">
                        <p className="font-bold text-slate-900 m-0">{dos.horse}</p>
                        <p className="text-xs text-blue-600 font-semibold m-0">{dos.reqCode}</p>
                      </td>
                      <td className="p-4 text-slate-600 font-medium">{dos.destination}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs w-8">{dos.docs}</span>
                          <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                dos.status === 'Complete' ? 'bg-emerald-500' : 'bg-blue-600'
                              }`}
                              style={{ width: `${Math.min(100, progressPct)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500">{progressPct}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${
                            dos.status === 'Complete'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}
                        >
                          {dos.status === 'Complete' ? (
                            <CheckCircle size={12} className="text-emerald-600" />
                          ) : (
                            <FolderOpen size={12} className="text-blue-600" />
                          )}
                          {dos.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleOpenExport(dos)}
                          className="text-blue-600 hover:text-blue-800 font-semibold text-sm inline-flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
                        >
                          Export <Download size={14} />
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

      {/* EXPORT DOSSIER MODAL WITH PDF & TXT OPTIONS */}
      <Modal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title={`Xuất gói hồ sơ vận chuyển ${exportDossier?.id || ''}`}
        subtitle="Trích xuất chứng từ pháp lý & kiểm dịch đã xác minh cho cơ quan kiểm quyền hoặc lưu trữ."
        maxWidth="600px"
      >
        {exportDossier && (() => {
          const {
            docsToRender,
            approvedCount,
            totalCount,
            isFullyApproved,
            progressPct,
            metaMicrochipDisplay,
            metaPassportDisplay,
          } = getResolvedExportData(exportDossier);
          return (
            <div className="flex flex-col gap-4">
              {/* Dossier Metadata Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Đơn vận chuyển:</span>
                  <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border">
                    {exportDossier.reqCode}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Chiến mã vận chuyển:</span>
                  <span className="font-bold text-slate-900">{exportDossier.horse}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Microchip ID:</span>
                  <span className="font-bold text-slate-900 min-h-[16px]">{metaMicrochipDisplay}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Passport Number:</span>
                  <span className="font-bold text-slate-900 min-h-[16px]">{metaPassportDisplay}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Tuyến đích:</span>
                  <span className="font-semibold text-slate-700">{exportDossier.destination}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500 font-semibold">Tổng số chứng từ đã thẩm định:</span>
                  {isLoadingExportDocs ? (
                    <span className="font-bold text-slate-600 bg-white px-2 py-0.5 rounded border">
                      Đang nạp...
                    </span>
                  ) : isFullyApproved ? (
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                      <CheckCircle size={12} />
                      {`${approvedCount}/${totalCount} văn bản (100% Hoàn thành)`}
                    </span>
                  ) : (
                    <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                      <FolderOpen size={12} />
                      {`${approvedCount}/${totalCount} văn bản đã duyệt (${progressPct}% - Đang xử lý)`}
                    </span>
                  )}
                </div>
              </div>

              {/* Document Checklist Preview */}
              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Chi tiết danh mục văn bản trích xuất:
                </p>
                {isLoadingExportDocs ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border">
                    Đang tải danh mục hồ sơ kiểm dịch...
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto flex flex-col gap-1.5 pr-1">
                    {docsToRender.map((doc, idx) => {
                      const statusMeta = getDocStatusMeta(doc.status);
                      return (
                        <div
                          key={idx}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-xs flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-400 w-5 shrink-0 text-center">#{idx + 1}</span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 m-0 truncate text-[11.5px]">{doc.title}</p>
                              <p className="text-[10.5px] text-slate-500 m-0">
                                Ngựa: <strong className="text-slate-700">{doc.horseName}</strong>
                                {' • '}Microchip ID: <strong className="text-slate-700">{doc.microchipNo || ''}</strong>
                                {' • '}Passport Number: <strong className="text-slate-700">{doc.passportNo || ''}</strong>
                              </p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${statusMeta.modalClass}`}>
                            {statusMeta.modalLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Export Actions: PDF & TXT */}
              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportTXT}
                  className="w-full sm:w-auto text-xs py-2 px-3 font-semibold text-slate-700"
                >
                  <Download size={14} className="mr-1.5" />
                  Tải file TXT (.txt)
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleExportPDF}
                  className="w-full sm:w-auto text-xs py-2 px-4 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Printer size={15} />
                  In / Lưu file PDF (Chuẩn A4)
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
