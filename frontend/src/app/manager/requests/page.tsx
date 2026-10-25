'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  Download,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// ─── Types ─────────────────────────────────────────────────────────────────────
type ShipmentStatus = 'requested' | 'under_review' | 'approved' | 'rejected' | 'planning' | 'in_transit' | 'completed' | 'cancelled';

interface OrderHorse {
  horseId: number;
  name: string;
  breed: string | null;
  gender: string | null;
  age: number | null;
}

interface TransportOrder {
  id: number;
  customerId: number;
  contactName: string | null;
  contactEmail: string;
  originLocation: string;
  destinationLocation: string;
  requestedDate: string;
  departureDate: string | null;
  status: ShipmentStatus;
  totalCost: number;
  createdAt: string;
  customerEmail?: string;
  approverName?: string;
  horses?: OrderHorse[];
  specialRequirements?: string | null;
  rejectionReason?: string | null;
}

interface PaginatedOrders {
  data: TransportOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortField = 'createdAt' | 'totalCost' | 'requestedDate';
type SortOrder = 'asc' | 'desc';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<ShipmentStatus, string> = {
  requested: 'Requested',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  planning: 'Planning',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<ShipmentStatus, { bg: string; color: string; border: string }> = {
  requested: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  under_review: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  approved: { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  rejected: { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  planning: { bg: '#f3e8ff', color: '#7c3aed', border: '#ddd6fe' },
  in_transit: { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  completed: { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  cancelled: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(n: number) {
  if (!n || n === 0) return '—';
  return n.toLocaleString('vi-VN') + ' ₫';
}

// ─── PDF Export ────────────────────────────────────────────────────────────────
function exportQuotationPDF(order: TransportOrder) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const horses = order.horses?.map((h) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.breed || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.gender || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.age ?? '—'} yrs</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="padding:8px 12px;">Không có thông tin ngựa</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Báo Giá Vận Chuyển - #${order.id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
    .page { max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #1e40af; margin-bottom: 28px; }
    .brand { display: flex; flex-direction: column; }
    .brand-name { font-size: 22px; font-weight: 800; color: #1e40af; letter-spacing: -0.5px; }
    .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
    .doc-info { text-align: right; }
    .doc-title { font-size: 24px; font-weight: 800; color: #0f172a; }
    .doc-id { font-size: 13px; color: #64748b; margin-top: 4px; }
    .doc-date { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; background: ${STATUS_COLORS[order.status]?.bg || '#f1f5f9'}; color: ${STATUS_COLORS[order.status]?.color || '#64748b'}; margin-top: 6px; border: 1px solid ${STATUS_COLORS[order.status]?.border || '#e2e8f0'}; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .info-box { background: #f8fafc; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .info-value { font-size: 14px; font-weight: 600; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
    thead { background: #1e40af; }
    thead th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #ffffff; text-align: left; }
    .cost-section { background: #1e40af; border-radius: 12px; padding: 20px 24px; margin: 24px 0; color: #fff; }
    .cost-label { font-size: 13px; opacity: 0.8; margin-bottom: 4px; }
    .cost-value { font-size: 28px; font-weight: 800; }
    .cost-sub { font-size: 11px; opacity: 0.6; margin-top: 4px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    .note-box { background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-top: 16px; font-size: 12px; color: #92400e; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="brand">
      <div class="brand-name">🏇 RaceHorse Logistics</div>
      <div class="brand-sub">Cross-Border Racehorse Transport System</div>
      <div class="brand-sub" style="margin-top:8px;">Hotline: +84 28 3456 7890 | info@racehorse-logistics.vn</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">BÁO GIÁ VẬN CHUYỂN</div>
      <div class="doc-id">Mã yêu cầu: #${order.id}</div>
      <div class="doc-date">Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</div>
      <div><span class="status-badge">${STATUS_LABELS[order.status]}</span></div>
    </div>
  </div>

  <!-- Customer Info -->
  <div class="section">
    <div class="section-title">Thông tin khách hàng</div>
    <div class="grid-2">
      <div class="info-box">
        <div class="info-label">Tên liên hệ</div>
        <div class="info-value">${order.contactName || '—'}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Email</div>
        <div class="info-value">${order.contactEmail}</div>
      </div>
    </div>
  </div>

  <!-- Route Info -->
  <div class="section">
    <div class="section-title">Thông tin tuyến vận chuyển</div>
    <div class="grid-3">
      <div class="info-box">
        <div class="info-label">Điểm xuất phát</div>
        <div class="info-value">${order.originLocation}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Điểm đến</div>
        <div class="info-value">${order.destinationLocation}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Ngày yêu cầu xuất phát</div>
        <div class="info-value">${formatDate(order.requestedDate)}</div>
      </div>
    </div>
    ${order.specialRequirements ? `<div class="note-box" style="margin-top:12px;"><strong>Yêu cầu đặc biệt:</strong> ${order.specialRequirements}</div>` : ''}
  </div>

  <!-- Horses -->
  <div class="section">
    <div class="section-title">Danh sách ngựa vận chuyển (${order.horses?.length || 0} con)</div>
    <table>
      <thead>
        <tr>
          <th>Tên ngựa</th>
          <th>Giống</th>
          <th>Giới tính</th>
          <th>Tuổi</th>
        </tr>
      </thead>
      <tbody>
        ${horses}
      </tbody>
    </table>
  </div>

  <!-- Cost -->
  <div class="cost-section">
    <div class="cost-label">Chi phí vận chuyển ước tính</div>
    <div class="cost-value">${order.totalCost > 0 ? order.totalCost.toLocaleString('vi-VN') + ' ₫' : 'Chưa định giá'}</div>
    <div class="cost-sub">${order.totalCost > 0 ? 'Đã bao gồm: phí vận chuyển, kiểm dịch, hải quan cơ bản' : 'Vui lòng chờ Manager xác nhận báo giá'}</div>
  </div>

  <!-- Rejection reason if any -->
  ${order.rejectionReason ? `
  <div class="section">
    <div class="section-title" style="color:#b91c1c;">Lý do từ chối</div>
    <div class="note-box" style="background:#fee2e2;border-color:#fecaca;color:#b91c1c;">${order.rejectionReason}</div>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <div>
      <div>RaceHorse Logistics Co., Ltd.</div>
      <div>MST: 0315678901 | Số 123 Đường Nguyễn Huệ, Q.1, TP.HCM</div>
    </div>
    <div style="text-align:right;">
      <div>Tài liệu này có giá trị trong 30 ngày kể từ ngày xuất</div>
      <div>Powered by RaceHorse Transport System v2.0</div>
    </div>
  </div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function ManagerRequestsPage() {
  const router = useRouter();

  // Filter & sort state
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ShipmentStatus | 'all'>('all');
  const [departureDateFrom, setDepartureDateFrom] = useState('');
  const [departureDateTo, setDepartureDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 20>(10);

  // Data state
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Approve/reject modal state
  const [approveOrder, setApproveOrder] = useState<TransportOrder | null>(null);
  const [rejectOrder, setRejectOrder] = useState<TransportOrder | null>(null);
  const [totalCostInput, setTotalCostInput] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (departureDateFrom) params.set('departureDateFrom', departureDateFrom);
      if (departureDateTo) params.set('departureDateTo', departureDateTo);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const result = await apiClient<PaginatedOrders>(`/orders?${params.toString()}`);
      setOrders(result.data || []);
      setPagination({ total: result.total, totalPages: result.totalPages });
    } catch (err: any) {
      // Fallback sample data if backend is offline
      const sampleOrders: TransportOrder[] = [
        {
          id: 101,
          customerId: 1,
          contactName: 'John Doe',
          contactEmail: 'customer@equitransit.com',
          originLocation: 'Ho Chi Minh City, VN',
          destinationLocation: 'Singapore Turf Club, SG',
          requestedDate: '2026-10-28T08:00:00.000Z',
          departureDate: '2026-10-28',
          status: 'requested',
          totalCost: 18500000,
          createdAt: '2026-10-23T09:42:00.000Z',
          customerEmail: 'customer@equitransit.com',
          specialRequirements: 'Cần khoang máy bay có điều hòa 18 độ C',
          horses: [
            { horseId: 1, name: 'Thunder', breed: 'Thoroughbred', gender: 'Male', age: 6 },
            { horseId: 2, name: 'Silver Star', breed: 'Thoroughbred', gender: 'Female', age: 5 }
          ]
        },
        {
          id: 102,
          customerId: 2,
          contactName: 'Alex Ferguson',
          contactEmail: 'alex.f@equineclub.sg',
          originLocation: 'Hanoi Equestrian Center, VN',
          destinationLocation: 'Bangkok Royal Stables, TH',
          requestedDate: '2026-11-05T06:30:00.000Z',
          departureDate: '2026-11-05',
          status: 'under_review',
          totalCost: 24000000,
          createdAt: '2026-10-22T14:15:00.000Z',
          customerEmail: 'alex.f@equineclub.sg',
          specialRequirements: 'Kiểm dịch đặc biệt qua cửa khẩu Hữu Nghị',
          horses: [
            { horseId: 3, name: 'Pegasus Spirit', breed: 'Arabian', gender: 'Mare', age: 4 }
          ]
        },
        {
          id: 103,
          customerId: 3,
          contactName: 'Michael Chang',
          contactEmail: 'mchang@derby.my',
          originLocation: 'Danang Horse Club, VN',
          destinationLocation: 'Kuala Lumpur Turf Club, MY',
          requestedDate: '2026-10-30T10:00:00.000Z',
          departureDate: '2026-10-30',
          status: 'approved',
          totalCost: 32000000,
          createdAt: '2026-10-21T08:00:00.000Z',
          customerEmail: 'mchang@derby.my',
          specialRequirements: 'Cần chuyên viên thú y đi kèm suốt chuyến',
          horses: [
            { horseId: 4, name: 'Golden Champion', breed: 'Warmblood', gender: 'Gelding', age: 6 }
          ]
        }
      ];

      let filtered = sampleOrders;
      if (filterStatus !== 'all') {
        filtered = filtered.filter((o) => o.status === filterStatus);
      }
      if (sortBy === 'totalCost') {
        filtered.sort((a, b) => (sortOrder === 'asc' ? a.totalCost - b.totalCost : b.totalCost - a.totalCost));
      }

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const paginated = filtered.slice((page - 1) * limit, page * limit);

      setOrders(paginated);
      setPagination({ total, totalPages });
      setError('');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, departureDateFrom, departureDateTo, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterStatus, departureDateFrom, departureDateTo, sortBy, sortOrder, limit]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown size={13} color="#94a3b8" />;
    return sortOrder === 'asc' ? <ArrowUp size={13} color="var(--primary)" /> : <ArrowDown size={13} color="var(--primary)" />;
  };

  const handleApprove = async () => {
    if (!approveOrder) return;
    setActionLoading(true);
    try {
      await apiClient(`/orders/${approveOrder.id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ totalCost: Number(totalCostInput) || 0 }),
      });
      setApproveOrder(null);
      setTotalCostInput('');
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Không thể phê duyệt');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectOrder || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await apiClient(`/orders/${rejectOrder.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectOrder(null);
      setRejectReason('');
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Không thể từ chối');
    } finally {
      setActionLoading(false);
    }
  };

  // Filter by search locally (order id / customer email)
  const displayedOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.customerEmail || '').toLowerCase().includes(q) ||
      (o.contactName || '').toLowerCase().includes(q) ||
      o.originLocation.toLowerCase().includes(q) ||
      o.destinationLocation.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-heading, #0f172a)', margin: 0 }}>
            Transport Requests
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', margin: '4px 0 0 0' }}>
            Review, price and approve customer transport requests
          </p>
        </div>
        <div style={{ background: '#eff6ff', padding: '10px 18px', borderRadius: '10px', border: '1px solid #dbeafe', textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 600, textTransform: 'uppercase' }}>Total Requests</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#1e40af' }}>{pagination.total}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        padding: '16px 20px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        {/* Row 1: Search + Status tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', minWidth: '260px' }}>
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by ID, email, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%' }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Filter size={14} color="#64748b" />
            {(['all', 'requested', 'under_review', 'approved', 'rejected'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: filterStatus === s ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                  backgroundColor: filterStatus === s ? '#eff6ff' : '#ffffff',
                  color: filterStatus === s ? '#1d4ed8' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Date range + Limit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Departure date:</span>
          <input
            type="date"
            value={departureDateFrom}
            onChange={(e) => setDepartureDateFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', backgroundColor: '#f8fafc' }}
          />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>to</span>
          <input
            type="date"
            value={departureDateTo}
            min={departureDateFrom}
            onChange={(e) => setDepartureDateTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', backgroundColor: '#f8fafc' }}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Rows:</span>
            {([10, 20] as const).map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: limit === n ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                  backgroundColor: limit === n ? '#eff6ff' : '#ffffff',
                  color: limit === n ? '#1d4ed8' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626', fontSize: '14px' }}>{error}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f8fafc' }}>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>#ID</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Customer</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Route</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                  <button onClick={() => handleSort('requestedDate')} style={{ display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Departure <SortIcon field="requestedDate" />
                  </button>
                </th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                  <button onClick={() => handleSort('totalCost')} style={{ display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Cost <SortIcon field="totalCost" />
                  </button>
                </th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                  <button onClick={() => handleSort('createdAt')} style={{ display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    Submitted <SortIcon field="createdAt" />
                  </button>
                </th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    No transport requests found
                  </td>
                </tr>
              ) : (
                displayedOrders.map((order) => {
                  const sc = STATUS_COLORS[order.status] || STATUS_COLORS.cancelled;
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1d4ed8', fontSize: '13px' }}>#{order.id}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{order.contactName || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{order.customerEmail}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#334155' }}>
                        {order.originLocation} → {order.destinationLocation}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#334155' }}>{formatDate(order.requestedDate)}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, color: order.totalCost > 0 ? '#15803d' : '#94a3b8' }}>
                        {formatCurrency(order.totalCost)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                          {STATUS_LABELS[order.status]}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#64748b' }}>{formatDate(order.createdAt)}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {/* View */}
                          <button
                            onClick={() => router.push(`/manager/requests/${order.id}`)}
                            title="View Details"
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#475569', fontWeight: 600 }}
                          >
                            <Eye size={13} /> View
                          </button>

                          {/* Approve - only for requested status */}
                          {order.status === 'requested' && (
                            <button
                              onClick={() => { setApproveOrder(order); setTotalCostInput(''); }}
                              title="Approve"
                              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #bbf7d0', background: '#dcfce7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#15803d', fontWeight: 600 }}
                            >
                              <CheckCircle size={13} /> Approve
                            </button>
                          )}

                          {/* Reject - only for requested status */}
                          {order.status === 'requested' && (
                            <button
                              onClick={() => { setRejectOrder(order); setRejectReason(''); }}
                              title="Reject"
                              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fee2e2', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#b91c1c', fontWeight: 600 }}
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          )}

                          {/* PDF Export */}
                          <button
                            onClick={() => exportQuotationPDF(order)}
                            title="Export Quotation PDF"
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #dbeafe', background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1d4ed8', fontWeight: 600 }}
                          >
                            <Download size={13} /> PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total} requests
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: page === 1 ? '#f8fafc' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#cbd5e1' : '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: page === pageNum ? '1px solid #1d4ed8' : '1px solid #e2e8f0', background: page === pageNum ? '#eff6ff' : '#fff', cursor: 'pointer', fontWeight: page === pageNum ? 700 : 400, color: page === pageNum ? '#1d4ed8' : '#475569', fontSize: '13px' }}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: page === pagination.totalPages ? '#f8fafc' : '#fff', cursor: page === pagination.totalPages ? 'not-allowed' : 'pointer', color: page === pagination.totalPages ? '#cbd5e1' : '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {approveOrder && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>Approve Request #{approveOrder.id}</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
              {approveOrder.originLocation} → {approveOrder.destinationLocation}<br />
              Customer: {approveOrder.contactName || approveOrder.customerEmail}
            </p>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
              Quoted Price (VND) <span style={{ color: '#94a3b8', fontWeight: 400 }}>optional</span>
            </label>
            <input
              type="number"
              min={0}
              value={totalCostInput}
              onChange={(e) => setTotalCostInput(e.target.value)}
              placeholder="e.g. 15000000"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setApproveOrder(null)} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleApprove} disabled={actionLoading} style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: '#15803d', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: actionLoading ? 0.7 : 1 }}>
                {actionLoading ? 'Approving...' : '✓ Approve Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectOrder && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#b91c1c', margin: '0 0 8px' }}>Reject Request #{rejectOrder.id}</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
              {rejectOrder.originLocation} → {rejectOrder.destinationLocation}<br />
              Customer: {rejectOrder.contactName || rejectOrder.customerEmail}
            </p>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
              Rejection Reason <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Please provide a detailed reason for rejection..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: rejectReason.trim() ? '1px solid #cbd5e1' : '1px solid #fecaca', fontSize: '13px', resize: 'vertical', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectOrder(null)} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()} style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: (actionLoading || !rejectReason.trim()) ? 0.7 : 1 }}>
                {actionLoading ? 'Rejecting...' : '✗ Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
