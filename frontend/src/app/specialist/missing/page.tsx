'use client';

import React, { useState, useEffect } from 'react';
import { FileX, Search, Filter, BellRing, CheckCircle, Info, Loader2, RefreshCw } from 'lucide-react';
import { useDocumentStore } from '@/lib/document-store';
import { documentsApi } from '@/features/documents/api/documents.api';
import toast from 'react-hot-toast';

interface MissingDocItem {
  id: string;
  orderId?: number;
  reqCode: string;
  horseName: string;
  type: string;
  due: string;
  customer: string;
  status: 'MISSING' | 'REJECTED';
  rejectionReason?: string;
  remindersSent?: number;
}

export default function MissingDocumentsPage() {
  const { missingDocs: localMissingDocs } = useDocumentStore();
  const [realMissingDocs, setRealMissingDocs] = useState<MissingDocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const fetchRealData = async () => {
    setLoading(true);
    try {
      const complianceOrders = await documentsApi.getComplianceOrders();
      // Look for orders that have compliance requirements but are not fully compliant
      const pendingOrders = complianceOrders.filter((o) => !o.isFullyCompliant);

      const checklistPromises = pendingOrders.map(async (order) => {
        try {
          const checklist = await documentsApi.getOrderComplianceChecklist(order.orderId);
          return { order, checklist };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(checklistPromises);
      const aggregated: MissingDocItem[] = [];

      for (const res of results) {
        if (!res) continue;
        const { order, checklist } = res;

        for (const horse of checklist.horses || []) {
          // Missing regulations
          if (horse.missingRegulations && horse.missingRegulations.length > 0) {
            for (const reg of horse.missingRegulations) {
              aggregated.push({
                id: `miss-${order.orderId}-${horse.horseId}-${reg.id}`,
                orderId: order.orderId,
                horseName: horse.horseName,
                reqCode: order.requestCode,
                type: reg.documentType,
                customer: order.customerName || order.customerEmail || 'Customer',
                due: 'Chờ nộp hồ sơ',
                status: 'MISSING',
                remindersSent: 0,
              });
            }
          }

          // Rejected documents
          if (horse.documents && horse.documents.length > 0) {
            const rejectedDocs = horse.documents.filter((d: any) => d.status === 'rejected');
            for (const rDoc of rejectedDocs) {
              aggregated.push({
                id: `rej-${order.orderId}-${horse.horseId}-${rDoc.id}`,
                orderId: order.orderId,
                horseName: horse.horseName,
                reqCode: order.requestCode,
                type: rDoc.regulationDocType || rDoc.docType,
                customer: order.customerName || order.customerEmail || 'Customer',
                due: rDoc.createdAt
                  ? new Date(rDoc.createdAt).toLocaleDateString('vi-VN')
                  : 'Chờ nộp lại',
                status: 'REJECTED',
                rejectionReason: rDoc.reviewerNotes || 'Hồ sơ chưa đạt yêu cầu kiểm dịch.',
                remindersSent: 0,
              });
            }
          }
        }
      }

      setRealMissingDocs(aggregated);
    } catch (err) {
      console.error('Failed to load missing documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRealData();
  }, []);

  // Combine real DB items with any valid non-mock items from local store
  const allMissingDocs: MissingDocItem[] = [
    ...realMissingDocs,
    ...localMissingDocs.filter(
      (d) =>
        d.id !== 'MISS-1' &&
        d.id !== 'MISS-2' &&
        d.horseName !== 'Royal Star' &&
        d.horseName !== 'Midnight' &&
        !realMissingDocs.some((r) => r.id === d.id)
    ),
  ];

  // Dynamic unique customer list
  const uniqueCustomers = Array.from(new Set(allMissingDocs.map((d) => d.customer)));

  const filteredMissing = allMissingDocs.filter((doc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      doc.horseName.toLowerCase().includes(q) ||
      doc.reqCode.toLowerCase().includes(q) ||
      doc.type.toLowerCase().includes(q) ||
      doc.customer.toLowerCase().includes(q) ||
      (doc.rejectionReason && doc.rejectionReason.toLowerCase().includes(q));
    const matchesCustomer = customerFilter === 'ALL' || doc.customer === customerFilter;
    return matchesSearch && matchesCustomer;
  });

  const handleSendReminder = async (doc: MissingDocItem) => {
    setSendingId(doc.id);
    try {
      if (doc.orderId) {
        await documentsApi.notifyMissingDocuments(doc.orderId, {
          message: `Nhắc nhở nộp hoặc cập nhật chứng từ kiểm dịch (${doc.type}) cho ngựa ${doc.horseName}.`,
        });
      }
      setRealMissingDocs((prev) =>
        prev.map((item) =>
          item.id === doc.id
            ? { ...item, remindersSent: (item.remindersSent || 0) + 1 }
            : item
        )
      );
      toast.success(`Đã gửi thông báo nhắc nhở nộp hồ sơ tới ${doc.customer}!`);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể gửi thông báo nhắc nhở');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">Missing & Rejected Documents</h1>
            {allMissingDocs.length > 0 ? (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800">
                {allMissingDocs.length} Action Needed
              </span>
            ) : (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle size={12} /> All Compliant
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track compliance blockers, view rejection reasons, and notify customers.
          </p>
        </div>

        <button
          onClick={fetchRealData}
          disabled={loading}
          className="self-start md:self-auto px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : 'text-slate-500'} />
          Làm mới
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search by horse, code, or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-sm w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-semibold transition-colors ${
                customerFilter !== 'ALL'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
              }`}
            >
              <Filter size={14} /> {customerFilter === 'ALL' ? 'All Customers' : customerFilter}
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
                <button
                  onClick={() => {
                    setCustomerFilter('ALL');
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    customerFilter === 'ALL'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  All Customers
                </button>
                {uniqueCustomers.map((cust) => (
                  <button
                    key={cust}
                    onClick={() => {
                      setCustomerFilter(cust);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      customerFilter === cust
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {cust}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Horse / Request</th>
                <th className="p-4">Document / Issue</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Due Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">
                    <Loader2 size={28} className="mx-auto text-blue-600 animate-spin mb-2" />
                    Đang tải dữ liệu hồ sơ kiểm dịch...
                  </td>
                </tr>
              ) : filteredMissing.length > 0 ? (
                filteredMissing.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-slate-900 m-0">{doc.horseName}</p>
                      <p className="text-xs text-blue-600 font-semibold m-0">{doc.reqCode}</p>
                    </td>
                    <td className="p-4">
                      <div className="font-medium flex items-center gap-2 text-slate-800">
                        <FileX
                          size={16}
                          className={doc.status === 'REJECTED' ? 'text-red-500' : 'text-amber-500'}
                        />
                        <span>{doc.type}</span>
                      </div>
                      {doc.rejectionReason && (
                        <p className="text-xs text-red-600 mt-1 mb-0 flex items-start gap-1 bg-red-50 p-1.5 rounded border border-red-100">
                          <Info size={12} className="shrink-0 mt-0.5" />
                          <span>
                            <strong>Reason:</strong> {doc.rejectionReason}
                          </span>
                        </p>
                      )}
                    </td>
                    <td className="p-4 font-semibold text-slate-700">{doc.customer}</td>
                    <td className="p-4 font-bold text-slate-600">{doc.due}</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            doc.status === 'REJECTED'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {doc.status === 'REJECTED' ? 'Rejected' : 'Missing'}
                        </span>
                        {doc.remindersSent && doc.remindersSent > 0 ? (
                          <span className="text-[10px] text-slate-500 font-medium">
                            {doc.remindersSent} reminder{doc.remindersSent > 1 ? 's' : ''} sent
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleSendReminder(doc)}
                        disabled={sendingId === doc.id}
                        className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {sendingId === doc.id ? (
                          <Loader2 size={13} className="animate-spin text-blue-600" />
                        ) : (
                          <BellRing size={13} className="text-blue-600" />
                        )}
                        Send Reminder
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle size={24} />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 m-0">
                      Tất cả đơn hàng đã đầy đủ hồ sơ
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 mb-0">
                      Hiện không có chứng từ nào bị thiếu hoặc bị từ chối cần bổ sung.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
