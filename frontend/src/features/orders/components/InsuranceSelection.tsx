'use client';

import { defaultInsurance, insuranceNames, previewInsurance, unchangedInsurance, vnd, type InsuranceInput, type InsurancePolicy, type InsuredHorse } from '../insurance-policy';

export function InsuranceSelection({ horses, values, onChange, policy, error, onRetry, savedPolicies }: {
  horses: Array<{ id: string; name: string; quantity?: number }>;
  values: Record<string, InsuranceInput>;
  onChange: (id: string, value: InsuranceInput) => void;
  policy: InsurancePolicy | null; error?: string; onRetry: () => void;
  savedPolicies?: Record<string, InsuredHorse>;
}) {
  return <section aria-label="Giá trị và bảo hiểm vận chuyển" className="mt-6 space-y-5 border-t border-slate-200 pt-5">
    <div><h4 className="font-semibold text-slate-900">Giá trị & bảo hiểm vận chuyển</h4><p className="mt-1 text-sm text-slate-600">Khai báo giá trị cho mỗi ngựa. Phí bảo hiểm được tính riêng cho từng ngựa rồi nhân với số lượng.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" className="min-h-10 underline" onClick={onRetry}>Tải lại chính sách</button></p>}
    {horses.map(horse => {
      const value = values[horse.id] ?? defaultInsurance, saved = savedPolicies?.[horse.id];
      const preview = previewInsurance(value, policy, saved);
      const keepsPolicy = saved && unchangedInsurance(value, saved);
      const rate = keepsPolicy ? saved.exchangeRate : policy?.usdToVnd;
      return <fieldset key={horse.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 font-semibold text-slate-900">{horse.name} · {horse.quantity ?? 1} ngựa</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <label className="text-sm font-medium">Giá trị ước tính / ngựa
            <input type="number" min="0" max="9999999999999.99" step="0.01" inputMode="decimal" value={value.declaredValue}
              aria-invalid={Boolean(preview.error)} aria-describedby={`insurance-help-${horse.id}`} placeholder="Ví dụ: 100000000"
              onChange={e => onChange(horse.id, { ...value, declaredValue: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </label>
          <label className="text-sm font-medium">Loại tiền
            <select value={value.declaredCurrency} onChange={e => onChange(horse.id, { ...value, declaredCurrency: e.target.value as 'VND' | 'USD' })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3">
              <option value="VND">VNĐ</option><option value="USD" disabled={!policy?.usdToVnd}>USD{!policy?.usdToVnd ? ' (chưa có tỷ giá)' : ''}</option>
            </select>
          </label>
        </div>
        {keepsPolicy && <p className="text-xs text-slate-500">Giữ nguyên phí và quyền lợi đã lưu nếu không thay đổi khai báo.</p>}
        {value.declaredCurrency === 'USD' && rate && <p className="text-xs text-slate-500">{keepsPolicy ? 'Tỷ giá đã lưu' : 'Tỷ giá khai báo hiện tại'}: 1 USD = {vnd(rate)}. Tỷ giá được lưu khi gửi yêu cầu.</p>}
        <div role="radiogroup" aria-label={`Gói bảo hiểm cho ${horse.name}`} className="divide-y divide-slate-100">
          {(['basic', 'standard', 'premium'] as const).map(code => <label key={code} className="flex min-h-14 cursor-pointer items-start gap-3 py-3">
            <input type="radio" name={`insurance-${horse.id}`} value={code} checked={value.insurancePackage === code} onChange={() => onChange(horse.id, { ...value, insurancePackage: code })} className="mt-1 h-4 w-4 shrink-0" />
            <span className="text-sm"><strong>{insuranceNames[code]}</strong><span className="mt-1 block text-slate-600">
              {code === 'basic' ? 'Phí 0 VNĐ, đã gồm trong cước. Bồi thường tối đa 50.000.000 VNĐ/ngựa theo quy định vận tải chung.' : code === 'standard' ? 'Phí 1,5% giá trị khai báo. Bồi thường tối đa 80% khi có tổn thất/thương tích vĩnh viễn.' : 'Phí 3% giá trị khai báo. Bồi thường 100% giá trị khai báo và toàn bộ chi phí cấp cứu thú y trên đường.'}
            </span></span>
          </label>)}
        </div>
        <p id={`insurance-help-${horse.id}`} role={preview.error ? 'alert' : undefined} className={`text-sm ${preview.error ? 'text-red-700' : 'text-slate-700'}`}>{preview.error || `Phí dự kiến: ${vnd(preview.fee)} / ngựa × ${horse.quantity ?? 1} = ${vnd(preview.fee * (horse.quantity ?? 1))}`}</p>
      </fieldset>;
    })}
  </section>;
}
