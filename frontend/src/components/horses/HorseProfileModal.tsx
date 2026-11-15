'use client';

import { useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getFullPhotoUrl } from '@/lib/customer-store';
import { formatHorseColor, formatHorseMedicalStatus } from '@/lib/horse-constants';
import { calendarDayLabel } from '@/lib/transport-dates';

interface HorseProfile {
  id: number; name: string; breed: string | null; age: number | null; gender: string | null;
  dateOfBirth: string | null; microchipNo: string | null; passportNo: string | null;
  color: string | null; weight: string | null; medicalStatus: string | null;
  specialRequirements: string | null; quantity: number; status: string; photoUrl: string | null;
}

export function HorseProfileModal({ horseId, onClose }: { horseId: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [imageFailed, setImageFailed] = useState(false);
  const { data: horse, error, isLoading, mutate } = useSWR<HorseProfile>(
    `/horses/${horseId}`, (url: string) => apiClient<HorseProfile>(url), { shouldRetryOnError: false });

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  const fields = horse ? [
    ['Giống ngựa', horse.breed],
    ['Tuổi', horse.age != null ? `${horse.age} tuổi` : null],
    ['Giới tính', ({ male: 'Ngựa đực (Stallion)', female: 'Ngựa cái (Mare)', gelding: 'Ngựa thiến (Gelding)' } as Record<string, string>)[horse.gender ?? ''] ?? horse.gender],
    ['Ngày sinh', horse.dateOfBirth ? calendarDayLabel(horse.dateOfBirth) : null],
    ['Số lượng trong hồ sơ', horse.quantity],
    ['Trạng thái', ({ active: 'Sẵn sàng', in_transit: 'Đang vận chuyển', delivered: 'Đã bàn giao', retired: 'Đã nghỉ', deceased: 'Đã mất' } as Record<string, string>)[horse.status] ?? horse.status],
    ['Số microchip', horse.microchipNo],
    ['Số hộ chiếu', horse.passportNo],
    ['Màu lông', horse.color ? formatHorseColor(horse.color) : null],
    ['Cân nặng', horse.weight],
    ['Tình trạng sức khỏe', horse.medicalStatus ? formatHorseMedicalStatus(horse.medicalStatus) : null],
  ] : [];

  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
    className="m-auto max-h-[90vh] max-w-2xl rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
    style={{ width: 'calc(100% - 2rem)' }}>
    <div className="flex max-h-[90vh] flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div><h3 id={titleId} className="text-lg font-bold">Hồ sơ ngựa{horse ? ` · ${horse.name}` : ''}</h3>
          <p className="mt-1 text-sm text-slate-500">Xem hồ sơ ngay tại đây. Thông tin yêu cầu đang nhập được giữ nguyên.</p></div>
        <button type="button" autoFocus onClick={onClose} aria-label="Đóng hồ sơ ngựa" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 focus-visible:outline-blue-600"><X size={20} /></button>
      </header>
      <div className="overflow-y-auto p-5 sm:p-6">
        {isLoading ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-slate-600"><Loader2 className="animate-spin" size={18} />Đang tải hồ sơ ngựa…</p>
          : error || !horse ? <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Không tải được hồ sơ ngựa. <button type="button" className="min-h-10 underline" onClick={() => void mutate()}>Thử lại</button></div>
          : <>
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-2xl font-bold text-blue-700">
                {horse.photoUrl && !imageFailed ? <img src={getFullPhotoUrl(horse.photoUrl)} alt={horse.name} onError={() => setImageFailed(true)} className="h-full w-full object-cover" /> : horse.name.charAt(0)}
              </div>
              <div className="min-w-0"><p className="break-words text-xl font-semibold">{horse.name}</p><p className="mt-1 text-sm text-slate-500">Mã hồ sơ #{horse.id}</p></div>
            </div>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value == null || value === '' ? 'Chưa cập nhật' : value}</dd></div>)}</dl>
            <div className="mt-5 border-t border-slate-100 pt-4"><h4 className="text-sm font-semibold">Yêu cầu chăm sóc đặc biệt</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{horse.specialRequirements || 'Chưa có yêu cầu được ghi nhận.'}</p></div>
          </>}
      </div>
      <footer className="flex justify-end border-t border-slate-100 px-5 py-4"><button type="button" onClick={onClose} className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Đóng</button></footer>
    </div>
  </dialog>;
}
