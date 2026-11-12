import { insuranceNames, vnd, type InsuredHorse } from '../insurance-policy';

export function CostSummary({ transportCost, insuranceFee, totalCost }: { transportCost: number | null; insuranceFee: number; totalCost?: number }) {
  return <dl aria-label="Tóm tắt chi phí" className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><dt>Cước vận chuyển cơ bản</dt><dd className="font-medium">{transportCost === null ? 'Chờ Manager báo giá' : vnd(transportCost)}</dd></div>
    <div className="flex flex-wrap justify-between gap-2"><dt>Phí bảo hiểm</dt><dd className="font-medium">{vnd(insuranceFee)}</dd></div>
    <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 font-semibold"><dt>Tổng chi phí đơn hàng</dt><dd>{transportCost === null ? 'Chờ xác nhận cước cơ bản' : vnd(totalCost ?? transportCost + insuranceFee)}</dd></div>
  </dl>;
}

export function InsuranceSummary({ horses, transportCost, insuranceFee, totalCost }: { horses: InsuredHorse[]; transportCost: number | null; insuranceFee: number; totalCost?: number }) {
  return <section aria-label="Bảo hiểm vận chuyển" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
    <h4 className="font-semibold text-slate-900">Giá trị khai báo & bảo hiểm</h4>
    <ul className="divide-y divide-slate-100">{horses.map((h, index) => <li key={h.horseId ?? index} className="space-y-1 py-3 text-sm">
      <p className="font-semibold text-slate-900">{h.name} · {h.quantity ?? 1} ngựa · Gói {insuranceNames[h.insurancePackage ?? 'basic']}</p>
      <p>Giá trị / ngựa: {(h.declaredValue ?? 0).toLocaleString('vi-VN')} {h.declaredCurrency ?? 'VND'}{h.declaredCurrency === 'USD' ? ` (tỷ giá đã lưu: ${vnd(h.exchangeRate ?? 0)}/USD; tương đương ${vnd(h.declaredValueVnd ?? 0)})` : ''}</p>
      <p>Phí: {vnd(h.insuranceFee ?? 0)} / ngựa × {h.quantity ?? 1} = {vnd((h.insuranceFee ?? 0) * (h.quantity ?? 1))}</p>
      <p className="text-slate-600">Bồi thường tối đa / ngựa: {vnd(h.maxCompensation ?? 50000000)}{h.emergencyVetCovered ? ' + toàn bộ chi phí cấp cứu thú y trên đường.' : h.insurancePackage === 'standard' ? ' (80% giá trị khai báo khi tổn thất/thương tích vĩnh viễn).' : ' theo quy định vận tải chung.'}</p>
    </li>)}</ul>
    <CostSummary transportCost={transportCost} insuranceFee={insuranceFee} totalCost={totalCost} />
  </section>;
}
