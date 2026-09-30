'use client';

import React from 'react';
import { FileX, Search, Filter, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const MOCK_MISSING = [
  { id: 'MISS-1', reqCode: 'TR-2026-002', horseName: 'Royal Star', type: 'Quarantine Certificate', due: 'Sep 29, 2026', customer: 'Alex Morgan' },
  { id: 'MISS-2', reqCode: 'TR-2026-008', horseName: 'Midnight', type: 'Export Permit (UAE)', due: 'Oct 01, 2026', customer: 'Emily Chen' }
];

export default function MissingDocumentsPage() {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Missing Documents</h1>
          <p className="text-sm text-slate-500 mt-1">Track and request missing compliance documents from customers.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input type="text" placeholder="Search missing docs..." className="border-none outline-none text-sm w-full" />
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50">
            <Filter size={14} /> Filter
          </button>
        </div>
        
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4">Horse / Request</th>
              <th className="p-4">Missing Document</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Due Date</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_MISSING.map(doc => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="p-4">
                  <p className="font-bold text-slate-900 m-0">{doc.horseName}</p>
                  <p className="text-xs text-blue-600 font-semibold m-0">{doc.reqCode}</p>
                </td>
                <td className="p-4 font-medium flex items-center gap-2 text-slate-800">
                  <FileX size={16} className="text-red-500" /> {doc.type}
                </td>
                <td className="p-4 font-semibold text-slate-700">{doc.customer}</td>
                <td className="p-4 font-bold text-red-600">{doc.due}</td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => toast.success(`Notification sent to ${doc.customer} for ${doc.type}`)}
                    className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-sm"
                  >
                    Send Reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
