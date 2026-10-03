'use client';

import React from 'react';
import { MapPin, Globe, Plane, Truck, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ManagerPlanningPage() {
  const plans = [
    { id: 'MP-01', route: 'HCMC → Singapore Turf Club', type: 'Air + Overland', budget: '15,000,000 VND', status: 'Feasible (Approved)', legs: 'Overland Staging → Air Transit (B777 Cargo) → Kranji Isolation' },
    { id: 'MP-02', route: 'Hanoi → Bangkok Royal Stables', type: 'Overland Corridor', budget: '22,000,000 VND', status: 'In Dispatch Planning', legs: 'Soc Son → Ha Tinh Border → Vientiane Rest → Bangkok Destination' },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 m-0">Master Transport Planning</h1>
        <p className="text-sm text-slate-500 mt-1">
          Feasibility analysis, multimodal routes, airline stall allocations, and transfer hubs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between gap-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100">{p.id}</span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100">{p.status}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 m-0">{p.route}</h3>
              <p className="text-xs text-slate-500 mt-1">Modality: <strong>{p.type}</strong> • Budget: <strong>{p.budget}</strong></p>
              <div className="mt-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-100">
                <strong>Execution Corridor:</strong> {p.legs}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="outline" size="sm">Export Plan Dossier</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
