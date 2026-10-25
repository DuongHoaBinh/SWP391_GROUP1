'use client';

import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Search,
  Filter,
  ShieldCheck,
  Building2,
  FileText,
  User,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  documentsApi,
  ComplianceOrderSummary,
  OrderComplianceChecklist,
} from '@/features/documents/api/documents.api';
import toast from 'react-hot-toast';

export default function ComplianceOrdersPage() {
  const [orders, setOrders] = useState<ComplianceOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_SEND' | 'AWAITING_UPLOAD' | 'COMPLIANT'>('ALL');

  // Modal State for Review & Send Requirements
  const [selectedOrder, setSelectedOrder] = useState<ComplianceOrderSummary | null>(null);
  const [checklist, setChecklist] = useState<OrderComplianceChecklist | null>(null);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [customNotes, setCustomNotes] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const data = await documentsApi.getComplianceOrders();
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch compliance orders:', err);
      toast.error('Không thể tải danh sách đơn hàng chờ kiểm dịch');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openOrderModal = async (order: ComplianceOrderSummary) => {
    setSelectedOrder(order);
    setCustomNotes('');
    setIsLoadingChecklist(true);
    try {
      const chk = await documentsApi.getOrderComplianceChecklist(order.orderId);
      setChecklist(chk);
    } catch (err) {
      console.error('Failed to load checklist:', err);
      toast.error('Không thể tải bảng checklist quy định cho đơn hàng này');
    } finally {
      setIsLoadingChecklist(false);
    }
  };

  const handleSendRequirements = async () => {
    if (!selectedOrder) return;
    setIsSending(true);
    try {
      await documentsApi.sendComplianceRequirements(selectedOrder.orderId, {
        customNotes: customNotes.trim() || undefined,
      });

      toast.success(
        `Đã gửi yêu cầu danh mục hồ sơ kiểm dịch cho khách hàng của đơn ${selectedOrder.requestCode} thành công!`
      );
      setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || 'Không thể gửi yêu cầu hồ sơ');
    } finally {
      setIsSending(false);
    }
  };

  // Filtered orders
  const filteredOrders = orders.filter((order) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      order.requestCode.toLowerCase().includes(q) ||
      order.customerName.toLowerCase().includes(q) ||
      order.destinationLocation.toLowerCase().includes(q) ||
      order.destinationCountry.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === 'PENDING_SEND') return !order.requirementsSent;
    if (statusFilter === 'AWAITING_UPLOAD') return order.requirementsSent && !order.isFullyCompliant;
    if (statusFilter === 'COMPLIANT') return order.isFullyCompliant;

    return true;
  });

  const pendingSendCount = orders.filter((o) => !o.requirementsSent).length;
  const awaitingUploadCount = orders.filter((o) => o.requirementsSent && !o.isFullyCompliant).length;
  const fullyCompliantCount = orders.filter((o) => o.isFullyCompliant).length;

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <ClipboardCheck size={20} />
            </span>
            <h1 className="text-lg font-bold text-slate-900 m-0">
              Quản lý Hồ sơ Kiểm dịch theo Đơn hàng
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
              {pendingSendCount} đơn chờ phát lệnh yêu cầu
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Chuyển giao từ Flow 1: Rà soát điểm đến của các đơn đã duyệt, áp dụng quy chuẩn kiểm dịch và gửi yêu cầu hồ sơ cho khách hàng.
          </p>
        </div>
      </div>

      {/* 2. Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'ALL'
              ? 'bg-blue-50/60 border-blue-500 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Tổng đơn đã duyệt</span>
            <Layers size={16} className="text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">{orders.length} đơn</div>
        </div>

        <div
          onClick={() => setStatusFilter('PENDING_SEND')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'PENDING_SEND'
              ? 'bg-amber-50/60 border-amber-500 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
            <span>Chờ gửi yêu cầu hồ sơ</span>
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-900 mt-1">{pendingSendCount} đơn cần xử lý</div>
        </div>

        <div
          onClick={() => setStatusFilter('AWAITING_UPLOAD')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'AWAITING_UPLOAD'
              ? 'bg-blue-50/60 border-blue-500 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-blue-700">
            <span>Đã gửi (Chờ khách nộp)</span>
            <Clock size={16} className="text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-900 mt-1">{awaitingUploadCount} đơn</div>
        </div>

        <div
          onClick={() => setStatusFilter('COMPLIANT')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'COMPLIANT'
              ? 'bg-emerald-50/60 border-emerald-500 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>Đạt chuẩn tuân thủ 100%</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-900 mt-1">{fullyCompliantCount} đơn</div>
        </div>
      </div>

      {/* 3. Main Orders Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Search bar */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-80 shadow-2xs">
            <Search size={15} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Tìm mã đơn, tên khách hàng, điểm đến..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-xs w-full bg-transparent"
            />
          </div>

          <div className="text-xs text-slate-500 font-semibold">
            Hiển thị <strong>{filteredOrders.length}</strong> đơn vận chuyển
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5 w-24">Mã đơn</th>
                <th className="p-3.5">Khách hàng</th>
                <th className="p-3.5">Lộ trình & Nước đến</th>
                <th className="p-3.5 w-28 text-center">Số lượng ngựa</th>
                <th className="p-3.5 w-36">Hồ sơ đã duyệt</th>
                <th className="p-3.5 w-48">Trạng thái gửi yêu cầu</th>
                <th className="p-3.5 w-36 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mb-2"></div>
                    <div>Đang tải dữ liệu đơn hàng...</div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <Info size={30} className="mx-auto text-slate-300 mb-1" />
                    Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isSent = order.requirementsSent;
                  const isDone = order.isFullyCompliant;

                  return (
                    <tr key={order.orderId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-xs text-blue-700">
                        {order.requestCode}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 text-xs">{order.customerName}</div>
                        <div className="text-[11px] text-slate-400">{order.customerEmail}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                          <span className="truncate max-w-[120px]">{order.originLocation}</span>
                          <ArrowRight size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[140px] font-bold text-slate-900">
                            {order.destinationLocation}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {order.destinationCountry}
                          </span>
                          {order.isUsingGlobalBaseline && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">
                              WOAH Baseline
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {order.horsesCount} ngựa
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="text-xs font-semibold text-slate-700">
                          {order.approvedDocsCount} / {order.totalRequiredDocs} chứng từ
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                            style={{
                              width: `${
                                order.totalRequiredDocs > 0
                                  ? (order.approvedDocsCount / order.totalRequiredDocs) * 100
                                  : 0
                              }%`,
                            }}
                          ></div>
                        </div>
                      </td>
                      <td className="p-3.5">
                        {!isSent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle size={12} /> Chưa gửi yêu cầu
                          </span>
                        ) : isDone ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> Hoàn tất 100%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock size={12} /> Đang chờ nộp hồ sơ
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => openOrderModal(order)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 mx-auto cursor-pointer ${
                            !isSent
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                          }`}
                        >
                          {!isSent ? (
                            <>
                              <Send size={12} /> Thiết lập & Gửi
                            </>
                          ) : (
                            <>Xem Checklist</>
                          )}
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

      {/* 4. MODAL: Thiết lập & Phát lệnh Yêu cầu Hồ sơ kiểm dịch */}
      {selectedOrder && (
        <Modal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title={`Thiết lập & Gửi Yêu cầu Hồ sơ - ${selectedOrder.requestCode}`}
          subtitle={`Khách hàng: ${selectedOrder.customerName} • Điểm đến: ${selectedOrder.destinationLocation}`}
          maxWidth="700px"
        >
          <div className="flex flex-col gap-4 pt-1">
            {/* Corridor Context Banner */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-start gap-3">
              <span className="p-1 bg-blue-600 text-white rounded-md shrink-0 mt-0.5">
                <ShieldCheck size={16} />
              </span>
              <div className="text-xs text-blue-900 leading-relaxed">
                <div>
                  Hệ thống nhận diện quốc gia đích: <strong>{selectedOrder.destinationCountry}</strong>.
                  {checklist?.isUsingGlobalBaseline && (
                    <span className="text-purple-700 font-semibold ml-1">
                      (Đang áp dụng Tiêu chuẩn Quốc tế Cơ bản WOAH/FEI)
                    </span>
                  )}
                </div>
                <div className="text-blue-700 mt-0.5">
                  Đơn vận chuyển có <strong>{selectedOrder.horsesCount} con ngựa</strong>. Khi gửi yêu cầu, khách hàng sẽ nhận được thông báo kèm danh mục chính xác các loại chứng từ cần nộp.
                </div>
              </div>
            </div>

            {/* Checklist items preview */}
            <div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Danh mục chứng chỉ bắt buộc cho chuyến đi:</span>
                <span className="text-[11px] font-normal text-slate-400">
                  {checklist?.horses?.[0]?.missingRegulations?.length || 0} loại chứng từ / con ngựa
                </span>
              </div>

              {isLoadingChecklist ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mb-1"></div>
                  <div>Đang tải quy định kiểm dịch...</div>
                </div>
              ) : checklist?.horses?.[0]?.missingRegulations ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {checklist.horses[0].missingRegulations.map((reg) => (
                    <div
                      key={reg.id}
                      className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{reg.description || reg.documentType}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">Mã: {reg.documentType}</div>
                      </div>
                      <span className="px-2 py-0.5 bg-white text-slate-600 rounded border border-slate-200 text-[10.5px] font-semibold shrink-0">
                        Bắt buộc
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Specialist Custom Notes */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Ghi chú / Hướng dẫn thêm cho khách hàng (Tùy chọn):
              </label>
              <textarea
                rows={2}
                placeholder="VD: Quý khách lưu ý giấy chứng nhận kiểm dịch phải được cấp trước giờ xuất phát không quá 72h..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setSelectedOrder(null)}>
                Đóng
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={isSending}
                onClick={handleSendRequirements}
              >
                {isSending ? (
                  'Đang gửi...'
                ) : (
                  <>
                    <Send size={14} className="mr-1.5" />
                    {selectedOrder.requirementsSent
                      ? 'Gửi lại thông báo nhắc nhở khách hàng'
                      : 'Xác nhận & Gửi yêu cầu nộp hồ sơ'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
