'use client';
import { insuranceNames, vnd, type InsuredHorse } from '../insurance-policy';
import { bookingName, type BookingType } from '../booking-policy';

export interface Invoice {
  id: number;
  code: string;
  shipmentId: number;
  routeId: number;
  amount: number;
  currency: 'VND';
  issuedAt: string;
  snapshot: {
    bookingType?: BookingType; stallUnitPrice?: number | null;
    transportCost?: number; insuranceFee?: number; horses?: InsuredHorse[];
    requestCode: string; contactName: string | null; contactEmail: string;
    origin: string; destination: string; horseCount: number; routeName: string | null;
    legs: Array<{ sequence_no: number; origin_location: string; destination_location: string; planned_departure: string; planned_arrival: string; vehicle_id: number | null; flight_number: string | null }>;
  };
}

function printInvoice(invoice: Invoice) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return;
  const doc = popup.document;
  doc.documentElement.lang = 'vi';
  doc.title = `Hóa đơn ${invoice.code}`;
  const style = doc.createElement('style');
  style.textContent = 'body{font:15px Arial,sans-serif;color:#17243b;max-width:800px;margin:40px auto;padding:24px}h1{font-size:26px}p{line-height:1.6}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{text-align:left;border:1px solid #ccd3dc;padding:12px}button{padding:12px}@media print{button{display:none}body{margin:0}}';
  doc.head.append(style);
  const add = (tag: string, text: string) => { const el = doc.createElement(tag); el.textContent = text; doc.body.append(el); return el; };
  add('h1', `HÓA ĐƠN VẬN CHUYỂN ${invoice.code}`);
  add('p', `Mã yêu cầu: ${invoice.snapshot.requestCode} · Ngày phát hành: ${new Date(invoice.issuedAt).toLocaleString('vi-VN')}`);
  add('p', `Khách hàng: ${invoice.snapshot.contactName || invoice.snapshot.contactEmail}`);
  add('p', `${invoice.snapshot.origin} → ${invoice.snapshot.destination} · ${invoice.snapshot.horseCount} ngựa`);
  add('p', `Lộ trình đã xác nhận: ${invoice.snapshot.routeName || invoice.routeId}`);
  add('p', `Hình thức: ${bookingName(invoice.snapshot.bookingType)}`);
  if (invoice.snapshot.bookingType === 'shared_stall' && invoice.snapshot.stallUnitPrice != null) {
    add('p', `Cước cơ bản: ${vnd(invoice.snapshot.stallUnitPrice)} / ô × ${invoice.snapshot.horseCount} ngựa = ${vnd(invoice.snapshot.stallUnitPrice * invoice.snapshot.horseCount)}`);
  }
  const table = doc.createElement('table');
  [
    ['Chặng', 'Lộ trình', 'Giờ đi', 'Giờ đến'],
    ...invoice.snapshot.legs.map(leg => [String(leg.sequence_no), `${leg.origin_location} → ${leg.destination_location}`, new Date(leg.planned_departure).toLocaleString('vi-VN'), new Date(leg.planned_arrival).toLocaleString('vi-VN')]),
  ].forEach((values, index) => {
    const row = doc.createElement('tr');
    for (const value of values) { const cell = doc.createElement(index ? 'td' : 'th'); cell.textContent = value; row.append(cell); }
    table.append(row);
  });
  doc.body.append(table);
  for (const horse of invoice.snapshot.horses ?? []) {
    add('p', `${horse.name}: ${horse.quantity ?? 1} ngựa; giá trị ${(horse.declaredValue ?? 0).toLocaleString('vi-VN')} ${horse.declaredCurrency ?? 'VND'}/ngựa; gói ${insuranceNames[horse.insurancePackage ?? 'basic']}; phí ${vnd((horse.insuranceFee ?? 0) * (horse.quantity ?? 1))}; bồi thường tối đa ${vnd(horse.maxCompensation ?? 50000000)}/ngựa${horse.emergencyVetCovered ? ' + chi phí cấp cứu thú y trên đường' : ''}.`);
  }
  add('p', `Cước cơ bản: ${vnd(invoice.snapshot.transportCost ?? invoice.amount)} · Phí bảo hiểm: ${vnd(invoice.snapshot.insuranceFee ?? 0)}`);
  add('h2', `Tổng tiền: ${invoice.amount.toLocaleString('vi-VN')} VND`);
  add('p', 'Hóa đơn cước vận chuyển phát hành theo lộ trình đã xác nhận. Trạng thái nhận tiền được cập nhật riêng sau khi ngân hàng xác nhận.');
  const button = add('button', 'In / lưu PDF');
  button.onclick = () => popup.print();
  popup.focus();
  popup.print();
}

export function InvoiceSummary({ invoice }: { invoice: Invoice }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
    <div><p className="font-semibold text-slate-900">Hóa đơn chính thức {invoice.code}</p><p className="mt-1 text-sm text-slate-600">Phát hành {new Date(invoice.issuedAt).toLocaleString('vi-VN')} · {invoice.amount.toLocaleString('vi-VN')} VND</p></div>
    <button type="button" onClick={() => printInvoice(invoice)} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">In / lưu hóa đơn PDF</button>
  </div>;
}
