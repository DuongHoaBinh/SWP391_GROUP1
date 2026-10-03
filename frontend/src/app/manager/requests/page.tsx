'use client';

import React, { useState } from 'react';
import { Truck, Search, Filter, CheckCircle2, XCircle, AlertCircle, Eye, ArrowRight, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';
import toast from 'react-hot-toast';

const fetcher = (url: string) => apiClient<any[]>(url);

export default function ManagerRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch orders from backend with graceful local fallback
  const { data: apiOrders = [], isLoading, mutate } = useSWR('/orders', fetcher, {
    revalidateOnFocus: true,
  });

  const [localOrders, setLocalOrders] = useState<any[]>([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('equitransit_store_requests');
      if (raw) {
        const parsed = JSON.parse(raw);
        setLocalOrders(parsed);
      }
    } catch {}
  }, []);

  const orders = apiOrders.length > 0 ? apiOrders : localOrders.map((lo, idx) => ({
    id: lo.id || lo.requestCode || `ord-${idx + 1}`,
    requestCode: lo.requestCode || `REQ-${String(idx + 1).padStart(3, '0')}`,
    contactName: lo.customerName || 'Al Fares Customer',
    contactPhone: '+84 901 234 567',
    originLocation: lo.origin || 'Cu Chi Stables, HCMC',
    destinationLocation: lo.destination || 'Singapore Turf Club',
    requestedHorseCount: lo.horses?.length || lo.horseCount || 1,
    status: (lo.status || 'requested').toLowerCase() === 'submitted' || (lo.status || '').toLowerCase() === 'pending'
      ? 'requested'
      : (lo.status || 'requested').toLowerCase() === 'approved'
      ? 'approved'
      : (lo.status || 'requested').toLowerCase(),
    horseName: lo.horse?.name || lo.horseName,
  }));

  // Modal states
  const [activeModal, setActiveModal] = useState<'NONE' | 'APPROVE' | 'REJECT' | 'CHANGE'>('NONE');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openActionModal = (type: 'APPROVE' | 'REJECT' | 'CHANGE', order: any) => {
    setActiveModal(type);
    setSelectedOrder(order);
    setInputValue(type === 'APPROVE' ? '15000000' : '');
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
        try {
          await apiClient(`/orders/${selectedOrder.id}/approve`, {
            method: 'PATCH',
            body: JSON.stringify({ totalCost: cost }),
          });
        } catch {}

        // Local storage update for offline / prototype continuity
        try {
          const raw = localStorage.getItem('equitransit_store_requests');
          if (raw) {
            const parsed = JSON.parse(raw);
            const updated = parsed.map((r: any) => {
              if (r.id === selectedOrder.id || r.requestCode === selectedOrder.requestCode || r.requestCode === selectedOrder.id) {
                return {
                  ...r,
                  status: 'APPROVED',
                  statusLabel: 'Approved & Ready for Dispatch',
                  activeStepIndex: 4,
                  totalCost: cost,
                  activities: [
                    {
                      id: `act-${Date.now()}`,
                      timestamp: 'Just now',
                      description: `Transport request approved by Logistics Manager David Vance (Cost: ${cost.toLocaleString()} VND).`,
                      actor: 'Logistics Manager',
                      type: 'system',
                    },
                    ...(r.activities || []),
                  ],
                };
              }
              return r;
            });
            localStorage.setItem('equitransit_store_requests', JSON.stringify(updated));
            setLocalOrders(updated);
          }
        } catch {}

        toast.success(`Order ${selectedOrder.requestCode || selectedOrder.id} approved! Ready for Dispatch.`);
      } else if (activeModal === 'REJECT') {
        if (!inputValue.trim()) {
          toast.error('Rejection reason required');
          setIsSubmitting(false);
          return;
        }
        try {
          await apiClient(`/orders/${selectedOrder.id}/reject`, {
            method: 'PATCH',
            body: JSON.stringify({ reason: inputValue }),
          });
        } catch {}

        try {
          const raw = localStorage.getItem('equitransit_store_requests');
          if (raw) {
            const parsed = JSON.parse(raw);
            const updated = parsed.map((r: any) => {
              if (r.id === selectedOrder.id || r.requestCode === selectedOrder.requestCode || r.requestCode === selectedOrder.id) {
                return {
                  ...r,
                  status: 'REJECTED',
                  statusLabel: 'Rejected',
                  rejectionReason: inputValue,
                };
              }
              return r;
            });
            localStorage.setItem('equitransit_store_requests', JSON.stringify(updated));
            setLocalOrders(updated);
          }
        } catch {}

        toast.success(`Order ${selectedOrder.requestCode || selectedOrder.id} rejected.`);
      } else if (activeModal === 'CHANGE') {
        if (!inputValue.trim()) {
          toast.error('Required change details needed');
          setIsSubmitting(false);
          return;
        }
        try {
          await apiClient(`/orders/${selectedOrder.id}/request-changes`, {
            method: 'PATCH',
            body: JSON.stringify({ reason: inputValue }),
          });
        } catch {}

        toast.success(`Changes requested for Order ${selectedOrder.requestCode || selectedOrder.id}.`);
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

  const filteredOrders = orders.filter(o => {
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    const matchesSearch = (o.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (o.originLocation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (o.destinationLocation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (o.requestCode || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

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
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-none outline-none text-sm w-full bg-transparent" 
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-slate-500 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="requested">Pending Review (requested)</option>
              <option value="approved">Approved</option>
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
                <th className="p-4">Order ID</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Origin / Destination</th>
                <th className="p-4">Horses</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Review Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">Loading transport orders...</td>
                </tr>
              ) : filteredOrders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50/70">
                  <td className="p-4 font-bold text-blue-600">REQ-{String(order.id).padStart(3, '0')}</td>
                  <td className="p-4">
                    <p className="font-bold text-slate-900 m-0">{order.contactName || 'Customer'}</p>
                    <p className="text-xs text-slate-500 m-0">{order.contactPhone}</p>
                  </td>
                  <td className="p-4 text-slate-700 text-xs">
                    <p className="font-semibold text-slate-900 m-0">{order.originLocation}</p>
                    <p className="text-slate-500 m-0">→ {order.destinationLocation}</p>
                  </td>
                  <td className="p-4 font-semibold text-slate-800">{order.requestedHorseCount} Horse(s)</td>
                  <td className="p-4">
                    {order.status === 'requested' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        Pending Review
                      </span>
                    )}
                    {order.status === 'approved' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        Approved
                      </span>
                    )}
                    {order.status === 'rejected' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                        Rejected
                      </span>
                    )}
                    {order.status === 'change_requested' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                        Change Requested
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {order.status === 'requested' ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openActionModal('APPROVE', order)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openActionModal('CHANGE', order)}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-sm"
                        >
                          Revise
                        </button>
                        <button
                          onClick={() => openActionModal('REJECT', order)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">Decided</span>
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
      </div>

      {/* Decision Modal */}
      {activeModal !== 'NONE' && selectedOrder && (
        <Modal 
          isOpen={true} 
          onClose={() => setActiveModal('NONE')} 
          title={
            activeModal === 'APPROVE' ? `Approve Transport Order #${selectedOrder.id}` :
            activeModal === 'REJECT' ? `Reject Order #${selectedOrder.id}` : `Request Changes on Order #${selectedOrder.id}`
          } 
          maxWidth="500px"
        >
          <div className="flex flex-col gap-4">
            {activeModal === 'APPROVE' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Estimated Total Cost (VND / USD) *</label>
                <input 
                  type="number" 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
            )}

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
