// Step 6: Bảo hiểm theo % giá trị và bồi thường theo mức độ sự cố M1–M4
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');

const {
  calculateInsurance,
  suggestPayout,
  payoutTable,
  DEFAULT_PAYOUT_RULES_V2,
  INSURANCE_VERSION,
} = require('../dist/modules/orders/insurance-policy');

const { InsuranceClaimService } = require('../dist/modules/orders/insurance-claim.service');
const { UserRole } = require('../dist/modules/auth/auth.types');

// 1. Phí: Tiêu chuẩn 2 tỷ → 30.000.000; Tiêu chuẩn 50 triệu → tối thiểu 1.000.000; Toàn diện 50 triệu → tối thiểu 2.000.000; Cơ bản → 0; Tiêu chuẩn với giá trị 0 → lỗi
test('1. Phí bảo hiểm v2: tính theo % có mức tối thiểu và chặn giá trị 0', () => {
  // a. Tiêu chuẩn 2 tỷ: 1.5% của 2 tỷ = 30.000.000 VNĐ
  const std2b = calculateInsurance({ declaredValue: 2000000000, insurancePackage: 'standard' });
  assert.equal(std2b.insuranceFee, 30000000);
  assert.equal(std2b.maxCompensation, 1600000000); // 80%

  // b. Tiêu chuẩn 50 triệu: 1.5% của 50 triệu = 750.000 VNĐ < tối thiểu 1.000.000 VNĐ → áp 1.000.000
  const std50m = calculateInsurance({ declaredValue: 50000000, insurancePackage: 'standard' });
  assert.equal(std50m.insuranceFee, 1000000);

  // c. Toàn diện 50 triệu: 3% của 50 triệu = 1.500.000 VNĐ < tối thiểu 2.000.000 VNĐ → áp 2.000.000
  const prem50m = calculateInsurance({ declaredValue: 50000000, insurancePackage: 'premium' });
  assert.equal(prem50m.insuranceFee, 2000000);
  assert.equal(prem50m.maxCompensation, 50000000); // 100%

  // d. Cơ bản 2 tỷ → phí 0 VNĐ, trần đền 50.000.000 VNĐ
  const basic2b = calculateInsurance({ declaredValue: 2000000000, insurancePackage: 'basic' });
  assert.equal(basic2b.insuranceFee, 0);
  assert.equal(basic2b.maxCompensation, 50000000);

  // e. Tiêu chuẩn với giá trị 0 → ném BadRequestException
  assert.throws(
    () => calculateInsurance({ declaredValue: 0, insurancePackage: 'standard' }),
    (err) => err instanceof BadRequestException,
  );
});

// 2. suggestPayout / payoutTable với 2 tỷ: đúng số tiền các mức M1–M4
test('2. suggestPayout và payoutTable với ngựa 2 tỷ theo C4.2', () => {
  const declaredValue = 2000000000;

  // Tiêu chuẩn M3 (Loss of Use): 50% của 2 tỷ = 1.000.000.000
  const stdM3Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'standard' && r.severity === 'M3');
  const resStdM3 = suggestPayout({ rule: stdM3Rule, declaredValueVnd: declaredValue });
  assert.equal(resStdM3.amount, 1000000000);

  // Tiêu chuẩn M4 (Tử vong): 80% của 2 tỷ = 1.600.000.000
  const stdM4Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'standard' && r.severity === 'M4');
  const resStdM4 = suggestPayout({ rule: stdM4Rule, declaredValueVnd: declaredValue });
  assert.equal(resStdM4.amount, 1600000000);

  // Toàn diện M4: 100% của 2 tỷ = 2.000.000.000
  const premM4Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'premium' && r.severity === 'M4');
  const resPremM4 = suggestPayout({ rule: premM4Rule, declaredValueVnd: declaredValue });
  assert.equal(resPremM4.amount, 2000000000);

  // Cơ bản M4: 100% nhưng có trần 50.000.000
  const basicM4Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'basic' && r.severity === 'M4');
  const resBasicM4 = suggestPayout({ rule: basicM4Rule, declaredValueVnd: declaredValue });
  assert.equal(resBasicM4.amount, 50000000);

  // Cơ bản M3: 20% của 2 tỷ = 400 triệu, trần 50.000.000 → 50.000.000
  const basicM3Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'basic' && r.severity === 'M3');
  const resBasicM3 = suggestPayout({ rule: basicM3Rule, declaredValueVnd: declaredValue });
  assert.equal(resBasicM3.amount, 50000000);

  // Tiêu chuẩn M1 với chi phí thú y 30 triệu: trần là 1% của 2 tỷ = 20 triệu → đền 20.000.000
  const stdM1Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'standard' && r.severity === 'M1');
  const resStdM1 = suggestPayout({
    rule: stdM1Rule,
    declaredValueVnd: declaredValue,
    vetCostVnd: 30000000,
  });
  assert.equal(resStdM1.amount, 20000000);

  // Cơ bản M1 với chi phí thú y 3 triệu: trần 5 triệu → đền 3.000.000
  const basicM1Rule = DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === 'basic' && r.severity === 'M1');
  const resBasicM1 = suggestPayout({
    rule: basicM1Rule,
    declaredValueVnd: declaredValue,
    vetCostVnd: 3000000,
  });
  assert.equal(resBasicM1.amount, 3000000);

  // payoutTable đầy đủ cho gói Tiêu chuẩn
  const table = payoutTable({ packageCode: 'standard', declaredValueVnd: declaredValue });
  assert.equal(table.M1.amount, 20000000); // 1%
  assert.equal(table.M2.amount, 300000000); // 15%
  assert.equal(table.M3.amount, 1000000000); // 50%
  assert.equal(table.M4.amount, 1600000000); // 80%
});

// 3. Khứ hồi: phí × 2 × 0,9
test('3. Bảo hiểm khứ hồi tính 2 chặng nhân ưu đãi 0.9', () => {
  const oneWay = calculateInsurance({ declaredValue: 2000000000, insurancePackage: 'standard' });
  const roundTripInsurance = Math.round(oneWay.insuranceFee * 2 * 0.9);
  assert.equal(oneWay.insuranceFee, 30000000);
  assert.equal(roundTripInsurance, 54000000);
});

// Mock helpers for Claim Service
function createMockClaimService(overrides = {}) {
  const mockClaimStore = {
    findHorseAndShipment: async () => ({
      shipmentId: 10,
      customerId: 1,
      shipmentStatus: 'completed',
      shipmentUpdatedAt: new Date(Date.now() - 10 * 3600 * 1000), // 10h ago
      shipmentHorseId: 101,
      declaredValueVnd: 2000000000,
      insurancePackage: 'standard',
      insurancePolicyVersion: 'equine-v2',
      horseName: 'Thunder',
      handoverId: 1,
      handoverDatetime: new Date(Date.now() - 10 * 3600 * 1000),
      ...overrides.horseAndShipment,
    }),
    findRulesByVersion: async () => DEFAULT_PAYOUT_RULES_V2,
    hasActiveClaimForHorse: async () => Boolean(overrides.hasActiveClaim),
    createClaim: async (data) => ({
      id: 55,
      ...data,
      status: 'submitted',
      createdAt: new Date().toISOString(),
    }),
    findClaimById: async (id) => ({
      id,
      shipmentId: 10,
      shipmentHorseId: 101,
      customerId: 1,
      severity: 'M3',
      description: 'Ngựa chấn thương gãy chân trong quá trình di chuyển',
      vetCostVnd: null,
      evidenceUrls: [],
      requestedAmount: 1000000000,
      suggestedAmount: 1000000000,
      approvedAmount: null,
      policyVersion: 'equine-v2',
      packageCode: 'standard',
      declaredValueVnd: 2000000000,
      status: overrides.claimStatus || 'submitted',
      rejectionReasonCode: null,
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
      refundRecordId: null,
      createdAt: new Date().toISOString(),
      horseName: 'Thunder',
      ...overrides.claimData,
    }),
    findClaimEvents: async () => [],
    reviewClaim: async (claimId, reviewerId, decision, approvedAmount, rejectionReasonCode, reason) => ({
      claim: {
        id: claimId,
        status: decision === 'start_review' ? 'under_review' : decision === 'approve' ? 'approved' : 'rejected',
        approvedAmount: approvedAmount ?? null,
      },
      refundRecordId: decision === 'approve' ? 99 : undefined,
    }),
  };

  const mockOrdersStore = {
    findShipmentById: async () => ({
      id: 10,
      customerId: 1,
      horses: [
        {
          shipmentHorseId: 101,
          horseId: 1,
          name: 'Thunder',
          declaredValueVnd: 2000000000,
          insurancePackage: 'standard',
          insurancePolicyVersion: 'equine-v2',
        },
      ],
    }),
  };

  const mockNotifications = {
    createNotification: async () => {},
    notifyRole: async () => {},
  };

  return new InsuranceClaimService(mockClaimStore, mockOrdersStore, mockNotifications);
}

// 4. Claim quá 72 giờ → ConflictException; khách khác chủ → ForbiddenException; claim thứ hai khi claim đầu đang mở → ConflictException
test('4. Ràng buộc thời hạn 72h, quyền sở hữu và chống tạo claim trùng lặp', async () => {
  const customerUser = { id: 1, email: 'cus@test.com', role: UserRole.CUSTOMER };
  const otherCustomer = { id: 2, email: 'other@test.com', role: UserRole.CUSTOMER };

  // a. Khách khác chủ → ForbiddenException
  const srv1 = createMockClaimService();
  await assert.rejects(
    () =>
      srv1.createClaim(
        otherCustomer,
        10,
        101,
        { severity: 'M3', description: 'Ngựa bị thương tật nghiêm trọng sau chặng vận chuyển', requestedAmount: 1000000000 },
      ),
    (err) => err instanceof ForbiddenException,
  );

  // b. Quá thời hạn 72 giờ (ví dụ 80 giờ sau bàn giao) → ConflictException
  const srvOverdue = createMockClaimService({
    horseAndShipment: {
      handoverDatetime: new Date(Date.now() - 80 * 3600 * 1000),
    },
  });
  await assert.rejects(
    () =>
      srvOverdue.createClaim(
        customerUser,
        10,
        101,
        { severity: 'M3', description: 'Ngựa bị thương tật nghiêm trọng sau chặng vận chuyển', requestedAmount: 1000000000 },
      ),
    (err) => err instanceof ConflictException && err.message.includes('72 giờ'),
  );

  // c. Đang có claim mở (submitted/under_review) → ConflictException
  const srvActive = createMockClaimService({ hasActiveClaim: true });
  await assert.rejects(
    () =>
      srvActive.createClaim(
        customerUser,
        10,
        101,
        { severity: 'M3', description: 'Ngựa bị thương tật nghiêm trọng sau chặng vận chuyển', requestedAmount: 1000000000 },
      ),
    (err) => err instanceof ConflictException && err.message.includes('đang có yêu cầu'),
  );
});

// 5. Duyệt vượt trần → BadRequestException; duyệt khác gợi ý mà không có lý do → BadRequestException; từ chối thiếu mã lý do → BadRequestException
test('5. Thẩm định claim: kiểm soát trần, lý do khi khác gợi ý và mã từ chối', async () => {
  const managerUser = { id: 9, email: 'mgr@test.com', role: UserRole.LOGISTICS_MANAGER };
  const srv = createMockClaimService();

  // a. Duyệt vượt trần: Tiêu chuẩn M3 trần 1.000.000.000; quản lý duyệt 1.200.000.000 → BadRequestException
  await assert.rejects(
    () =>
      srv.reviewClaim(managerUser, 55, {
        decision: 'approve',
        approvedAmount: 1200000000,
        reason: 'Hỗ trợ thêm',
      }),
    (err) => err instanceof BadRequestException && err.message.includes('vượt trần'),
  );

  // b. Duyệt khác gợi ý (800 triệu thay vì 1 tỷ) nhưng không có lý do → BadRequestException
  await assert.rejects(
    () =>
      srv.reviewClaim(managerUser, 55, {
        decision: 'approve',
        approvedAmount: 800000000,
        reason: '',
      }),
    (err) => err instanceof BadRequestException && err.message.includes('Bắt buộc nhập lý do'),
  );

  // c. Từ chối thiếu mã lý do hợp lệ → BadRequestException
  await assert.rejects(
    () =>
      srv.reviewClaim(managerUser, 55, {
        decision: 'reject',
        rejectionReasonCode: 'invalid_code',
        reason: 'Không hợp lệ',
      }),
    (err) => err instanceof BadRequestException && err.message.includes('Mã lý do từ chối không hợp lệ'),
  );
});

// 6. Duyệt ≥ 20 triệu tạo refund record requires_dual_approval = true
test('6. Duyệt bồi thường ≥ 20 triệu kích hoạt cơ chế Dual-Approval', async () => {
  const managerUser = { id: 9, email: 'mgr@test.com', role: UserRole.LOGISTICS_MANAGER };
  let capturedDualApproval = null;

  const mockStore = {
    findClaimById: async (id) => ({
      id,
      shipmentId: 10,
      shipmentHorseId: 101,
      customerId: 1,
      severity: 'M3',
      description: 'Ngựa chấn thương gãy chân trong quá trình di chuyển',
      vetCostVnd: null,
      evidenceUrls: [],
      requestedAmount: 1000000000,
      suggestedAmount: 1000000000,
      approvedAmount: null,
      policyVersion: 'equine-v2',
      packageCode: 'standard',
      declaredValueVnd: 2000000000,
      status: 'under_review',
    }),
    findRulesByVersion: async () => DEFAULT_PAYOUT_RULES_V2,
    findClaimEvents: async () => [],
    reviewClaim: async (claimId, reviewerId, decision, approvedAmount) => {
      capturedDualApproval = approvedAmount >= 20000000;
      return {
        claim: { id: claimId, status: 'approved', approvedAmount },
        refundRecordId: 105,
      };
    },
  };

  const srv = new InsuranceClaimService(mockStore, {}, { createNotification: async () => {} });

  const res = await srv.reviewClaim(managerUser, 55, {
    decision: 'approve',
    approvedAmount: 1000000000,
    reason: 'Hợp lệ theo kết luận thú y',
  });

  assert.equal(res.claim.status, 'approved');
  assert.equal(capturedDualApproval, true);
});

// 7. Chuyển trạng thái sai (vd đã duyệt rồi mà cố từ chối) → ConflictException
test('7. Chuyển trạng thái claim sai thứ tự ném ConflictException', async () => {
  const { InsuranceClaimStore } = require('../dist/modules/orders/insurance-claim.store');

  // Test state machine logic in store
  const mockDb = {
    execute: async (sql) => {
      if (sql.includes('FOR UPDATE')) {
        return [[{ claim_id: 55, status: 'approved' }]]; // Already approved
      }
      return [[]];
    },
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const mockPool = {
    getConnection: async () => mockDb,
    execute: async () => [[]],
  };

  const store = new InsuranceClaimStore(mockPool);

  await assert.rejects(
    () => store.reviewClaim(55, 9, 'reject', undefined, 'other', 'Muốn từ chối sau khi duyệt'),
    (err) => err instanceof ConflictException,
  );
});

// 8. Đơn cũ snapshot equine-v1 không bị tính lại phí theo v2
test('8. Snapshot equine-v1 không áp mức tối thiểu của v2', () => {
  // Với gói standard và giá trị 50 triệu:
  // - Ở v2: 1.5% là 750.000 VNĐ nhưng bị nâng lên mức tối thiểu 1.000.000 VNĐ
  // - Ở v1: tính đúng 750.000 VNĐ, không có minimum fee
  const v1Result = calculateInsurance(
    { declaredValue: 50000000, insurancePackage: 'standard' },
    undefined,
    'equine-v1',
  );
  assert.equal(v1Result.insuranceFee, 750000);
  assert.equal(v1Result.insurancePolicyVersion, 'equine-v1');

  // Ngược lại nếu tính v2:
  const v2Result = calculateInsurance(
    { declaredValue: 50000000, insurancePackage: 'standard' },
  );
  assert.equal(v2Result.insuranceFee, 1000000);
  assert.equal(v2Result.insurancePolicyVersion, 'equine-v2');
});
