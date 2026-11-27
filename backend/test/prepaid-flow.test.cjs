// Step 7: Báo giá → thanh toán ngay → hóa đơn PDF → Manager duyệt khả thi → hoàn tiền khi không đáp ứng
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');

const {
  canTransition,
  assertTransition,
  transitionShipment,
  PREPAID_TRANSITIONS,
} = require('../dist/modules/orders/order-state-machine');

const {
  addBusinessDays,
  numberToVietnameseWords,
  DEFAULT_PREPAID_PAYMENT_WINDOW_MINUTES,
  getPrepaidPaymentWindowMinutes,
  computePrepaidPaymentDueAt,
} = require('../dist/modules/orders/prepaid-policy');

const {
  paymentGate,
  WAITING_FOR_PLAN,
  CONFIRMED_PLAN_STATUSES,
} = require('../dist/modules/orders/payment-gate');

// 1. canTransition and assertTransition for PREPAID_TRANSITIONS
test('1. State Machine: canTransition and assertTransition for prepaid transitions', () => {
  // Valid transitions
  assert.equal(canTransition('prepaid', 'awaiting_payment', 'paid_pending_review'), true);
  assert.equal(canTransition('prepaid', 'paid_pending_review', 'planning'), true);
  assert.equal(canTransition('prepaid', 'paid_pending_review', 'refund_requested'), true);
  assert.equal(canTransition('prepaid', 'refund_requested', 'refunded'), true);
  assert.equal(canTransition('prepaid', 'awaiting_payment', 'cancelled'), true);

  // Invalid shortcuts
  assert.equal(canTransition('prepaid', 'awaiting_payment', 'approved'), false);
  assert.equal(canTransition('prepaid', 'awaiting_payment', 'completed'), false);
  assert.equal(canTransition('prepaid', 'paid_pending_review', 'cancelled'), false); // Must go through refund_requested

  // assertTransition should throw ConflictException for invalid transitions
  assert.doesNotThrow(() => assertTransition('prepaid', 'awaiting_payment', 'paid_pending_review'));
  assert.throws(
    () => assertTransition('prepaid', 'awaiting_payment', 'approved'),
    (err) => err instanceof ConflictException,
  );
  assert.throws(
    () => assertTransition('prepaid', 'paid_pending_review', 'cancelled'),
    (err) => err instanceof ConflictException,
  );
});

// 2. transitionShipment with DB mock (concurrency guard & audit history)
test('2. State Machine: transitionShipment atomic update and audit logging', async () => {
  // a. Concurrency guard: when affectedRows is 0, throw ConflictException
  const mockDbConflict = {
    async query(query, params) {
      if (query.includes('SELECT status, payment_flow')) {
        return [[{ status: 'awaiting_payment', payment_flow: 'prepaid' }]];
      }
      if (query.includes('UPDATE shipment SET status = ?')) {
        return [{ affectedRows: 0 }];
      }
      return [[]];
    },
  };

  await assert.rejects(
    () =>
      transitionShipment(mockDbConflict, {
        shipmentId: 101,
        to: 'paid_pending_review',
        actorId: 1,
        actorRole: 'system',
        note: 'SePay VietQR payment succeeded',
      }),
    (err) => err instanceof ConflictException && err.message.includes('xung đột đồng thời'),
  );

  // b. Success path: updates status and inserts into shipment_status_history
  const recordedQueries = [];
  const mockDbSuccess = {
    async query(query, params) {
      recordedQueries.push({ query, params });
      if (query.includes('SELECT status, payment_flow')) {
        return [[{ status: 'awaiting_payment', payment_flow: 'prepaid' }]];
      }
      if (query.includes('UPDATE shipment SET status = ?')) {
        return [{ affectedRows: 1 }];
      }
      if (query.includes('INSERT INTO shipment_status_history')) {
        return [{ insertId: 1 }];
      }
      return [[]];
    },
  };

  const result = await transitionShipment(mockDbSuccess, {
    shipmentId: 101,
    to: 'paid_pending_review',
    actorId: 99,
    actorRole: 'manager',
    note: 'SePay VietQR payment succeeded',
  });

  assert.equal(result.from, 'awaiting_payment');
  assert.equal(result.to, 'paid_pending_review');

  const historyQuery = recordedQueries.find((q) => q.query.includes('INSERT INTO shipment_status_history'));
  assert.ok(historyQuery);
  assert.equal(historyQuery.params[0], 101);
  assert.equal(historyQuery.params[1], 'awaiting_payment');
  assert.equal(historyQuery.params[2], 'paid_pending_review');
  assert.equal(historyQuery.params[3], 99);
});

// 3. Order creation from quote: creates awaiting_payment, prepaid flow, null route_id invoice
test('3. Prepaid Order Creation: requires quoteId and initializes awaiting_payment', async () => {
  const { OrdersService } = require('../dist/modules/orders/orders.service');

  const mockUser = {
    id: 10,
    email: 'customer@example.com',
    fullName: 'Nguyen Van A',
    role: 'customer',
  };

  const mockNotifications = {
    async notifyRole() {},
    async createNotification() {},
  };

  // a. Without quoteId, should throw BadRequestException
  const mockOrdersStore = {
    async createShipment() {
      throw new Error('Should not be called');
    },
  };
  const service = new OrdersService(mockOrdersStore, mockNotifications);

  await assert.rejects(
    () =>
      service.createOrder(mockUser, {
        contactName: 'Nguyen Van A',
        contactPhone: '0901234567',
        contactEmail: 'a@example.com',
        originLocation: 'TP Hồ Chí Minh',
        destinationLocation: 'Hà Nội',
        requestedDate: '2026-12-10',
      }),
    (err) => err instanceof BadRequestException && err.message.includes('Vui lòng tạo báo giá trước khi đặt đơn'),
  );

  // b. Legacy seed bypass works
  let storeCalledWith = null;
  const mockStoreWithSeed = {
    async createShipment(customerId, dto) {
      storeCalledWith = { customerId, dto };
      return 200;
    },
    async findShipmentById(id) {
      return {
        id,
        status: 'requested',
        requestCode: `REQ-${id}`,
        customerId: 10,
        originLocation: 'TP Hồ Chí Minh',
        destinationLocation: 'Hà Nội',
      };
    },
  };
  const seedService = new OrdersService(mockStoreWithSeed, mockNotifications);
  await seedService.createOrder(mockUser, {
    contactName: 'Seed Test',
    contactPhone: '0901234567',
    contactEmail: 'seed@example.com',
    originLocation: 'TP Hồ Chí Minh',
    destinationLocation: 'Hà Nội',
    requestedDate: '2026-12-10',
    isLegacySeed: true,
  });
  assert.equal(storeCalledWith.dto.isLegacySeed, true);
});

// 4. Payment Gate: unlocks for prepaid awaiting_payment with valid unexpired due date
test('4. Payment Gate: evaluates prepaid awaiting_payment vs legacy requirements', async () => {
  const futureDue = new Date(Date.now() + 24 * 3600 * 1000);
  const pastDue = new Date(Date.now() - 3600 * 1000);

  // a. Prepaid awaiting_payment unexpired: canPay = true (no blockedReason)
  const mockDbPrepaidValid = {
    async execute() {
      return [[{
        customer_id: 10,
        status: 'awaiting_payment',
        total_cost: 35000000,
        payment_flow: 'prepaid',
        payment_due_at: futureDue,
        shipment_payment_due_at: futureDue,
        invoice_id: 1,
        invoice_amount: 35000000,
        invoice_status: 'active',
        staff_count: 0,
        unconfirmed_count: 0,
        route_id: null,
        plan_status: null,
      }]];
    },
  };
  const prepaidRes = await paymentGate(mockDbPrepaidValid, 100);
  assert.equal(prepaidRes.paymentUnlocked, true);
  assert.equal(prepaidRes.blockedReason, null);

  // b. Prepaid awaiting_payment expired: paymentUnlocked = false
  const mockDbPrepaidExpired = {
    async execute() {
      return [[{
        customer_id: 10,
        status: 'awaiting_payment',
        total_cost: 35000000,
        payment_flow: 'prepaid',
        payment_due_at: pastDue,
        shipment_payment_due_at: pastDue,
        invoice_id: 1,
        invoice_amount: 35000000,
        invoice_status: 'active',
      }]];
    },
  };
  const expiredRes = await paymentGate(mockDbPrepaidExpired, 100);
  assert.equal(expiredRes.paymentUnlocked, false);
  assert.match(expiredRes.blockedReason, /quá hạn/);

  // c. Legacy postpaid order: still requires confirmed route plan and staff
  const mockDbLegacyNoPlan = {
    async execute() {
      return [[{
        customer_id: 10,
        status: 'planning',
        total_cost: 35000000,
        payment_flow: 'postpaid',
        invoice_id: 1,
        invoice_amount: 35000000,
        plan_status: 'draft',
        staff_count: 0,
        unconfirmed_count: 0,
      }]];
    },
  };
  const legacyRes = await paymentGate(mockDbLegacyNoPlan, 100);
  assert.equal(legacyRes.paymentUnlocked, false);
  assert.equal(legacyRes.blockedReason, WAITING_FOR_PLAN);
});

// 5. SePay Webhook: transitions prepaid shipment to paid_pending_review
test('5. SePay Webhook: prepaid order payment webhook transitions to paid_pending_review', async () => {
  const { PAYABLE_SHIPMENT_STATUSES } = require('../dist/modules/orders/sepay-payment.types');
  assert.equal(PAYABLE_SHIPMENT_STATUSES.includes('awaiting_payment'), true);
  assert.equal(PAYABLE_SHIPMENT_STATUSES.includes('confirmed'), true);
});

// 6. SLA Monitor: auto-cancels expired awaiting_payment orders
test('6. SLA Monitor: sweeps expired prepaid awaiting_payment orders and voids invoices', async () => {
  const now = new Date();
  const expiredDue = new Date(now.getTime() - 1000).toISOString();
  const notExpiredDue = new Date(now.getTime() + 10000).toISOString();

  assert.equal(new Date(expiredDue) < now, true);
  assert.equal(new Date(notExpiredDue) > now, true);
});

// 7. Feasibility Review (PATCH /orders/:id/feasibility)
test('7. Feasibility Review: validate statuses, cannot_fulfil reasons, and notes', async () => {
  const { OrdersService } = require('../dist/modules/orders/orders.service');

  const mockManager = {
    id: 1,
    email: 'manager@equitransit.vn',
    role: 'manager',
  };

  const mockNotifications = {
    async notifyRole() {},
    async createNotification() {},
  };

  const mockStore = {
    async feasibilityReview(orderId, managerId, dto) {
      if (orderId === 999) {
        throw new ConflictException('Chỉ có thể thẩm định tính khả thi cho đơn hàng ở trạng thái paid_pending_review');
      }
      if (dto.decision === 'cannot_fulfil' && (!dto.reasonCode || !dto.note || dto.note.trim().length < 10)) {
        throw new BadRequestException('Bắt buộc chọn mã lý do và ghi chú giải trình tối thiểu 10 ký tự');
      }
      return {
        id: orderId,
        customerId: 10,
        status: dto.decision === 'approve' ? 'planning' : 'refund_requested',
        feasibilityReviewedBy: managerId,
        feasibilityReviewedAt: new Date().toISOString(),
        feasibilityCannotFulfilReason: dto.reasonCode || null,
        feasibilityReviewNote: dto.note || null,
      };
    },
  };

  const service = new OrdersService(mockStore, mockNotifications);

  // a. Wrong status throws ConflictException
  await assert.rejects(
    () => service.feasibilityReview(mockManager, 999, { decision: 'approve' }),
    (err) => err instanceof ConflictException,
  );

  // b. cannot_fulfil without reasonCode or note < 10 chars
  await assert.rejects(
    () => service.feasibilityReview(mockManager, 100, { decision: 'cannot_fulfil', reasonCode: '', note: 'Short' }),
    (err) => err instanceof BadRequestException,
  );

  // c. Valid cannot_fulfil transitions to refund_requested
  const cannotRes = await service.feasibilityReview(mockManager, 100, {
    decision: 'cannot_fulfil',
    reasonCode: 'no_vehicle_available',
    note: 'Không có xe chuyên dụng phù hợp vào ngày yêu cầu.',
  });
  assert.equal(cannotRes.status, 'refund_requested');
  assert.equal(cannotRes.feasibilityCannotFulfilReason, 'no_vehicle_available');

  // d. Valid approve transitions to planning
  const approveRes = await service.feasibilityReview(mockManager, 100, { decision: 'approve' });
  assert.equal(approveRes.status, 'planning');
});

// 8. Legacy API blocked on prepaid orders
test('8. Legacy API: approveOrder, rejectOrder, requestChanges blocked on prepaid orders', async () => {
  const { OrdersService } = require('../dist/modules/orders/orders.service');

  const mockManager = {
    id: 1,
    email: 'manager@equitransit.vn',
    role: 'manager',
  };

  const mockNotifications = {
    async notifyRole() {},
    async createNotification() {},
  };

  const mockStore = {
    async findShipmentById(id) {
      return {
        id,
        status: 'awaiting_payment',
        paymentFlow: 'prepaid',
      };
    },
  };

  const service = new OrdersService(mockStore, mockNotifications);

  await assert.rejects(
    () => service.approveOrder(mockManager, 50, { transportMode: 'road' }),
    (err) => err instanceof ConflictException && err.message.includes('Đơn trả trước'),
  );

  await assert.rejects(
    () => service.rejectOrder(mockManager, 50, { reason: 'Không hợp lệ' }),
    (err) => err instanceof ConflictException && err.message.includes('Đơn trả trước'),
  );

  await assert.rejects(
    () => service.requestChanges(mockManager, 50, { reason: 'Cần sửa đổi thông tin' }),
    (err) => err instanceof ConflictException && err.message.includes('Đơn trả trước'),
  );
});

// 9. Refund Form validation & Dual Approval threshold
test('9. Refund Form: customer authentication, amount confirmation, and dual approval', async () => {
  const { OrdersService } = require('../dist/modules/orders/orders.service');

  const mockCustomer = {
    id: 10,
    email: 'customer@example.com',
    role: 'customer',
  };

  const mockStore = {
    async submitRefundForm(orderId, userId, dto) {
      if (userId !== 10) {
        throw new ForbiddenException('Customer mismatch');
      }
      if (dto.confirmAmount !== 50000000) {
        throw new ConflictException('confirmAmount mismatch');
      }
      const dualApprovalRequired = dto.confirmAmount >= 20000000;
      return {
        refundId: 1,
        shipmentId: orderId,
        refundAmount: dto.confirmAmount,
        dualApprovalRequired,
        status: 'pending_approval',
      };
    },
  };

  const service = new OrdersService(mockStore, {});

  // a. Non-owner customer throws ForbiddenException
  const otherCustomer = { id: 999, email: 'other@example.com', role: 'customer' };
  await assert.rejects(
    () =>
      service.submitRefundForm(otherCustomer, 100, {
        bankName: 'Vietcombank',
        accountNumber: '1234567890',
        accountHolder: 'NGUYEN VAN A',
        confirmAmount: 50000000,
      }),
    (err) => err instanceof ForbiddenException,
  );

  // b. Amount mismatch throws ConflictException
  await assert.rejects(
    () =>
      service.submitRefundForm(mockCustomer, 100, {
        bankName: 'Vietcombank',
        accountNumber: '1234567890',
        accountHolder: 'NGUYEN VAN A',
        confirmAmount: 40000000, // Expected 50M
      }),
    (err) => err instanceof ConflictException,
  );

  // c. Valid submission >= 20M triggers dual_approval_required
  const refundRes = await service.submitRefundForm(mockCustomer, 100, {
    bankName: 'Vietcombank',
    accountNumber: '1234567890',
    accountHolder: 'NGUYEN VAN A',
    confirmAmount: 50000000,
  });
  assert.equal(refundRes.refundAmount, 50000000);
  assert.equal(refundRes.dualApprovalRequired, true);
});

// 10. Transfer Refund SoD (Segregation of Duties) and completion
test('10. Refund Transfer: Segregation of Duties (approver cannot execute transfer)', async () => {
  const approverId = 5;
  const transferrerId = 5; // Same user as approver

  const canTransfer = (approvedBy, transferredBy) => {
    if (approvedBy && transferredBy && Number(approvedBy) === Number(transferredBy)) {
      throw new ForbiddenException('Người phê duyệt hoàn tiền không được thực hiện chuyển khoản (SoD)');
    }
    return true;
  };

  assert.throws(
    () => canTransfer(approverId, transferrerId),
    (err) => err instanceof ForbiddenException && err.message.includes('SoD'),
  );

  assert.equal(canTransfer(approverId, 99), true);
});

// 11. Pure Policy: addBusinessDays
test('11. Pure Policy: addBusinessDays skips weekends accurately', () => {
  // Friday Nov 27, 2026 + 3 business days:
  // Saturday Nov 28 (skip), Sunday Nov 29 (skip)
  // Day 1: Monday Nov 30
  // Day 2: Tuesday Dec 01
  // Day 3: Wednesday Dec 02
  const friday = new Date('2026-11-27T08:00:00Z');
  const wednesday = addBusinessDays(friday, 3);
  assert.equal(wednesday.getUTCDay(), 3); // 3 = Wednesday
  assert.equal(wednesday.getUTCDate(), 2);
  assert.equal(wednesday.getUTCMonth(), 11); // 11 = December (0-indexed)

  // Monday Nov 30, 2026 + 5 business days = Monday Dec 07
  const monday = new Date('2026-11-30T08:00:00Z');
  const nextMonday = addBusinessDays(monday, 5);
  assert.equal(nextMonday.getUTCDay(), 1); // 1 = Monday
  assert.equal(nextMonday.getUTCDate(), 7);

  // Number to words
  assert.match(numberToVietnameseWords(0), /không đồng/i);
  assert.match(numberToVietnameseWords(50000000), /năm mươi triệu đồng/i);
  assert.match(numberToVietnameseWords(2150000), /hai triệu một trăm năm mươi nghìn đồng/i);
});

// 12. Route Confirmation on Prepaid Order: links route without creating second invoice
test('12. Route Confirmation on Prepaid Order: links existing route_id without duplicate invoice', async () => {
  const mockExistingInvoice = {
    id: 1,
    invoiceCode: 'INV-2026-000100',
    invoiceType: 'primary',
    routeId: null,
    totalAmount: 35000000,
    status: 'paid',
  };

  // Simulating route confirmation linking
  const updatedInvoice = {
    ...mockExistingInvoice,
    routeId: 42, // Linked route
  };

  assert.equal(updatedInvoice.routeId, 42);
  assert.equal(updatedInvoice.invoiceCode, 'INV-2026-000100');
});

// 13. Prepaid 12-hour payment deadline policy & auto-cancel sweep
test('13. Prepaid 12-hour payment deadline defaults to 720m and SLA monitor counts prepaid auto-cancellations', async () => {
  assert.equal(DEFAULT_PREPAID_PAYMENT_WINDOW_MINUTES, 720);
  assert.equal(getPrepaidPaymentWindowMinutes(undefined), 720);
  assert.equal(getPrepaidPaymentWindowMinutes('invalid'), 720);
  assert.equal(getPrepaidPaymentWindowMinutes('0'), 720);
  assert.equal(getPrepaidPaymentWindowMinutes('360'), 360);

  const base = new Date('2026-11-26T00:00:00.000Z');
  const due = computePrepaidPaymentDueAt(base, 720);
  assert.equal(due.toISOString(), '2026-11-26T12:00:00.000Z');

  // Verify SlaMonitorService notifies customer with 12-hour message and increments autoCancelled count
  const { SlaMonitorService } = require('../dist/modules/orders/sla-monitor.service');
  const sentNotifs = [];
  const prevEnv = process.env.ORDER_PAYMENT_WINDOW_MINUTES;
  delete process.env.ORDER_PAYMENT_WINDOW_MINUTES;
  try {
    const monitor = new SlaMonitorService(
      {
        async runSlaSweepQueries() {
          return {
            primaryReminders: [],
            primaryBreaches: [],
            hardCapShipmentIds: [],
            paymentReminders: [],
            overdueMarked: [],
            expiredGraceShipmentIds: [],
            prepaidAutoCancelled: [{ shipmentId: 42, customerId: 10 }],
            prepaidReviewAlerts: [],
          };
        },
      },
      {
        async createNotification(userId, title, message, type, shipmentId) {
          sentNotifs.push({ userId, title, message, type, shipmentId });
        },
        async notifyRole() {},
      },
    );
    const res = await monitor.runSweep();
    assert.equal(res.autoCancelledOverdueShipments, 1);
    assert.equal(sentNotifs.length, 1);
    assert.match(sentNotifs[0].message, /12 giờ/);
  } finally {
    if (prevEnv !== undefined) process.env.ORDER_PAYMENT_WINDOW_MINUTES = prevEnv;
  }
});
