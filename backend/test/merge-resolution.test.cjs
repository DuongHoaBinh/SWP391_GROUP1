const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { SepayPaymentStore } = require('../dist/modules/orders/sepay-payment.store');
const { UserRole } = require('../dist/modules/auth/auth.types');

for (const [expiryDate, compliant] of [['2099-01-09', false], ['2099-01-10', true]]) {
  test(`merged compliance keeps trip expiry validation for ${expiryDate}`, async () => {
    const service = new DocumentsService({
      findOrderDetails: async () => ({ customer_id: 7, destination_location: 'Vietnam', requested_date: '2099-01-01', expected_arrival_date: '2099-01-10' }),
      findRegulations: async () => [{ id: 1, documentType: 'health_certificate' }],
      findHorsesInOrder: async () => [{ horse_id: 4, name: 'Test horse' }],
      findDocumentsByHorseId: async () => [{ regulationId: 1, status: 'approved', expiryDate }],
      hasRequirementsSent: async () => true,
    }, {}, {});
    const checklist = await service.getOrderComplianceChecklist({ id: '7', role: UserRole.CUSTOMER }, 42);
    assert.equal(checklist.tripTargetDate, '2099-01-10');
    assert.equal(checklist.isFullyCompliant, compliant);
    assert.equal(checklist.approvedDocumentsCount, compliant ? 1 : 0);
  });
}

for (const allConfirmed of [false, true]) {
  test(`driver confirmation uses atomic invoice workflow; all confirmed = ${allConfirmed}`, async () => {
    const calls = [];
    const service = new RoutesService({
      confirmAndInvoice: async (...args) => { calls.push(['confirmAndInvoice', ...args]); return allConfirmed; },
    }, { findById: async () => ({ id: 42 }) }, {}, {}, {}, {});
    service.evaluateReadyToDepartGate = async shipmentId => { calls.push(['readiness', shipmentId]); };
    const result = await service.confirmTripAssignment({ id: '7', role: UserRole.DRIVER_ESCORT }, 42, { confirmationNotes: 'Accepted' });
    assert.equal(result.isFullyConfirmed, allConfirmed);
    assert.deepEqual(calls, [['confirmAndInvoice', 42, 7, 'Accepted'], ...(allConfirmed ? [['readiness', 42]] : [])]);
  });
}

function paymentFixture(confirmed) {
  const writes = [];
  const payment = { payment_id: 9, shipment_id: 42, customer_id: 7, amount: 10000000, status: 'pending' };
  const db = {
    beginTransaction: async () => {}, commit: async () => writes.push('commit'),
    rollback: async () => writes.push('rollback'), release() {},
    execute: async sql => {
      if (sql.startsWith('SELECT customer_id, status, total_cost')) return [[{ customer_id: 7, status: 'planning', total_cost: 10000000 }]];
      if (sql.startsWith('SELECT * FROM shipment_sepay_payment WHERE shipment_id')) return [[]];
      if (sql.startsWith('SELECT s.customer_id')) return [[{ customer_id: 7, status: 'planning', total_cost: 10000000,
        route_id: 3, plan_status: confirmed ? 'confirmed' : 'approved', staff_count: 2, unconfirmed_count: confirmed ? 0 : 1,
        invoice_id: confirmed ? 5 : null, invoice_amount: confirmed ? 10000000 : null,
        issued_at: '2099-01-01T00:00:00Z', snapshot: '{}' }]];
      if (sql.startsWith('INSERT INTO shipment_sepay_payment')) { writes.push('payment'); return [{ insertId: 9 }]; }
      if (sql.startsWith('SELECT * FROM shipment_sepay_payment WHERE payment_id')) return [[payment]];
      throw new Error('Unexpected query in payment fixture');
    },
  };
  const store = new SepayPaymentStore();
  store.pool = { getConnection: async () => db };
  return { store, writes };
}

test('planning order cannot reserve a QR before all route staff confirm and an invoice exists', async () => {
  const { store, writes } = paymentFixture(false);
  await assert.rejects(store.reserve(42, 7, {}), error => error.getStatus() === 400 && /lịch trình được xác nhận/.test(error.message));
  assert.deepEqual(writes, ['rollback']);
});

test('confirmed route and matching invoice unlock a legacy planning order', async () => {
  const { store, writes } = paymentFixture(true);
  const payment = await store.reserve(42, 7, { prefix: 'DH', suffixLength: 8, bankCode: 'TEST', accountNumber: '0000000000', accountName: 'Test fixture' });
  assert.equal(payment.amount, 10000000);
  assert.deepEqual(writes, ['payment', 'commit']);
});
