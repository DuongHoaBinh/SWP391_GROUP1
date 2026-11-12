'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';
import { InsuranceSelection } from './InsuranceSelection';
import { CostSummary } from './InsuranceSummary';
import { previewInsurance, unchangedInsurance, type InsuredHorse, type InsuranceInput, type InsurancePolicy } from '../insurance-policy';

export function InsuranceAmendmentForm({ orderId, horses, specialRequirements, onSaved, onCancel }: {
  orderId: number; horses: InsuredHorse[]; specialRequirements?: string | null;
  onSaved: () => void; onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, InsuranceInput>>(() => Object.fromEntries(horses.map(h => [String(h.horseId), {
    declaredValue: String(h.declaredValue ?? 0), declaredCurrency: h.declaredCurrency ?? 'VND', insurancePackage: h.insurancePackage ?? 'basic',
  }])));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: policy, error: policyError, mutate } = useSWR<InsurancePolicy>('/orders/insurance-policy', (url: string) => apiClient<InsurancePolicy>(url));
  const savedPolicies = Object.fromEntries(horses.map(h => [String(h.horseId), h]));
  const previews = horses.map(h => ({ ...previewInsurance(values[String(h.horseId)], policy ?? null, h), quantity: h.quantity ?? 1 }));
  const fee = previews.reduce((sum, p) => sum + p.fee * p.quantity, 0);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!notes.trim()) { setError('Vui lòng ghi chú nội dung đã chỉnh sửa.'); return; }
    const invalid = previews.find(p => p.error);
    if (invalid?.error) { setError(invalid.error); return; }
    if (!Number.isSafeInteger(fee) || fee > 9999999999999) { setError('Tổng phí bảo hiểm vượt giới hạn đơn hàng.'); return; }
    setSubmitting(true); setError('');
    try {
      const changed = horses.some(h => !unchangedInsurance(values[String(h.horseId)], h));
      await apiClient(`/orders/${orderId}`, { method: 'PUT', body: JSON.stringify({
        specialRequirements: [specialRequirements, `[Updated] ${notes.trim()}`].filter(Boolean).join(' | '),
        ...(changed ? { horses: horses.map(h => {
          const value = values[String(h.horseId)];
          return { horseId: h.horseId, name: h.name, quantity: h.quantity ?? 1, declaredValue: Number(value.declaredValue || 0),
            declaredCurrency: value.declaredCurrency, insurancePackage: value.insurancePackage };
        }) } : {}),
      }) });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa gửi lại được yêu cầu. Vui lòng thử lại.');
      setSubmitting(false);
    }
  };

  return <form onSubmit={submit} className="space-y-5">
    <fieldset disabled={submitting} className="space-y-5 disabled:opacity-60">
      <p className="text-sm text-slate-600">Điều chỉnh giá trị hoặc gói bảo hiểm theo yêu cầu của Manager. Cước cơ bản sẽ được báo giá lại sau khi gửi.</p>
      <InsuranceSelection horses={horses.map(h => ({ id: String(h.horseId), name: h.name, quantity: h.quantity }))}
        values={values} savedPolicies={savedPolicies} onChange={(id, value) => { setValues(previous => ({ ...previous, [id]: value })); setError(''); }}
        policy={policy ?? null} error={policyError ? 'Chưa tải được chính sách mới. Khai báo không thay đổi vẫn giữ quyền lợi đã lưu.' : undefined}
        onRetry={() => void mutate()} />
      <CostSummary transportCost={null} insuranceFee={fee} />
      <label className="block text-sm font-semibold text-slate-700">Ghi chú chỉnh sửa
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} required
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-normal" placeholder="Mô tả nội dung đã cập nhật để Manager xét duyệt lại" />
      </label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3">
      <button type="button" disabled={submitting} onClick={onCancel} className="min-h-11 rounded-lg border border-slate-300 px-4">Hủy</button>
      <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">{submitting ? 'Đang gửi…' : 'Gửi lại yêu cầu'}</button>
    </div>
  </form>;
}
