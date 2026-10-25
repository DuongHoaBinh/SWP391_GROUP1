'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { apiClient } from '@/lib/api-client';
import { useCustomerStore } from '@/lib/customer-store';

// ─── Types ────────────────────────────────────────────────────────────────────
type ShipmentStatus =
  | 'requested'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'planning'
  | 'in_transit'
  | 'completed'
  | 'cancelled';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

const STATUS_VARIANT: Record<ShipmentStatus, string> = {
  requested: 'pending',
  under_review: 'pending',
  approved: 'success',
  rejected: 'danger',
  planning: 'pending',
  in_transit: 'transit',
  completed: 'success',
  cancelled: 'danger',
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
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(n: number) {
  if (!n || n === 0) return '—';
  return n.toLocaleString('vi-VN') + ' ₫';
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportQuotationPDF(order: TransportOrder) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.cancelled;

  const horsesRows =
    order.horses
      ?.map(
        (h) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.breed || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.gender || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.age ?? '—'} yrs</td>
    </tr>`,
      )
      .join('') ||
    '<tr><td colspan="4" style="padding:12px;color:#94a3b8;text-align:center;">Không có thông tin ngựa</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Báo Giá Vận Chuyển - #${order.id}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff}
    .page{max-width:800px;margin:0 auto;padding:40px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #1e40af;margin-bottom:28px}
    .brand-name{font-size:22px;font-weight:800;color:#1e40af}
    .brand-sub{font-size:12px;color:#64748b;margin-top:3px}
    .doc-title{font-size:24px;font-weight:800;color:#0f172a;text-align:right}
    .doc-id{font-size:13px;color:#64748b;text-align:right;margin-top:4px}
    .doc-date{font-size:12px;color:#94a3b8;text-align:right;margin-top:2px}
    .status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${statusColor.bg};color:${statusColor.color};border:1px solid ${statusColor.border};margin-top:6px}
    .section{margin-bottom:24px}
    .section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .info-box{background:#f8fafc;padding:14px 16px;border-radius:8px;border:1px solid #e2e8f0}
    .info-label{font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-bottom:4px}
    .info-value{font-size:14px;font-weight:600;color:#0f172a}
    table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
    thead{background:#1e40af}
    thead th{padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#fff;text-align:left}
    .cost-section{background:linear-gradient(135deg,#1e40af,#1d4ed8);border-radius:12px;padding:24px;margin:24px 0;color:#fff}
    .cost-label{font-size:13px;opacity:.8;margin-bottom:4px}
    .cost-value{font-size:30px;font-weight:800}
    .cost-sub{font-size:11px;opacity:.6;margin-top:4px}
    .note-box{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#92400e}
    .footer{margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">🏇 RaceHorse Logistics</div>
      <div class="brand-sub">Cross-Border Racehorse Transport System</div>
      <div class="brand-sub" style="margin-top:8px">Hotline: +84 28 3456 7890 | info@racehorse-logistics.vn</div>
    </div>
    <div>
      <div class="doc-title">BÁO GIÁ VẬN CHUYỂN</div>
      <div class="doc-id">Mã yêu cầu: #${order.id}</div>
      <div class="doc-date">Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</div>
      <div style="text-align:right"><span class="status-badge">${STATUS_LABELS[order.status]}</span></div>
    </div>
  </div>

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
    ${order.specialRequirements ? `<div class="note-box" style="margin-top:12px"><strong>Yêu cầu đặc biệt:</strong> ${order.specialRequirements}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Danh sách ngựa vận chuyển (${order.horses?.length || 0} con)</div>
    <table>
      <thead>
        <tr>
          <th>Tên ngựa</th><th>Giống</th><th>Giới tính</th><th>Tuổi</th>
        </tr>
      </thead>
      <tbody>${horsesRows}</tbody>
    </table>
  </div>

  <div class="cost-section">
    <div class="cost-label">Chi phí vận chuyển ước tính</div>
    <div class="cost-value">${order.totalCost > 0 ? order.totalCost.toLocaleString('vi-VN') + ' ₫' : 'Chưa định giá'}</div>
    <div class="cost-sub">${order.totalCost > 0 ? 'Đã bao gồm: phí vận chuyển, kiểm dịch và hải quan cơ bản' : 'Vui lòng chờ Logistics Manager xác nhận báo giá chính thức'}</div>
  </div>

  ${order.rejectionReason ? `
  <div class="section">
    <div class="section-title" style="color:#b91c1c">Lý do từ chối</div>
    <div class="note-box" style="background:#fee2e2;border-color:#fecaca;color:#b91c1c">${order.rejectionReason}</div>
  </div>` : ''}

  <div class="footer">
    <div>
      <div>RaceHorse Logistics Co., Ltd.</div>
      <div>MST: 0315678901 | Số 123 Đường Nguyễn Huệ, Q.1, TP.HCM</div>
    </div>
    <div style="text-align:right">
      <div>Tài liệu này có giá trị trong 30 ngày kể từ ngày xuất</div>
      <div>Powered by RaceHorse Transport System v2.0</div>
    </div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RequestsPage() {
  const router = useRouter();
  const { requests: storeRequests } = useCustomerStore();

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

      const result = await apiClient<PaginatedOrders>(`/orders/my-orders?${params.toString()}`);
      setOrders(result.data || []);
      setPagination({ total: result.total, totalPages: result.totalPages });
    } catch (err: any) {
      // Fallback to local store data if backend is offline or unauthenticated
      if (storeRequests && storeRequests.length > 0) {
        const mappedOrders: TransportOrder[] = storeRequests.map((r, idx) => ({
          id: idx + 1,
          customerId: 1,
          contactName: r.horse?.ownerName || 'Customer',
          contactEmail: 'customer@equitransit.com',
          originLocation: r.origin,
          destinationLocation: r.destination,
          requestedDate: new Date().toISOString(),
          departureDate: r.departureDate,
          status: (r.status.toLowerCase() === 'submitted' ? 'requested' : r.status.toLowerCase() === 'in_review' ? 'under_review' : r.status.toLowerCase()) as ShipmentStatus,
          totalCost: 15000000,
          createdAt: new Date().toISOString(),
          customerEmail: 'customer@equitransit.com',
          horses: r.horses?.map((h, hIdx) => ({
            horseId: hIdx + 1,
            name: h.horse.name,
            breed: h.horse.breed,
            gender: h.horse.gender,
            age: h.horse.age,
          })) || [
            {
              horseId: 1,
              name: r.horse?.name || 'Thunder',
              breed: r.horse?.breed || 'Thoroughbred',
              gender: r.horse?.gender || 'Male',
              age: r.horse?.age || 6,
            },
          ],
          specialRequirements: r.notes,
        }));

        let filtered = mappedOrders;
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
      } else {
        setError(err.message || 'Không thể kết nối đến máy chủ Backend.');
      }
    } finally {
      setLoading(false);
    }
  }, [filterStatus, departureDateFrom, departureDateTo, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset page khi thay đổi filter
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
    return sortOrder === 'asc' ? (
      <ArrowUp size={13} color="var(--primary)" />
    ) : (
      <ArrowDown size={13} color="var(--primary)" />
    );
  };

  // Local search filter
  const displayedOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.contactName || '').toLowerCase().includes(q) ||
      o.originLocation.toLowerCase().includes(q) ||
      o.destinationLocation.toLowerCase().includes(q) ||
      (o.horses?.[0]?.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Breadcrumb & Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/customer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#64748b',
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
              Transport Requests
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Track the approval and execution status of your racehorse shipments.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => router.push('/customer/requests/new')}
        >
          New Transport Request
        </Button>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid var(--border-card)',
          padding: '16px 20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Row 1: Search + Status tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '8px 14px',
              minWidth: '280px',
            }}
          >
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by ID, horse, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                outline: 'none',
                fontSize: '13.5px',
                width: '100%',
              }}
            />
          </div>

          {/* Status filter tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Filter size={14} color="#64748b" />
            {(
              [
                'all',
                'requested',
                'under_review',
                'approved',
                'rejected',
              ] as const
            ).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  border:
                    filterStatus === s
                      ? '1px solid var(--primary)'
                      : '1px solid #e2e8f0',
                  backgroundColor:
                    filterStatus === s ? 'var(--primary-light)' : '#ffffff',
                  color:
                    filterStatus === s ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Date range + Rows per page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
            Departure date:
          </span>
          <input
            type="date"
            value={departureDateFrom}
            onChange={(e) => setDepartureDateFrom(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              backgroundColor: '#f8fafc',
            }}
          />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>to</span>
          <input
            type="date"
            value={departureDateTo}
            min={departureDateFrom}
            onChange={(e) => setDepartureDateTo(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              backgroundColor: '#f8fafc',
            }}
          />

          {/* Rows per page */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Rows:</span>
            {([10, 20] as const).map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  border:
                    limit === n ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                  backgroundColor: limit === n ? 'var(--primary-light)' : '#ffffff',
                  color: limit === n ? 'var(--primary)' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {loading ? (
          <div
            style={{
              padding: '60px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '14px',
            }}
          >
            Loading...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: '#dc2626',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                <th
                  style={{
                    padding: '12px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  #ID
                </th>
                <th
                  style={{
                    padding: '12px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  Horse(s)
                </th>
                <th
                  style={{
                    padding: '12px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  Route
                </th>
                <th style={{ padding: '12px 14px' }}>
                  <button
                    onClick={() => handleSort('requestedDate')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Departure <SortIcon field="requestedDate" />
                  </button>
                </th>
                <th style={{ padding: '12px 14px' }}>
                  <button
                    onClick={() => handleSort('totalCost')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Cost <SortIcon field="totalCost" />
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  Status
                </th>
                <th style={{ padding: '12px 14px' }}>
                  <button
                    onClick={() => handleSort('createdAt')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Submitted <SortIcon field="createdAt" />
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: '48px',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: '14px',
                    }}
                  >
                    No transport requests found.
                  </td>
                </tr>
              ) : (
                displayedOrders.map((order) => {
                  const sc =
                    STATUS_COLORS[order.status] || STATUS_COLORS.cancelled;
                  return (
                    <tr
                      key={order.id}
                      style={{ borderBottom: '1px solid var(--border-light)' }}
                    >
                      {/* ID */}
                      <td style={{ padding: '14px 14px' }}>
                        <Link
                          href={`/customer/requests/${order.id}`}
                          style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '13px' }}
                        >
                          #{order.id}
                        </Link>
                      </td>

                      {/* Horses */}
                      <td style={{ padding: '14px 14px' }}>
                        {order.horses && order.horses.length > 0 ? (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '13px' }}>
                              {order.horses[0].name}
                            </span>
                            {order.horses.length > 1 && (
                              <span
                                style={{
                                  marginLeft: '6px',
                                  fontSize: '11px',
                                  color: '#94a3b8',
                                  background: '#f1f5f9',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                +{order.horses.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '13px' }}>—</span>
                        )}
                      </td>

                      {/* Route */}
                      <td
                        style={{
                          padding: '14px 14px',
                          fontSize: '13px',
                          color: 'var(--text-body)',
                          maxWidth: '200px',
                        }}
                      >
                        {order.originLocation} → {order.destinationLocation}
                      </td>

                      {/* Departure Date */}
                      <td
                        style={{
                          padding: '14px 14px',
                          fontSize: '13px',
                          color: 'var(--text-body)',
                        }}
                      >
                        {formatDate(order.requestedDate)}
                      </td>

                      {/* Cost */}
                      <td
                        style={{
                          padding: '14px 14px',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: order.totalCost > 0 ? '#15803d' : '#94a3b8',
                        }}
                      >
                        {formatCurrency(order.totalCost)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 14px' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}
                        >
                          {STATUS_LABELS[order.status]}
                        </span>
                      </td>

                      {/* Submitted Date */}
                      <td
                        style={{
                          padding: '14px 14px',
                          fontSize: '12px',
                          color: '#64748b',
                        }}
                      >
                        {formatDate(order.createdAt)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <button
                            onClick={() => router.push(`/customer/requests/${order.id}`)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                              background: '#f8fafc',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              color: '#475569',
                              fontWeight: 600,
                            }}
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            onClick={() => exportQuotationPDF(order)}
                            title="Export Quotation PDF"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid #dbeafe',
                              background: '#eff6ff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              color: 'var(--primary)',
                              fontWeight: 600,
                            }}
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

        {/* Pagination Footer */}
        {!loading && pagination.totalPages >= 1 && (
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              {pagination.total === 0
                ? 'No results'
                : `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, pagination.total)} of ${pagination.total} requests`}
            </div>

            {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: page === 1 ? '#f8fafc' : '#fff',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                    color: page === 1 ? '#cbd5e1' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '13px',
                  }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>

                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border:
                          page === pageNum
                            ? '1px solid var(--primary)'
                            : '1px solid #e2e8f0',
                        background:
                          page === pageNum ? 'var(--primary-light)' : '#fff',
                        cursor: 'pointer',
                        fontWeight: page === pageNum ? 700 : 400,
                        color:
                          page === pageNum ? 'var(--primary)' : '#475569',
                        fontSize: '13px',
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: page === pagination.totalPages ? '#f8fafc' : '#fff',
                    cursor: page === pagination.totalPages ? 'not-allowed' : 'pointer',
                    color: page === pagination.totalPages ? '#cbd5e1' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '13px',
                  }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
