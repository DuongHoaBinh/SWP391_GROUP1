'use client';

import React, { useState } from 'react';
import { Truck, Search, Filter, CheckCircle2, XCircle, AlertCircle, Eye, ArrowRight, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/api-client';
import { buildEquineRoute } from '@/lib/geo-corridors';
import useSWR from 'swr';
import toast from 'react-hot-toast';

const fetcher = (url: string) => apiClient<any[]>(url);

export default function ManagerRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch orders from backend
  const { data: orders = [], isLoading, mutate } = useSWR('/orders', fetcher, {
    revalidateOnFocus: true,
  });

  // Modal states
  const [activeModal, setActiveModal] = useState<'NONE' | 'APPROVE' | 'REJECT' | 'CHANGE'>('NONE');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [costCurrency, setCostCurrency] = useState<'USD' | 'VND'>('USD');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openActionModal = (type: 'APPROVE' | 'REJECT' | 'CHANGE', order: any) => {
    setActiveModal(type);
    setSelectedOrder(order);
    if (type === 'APPROVE') {
      const routeInfo = buildEquineRoute(order.originLocation || '', order.destinationLocation || '');
      const horseCount = order.requestedHorseCount || 1;
      // Estimate USD default: e.g. base ~$600 + $1.8/km
      const estimatedUsd = Math.max(1200, Math.round((600 + routeInfo.distanceKm * 1.6) * Math.sqrt(horseCount)));
      setCostCurrency('USD');
      setInputValue(String(estimatedUsd));
    } else {
      setInputValue('');
    }
  };

  const handleCurrencyToggle = (newCurr: 'USD' | 'VND') => {
    if (newCurr === costCurrency) return;
    const val = parseFloat(inputValue);
    if (!isNaN(val) && val > 0) {
      if (newCurr === 'VND') {
        setInputValue(String(Math.round(val * 25400)));
      } else {
        setInputValue(String(Math.round(val / 25400)));
      }
    }
    setCostCurrency(newCurr);
  };

  const formatEquivalent = (valStr: string, curr: 'USD' | 'VND') => {
    const val = parseFloat(valStr);
    if (isNaN(val) || val <= 0) return '---';
    if (curr === 'USD') {
      const vnd = Math.round(val * 25400);
      return `≈ ${vnd.toLocaleString('vi-VN')} VND`;
    } else {
      const usd = Math.round(val / 25400);
      return `≈ $${usd.toLocaleString('en-US')} USD`;
    }
  };

  const handleConfirmAction = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      if (activeModal === 'APPROVE') {
        const cost = parseFloat(inputValue);
        if (isNaN(cost) || cost <= 0) {
          toast.error('Please enter a valid cost');
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrder.id}/approve`, {
          method: 'PATCH',
          body: JSON.stringify({ totalCost: cost }),
        });
        toast.success(`Order #${selectedOrder.id} approved!`);
      } else if (activeModal === 'REJECT') {
        if (!inputValue.trim()) {
          toast.error('Rejection reason required');
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrder.id}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: inputValue }),
        });
        toast.success(`Order #${selectedOrder.id} rejected.`);
      } else if (activeModal === 'CHANGE') {
        if (!inputValue.trim()) {
          toast.error('Required change details needed');
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrder.id}/request-changes`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: inputValue }),
        });
        toast.success(`Changes requested for Order #${selectedOrder.id}.`);
      }
      mutate();
      setActiveModal('NONE');
      setSelectedOrder(null);
    } catch {
      toast.error('Failed to submit action. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredOrders = orders.filter(o => {
    const s = String(o.status || '').toLowerCase();
    const filterLower = statusFilter.toLowerCase();
    const matchesStatus =
      statusFilter === 'ALL' ||
      s === filterLower ||
      (filterLower === 'ready_to_depart' && (s === 'ready_to_depart' || s === 'ready'));
    const matchesSearch = (o.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (o.originLocation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (o.destinationLocation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (o.requestCode || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">All Transport Orders</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review customer orders, evaluate transport feasibility, and manage service approvals.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Controls */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-80 shadow-sm">
            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
            <input 
              type="text" 
              placeholder="Search customer or city..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="border-none outline-none text-sm w-full bg-transparent" 
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-slate-500 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="requested">Pending Review (requested)</option>
              <option value="approved">Approved</option>
              <option value="planning">In Planning</option>
              <option value="confirmed">Confirmed Plan</option>
              <option value="ready_to_depart">Ready to Depart</option>
              <option value="in_transit">In Transit</option>
              <option value="completed">Completed</option>
              <option value="change_requested">Change Requested</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-4 w-32 whitespace-nowrap">Order ID</th>
                <th className="px-6 py-4 min-w-[180px]">Customer</th>
                <th className="px-6 py-4 min-w-[240px]">Origin / Destination</th>
                <th className="px-6 py-4 text-center w-28 whitespace-nowrap">Horses</th>
                <th className="px-6 py-4 text-center w-44 whitespace-nowrap">Status</th>
                <th className="px-6 py-4 text-center w-64 whitespace-nowrap">Review Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">Loading transport orders...</td>
                </tr>
              ) : paginatedOrders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-4 font-bold text-blue-600 whitespace-nowrap">
                    {order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900 m-0">{order.contactName || 'Customer'}</p>
                    <p className="text-xs text-slate-500 m-0">{order.contactPhone}</p>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <p className="font-semibold text-slate-900 m-0">{order.originLocation}</p>
                    <p className="text-slate-500 m-0">→ {order.destinationLocation}</p>
                  </td>
                  <td className="px-6 py-4 text-center font-semibold text-slate-800 whitespace-nowrap">
                    {order.requestedHorseCount} Horse(s)
                  </td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">
                    {order.status === 'requested' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                        Pending Review
                      </span>
                    )}
                    {order.status === 'approved' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                        Approved
                      </span>
                    )}
                    {order.status === 'planning' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                        In Planning
                      </span>
                    )}
                    {order.status === 'confirmed' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 shadow-2xs">
                        Confirmed Plan
                      </span>
                    )}
                    {(order.status === 'ready_to_depart' || order.status === 'ready') && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                        Ready to Depart
                      </span>
                    )}
                    {order.status === 'in_transit' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200 shadow-2xs">
                        In Transit
                      </span>
                    )}
                    {order.status === 'completed' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs">
                        Completed
                      </span>
                    )}
                    {order.status === 'rejected' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 shadow-2xs">
                        Rejected
                      </span>
                    )}
                    {order.status === 'change_requested' && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                        Change Requested
                      </span>
                    )}
                    {!['requested', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'ready', 'in_transit', 'completed', 'rejected', 'change_requested'].includes(order.status) && (
                      <span className="inline-flex items-center justify-center w-[136px] h-[28px] rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                        {order.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">
                    {order.status === 'requested' ? (
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openActionModal('APPROVE', order)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openActionModal('CHANGE', order)}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
                        >
                          Revise
                        </button>
                        <button
                          onClick={() => openActionModal('REJECT', order)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : order.status === 'planning' ? (
                      <span className="inline-flex items-center justify-center w-[96px] h-[28px] rounded-md text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200">
                        In Planning
                      </span>
                    ) : order.status === 'ready_to_depart' || order.status === 'ready' ? (
                      <span className="inline-flex items-center justify-center w-[96px] h-[28px] rounded-md text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                        Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-[96px] h-[28px] rounded-md text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200">
                        Decided
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">No transport requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar (10 orders per page) */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            Hiển thị <span className="font-bold text-slate-700">{filteredOrders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> -{' '}
            <span className="font-bold text-slate-700">{Math.min(currentPage * pageSize, filteredOrders.length)}</span> trong tổng số{' '}
            <span className="font-bold text-slate-700">{filteredOrders.length}</span> đơn hàng
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Trước
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                    currentPage === page
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Decision Modal */}
      {activeModal !== 'NONE' && selectedOrder && (
        <Modal 
          isOpen={true} 
          onClose={() => setActiveModal('NONE')} 
          title={
            activeModal === 'APPROVE' ? `Phê duyệt đơn vận chuyển ${selectedOrder.requestCode || `REQ-${String(selectedOrder.id).padStart(3, '0')}`}` :
            activeModal === 'REJECT' ? `Từ chối đơn vận chuyển ${selectedOrder.requestCode || `REQ-${String(selectedOrder.id).padStart(3, '0')}`}` : 
            `Yêu cầu chỉnh sửa đơn ${selectedOrder.requestCode || `REQ-${String(selectedOrder.id).padStart(3, '0')}`}`
          } 
          maxWidth="500px"
        >
          <div className="flex flex-col gap-4">
            {activeModal === 'APPROVE' && selectedOrder && (() => {
              const routeInfo = buildEquineRoute(selectedOrder.originLocation || '', selectedOrder.destinationLocation || '');
              const horseCount = selectedOrder.requestedHorseCount || 1;
              return (
                <div className="flex flex-col gap-4">
                  {/* Route & Distance Card */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>Lộ trình & Khoảng cách đã xác định:</span>
                      <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {routeInfo.mode === 'air' ? '✈️ Đường hàng không' : '🚛 Đường bộ liên vận'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{selectedOrder.originLocation || 'Vietnam'}</span>
                      <ArrowRight size={14} className="text-slate-400 shrink-0" />
                      <span>{selectedOrder.destinationLocation || 'Destination'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Khoảng cách:</span>
                        <strong className="text-blue-600 text-sm font-bold">{routeInfo.distanceKm.toLocaleString('vi-VN')} km</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Thời gian ước tính:</span>
                        <strong className="text-slate-800 text-sm font-bold">~{routeInfo.durationHours} giờ</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Số lượng ngựa:</span>
                        <strong className="text-emerald-600 text-sm font-bold">{horseCount} cá thể</strong>
                      </div>
                    </div>
                  </div>

                  {/* Cost & Currency input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Chi phí vận chuyển báo giá (Total Cost) *
                      </label>
                      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                        <button
                          type="button"
                          onClick={() => handleCurrencyToggle('USD')}
                          className={`px-2.5 py-0.5 text-xs font-bold rounded-md transition-all ${
                            costCurrency === 'USD'
                              ? 'bg-white text-blue-600 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          USD ($)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCurrencyToggle('VND')}
                          className={`px-2.5 py-0.5 text-xs font-bold rounded-md transition-all ${
                            costCurrency === 'VND'
                              ? 'bg-white text-emerald-600 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          VND (₫)
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <input 
                        type="number" 
                        min={1}
                        step={costCurrency === 'USD' ? 50 : 100000}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={costCurrency === 'USD' ? 'e.g. 2500' : 'e.g. 60000000'}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 pr-16"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-500">
                        {costCurrency === 'USD' ? 'USD ($)' : 'VND (₫)'}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                      <span>Quy đổi tham khảo (1 USD ≈ 25,400 VND):</span>
                      <strong className="text-slate-800 font-semibold">{formatEquivalent(inputValue, costCurrency)}</strong>
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeModal === 'REJECT' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Reason for Rejection *</label>
                <textarea 
                  rows={4}
                  placeholder="Provide detailed explanation for rejection..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
            )}

            {activeModal === 'CHANGE' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Modification Instructions *</label>
                <textarea 
                  rows={4}
                  placeholder="Describe required changes (e.g., adjust departure date, provide health certificates)..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-2">
              <Button type="button" variant="outline" onClick={() => setActiveModal('NONE')}>Cancel</Button>
              <Button 
                type="button" 
                variant="primary" 
                disabled={isSubmitting}
                onClick={handleConfirmAction}
                className={activeModal === 'REJECT' ? 'bg-red-600 hover:bg-red-700' : activeModal === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                {isSubmitting ? 'Processing...' : 'Confirm Decision'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
