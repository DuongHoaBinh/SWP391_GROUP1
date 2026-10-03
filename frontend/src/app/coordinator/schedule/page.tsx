'use client';

import React, { useState } from 'react';
import { CalendarDays, Plus, Clock, Truck, User, CheckCircle2, ChevronRight, Search, Filter, ShieldCheck, MapPin, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { useFleetRouteStore, TripSchedule } from '@/lib/fleet-route-store';
import toast from 'react-hot-toast';

export default function TripSchedulePage() {
  const { schedules, vehicles, routes, dispatchTrip, updateTripStatus } = useFleetRouteStore();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [orderCode, setOrderCode] = useState('TR-2026-004');
  const [horseName, setHorseName] = useState('Thunder');
  const [horseCount, setHorseCount] = useState(2);
  const [departureTime, setDepartureTime] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [selectedVehicleCode, setSelectedVehicleCode] = useState('');
  const [driverName, setDriverName] = useState('John Smith');
  const [escortName, setEscortName] = useState('Dr. Sarah (FEI Vet)');
  const [selectedRouteTitle, setSelectedRouteTitle] = useState('');
  const [notes, setNotes] = useState('Climate-controlled chamber set to 18°C. Standard timothy hay feed.');

  // Approved Orders from Flow 1 & Flow 2
  const [approvedOrders, setApprovedOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('equitransit_store_requests');
      if (raw) {
        const parsed = JSON.parse(raw);
        const filtered = parsed.filter((r: any) =>
          !schedules.some((s) => s.orderCode.toLowerCase() === (r.requestCode || '').toLowerCase())
        );
        if (filtered.length > 0) {
          setApprovedOrders(filtered);
          return;
        }
      }
    } catch {}

    setApprovedOrders([
      {
        id: 'ord-101',
        requestCode: 'TR-2026-001',
        horseName: 'Thunder',
        horseCount: 2,
        origin: 'Cu Chi Stables, HCMC',
        destination: 'Singapore Turf Club',
        departureDate: 'Oct 15, 2026 • 08:00 AM',
        statusLabel: 'Approved & Verified',
      },
      {
        id: 'ord-103',
        requestCode: 'TR-2026-003',
        horseName: 'Eclipse',
        horseCount: 3,
        origin: 'HCMC Logistics Hub',
        destination: 'Kuala Lumpur Turf Club',
        departureDate: 'Oct 20, 2026 • 09:00 AM',
        statusLabel: 'Approved (Awaiting Dispatch)',
      },
      {
        id: 'ord-104',
        requestCode: 'TR-2026-004',
        horseName: 'Pegasus Star',
        horseCount: 1,
        origin: 'Da Nang Equestrian Center',
        destination: 'Vientiane Royal Riding Club',
        departureDate: 'Oct 25, 2026 • 06:00 AM',
        statusLabel: 'Approved (Awaiting Dispatch)',
      },
    ]);
  }, [schedules]);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    const found = approvedOrders.find((o) => o.id === orderId || o.requestCode === orderId);
    if (found) {
      setOrderCode(found.requestCode || 'TR-2026-005');
      setHorseName(found.horse?.name || found.horseName || 'Racehorse');
      const count = Number(found.horseCount || (found.horses ? found.horses.length : 1)) || 1;
      setHorseCount(count);
      setDepartureTime(found.departureDate || 'Oct 20, 2026 • 08:00 AM');

      // Auto-match route if possible
      const matched = routes.find(
        (r) =>
          (found.destination && r.destination.toLowerCase().includes(found.destination.toLowerCase())) ||
          (found.origin && r.origin.toLowerCase().includes(found.origin.toLowerCase()))
      );
      if (matched) {
        setSelectedRouteTitle(matched.name);
      }

      // Auto-select compliant vehicle with capacity >= count
      const compliantVehicle = availableVehicles.find((v) => v.capacity >= count);
      if (compliantVehicle) {
        setSelectedVehicleCode(compliantVehicle.code);
      }
    }
  };

  // Available vehicles (for selection)
  const availableVehicles = vehicles.filter(v => v.status === 'available');

  const filteredSchedules = schedules.filter(s => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q ||
      s.orderCode.toLowerCase().includes(q) ||
      s.driverName.toLowerCase().includes(q) ||
      s.horseName.toLowerCase().includes(q) ||
      s.vehicleCode.toLowerCase().includes(q) ||
      s.routeTitle.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenModal = () => {
    if (availableVehicles.length > 0) {
      setSelectedVehicleCode(availableVehicles[0].code);
    }
    if (routes.length > 0) {
      setSelectedRouteTitle(routes[0].name);
    }
    setIsAddOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departureTime || !driverName || !selectedVehicleCode || !selectedRouteTitle) {
      toast.error('Please complete all required dispatch assignments.');
      return;
    }

    const selectedVehicle = vehicles.find(v => v.code === selectedVehicleCode);
    if (selectedVehicle && selectedVehicle.capacity < horseCount) {
      toast.error(`Vehicle ${selectedVehicle.code} only has capacity for ${selectedVehicle.capacity} horses (Order requires ${horseCount}).`);
      return;
    }

    const matchedRoute = routes.find(r => r.name === selectedRouteTitle);

    dispatchTrip({
      orderCode: orderCode.trim().toUpperCase(),
      horseName: horseName.trim(),
      horseCount: Number(horseCount) || 1,
      departureTime,
      estimatedArrival: estimatedArrival || 'Within 24h of departure',
      vehicleCode: selectedVehicleCode,
      driverName: driverName.trim(),
      escortName: escortName.trim(),
      routeTitle: selectedRouteTitle,
      origin: matchedRoute?.origin || 'HCMC Logistics Hub',
      destination: matchedRoute?.destination || 'Singapore Turf Club',
      notes,
    });

    toast.success(`Trip ${orderCode.toUpperCase()} dispatched! Vehicle ${selectedVehicleCode} assigned.`);
    setIsAddOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">
              {t('coordinator.schedule.title', 'Trip Dispatch Schedule')}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {schedules.length} {t('coordinator.schedule.tripsScheduled', 'Trips Scheduled')}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {t('coordinator.schedule.subtitle', 'Assign specialized vehicles, licensed drivers, equine veterinarians, and departure timetables.')}
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenModal}>
          <Plus size={18} className="mr-1.5" /> {t('coordinator.dispatchTrip', 'Dispatch New Trip')}
        </Button>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-80">
          <Search size={16} className="text-slate-400 mr-2" />
          <input
            type="text"
            placeholder={t('coordinator.schedule.searchPlaceholder', 'Search trip, driver, horse, or vehicle...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'Scheduled', 'In Transit', 'Completed'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status === 'ALL'
                ? t('coordinator.schedule.allStatuses', 'All Statuses')
                : status === 'In Transit'
                ? t('status.inTransit', 'In Transit')
                : status === 'Scheduled'
                ? t('status.scheduled', 'Scheduled')
                : t('status.completed', 'Completed')}
            </button>
          ))}
        </div>
      </div>

      {/* SCHEDULE TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">{t('coordinator.schedule.tripOrderCode', 'Trip / Order Code')}</th>
                <th className="p-4">Horse(s)</th>
                <th className="p-4">{t('coordinator.table.departure', 'Departure')} &amp; {t('coordinator.table.arrival', 'Arrival')}</th>
                <th className="p-4">{t('coordinator.selectVehicle', 'Assigned Vehicle')}</th>
                <th className="p-4">{t('coordinator.table.vehicleDriver', 'Driver')} &amp; {t('coordinator.assignEscort', 'Escort')}</th>
                <th className="p-4">{t('coordinator.schedule.routeTitle', 'Route Title')}</th>
                <th className="p-4">{t('coordinator.table.status', 'Status')}</th>
                <th className="p-4 text-right">{t('common.actions', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSchedules.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="p-4">
                    <p className="font-bold text-blue-600 m-0">{s.orderCode}</p>
                    <p className="text-[11px] text-slate-400 m-0">ID: {s.id}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-slate-900 m-0">{s.horseName}</p>
                    <p className="text-xs text-slate-500 m-0">{s.horseCount} horse{s.horseCount > 1 ? 's' : ''}</p>
                  </td>
                  <td className="p-4 text-slate-800">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900">
                      <Clock size={13} className="text-slate-400" /> {s.departureTime}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 m-0">ETA: {s.estimatedArrival}</p>
                  </td>
                  <td className="p-4 font-medium text-slate-700">
                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded text-xs font-bold text-slate-800">
                      <Truck size={13} className="text-slate-500" /> {s.vehicleCode}
                    </span>
                  </td>
                  <td className="p-4 text-slate-700">
                    <p className="font-semibold text-slate-900 m-0 flex items-center gap-1">
                      <User size={13} className="text-blue-600" /> {s.driverName}
                    </p>
                    <p className="text-xs text-emerald-700 font-medium m-0 flex items-center gap-1">
                      <ShieldCheck size={12} /> {s.escortName}
                    </p>
                  </td>
                  <td className="p-4">
                    <p className="font-semibold text-slate-800 text-xs m-0 max-w-[220px] truncate" title={s.routeTitle}>
                      {s.routeTitle}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 m-0 flex items-center gap-1">
                      <MapPin size={11} /> {s.origin} → {s.destination}
                    </p>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
                      s.status === 'In Transit' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      s.status === 'Scheduled' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      s.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        s.status === 'In Transit' ? 'bg-blue-600 animate-pulse' :
                        s.status === 'Scheduled' ? 'bg-amber-500' : 'bg-emerald-600'
                      }`} />
                      {s.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {s.status === 'Scheduled' && (
                      <button
                        onClick={() => {
                          updateTripStatus(s.id, 'In Transit');
                          toast.success(`Trip ${s.orderCode} marked as In Transit!`);
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm"
                      >
                        Start Trip
                      </button>
                    )}
                    {s.status === 'In Transit' && (
                      <button
                        onClick={() => {
                          updateTripStatus(s.id, 'Completed');
                          toast.success(`Trip ${s.orderCode} completed safely!`);
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm"
                      >
                        Complete
                      </button>
                    )}
                    {s.status === 'Completed' && (
                      <span className="text-xs text-slate-400 font-medium">Archived</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSchedules.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                    No trips match your search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DISPATCH NEW TRIP MODAL */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={t('coordinator.dispatchTrip', 'Dispatch Transport Trip')}
        subtitle={t('coordinator.schedule.subtitle', 'Assign compliant vehicle stalls, licensed drivers, equine vets, and departure timetable.')}
        maxWidth="680px"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {/* Select Approved Request from Flow 1/2 */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
            <label className="text-xs font-extrabold text-blue-900 uppercase tracking-wider block mb-1">
              Select Approved Order awaiting Dispatch (Flow 1 & 2)
            </label>
            <select
              value={selectedOrderId}
              onChange={(e) => handleSelectOrder(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm font-semibold bg-white text-slate-800 outline-none focus:border-blue-500 shadow-xs"
            >
              <option value="">-- Choose an approved transport request --</option>
              {approvedOrders.map((ord) => (
                <option key={ord.id || ord.requestCode} value={ord.id || ord.requestCode}>
                  {ord.requestCode} • {ord.horse?.name || ord.horseName || 'Racehorse'} ({ord.origin || 'Depot'} → {ord.destination || 'Destination'})
                </option>
              ))}
            </select>
            <span className="text-[11px] text-blue-700 mt-1 block">
              Auto-fills horse manifest, route destination, and selects compliant vehicle capacity.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.selectOrder', 'Transport Order Code')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="E.g., TR-2026-004"
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none font-semibold"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.schedule.primaryHorseCount', 'Primary Horse & Count')} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Horse Name"
                  value={horseName}
                  onChange={(e) => setHorseName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                  required
                />
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={horseCount}
                  onChange={(e) => setHorseCount(Number(e.target.value))}
                  className="w-16 px-2 py-2 rounded-lg border border-slate-300 text-sm text-center focus:border-blue-500 outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Vehicle Assignment */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              {t('coordinator.selectVehicle', 'Select Available Vehicle / Air Cargo Stall')} <span className="text-red-500">*</span>
            </label>
            {availableVehicles.length === 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle size={16} /> {t('coordinator.schedule.allVehiclesBusy', 'All vehicles are currently in use or maintenance. Please release a vehicle or add one in Fleet Management.')}
              </div>
            ) : (
              <select
                value={selectedVehicleCode}
                onChange={(e) => setSelectedVehicleCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none bg-white"
                required
              >
                {availableVehicles.map(v => (
                  <option key={v.id} value={v.code}>
                    {v.code} — {v.type} ({v.capacity} Stalls, Currently at {v.location})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Route Assignment */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              {t('coordinator.schedule.routeTitle', 'Assigned Cross-Border Route')} <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedRouteTitle}
              onChange={(e) => setSelectedRouteTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none bg-white"
              required
            >
              {routes.map(r => (
                <option key={r.id} value={r.name}>
                  {r.name} ({r.distanceKm} km • {r.stops.length} stops: {r.origin} → {r.destination})
                </option>
              ))}
            </select>
          </div>

          {/* Staff Assignment */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.assignDriver', 'Licensed Heavy Driver')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="E.g., John Smith"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.assignEscort', 'Equine Veterinary Escort')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="E.g., Dr. Sarah (FEI Vet)"
                value={escortName}
                onChange={(e) => setEscortName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                required
              />
            </div>
          </div>

          {/* Timetable */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.departureTime', 'Departure Time')} <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t('coordinator.arrivalTime', 'Estimated Arrival')}
              </label>
              <input
                type="datetime-local"
                value={estimatedArrival}
                onChange={(e) => setEstimatedArrival(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              {t('coordinator.schedule.instructions', 'Dispatch & Climate Instructions')}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., Temperature set to 18°C, water checks every 3 hours..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 mt-3">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={availableVehicles.length === 0}>
              {t('coordinator.confirmDispatch', 'Confirm Dispatch Trip')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
