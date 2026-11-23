'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Building2, Edit, MapPin, Plus, Power, Trash2, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { DepotOption } from '@/features/fleet/fleet-catalog';

const DepotMap = dynamic(() => import('@/components/maps/DepotMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[360px] rounded-2xl border border-[#E5DDD0] bg-[#FAF8F4] animate-pulse" />,
});

interface DepotVehicle {
  id: number;
  plateOrCode: string;
  vehicleClassName?: string | null;
  vehicleType: string;
  capacity: number;
  status: string;
}

interface DepotForm {
  code: string;
  name: string;
  country: string;
  city: string;
  address: string;
  lat: string;
  lng: string;
  type: 'own' | 'partner';
}

const EMPTY_FORM: DepotForm = { code: '', name: '', country: 'Vietnam', city: '', address: '', lat: '', lng: '', type: 'own' };

/** Trạm xe (Step 3, review 11/2026): mỗi xe đường bộ thuộc một trạm; trạm đối tác dùng cho chặng giao cuối ở nước ngoài. */
export default function DepotsPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [depots, setDepots] = useState<DepotOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DepotOption | null>(null);
  const [vehicles, setVehicles] = useState<DepotVehicle[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepotOption | null>(null);
  const [form, setForm] = useState<DepotForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepotOption | null>(null);

  const loadDepots = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient<DepotOption[]>('/fleet/depots');
      setDepots(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : isEn ? 'Could not load depots.' : 'Không tải được danh sách trạm.');
    } finally {
      setIsLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    loadDepots();
  }, [loadDepots]);

  const selectDepot = useCallback(async (depot: DepotOption) => {
    setSelected(depot);
    setIsLoadingVehicles(true);
    try {
      const detail = await apiClient<DepotOption & { vehicles: DepotVehicle[] }>(`/fleet/depots/${depot.id}`);
      setVehicles(detail.vehicles ?? []);
    } catch {
      setVehicles([]);
    } finally {
      setIsLoadingVehicles(false);
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (d: DepotOption) => {
    setEditing(d);
    setForm({
      code: d.code,
      name: d.name,
      country: d.country,
      city: d.city,
      address: d.address ?? '',
      lat: String(d.lat),
      lng: String(d.lng),
      type: d.type,
    });
    setFormOpen(true);
  };

  const pickedPoint = useMemo(() => {
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    return form.lat !== '' && form.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [form.lat, form.lng]);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!form.code.trim() || !form.name.trim() || !form.city.trim() || !form.country.trim()) {
      toast.error(isEn ? 'Code, name, city and country are required.' : 'Vui lòng nhập mã, tên, thành phố và quốc gia.');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || form.lat === '' || form.lng === '') {
      toast.error(isEn ? 'Pick the location on the map or enter valid coordinates.' : 'Hãy bấm chọn vị trí trên bản đồ hoặc nhập tọa độ hợp lệ.');
      return;
    }
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      country: form.country.trim(),
      city: form.city.trim(),
      address: form.address.trim() || undefined,
      lat,
      lng,
      type: form.type,
    };
    setIsSubmitting(true);
    try {
      if (editing) {
        await apiClient(`/fleet/depots/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success(isEn ? 'Depot updated.' : 'Đã cập nhật trạm.');
      } else {
        await apiClient('/fleet/depots', { method: 'POST', body: JSON.stringify(body) });
        toast.success(isEn ? 'Depot created.' : 'Đã tạo trạm mới.');
      }
      setFormOpen(false);
      await loadDepots();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEn ? 'Could not save depot.' : 'Không lưu được trạm.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (d: DepotOption) => {
    try {
      await apiClient(`/fleet/depots/${d.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !d.isActive }) });
      toast.success(d.isActive ? (isEn ? 'Depot paused.' : 'Đã tạm ngưng trạm.') : (isEn ? 'Depot reactivated.' : 'Đã mở lại trạm.'));
      await loadDepots();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      await apiClient(`/fleet/depots/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(isEn ? 'Depot deleted.' : 'Đã xóa trạm.');
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      await loadDepots();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full h-11 px-3.5 rounded-xl border border-[#D8CEBE] text-sm outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#181A17]/10 text-slate-800 bg-white';
  const labelClass = 'text-xs font-bold text-slate-700 block mb-1.5';

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#181A17] m-0">{isEn ? 'Vehicle Depots' : 'Trạm Xe'}</h1>
          <p className="text-sm text-slate-500 mt-1 m-0">
            {isEn
              ? 'Every road vehicle belongs to a depot. Partner depots abroad handle last-mile delivery.'
              : 'Mỗi xe đường bộ thuộc một trạm. Trạm đối tác ở nước ngoài phụ trách chặng giao cuối.'}
          </p>
        </div>
        <Button type="button" variant="primary" onClick={openCreate} className="shadow-sm bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E]">
          <Plus size={18} className="mr-1.5" />
          <span>{isEn ? 'Add depot' : 'Thêm trạm'}</span>
        </Button>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={loadDepots} className="font-bold underline cursor-pointer">
            {isEn ? 'Retry' : 'Thử lại'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 flex flex-col gap-3">
          <DepotMap depots={depots} selectedId={selected?.id ?? null} onSelect={selectDepot} />
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#A67C2E] border border-[#181A17]" />{isEn ? 'Own depot' : 'Trạm riêng'}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#2F6FA3] border border-[#181A17]" />{isEn ? 'Partner abroad' : 'Đối tác nước ngoài'}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#9AA1A9] border border-[#181A17]" />{isEn ? 'Paused' : 'Tạm ngưng'}</span>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#D8CEBE]/70 shadow-sm p-5 flex flex-col gap-3">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#181A17] m-0">{selected.name}</h2>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">
                    {selected.code} · {selected.address || `${selected.city}, ${selected.country}`}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${selected.type === 'partner' ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-[#F5EFE2] text-[#8C6621] border-[#EAD9B5]'}`}>
                  {selected.type === 'partner' ? (isEn ? 'Partner' : 'Đối tác') : isEn ? 'Own' : 'Trạm riêng'}
                </span>
              </div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0 mt-2">
                {isEn ? 'Vehicles at this depot' : 'Xe thuộc trạm'}
              </h3>
              {isLoadingVehicles ? (
                <p className="text-xs text-slate-500 m-0">{isEn ? 'Loading...' : 'Đang tải...'}</p>
              ) : vehicles.length === 0 ? (
                <p className="text-xs text-slate-500 m-0">{isEn ? 'No vehicles yet.' : 'Chưa có xe nào.'}</p>
              ) : (
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {vehicles.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-100 text-xs">
                      <span className="flex items-center gap-2 font-bold text-slate-800">
                        <Truck size={14} className="text-[#A67C2E]" />
                        {v.plateOrCode}
                      </span>
                      <span className="text-slate-500">
                        {v.vehicleClassName || v.vehicleType} · {v.capacity} {isEn ? 'horses' : 'ngựa'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center text-slate-500 py-10 gap-2">
              <MapPin size={28} className="text-slate-300" />
              <p className="text-sm m-0">{isEn ? 'Select a depot on the map or in the list.' : 'Chọn một trạm trên bản đồ hoặc trong danh sách.'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#D8CEBE]/70 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">{isEn ? 'Depot' : 'Trạm'}</th>
                <th className="p-4">{isEn ? 'Location' : 'Vị trí'}</th>
                <th className="p-4">{isEn ? 'Type' : 'Loại'}</th>
                <th className="p-4">{isEn ? 'Vehicles' : 'Số xe'}</th>
                <th className="p-4">{isEn ? 'Status' : 'Trạng thái'}</th>
                <th className="p-4 text-right">{isEn ? 'Actions' : 'Thao tác'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-500 text-xs">{isEn ? 'Loading depots...' : 'Đang tải danh sách trạm...'}</td></tr>
              ) : depots.length === 0 ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-500 text-xs">{isEn ? 'No depots yet.' : 'Chưa có trạm nào.'}</td></tr>
              ) : (
                depots.map((d) => (
                  <tr key={d.id} className={`hover:bg-slate-50/70 transition-colors ${selected?.id === d.id ? 'bg-[#FAF8F4]' : ''}`}>
                    <td className="p-4">
                      <button type="button" onClick={() => selectDepot(d)} className="text-left cursor-pointer bg-transparent border-0 p-0">
                        <span className="font-bold text-slate-900 flex items-center gap-2">
                          <Building2 size={15} className="text-[#A67C2E]" />
                          {d.name}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">{d.code}</span>
                      </button>
                    </td>
                    <td className="p-4 text-slate-600">{d.city}, {d.country}</td>
                    <td className="p-4 text-slate-600">{d.type === 'partner' ? (isEn ? 'Partner abroad' : 'Đối tác nước ngoài') : isEn ? 'Own' : 'Trạm riêng'}</td>
                    <td className="p-4 font-semibold text-slate-700">{d.vehicleCount ?? 0}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${d.isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {d.isActive ? (isEn ? 'Active' : 'Hoạt động') : isEn ? 'Paused' : 'Tạm ngưng'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button type="button" onClick={() => openEdit(d)} aria-label={`${isEn ? 'Edit' : 'Sửa'} ${d.name}`} className="p-2 text-slate-500 hover:text-[#181A17] rounded-lg hover:bg-[#FAF8F4] cursor-pointer">
                          <Edit size={16} />
                        </button>
                        <button type="button" onClick={() => toggleActive(d)} aria-label={`${d.isActive ? (isEn ? 'Pause' : 'Tạm ngưng') : (isEn ? 'Reactivate' : 'Mở lại')} ${d.name}`} className="p-2 text-slate-500 hover:text-amber-700 rounded-lg hover:bg-amber-50 cursor-pointer">
                          <Power size={16} />
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(d)} aria-label={`${isEn ? 'Delete' : 'Xóa'} ${d.name}`} className="p-2 text-slate-500 hover:text-red-600 rounded-lg hover:bg-slate-100 cursor-pointer">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <Modal
          isOpen={formOpen}
          onClose={() => !isSubmitting && setFormOpen(false)}
          closeDisabled={isSubmitting}
          title={editing ? (isEn ? `Edit depot: ${editing.name}` : `Sửa trạm: ${editing.name}`) : isEn ? 'Add depot' : 'Thêm trạm xe'}
          subtitle={isEn ? 'Click on the map to set the depot location.' : 'Bấm lên bản đồ để chọn vị trí trạm.'}
          maxWidth="760px"
        >
          <form onSubmit={submitForm} className="flex flex-col gap-4">
            <DepotMap depots={depots.filter((d) => d.id !== editing?.id)} pickedPoint={pickedPoint} onPick={(lat, lng) => setForm((f) => ({ ...f, lat: String(lat), lng: String(lng) }))} className="w-full h-[260px] rounded-xl border border-[#E5DDD0] overflow-hidden" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="depot-code" className={labelClass}>{isEn ? 'Code *' : 'Mã trạm *'}</label>
                <input id="depot-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VN-HCM-TD" maxLength={30} className={`${inputClass} uppercase font-mono`} />
              </div>
              <div>
                <label htmlFor="depot-name" className={labelClass}>{isEn ? 'Name *' : 'Tên trạm *'}</label>
                <input id="depot-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} className={inputClass} />
              </div>
              <div>
                <label htmlFor="depot-country" className={labelClass}>{isEn ? 'Country *' : 'Quốc gia *'}</label>
                <input id="depot-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} maxLength={100} className={inputClass} />
              </div>
              <div>
                <label htmlFor="depot-city" className={labelClass}>{isEn ? 'City *' : 'Thành phố *'}</label>
                <input id="depot-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={100} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="depot-address" className={labelClass}>{isEn ? 'Address' : 'Địa chỉ'}</label>
                <input id="depot-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} className={inputClass} />
              </div>
              <div>
                <label htmlFor="depot-lat" className={labelClass}>{isEn ? 'Latitude *' : 'Vĩ độ *'}</label>
                <input id="depot-lat" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className={`${inputClass} font-mono`} />
              </div>
              <div>
                <label htmlFor="depot-lng" className={labelClass}>{isEn ? 'Longitude *' : 'Kinh độ *'}</label>
                <input id="depot-lng" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className={`${inputClass} font-mono`} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="depot-type" className={labelClass}>{isEn ? 'Depot type' : 'Loại trạm'}</label>
                <select id="depot-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DepotForm['type'] })} className={`${inputClass} cursor-pointer`}>
                  <option value="own">{isEn ? 'Own depot' : 'Trạm riêng của công ty'}</option>
                  <option value="partner">{isEn ? 'Partner depot abroad (last-mile)' : 'Trạm đối tác ở nước ngoài (chặng giao cuối)'}</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setFormOpen(false)}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting} className="bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E]">
                {isSubmitting ? (isEn ? 'Saving...' : 'Đang lưu...') : isEn ? 'Save depot' : 'Lưu trạm'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal isOpen onClose={() => !isSubmitting && setDeleteTarget(null)} closeDisabled={isSubmitting} title={isEn ? 'Delete depot' : 'Xóa trạm xe'} maxWidth="450px">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 m-0">
              {(deleteTarget.vehicleCount ?? 0) > 0
                ? isEn
                  ? `"${deleteTarget.name}" still has ${deleteTarget.vehicleCount} vehicles. Move them to another depot or pause the depot instead.`
                  : `Trạm "${deleteTarget.name}" còn ${deleteTarget.vehicleCount} xe. Hãy chuyển xe sang trạm khác hoặc tạm ngưng trạm thay vì xóa.`
                : isEn
                  ? `Delete "${deleteTarget.name}"? This cannot be undone.`
                  : `Xóa trạm "${deleteTarget.name}"? Hành động này không thể hoàn tác.`}
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setDeleteTarget(null)}>
                {isEn ? 'Cancel' : 'Hủy'}
              </Button>
              <Button type="button" variant="danger" disabled={isSubmitting || (deleteTarget.vehicleCount ?? 0) > 0} onClick={confirmDelete}>
                {isEn ? 'Delete' : 'Xóa trạm'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
