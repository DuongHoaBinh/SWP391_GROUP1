'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertOctagon, CalendarX, Pencil, Plus, RefreshCw, Save, Timer, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  createCityException,
  createCityRestriction,
  deleteCityException,
  getJourneyRules,
  listCityRestrictions,
  updateCityRestriction,
  updateJourneyRules,
  type CityRestrictionInput,
  type CityRestrictionList,
  type CityRestrictionRule,
  type JourneyRules,
} from '@/features/fleet/allocation-api';

const RestrictionZoneMap = dynamic(() => import('@/components/maps/RestrictionZoneMap'), { ssr: false });

const DAY_LABELS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EMPTY_RULE: CityRestrictionInput = {
  city: '',
  centerLat: 10.7769,
  centerLng: 106.7009,
  radiusKm: 10,
  appliesToHeavyTruck: true,
  bannedFrom: '06:00',
  bannedTo: '22:00',
  daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  legalReference: '',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: null,
  isDemoData: true,
  isActive: true,
};

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20';
const labelCls = 'block text-xs font-semibold text-[#5B6779] mb-1';

export default function CityRestrictionsPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [data, setData] = useState<CityRestrictionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [editing, setEditing] = useState<{ id: number | null; form: CityRestrictionInput } | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  const [exceptionForm, setExceptionForm] = useState({ city: 'Hồ Chí Minh', exceptionDate: '', bannedFrom: '04:00', bannedTo: '11:30', note: '' });
  const [savingException, setSavingException] = useState(false);

  const [rules, setRules] = useState<JourneyRules | null>(null);
  const [savingRules, setSavingRules] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, journey] = await Promise.all([listCityRestrictions(), getJourneyRules()]);
      setData(list);
      setRules(journey);
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Failed to load configuration' : 'Không tải được cấu hình'));
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (rule?: CityRestrictionRule) => {
    if (!rule) {
      setEditing({ id: null, form: { ...EMPTY_RULE } });
      return;
    }
    const { id, ...rest } = rule;
    setEditing({ id, form: { ...rest, effectiveFrom: rule.effectiveFrom ?? EMPTY_RULE.effectiveFrom, effectiveTo: rule.effectiveTo } });
  };

  const saveRule = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.city.trim() || !f.legalReference.trim()) {
      toast.error(isEn ? 'City and legal reference are required' : 'Thành phố và căn cứ pháp lý là bắt buộc');
      return;
    }
    if (f.radiusKm < 1 || f.radiusKm > 50) {
      toast.error(isEn ? 'Radius must be 1–50 km' : 'Bán kính phải trong khoảng 1–50 km');
      return;
    }
    setSavingRule(true);
    try {
      const body = { ...f, effectiveTo: f.effectiveTo || null };
      if (editing.id) await updateCityRestriction(editing.id, body);
      else await createCityRestriction(body);
      toast.success(isEn ? 'Restriction saved' : 'Đã lưu quy tắc giờ cấm');
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Save failed' : 'Lưu thất bại'));
    } finally {
      setSavingRule(false);
    }
  };

  const toggleActive = async (rule: CityRestrictionRule) => {
    const { id, ...rest } = rule;
    try {
      await updateCityRestriction(id, { ...rest, effectiveFrom: rule.effectiveFrom ?? EMPTY_RULE.effectiveFrom, isActive: !rule.isActive });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    }
  };

  const addException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionForm.city.trim() || !exceptionForm.exceptionDate) {
      toast.error(isEn ? 'City and date are required' : 'Cần chọn thành phố và ngày');
      return;
    }
    setSavingException(true);
    try {
      await createCityException({ ...exceptionForm, note: exceptionForm.note || null });
      toast.success(isEn ? 'Holiday exception added' : 'Đã thêm ngoại lệ ngày lễ');
      setExceptionForm({ ...exceptionForm, exceptionDate: '', note: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    } finally {
      setSavingException(false);
    }
  };

  const removeException = async (id: number) => {
    if (!window.confirm(isEn ? 'Delete this exception?' : 'Xóa ngoại lệ này?')) return;
    try {
      await deleteCityException(id);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    }
  };

  const saveJourneyRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rules) return;
    setSavingRules(true);
    try {
      setRules(await updateJourneyRules(rules));
      toast.success(isEn ? 'Rest rules saved' : 'Đã lưu tham số nghỉ');
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    } finally {
      setSavingRules(false);
    }
  };

  const dayLabels = isEn ? DAY_LABELS_EN : DAY_LABELS_VI;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="border-b border-[#E5DDD0] pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold text-[#181A17] flex items-center gap-2">
            <Timer className="w-6 h-6 text-[#A67C2E]" aria-hidden="true" />
            {isEn ? 'City truck bans & rest rules' : 'Giờ cấm xe tải nội đô & tham số nghỉ'}
          </h1>
          <p className="m-0 mt-1 text-sm text-[#5B6779]">
            {isEn
              ? 'Quotes automatically move heavy-truck pickups/deliveries out of banned hours and add the night surcharge.'
              : 'Báo giá tự dời giờ đón/giao của xe tải nặng ra khỏi giờ cấm và cộng phụ phí đêm.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="w-4 h-4" /> {isEn ? 'Reload' : 'Tải lại'}
        </Button>
      </header>

      {/* Compact Demo Pill */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-900 font-bold">Demo</span>
        <span className="text-[#5F6977]">
          {isEn
            ? 'Verify against official local transport authority rules before real use.'
            : 'Cần đối chiếu quy định UBND/Sở GTVT trước khi áp dụng thực tế.'}
        </span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-[#5B6779]">{isEn ? 'Loading…' : 'Đang tải…'}</div>
      ) : error ? (
        <div className="p-6 rounded-xl border border-[#E5B8B8] bg-[#FDF5F5] text-sm text-[#8A2C2C] flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>{isEn ? 'Retry' : 'Thử lại'}</Button>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2">
              <RestrictionZoneMap zones={data?.rules ?? []} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div className="lg:col-span-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-base font-bold text-[#181A17]">{isEn ? 'Restriction zones' : 'Vùng cấm'}</h2>
                <Button variant="primary" size="sm" onClick={() => openEdit()}>
                  <Plus className="w-4 h-4" /> {isEn ? 'Add zone' : 'Thêm vùng cấm'}
                </Button>
              </div>
              {data?.rules.length ? (
                <div className="overflow-x-auto rounded-xl border border-[#E5DDD0] bg-white">
                  <table className="w-full text-xs text-left min-w-[640px]">
                    <thead className="bg-[#FAF8F4] text-[#6D7785] font-semibold border-b border-[#E5DDD0]">
                      <tr>
                        <th className="px-3 py-2">{isEn ? 'City' : 'Thành phố'}</th>
                        <th className="px-3 py-2">{isEn ? 'Banned' : 'Giờ cấm'}</th>
                        <th className="px-3 py-2">{isEn ? 'Radius' : 'Bán kính'}</th>
                        <th className="px-3 py-2">{isEn ? 'Days' : 'Ngày'}</th>
                        <th className="px-3 py-2">{isEn ? 'Legal reference' : 'Căn cứ pháp lý'}</th>
                        <th className="px-3 py-2">{isEn ? 'Status' : 'Trạng thái'}</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EEE8]">
                      {data.rules.map((r) => (
                        <tr key={r.id} className={selectedId === r.id ? 'bg-[#FAF8F4]' : ''} onClick={() => setSelectedId(r.id)}>
                          <td className="px-3 py-2 font-semibold text-[#181A17]">
                            {r.city}
                            {r.appliesToHeavyTruck && <div className="text-[10px] text-[#8B6724] font-normal">{isEn ? 'heavy trucks' : 'xe tải nặng'}</div>}
                          </td>
                          <td className="px-3 py-2 font-mono">{r.bannedFrom}–{r.bannedTo}</td>
                          <td className="px-3 py-2">{r.radiusKm} km</td>
                          <td className="px-3 py-2">{r.daysOfWeek.length === 7 ? (isEn ? 'Every day' : 'Hằng ngày') : r.daysOfWeek.map((d) => dayLabels[d - 1]).join(', ')}</td>
                          <td className="px-3 py-2 max-w-[220px] text-[#5B6779]">{r.legalReference}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void toggleActive(r); }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border ${r.isActive ? 'bg-[#E8F3EC] text-[#287653] border-[#BFDCC9]' : 'bg-[#F0EEE8] text-[#6D7785] border-[#D8CEBE]'}`}
                            >
                              {r.isActive ? (isEn ? 'Active' : 'Đang áp dụng') : (isEn ? 'Off' : 'Tạm tắt')}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              aria-label={isEn ? `Edit ${r.city}` : `Sửa ${r.city}`}
                              onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                              className="p-1.5 rounded-md hover:bg-[#F0EBE0] cursor-pointer text-[#A67C2E]"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-[#D8CEBE] text-center text-sm text-[#5B6779]">
                  {isEn ? 'No restriction zones yet.' : 'Chưa có vùng cấm nào.'}
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-base font-bold text-[#181A17] flex items-center gap-2">
              <CalendarX className="w-5 h-5 text-[#A67C2E]" aria-hidden="true" />
              {isEn ? 'Holiday exceptions' : 'Ngoại lệ ngày lễ'}
            </h2>
            <p className="m-0 text-xs text-[#5B6779]">
              {isEn
                ? 'On an exception date, these hours REPLACE the normal ban of that city.'
                : 'Vào ngày ngoại lệ, khung giờ dưới đây THAY THẾ khung cấm thường của thành phố.'}
            </p>
            <form onSubmit={addException} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] p-3">
              <div className="col-span-2 md:col-span-1">
                <label className={labelCls} htmlFor="ex-city">{isEn ? 'City' : 'Thành phố'}</label>
                <input id="ex-city" className={inputCls} value={exceptionForm.city} onChange={(e) => setExceptionForm({ ...exceptionForm, city: e.target.value })} list="ex-city-list" />
                <datalist id="ex-city-list">
                  {[...new Set((data?.rules ?? []).map((r) => r.city))].map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls} htmlFor="ex-date">{isEn ? 'Date' : 'Ngày'}</label>
                <input id="ex-date" type="date" className={inputCls} value={exceptionForm.exceptionDate} onChange={(e) => setExceptionForm({ ...exceptionForm, exceptionDate: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ex-from">{isEn ? 'Ban from' : 'Cấm từ'}</label>
                <input id="ex-from" type="time" className={inputCls} value={exceptionForm.bannedFrom} onChange={(e) => setExceptionForm({ ...exceptionForm, bannedFrom: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ex-to">{isEn ? 'Ban to' : 'Đến'}</label>
                <input id="ex-to" type="time" className={inputCls} value={exceptionForm.bannedTo} onChange={(e) => setExceptionForm({ ...exceptionForm, bannedTo: e.target.value })} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className={labelCls} htmlFor="ex-note">{isEn ? 'Note' : 'Ghi chú'}</label>
                <input id="ex-note" className={inputCls} value={exceptionForm.note} onChange={(e) => setExceptionForm({ ...exceptionForm, note: e.target.value })} />
              </div>
              <Button type="submit" variant="primary" size="sm" disabled={savingException} className="col-span-2 md:col-span-1">
                <Plus className="w-4 h-4" /> {isEn ? 'Add' : 'Thêm'}
              </Button>
            </form>
            {data?.exceptions.length ? (
              <div className="overflow-x-auto rounded-xl border border-[#E5DDD0] bg-white">
                <table className="w-full text-xs text-left min-w-[480px]">
                  <thead className="bg-[#FAF8F4] text-[#6D7785] font-semibold border-b border-[#E5DDD0]">
                    <tr>
                      <th className="px-3 py-2">{isEn ? 'Date' : 'Ngày'}</th>
                      <th className="px-3 py-2">{isEn ? 'City' : 'Thành phố'}</th>
                      <th className="px-3 py-2">{isEn ? 'Banned' : 'Giờ cấm'}</th>
                      <th className="px-3 py-2">{isEn ? 'Note' : 'Ghi chú'}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EEE8]">
                    {data.exceptions.map((x) => (
                      <tr key={x.id}>
                        <td className="px-3 py-2 font-mono">{x.exceptionDate.split('-').reverse().join('/')}</td>
                        <td className="px-3 py-2">{x.city}</td>
                        <td className="px-3 py-2 font-mono">{x.bannedFrom}–{x.bannedTo}</td>
                        <td className="px-3 py-2 text-[#5B6779]">{x.note}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            aria-label={isEn ? 'Delete exception' : 'Xóa ngoại lệ'}
                            onClick={() => void removeException(x.id)}
                            className="p-1.5 rounded-md hover:bg-[#FDF0F0] cursor-pointer text-[#B33E3E]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 text-xs text-[#747D88]">{isEn ? 'No exceptions.' : 'Chưa có ngoại lệ.'}</p>
            )}
          </section>

          {rules && (
            <section className="flex flex-col gap-3">
              <h2 className="m-0 text-base font-bold text-[#181A17]">{isEn ? 'Journey Rest Rules' : 'Tham số nghỉ dọc đường'}</h2>
              <p className="m-0 text-xs text-[#5B6779]">
                {isEn
                  ? 'Reference: EU Regulation 1/2005 — water every 8 h, max 24 h journey then unload and rest at least 24 h. Used for ETA and suggested rest stops.'
                  : 'Tham chiếu EU Regulation 1/2005: cho uống nước mỗi 8 giờ, tối đa 24 giờ hành trình rồi dỡ ngựa nghỉ ít nhất 24 giờ. Dùng để tính ETA và gợi ý điểm nghỉ.'}
              </p>
              <form onSubmit={saveJourneyRules} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end rounded-xl border border-[#E5DDD0] bg-white p-4">
                {([
                  ['maxDriveHoursBeforeRest', isEn ? 'Drive hours before rest' : 'Giờ lái trước khi nghỉ'],
                  ['restMinutes', isEn ? 'Rest (minutes)' : 'Nghỉ (phút)'],
                  ['maxJourneyHours', isEn ? 'Max journey (h)' : 'Hành trình tối đa (giờ)'],
                  ['mandatoryRestHours', isEn ? 'Mandatory rest (h)' : 'Nghỉ bắt buộc (giờ)'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls} htmlFor={`jr-${key}`}>{label}</label>
                    <input
                      id={`jr-${key}`}
                      type="number"
                      min={0}
                      className={inputCls}
                      value={rules[key]}
                      onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
                    />
                  </div>
                ))}
                <div>
                  <label className={labelCls} htmlFor="jr-night">{isEn ? 'Night window' : 'Khung đêm'}</label>
                  <div className="flex items-center gap-1">
                    <input id="jr-night" type="time" className={inputCls} value={rules.nightWindow.from} onChange={(e) => setRules({ ...rules, nightWindow: { ...rules.nightWindow, from: e.target.value } })} />
                    <input aria-label={isEn ? 'Night window end' : 'Hết khung đêm'} type="time" className={inputCls} value={rules.nightWindow.to} onChange={(e) => setRules({ ...rules, nightWindow: { ...rules.nightWindow, to: e.target.value } })} />
                  </div>
                </div>
                <Button type="submit" variant="primary" size="sm" disabled={savingRules}>
                  <Save className="w-4 h-4" /> {isEn ? 'Save' : 'Lưu'}
                </Button>
              </form>
            </section>
          )}
        </>
      )}

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => !savingRule && setEditing(null)}
        title={editing?.id ? (isEn ? 'Edit restriction zone' : 'Sửa vùng cấm') : (isEn ? 'New restriction zone' : 'Thêm vùng cấm')}
        subtitle={isEn ? 'Local time Asia/Ho_Chi_Minh. "To" earlier than "From" = crosses midnight.' : 'Giờ Việt Nam. Giờ kết thúc nhỏ hơn giờ bắt đầu = qua nửa đêm.'}
        maxWidth="max-w-2xl"
        closeDisabled={savingRule}
      >
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls} htmlFor="r-city">{isEn ? 'City' : 'Thành phố'}</label>
              <input id="r-city" className={inputCls} value={editing.form.city} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, city: e.target.value } })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="r-lat">{isEn ? 'Center latitude' : 'Vĩ độ tâm'}</label>
              <input id="r-lat" type="number" step="0.0001" className={inputCls} value={editing.form.centerLat} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, centerLat: Number(e.target.value) } })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="r-lng">{isEn ? 'Center longitude' : 'Kinh độ tâm'}</label>
              <input id="r-lng" type="number" step="0.0001" className={inputCls} value={editing.form.centerLng} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, centerLng: Number(e.target.value) } })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="r-radius">{isEn ? 'Radius (km, 1–50)' : 'Bán kính (km, 1–50)'}</label>
              <input id="r-radius" type="number" min={1} max={50} className={inputCls} value={editing.form.radiusKm} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, radiusKm: Number(e.target.value) } })} />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input id="r-heavy" type="checkbox" checked={editing.form.appliesToHeavyTruck} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, appliesToHeavyTruck: e.target.checked } })} />
              <label htmlFor="r-heavy" className="text-xs text-[#181A17]">{isEn ? 'Heavy trucks only' : 'Chỉ áp dụng xe tải nặng'}</label>
            </div>
            <div>
              <label className={labelCls} htmlFor="r-from">{isEn ? 'Ban from' : 'Cấm từ'}</label>
              <input id="r-from" type="time" className={inputCls} value={editing.form.bannedFrom} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, bannedFrom: e.target.value } })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="r-to">{isEn ? 'Ban to' : 'Đến'}</label>
              <input id="r-to" type="time" className={inputCls} value={editing.form.bannedTo} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, bannedTo: e.target.value } })} />
            </div>
            <div className="col-span-2">
              <span className={labelCls}>{isEn ? 'Days of week' : 'Ngày áp dụng'}</span>
              <div className="flex flex-wrap gap-1.5">
                {dayLabels.map((d, i) => {
                  const on = editing.form.daysOfWeek.includes(i + 1);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const days = on ? editing.form.daysOfWeek.filter((x) => x !== i + 1) : [...editing.form.daysOfWeek, i + 1];
                        if (days.length) setEditing({ ...editing, form: { ...editing.form, daysOfWeek: days.sort() } });
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer ${on ? 'bg-[#181A17] text-white border-[#181A17]' : 'bg-white text-[#5B6779] border-[#D8CEBE]'}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls} htmlFor="r-legal">{isEn ? 'Legal reference (required)' : 'Căn cứ pháp lý (bắt buộc)'}</label>
              <input id="r-legal" className={inputCls} value={editing.form.legalReference} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, legalReference: e.target.value } })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="r-eff-from">{isEn ? 'Effective from' : 'Hiệu lực từ'}</label>
              <input id="r-eff-from" type="date" className={inputCls} value={editing.form.effectiveFrom} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, effectiveFrom: e.target.value } })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="r-eff-to">{isEn ? 'Effective to (optional)' : 'Hiệu lực đến (tùy chọn)'}</label>
              <input id="r-eff-to" type="date" className={inputCls} value={editing.form.effectiveTo ?? ''} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, effectiveTo: e.target.value || null } })} />
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={savingRule}>{isEn ? 'Cancel' : 'Hủy'}</Button>
              <Button variant="primary" onClick={() => void saveRule()} disabled={savingRule}>
                <Save className="w-4 h-4" /> {isEn ? 'Save' : 'Lưu'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
