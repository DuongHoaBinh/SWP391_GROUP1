'use client';

import React, { useState } from 'react';
import { Users, UserCheck, ShieldCheck, Truck, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function ManagerStaffPage() {
  const staff = [
    { id: 'usr-spec-01', name: 'Sarah Jenkins', role: 'Transport Specialist', email: 'specialist@example.com', activeTrips: 2, status: 'Active' },
    { id: 'usr-coord-01', name: 'Alex Morgan', role: 'Fleet Coordinator', email: 'coordinator@example.com', activeTrips: 3, status: 'Active' },
    { id: 'usr-drv-01', name: 'Michael Brown', role: 'Driver / Escort', email: 'driver@example.com', activeTrips: 1, status: 'On Route' },
    { id: 'usr-drv-02', name: 'Dr. Nguyen (Vet)', role: 'Equine Medical Escort', email: 'vet.nguyen@example.com', activeTrips: 1, status: 'On Route' },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Operations Staff & Assignment</h1>
          <p className="text-sm text-slate-500 mt-1">
            Allocate Transport Specialists, Fleet Coordinators, Drivers, and Equine Veterinarians.
          </p>
        </div>
        <Button variant="primary" onClick={() => toast.success('Staff invitation dialog')}>
          <Plus size={18} className="mr-1.5" /> Provision New Staff
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4">Staff Member</th>
              <th className="p-4">Assigned Role</th>
              <th className="p-4">Contact</th>
              <th className="p-4">Active Trip Assignments</th>
              <th className="p-4">Duty Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/70">
                <td className="p-4 font-bold text-slate-900">{s.name}</td>
                <td className="p-4 font-semibold text-blue-600">{s.role}</td>
                <td className="p-4 text-slate-600 text-xs">{s.email}</td>
                <td className="p-4 font-bold text-slate-800">{s.activeTrips} Trips Assigned</td>
                <td className="p-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    s.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
