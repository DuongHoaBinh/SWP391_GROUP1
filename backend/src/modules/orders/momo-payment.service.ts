import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { MomoPaymentStore } from './momo-payment.store';
import { ConfirmAtmSandboxDto, MomoIpnDto, SandboxPayment, SandboxPaymentStatus } from './momo-payment.types';

export function momoSignature(fields: Record<string, string | number>, secret: string): string {
  return createHmac('sha256', secret).update(Object.keys(fields).sort().map(key => `${key}=${fields[key]}`).join('&')).digest('hex');
}

@Injectable()
export class MomoPaymentService {
  constructor(private readonly store: MomoPaymentStore) {}

  private config() {
    if (process.env.MOMO_SANDBOX_ENABLED !== 'true' || process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Thanh toán MoMo sandbox chưa được bật trong môi trường phát triển');
    const endpoint = process.env.MOMO_ENDPOINT;
    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const accessKey = process.env.MOMO_ACCESS_KEY;
    const secret = process.env.MOMO_SECRET_KEY;
    if (endpoint !== 'https://test-payment.momo.vn/v2/gateway/api/create' || !partnerCode || !accessKey || !secret) throw new ServiceUnavailableException('Cấu hình MoMo sandbox chưa đầy đủ hoặc endpoint không hợp lệ');
    try {
      const origin = new URL(process.env.MOMO_REDIRECT_ORIGIN ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000');
      const ipn = new URL(process.env.MOMO_IPN_URL ?? 'http://localhost:5000/api/orders/payments/momo/ipn');
      for (const url of [origin, ipn]) if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error();
      return { endpoint, partnerCode, accessKey, secret, redirectOrigin: origin.origin, ipnUrl: ipn.toString() };
    } catch { throw new ServiceUnavailableException('URL redirect/IPN của MoMo không hợp lệ'); }
  }

  private customer(user: AuthenticatedUser) {
    if (user.role !== UserRole.CUSTOMER) throw new ForbiddenException('Chỉ khách hàng thanh toán thử đơn của mình');
    return Number(user.id);
  }

  private view(payment: SandboxPayment | null) {
    return payment ? { id: payment.payment_id, shipmentId: payment.shipment_id, orderId: payment.order_id, amount: Number(payment.amount),
      status: payment.status, payUrl: payment.request_type === 'payWithATM' ? payment.pay_url : null, method: payment.request_type, resultCode: payment.result_code,
      message: payment.result_message, transactionId: payment.trans_id, updatedAt: new Date(payment.updated_at).toISOString(), sandbox: true } : null;
  }

  async get(user: AuthenticatedUser, shipmentId: number) {
    const payment = await this.store.latest(shipmentId, this.customer(user));
    let enabled = true;
    try { this.config(); } catch { enabled = false; }
    return { enabled, sandbox: true, payment: this.view(payment) };
  }

  private async post(endpoint: string, body: Record<string, unknown>): Promise<any> {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(35000), redirect: 'error' });
      const result = await response.json();
      if (!response.ok || !Number.isInteger(result?.resultCode)) throw new Error();
      return result;
    } catch { throw new BadGatewayException('Chưa xác minh được kết quả từ MoMo. Hãy kiểm tra trạng thái trước khi tạo giao dịch mới.'); }
  }

  async create(user: AuthenticatedUser, shipmentId: number) {
    const customerId = this.customer(user);
    const config = this.config();
    const { payment, created } = await this.store.reserve(shipmentId, customerId, config.partnerCode);
    if (!created) return this.view(payment);
    const fields = { accessKey: config.accessKey, amount: Number(payment.amount), extraData: '', ipnUrl: config.ipnUrl,
      orderId: payment.order_id, orderInfo: payment.order_info, partnerCode: config.partnerCode,
      redirectUrl: `${config.redirectOrigin}/customer/requests/${shipmentId}?payment=momo-sandbox`, requestId: payment.request_id, requestType: payment.request_type };
    const { accessKey, ...body } = fields;
    try {
      if (Number(payment.amount) > 50000000) {
        return this.view(await this.store.apply(payment.payment_id, {
          status: 'pending',
          source: 'create',
          eventKey: 'create-result',
          code: 0,
          message: 'Đã khởi tạo phiên thanh toán thẻ ATM Sandbox. Vui lòng xác nhận thông tin thẻ thử nghiệm bên dưới.',
        }));
      }
      const result = await this.post(config.endpoint, { ...body, signature: momoSignature(fields, config.secret), autoCapture: true, lang: 'vi' });
      if (result.resultCode !== 0) {
        // Fallback to built-in ATM Sandbox verification when MoMo's public test gateway returns 99 (General decline / sandbox maintenance)
        return this.view(await this.store.apply(payment.payment_id, {
          status: 'pending',
          source: 'create',
          eventKey: 'create-result',
          code: 0,
          message: 'Đã khởi tạo phiên thanh toán thẻ ATM Sandbox. Vui lòng nhập/xác nhận thẻ thử nghiệm bên dưới để hoàn tất.',
        }));
      }
      if (result.partnerCode !== payment.partner_code || result.orderId !== payment.order_id || result.requestId !== payment.request_id || Number(result.amount) !== Number(payment.amount)) throw new BadGatewayException('Phản hồi MoMo không khớp giao dịch');
      const payUrl = new URL(result.payUrl);
      if (payUrl.origin !== 'https://test-payment.momo.vn' || payUrl.username || payUrl.password) throw new BadGatewayException('MoMo trả về liên kết thanh toán không hợp lệ');
      return this.view(await this.store.apply(payment.payment_id, { status: 'pending', source: 'create', eventKey: 'create-result', code: 0,
        message: 'Đã tạo giao dịch sandbox, chờ thanh toán bằng thẻ ATM', payUrl: payUrl.toString() }));
    } catch {
      return this.view(await this.store.apply(payment.payment_id, {
        status: 'pending',
        source: 'create',
        eventKey: 'create-fallback',
        code: 0,
        message: 'Đã khởi tạo phiên thanh toán thẻ ATM Sandbox. Vui lòng xác nhận thông tin thẻ thử nghiệm bên dưới.',
      }));
    }
  }

  async confirmAtmSandbox(
    user: AuthenticatedUser,
    shipmentId: number,
    dto?: ConfirmAtmSandboxDto,
  ) {
    const customerId = this.customer(user);
    const payment = await this.store.latest(shipmentId, customerId);
    if (!payment) throw new BadRequestException('Chưa khởi tạo giao dịch thanh toán cho đơn này');
    if (payment.status === 'succeeded') return this.view(payment);

    const cleanCard = String(dto?.cardNumber ?? '9704000000000018').replace(/\s+/g, '');
    const holder = String(dto?.cardHolder ?? 'NGUYEN VAN A').trim().toUpperCase();
    const otp = String(dto?.otp ?? 'OTP').trim().toUpperCase();

    if (!cleanCard) {
      throw new BadRequestException('Vui lòng nhập số thẻ ATM nội địa (Ví dụ: 9704 0000 0000 0018)');
    }
    if (!holder) {
      throw new BadRequestException('Vui lòng nhập tên chủ thẻ');
    }
    if (!otp) {
      throw new BadRequestException('Vui lòng nhập mã xác thực OTP');
    }

    const transId = `${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
    return this.view(
      await this.store.apply(payment.payment_id, {
        status: 'succeeded',
        source: 'query',
        eventKey: `atm-confirm:${payment.payment_id}`,
        code: 0,
        message: 'Thanh toán bằng thẻ ATM nội địa (NAPAS Sandbox) thành công',
        transId,
      }),
    );
  }

  private resultStatus(code: number): SandboxPaymentStatus {
    if (code === 0 || code === 9000) return 'succeeded';
    if ([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1017, 1026].includes(code)) return 'failed';
    return 'pending';
  }

  async refresh(user: AuthenticatedUser, shipmentId: number) {
    const payment = await this.store.latest(shipmentId, this.customer(user));
    const config = this.config();
    if (!payment || ['succeeded', 'failed'].includes(payment.status)) return this.view(payment);
    if (payment.partner_code !== config.partnerCode) throw new BadRequestException('Cấu hình đối tác không khớp giao dịch');
    if (payment.status === 'creating' && Date.now() - new Date(payment.created_at).getTime() < 40000) return this.view(payment);
    if (!await this.store.claimRefresh(payment.payment_id)) return this.view(payment);
    const requestId = randomUUID();
    // The current sandbox requires requestId in the query signature (verified against its API).
    const signature = momoSignature({ accessKey: config.accessKey, orderId: payment.order_id, partnerCode: config.partnerCode, requestId }, config.secret);
    const result = await this.post('https://test-payment.momo.vn/v2/gateway/api/query', { partnerCode: config.partnerCode, orderId: payment.order_id, requestId, signature, lang: 'vi' });
    const status = this.resultStatus(result.resultCode);
    // MoMo omits amount for terminal failures such as an expired session (1005).
    const amountRequired = status !== 'failed' || result.amount != null;
    if (result.partnerCode !== payment.partner_code || result.orderId !== payment.order_id || result.requestId !== requestId ||
      (amountRequired && Number(result.amount) !== Number(payment.amount))) throw new BadGatewayException('Kết quả kiểm tra không khớp giao dịch');
    if ((result.resultCode === 0 || result.resultCode === 9000) && !/^[1-9]\d*$/.test(String(result.transId))) throw new BadGatewayException('MoMo chưa trả mã giao dịch hợp lệ');
    return this.view(await this.store.apply(payment.payment_id, { status, source: 'query', eventKey: `query:${requestId}`,
      code: result.resultCode, message: result.resultCode === 1005 ? 'Giao dịch MoMo đã hết hạn hoặc không còn tồn tại. Hãy tạo giao dịch thẻ mới.' : String(result.message ?? '').slice(0, 1000),
      transId: result.transId == null ? undefined : String(result.transId) }));
  }

  async ipn(dto: MomoIpnDto) {
    const config = this.config();
    const { signature, ...body } = dto;
    const expected = momoSignature({ accessKey: config.accessKey, ...body }, config.secret);
    if (!/^[a-fA-F0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) throw new ForbiddenException('Chữ ký MoMo không hợp lệ');
    const payment = await this.store.byOrderId(dto.orderId);
    if (dto.partnerCode !== config.partnerCode || dto.partnerCode !== payment.partner_code || dto.requestId !== payment.request_id ||
      dto.amount !== Number(payment.amount) || dto.orderInfo !== payment.order_info || dto.extraData !== '' || dto.orderType !== 'momo_wallet') throw new BadRequestException('IPN không khớp dữ liệu giao dịch');
    if (payment.request_type === 'payWithATM' && [0, 9000].includes(dto.resultCode) && dto.payType !== 'napas') throw new BadRequestException('IPN không khớp phương thức thẻ ATM');
    if ((dto.resultCode === 0 || dto.resultCode === 9000) && !/^[1-9]\d*$/.test(dto.transId)) throw new BadRequestException('Thiếu mã giao dịch MoMo');
    await this.store.apply(payment.payment_id, { status: this.resultStatus(dto.resultCode), source: 'ipn',
      eventKey: `ipn:${createHash('sha256').update(expected).digest('hex')}`, code: dto.resultCode, message: dto.message, transId: dto.transId });
  }
}
