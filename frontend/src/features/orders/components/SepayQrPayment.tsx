'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  QrCode,
  FileText,
  Printer,
  AlertTriangle,
  RefreshCw,
  Send,
  Zap,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

export interface SepayPaymentResponse {
  shipmentId: number;
  orderCode: string;
  quotedAmountVnd: number;
  isFlow2Completed: boolean;
  devSimulateEnabled: boolean;
  config: {
    bankCode: string;
    bankAccountNo: string;
    bankAccountName: string;
    paymentCodePrefix: string;
    expireHours: number;
  };
  payment: {
    paymentId: number;
    shipmentId: number;
    customerId: number;
    paymentCode: string;
    amount: number;
    status: 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'NEEDS_REVIEW' | 'EXPIRED' | 'CANCELLED';
    expiresAt: string;
    paidAt: string | null;
    confirmedBy: string | null;
    sepayTransactionId: string | null;
    referenceCode: string | null;
    gateway: string | null;
    paidAmount: number | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  invoice: {
    invoiceId: number;
    invoiceNumber: string;
    paymentId: number;
    shipmentId: number;
    orderCode: string;
    payerName: string;
    payerEmail: string | null;
    paidAt: string;
    amount: number;
    transferContent: string;
    bankCode: string;
    bankAccountNo: string;
    bankAccountName: string;
    confirmedBy: string;
    createdAt: string;
  } | null;
  qrUrl: string | null;
  vietQrUrl: string | null;
}

export function printInvoiceHtml(invoice: NonNullable<SepayPaymentResponse['invoice']>) {
  const printWindow = window.open('', '_blank', 'width=820,height=900');
  if (!printWindow) {
    toast.error('Vui lòng cho phép mở cửa sổ popup để in/tải hóa đơn.');
    return;
  }
  const paidDateStr = new Date(invoice.paidAt).toLocaleString('vi-VN');
  const confirmedLabel =
    invoice.confirmedBy === 'WEBHOOK'
      ? 'Tự động qua SePay Webhook (VietQR)'
      : `Xác nhận bởi Quản lý (${invoice.confirmedBy})`;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8" />
      <title>${invoice.invoiceNumber}_${invoice.orderCode}_Invoice</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 36px; background: #fff; }
        .box { max-width: 720px; margin: 0 auto; border: 2px solid #0f172a; border-radius: 12px; padding: 32px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
        .brand { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; }
        .sub { font-size: 12px; color: #475569; margin-top: 4px; }
        .badge { display: inline-block; background: #dcfce7; color: #166534; font-weight: 800; font-size: 12px; padding: 6px 12px; border-radius: 999px; border: 1px solid #86efac; }
        .title { text-align: center; font-size: 22px; font-weight: 800; margin: 16px 0 4px; color: #0f172a; }
        .inv-no { text-align: center; font-size: 13px; color: #475569; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        td { padding: 11px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        td.label { color: #475569; font-weight: 600; width: 42%; }
        td.val { color: #0f172a; font-weight: 700; text-align: right; }
        .amount-row td { background: #f8fafc; font-size: 16px; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; }
        .amount-row td.val { color: #047857; font-size: 18px; }
        .footer { margin-top: 28px; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6; }
        @media print { body { padding: 0; } .box { border: 1px solid #cbd5e1; } }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="header">
          <div>
            <div class="brand">🐎 EQUITRANSIT LOGISTICS</div>
            <div class="sub">Cross-Border Racehorse Transport & Quarantine Compliance</div>
          </div>
          <div style="text-align: right;">
            <span class="badge">✓ ĐÃ THANH TOÁN (PAID)</span>
          </div>
        </div>

        <div class="title">HÓA ĐƠN THANH TOÁN CƯỚC VẬN CHUYỂN</div>
        <div class="inv-no">Số hóa đơn: <strong>${invoice.invoiceNumber}</strong></div>

        <table>
          <tr>
            <td class="label">Mã đơn vận chuyển</td>
            <td class="val">${invoice.orderCode}</td>
          </tr>
          <tr>
            <td class="label">Tên người thanh toán (Khách hàng)</td>
            <td class="val">${invoice.payerName}${invoice.payerEmail ? ` (${invoice.payerEmail})` : ''}</td>
          </tr>
          <tr>
            <td class="label">Ngày giờ thanh toán</td>
            <td class="val">${paidDateStr}</td>
          </tr>
          <tr class="amount-row">
            <td class="label">Số tiền đã thanh toán</td>
            <td class="val">${Number(invoice.amount).toLocaleString('vi-VN')} VND</td>
          </tr>
          <tr>
            <td class="label">Nội dung chuyển khoản</td>
            <td class="val" style="font-family: monospace;">${invoice.transferContent}</td>
          </tr>
          <tr>
            <td class="label">Ngân hàng nhận</td>
            <td class="val">${invoice.bankCode}</td>
          </tr>
          <tr>
            <td class="label">Số tài khoản nhận</td>
            <td class="val" style="font-family: monospace;">${invoice.bankAccountNo}</td>
          </tr>
          <tr>
            <td class="label">Chủ tài khoản nhận</td>
            <td class="val">${invoice.bankAccountName}</td>
          </tr>
          <tr>
            <td class="label">Phương thức xác nhận</td>
            <td class="val">${confirmedLabel}</td>
          </tr>
        </table>

        <div class="footer">
          Chứng từ điện tử được phát hành tự động từ hệ thống EquiTransit Logistics.<br/>
          Thanh toán dùng môi trường thử nghiệm của dịch vụ xác nhận chuyển khoản (SePay Test mode).
        </div>
      </div>
      <script>
        window.onload = function() { setTimeout(function() { window.print(); }, 250); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

export function SepayQrPayment({
  shipmentId,
  onPaid,
}: {
  shipmentId: number;
  onPaid?: () => void;
}) {
  const [data, setData] = useState<SepayPaymentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>('');
  const [qrImgFallback, setQrImgFallback] = useState(false);

  const loadPayment = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await apiClient<SepayPaymentResponse>(`/orders/${shipmentId}/payment`);
        setData((prev) => {
          if (prev?.payment?.status !== 'PAID' && res?.payment?.status === 'PAID') {
            toast.success('Thanh toán thành công! Hóa đơn đã được phát hành.');
            if (onPaid) onPaid();
          }
          return res;
        });
      } catch {
        // Ignore transient polling error
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shipmentId, onPaid],
  );

  useEffect(() => {
    loadPayment(false);
  }, [loadPayment]);

  // Bước 5: Tự cập nhật bằng polling mỗi 4 giây khi đang mở khối thanh toán và chưa PAID
  useEffect(() => {
    if (!data?.payment) return;
    if (data.payment.status === 'PAID' || data.payment.status === 'EXPIRED' || data.payment.status === 'CANCELLED') {
      return;
    }
    const timer = setInterval(() => {
      loadPayment(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [data?.payment, loadPayment]);

  // Đếm ngược thời hạn thanh toán
  useEffect(() => {
    const expiresAt = data?.payment?.expiresAt;
    const status = data?.payment?.status;
    if (!expiresAt || (status !== 'PENDING' && status !== 'AWAITING_CONFIRMATION')) {
      setCountdownText('');
      return;
    }

    const updateTimer = () => {
      const diffMs = new Date(expiresAt).getTime() - Date.now();
      if (diffMs <= 0) {
        setCountdownText('Đã hết hạn');
        return;
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      setCountdownText(
        `${String(hours).padStart(2, '0')}g : ${String(minutes).padStart(2, '0')}p : ${String(seconds).padStart(2, '0')}s`,
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [data?.payment?.expiresAt, data?.payment?.status]);

  // Bước 2: Khối thanh toán CHỈ xuất hiện sau khi Flow 2 hoàn tất VÀ Manager đã gửi yêu cầu thanh toán
  if (loading && !data) return null;
  if (!data || !data.isFlow2Completed || !data.payment) {
    return null;
  }

  const { payment, invoice, config, qrUrl, vietQrUrl, devSimulateEnabled, orderCode } = data;
  const formattedAmount = Number(payment.amount).toLocaleString('vi-VN');

  const handleCopy = (value: string, key: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    toast.success(`Đã sao chép ${label}`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleReportTransferred = async () => {
    setSubmitting(true);
    try {
      await apiClient(`/orders/${shipmentId}/payment/report-transferred`, {
        method: 'POST',
      });
      toast.success('Đã gửi thông báo xác nhận chuyển khoản cho Quản lý!');
      await loadPayment(true);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể gửi báo cáo chuyển khoản.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimulateWebhook = async (customAmount?: number) => {
    setSubmitting(true);
    try {
      await apiClient('/webhooks/sepay/simulate', {
        method: 'POST',
        body: JSON.stringify({
          shipmentId,
          transferAmount: customAmount,
        }),
      });
      await loadPayment(true);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể mô phỏng webhook SePay.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: payment.status === 'PAID' ? '1.5px solid #86efac' : '1.5px solid #bfdbfe',
        borderRadius: '14px',
        padding: '22px 24px',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={20} color={payment.status === 'PAID' ? '#16a34a' : '#2563eb'} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              Thanh toán chuyển khoản QR (VietQR / SePay)
            </h3>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#475569' }}>
            Đơn <strong>{orderCode}</strong> • Số tiền khóa theo báo giá:{' '}
            <strong style={{ color: '#0f172a', fontSize: '14px' }}>{formattedAmount} VND</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {payment.status === 'PENDING' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: '999px',
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
              }}
            >
              ⏳ Chờ thanh toán
            </span>
          )}
          {payment.status === 'AWAITING_CONFIRMATION' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: '999px',
                backgroundColor: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
              }}
            >
              🕒 Chờ Manager xác nhận
            </span>
          )}
          {payment.status === 'NEEDS_REVIEW' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: '999px',
                backgroundColor: '#ffedd5',
                color: '#c2410c',
                border: '1px solid #fed7aa',
              }}
            >
              ⚠️ Lệch số tiền - Chờ kiểm tra
            </span>
          )}
          {payment.status === 'PAID' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 800,
                padding: '5px 12px',
                borderRadius: '999px',
                backgroundColor: '#dcfce7',
                color: '#15803d',
                border: '1px solid #86efac',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <CheckCircle2 size={14} /> Thanh toán thành công
            </span>
          )}
          {payment.status === 'EXPIRED' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: '999px',
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
              }}
            >
              Đã hết hạn
            </span>
          )}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '4px 9px',
              borderRadius: '999px',
              backgroundColor: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
            }}
          >
            SEPAY TEST MODE
          </span>
        </div>
      </div>

      {/* Countdown Bar for PENDING / AWAITING_CONFIRMATION */}
      {(payment.status === 'PENDING' || payment.status === 'AWAITING_CONFIRMATION') && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155' }}>
            <Clock size={16} color="#2563eb" />
            <span>
              Hạn thanh toán: <strong>{new Date(payment.expiresAt).toLocaleString('vi-VN')}</strong>
            </span>
            {countdownText && (
              <span
                style={{
                  marginLeft: '6px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#dbeafe',
                  color: '#1e40af',
                  fontWeight: 800,
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                Còn lại: {countdownText}
              </span>
            )}
          </div>

          {!showQrModal && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              }}
            >
              <QrCode size={16} /> Thanh toán ngay (Mở mã QR)
            </button>
          )}
        </div>
      )}

      {/* Bước 3: Khối QR VietQR & Thông tin chuyển khoản */}
      {(payment.status === 'PENDING' || payment.status === 'AWAITING_CONFIRMATION') && showQrModal && (
        <div
          style={{
            marginTop: '16px',
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '22px',
              alignItems: 'center',
            }}
          >
            {/* Cột trái: Ảnh QR VietQR */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#ffffff',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e40af', marginBottom: '8px' }}>
                QUÉT MÃ VIETQR ĐỂ THANH TOÁN TỰ ĐỘNG
              </div>
              {(vietQrUrl || qrUrl) && (
                <img
                  src={qrImgFallback ? qrUrl || '' : vietQrUrl || qrUrl || ''}
                  onError={() => setQrImgFallback(true)}
                  alt="VietQR Payment Code"
                  style={{
                    width: '230px',
                    height: '230px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    border: '1px solid #f1f5f9',
                  }}
                />
              )}
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '8px' }}>
                Đã điền sẵn số tiền <strong>{formattedAmount}đ</strong> & nội dung{' '}
                <strong>{payment.paymentCode}</strong>
              </div>
            </div>

            {/* Cột phải: Thông tin tài khoản bằng chữ & nút Copy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Ngân hàng thụ hưởng</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    <Building2 size={14} style={{ display: 'inline', marginRight: '5px', color: '#2563eb' }} />
                    {config.bankCode}
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Số tài khoản nhận</div>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      marginTop: '2px',
                    }}
                  >
                    {config.bankAccountNo}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(config.bankAccountNo, 'acc', 'Số tài khoản')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedField === 'acc' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  Copy
                </button>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Chủ tài khoản</div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  {config.bankAccountName}
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Số tiền chuyển khoản</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                    {formattedAmount} VND
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(String(payment.amount), 'amt', 'Số tiền')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedField === 'amt' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  Copy
                </button>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '8px',
                  border: '1.5px solid #93c5fd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700 }}>
                    Nội dung chuyển khoản (Bắt buộc chính xác)
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 900,
                      color: '#1d4ed8',
                      fontFamily: 'monospace',
                      marginTop: '2px',
                    }}
                  >
                    {payment.paymentCode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(payment.paymentCode, 'code', 'Nội dung chuyển khoản')}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedField === 'code' ? <Check size={14} /> : <Copy size={14} />}
                  Copy mã
                </button>
              </div>
            </div>
          </div>

          {/* Dòng nhắc giữ nguyên nội dung chuyển khoản */}
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              fontSize: '12.5px',
              color: '#92400e',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>
              💡 <strong>Lưu ý:</strong> Giữ nguyên nội dung chuyển khoản{' '}
              <code style={{ fontWeight: 800, color: '#b45309' }}>{payment.paymentCode}</code> để hệ thống tự xác nhận
              qua SePay Webhook (trang tự động cập nhật sau 3–5 giây).
            </span>
          </div>

          {/* Các nút hành động: Nhánh dự phòng "Tôi đã chuyển khoản" + Mô phỏng SePay Test Mode */}
          <div
            style={{
              marginTop: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {payment.status === 'PENDING' ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleReportTransferred}
                  style={{
                    padding: '9px 15px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Send size={14} color="#2563eb" /> Tôi đã chuyển khoản (Báo Manager)
                </button>
              ) : (
                <span style={{ fontSize: '12.5px', color: '#b45309', fontWeight: 700 }}>
                  ✓ Đã gửi thông báo "Tôi đã chuyển khoản" — Đang chờ Manager hoặc Webhook xác nhận...
                </span>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={() => loadPayment(false)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <RefreshCw size={13} /> Kiểm tra ngay
              </button>
            </div>

            {devSimulateEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSimulateWebhook()}
                  style={{
                    padding: '9px 15px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                  }}
                >
                  <Zap size={14} /> Mô phỏng chuyển khoản SePay (Đúng số tiền)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cảnh báo khi lệch số tiền (NEEDS_REVIEW) */}
      {payment.status === 'NEEDS_REVIEW' && (
        <div
          style={{
            marginTop: '14px',
            padding: '14px 16px',
            borderRadius: '10px',
            backgroundColor: '#fff7ed',
            border: '1px solid #fed7aa',
            color: '#9a3412',
            fontSize: '13px',
          }}
        >
          <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <AlertTriangle size={16} color="#ea580c" /> Giao dịch chuyển khoản lệch số tiền (Cần kiểm tra)
          </div>
          <div>
            Hệ thống ghi nhận số tiền chuyển vào là{' '}
            <strong>{Number(payment.paidAmount ?? 0).toLocaleString('vi-VN')} VND</strong> (Báo giá yêu cầu:{' '}
            <strong>{formattedAmount} VND</strong>). Logistics Manager đã nhận thông báo và đang đối chiếu xác nhận.
          </div>
        </div>
      )}

      {/* Khi hết hạn (EXPIRED) */}
      {payment.status === 'EXPIRED' && (
        <div
          style={{
            marginTop: '14px',
            padding: '14px 16px',
            borderRadius: '10px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: '13px',
          }}
        >
          Yêu cầu thanh toán mã <strong>{payment.paymentCode}</strong> đã quá thời hạn 48 giờ. Vui lòng chờ Logistics
          Manager phát hành lại yêu cầu thanh toán mới.
        </div>
      )}

      {/* Bước 5: Khi PAID -> Hiển thị Hóa đơn điện tử (Invoice) */}
      {payment.status === 'PAID' && invoice && (
        <div
          style={{
            marginTop: '16px',
            padding: '18px 20px',
            borderRadius: '12px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              paddingBottom: '12px',
              borderBottom: '1px solid #bbf7d0',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="#15803d" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#14532d' }}>
                  HÓA ĐƠN ĐIỆN TỬ: {invoice.invoiceNumber}
                </div>
                <div style={{ fontSize: '12px', color: '#166534' }}>
                  Xác nhận lúc {new Date(invoice.paidAt).toLocaleString('vi-VN')} •{' '}
                  {invoice.confirmedBy === 'WEBHOOK' ? 'SePay Webhook tự động' : `Quản lý (${invoice.confirmedBy})`}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => printInvoiceHtml(invoice)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #16a34a',
                backgroundColor: '#ffffff',
                color: '#15803d',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Printer size={14} /> Xem / In / Tải Hóa đơn (PDF)
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px 18px',
              fontSize: '13px',
            }}
          >
            <div>
              <span style={{ color: '#475569' }}>Người thanh toán:</span>{' '}
              <strong style={{ color: '#0f172a' }}>{invoice.payerName}</strong>
            </div>
            <div>
              <span style={{ color: '#475569' }}>Mã đơn hàng:</span>{' '}
              <strong style={{ color: '#0f172a' }}>{invoice.orderCode}</strong>
            </div>
            <div>
              <span style={{ color: '#475569' }}>Số tiền:</span>{' '}
              <strong style={{ color: '#15803d' }}>{Number(invoice.amount).toLocaleString('vi-VN')} VND</strong>
            </div>
            <div>
              <span style={{ color: '#475569' }}>Nội dung CK:</span>{' '}
              <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{invoice.transferContent}</strong>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: '#475569' }}>Tài khoản nhận:</span>{' '}
              <strong style={{ color: '#0f172a' }}>
                {invoice.bankCode} • {invoice.bankAccountNo} ({invoice.bankAccountName})
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

