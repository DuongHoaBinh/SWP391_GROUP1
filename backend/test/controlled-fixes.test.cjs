const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OrdersStore } = require('../dist/modules/orders/orders.store');
const { OrdersService } = require('../dist/modules/orders/orders.service');
const { MomoPaymentStore } = require('../dist/modules/orders/momo-payment.store');
const { MomoPaymentService } = require('../dist/modules/orders/momo-payment.service');
const { RoutesService } = require('../dist/modules/routes/routes.service');
const { FleetService } = require('../dist/modules/fleet/fleet.service');
const { UserRole } = require('../dist/modules/auth/auth.types');
const { calculateBookingQuote } = require('../dist/modules/orders/booking-policy');
const { calculateInsurance } = require('../dist/modules/orders/insurance-policy');

const previous = { horse_id: 1, quantity: 3, declared_value: '10000', declared_currency: 'USD', exchange_rate: '25000',
  declared_value_vnd: '250000000', insurance_package: 'premium', insurance_fee: '7500000', max_compensation: '250000000',
  emergency_vet_covered: 1, insurance_policy_version: 'equine-v1' };
const horseDb = { execute: async () => [[{ horse_id: 1, name: 'Horse', status: 'in_transit', quantity: 5 }]] };

test('partial policy changes preserve omitted package, currency and quantity', async () => {
  const before = process.env.INSURANCE_USD_TO_VND;
  try {
    process.env.INSURANCE_USD_TO_VND = '25000';
    const [row] = await new OrdersStore().insuredHorses(horseDb, 2, [{ horseId: 1, name: 'Horse', declaredValue: 20000 }], [previous]);
    assert.equal(row.insurancePackage, 'premium'); assert.equal(row.declaredCurrency, 'USD');
    assert.equal(row.quantity, 3); assert.equal(row.insuranceFee, 15000000);
  } finally { if (before === undefined) delete process.env.INSURANCE_USD_TO_VND; else process.env.INSURANCE_USD_TO_VND = before; }
});

test('identity-only horse updates retain quantity and saved rate without requiring current USD config', async () => {
  const [row] = await new OrdersStore().insuredHorses(horseDb, 2, [{ horseId: 1, name: 'Horse' }], [previous]);
  assert.equal(row.quantity, 3); assert.equal(row.exchangeRate, 25000); assert.equal(row.insuranceFee, 7500000);
});

test('completion rejects orders which have not started', async () => {
  let changed = false;
  const service = new OrdersService({ findShipmentById: async () => ({ id: 7, status: 'requested' }),
    completeShipment: async () => { changed = true; } }, { createNotification: async () => {} });
  await assert.rejects(service.completeOrder({ id: 88, role: UserRole.DRIVER_ESCORT }, 7));
  assert.equal(changed, false);
});

test('completion store rejects an unassigned driver before mutating shipment/horses', async () => {
  const writes = [];
  const db = { execute: async sql => {
    if (sql.includes('FROM shipment_assignment')) return [[]];
    if (sql.includes('FROM shipment WHERE')) return [[{ status: 'in_transit' }]];
    writes.push(sql); return [{ affectedRows: 1 }];
  } };
  const store = new OrdersStore(); store.transaction = action => action(db); store.pool = db;
  await assert.rejects(store.completeShipment(7, 88, true)); assert.equal(writes.length, 0);
});

test('approval keeps international scope when selecting air mode', async () => {
  let update, values;
  const store = new OrdersStore(); store.transaction = action => action({ execute: async (sql, args) => {
    if (sql.startsWith('SELECT')) return [[{ insurance_fee: 1500000, booking_type: 'shared_stall', requested_horse_count: 1 }]];
    if (sql.startsWith('UPDATE shipment')) { update = sql; values = args; }
    return [{ affectedRows: 1 }];
  } });
  await store.updateShipmentApproval(7, 9, 'approved', null, 10000000, 'air', { transportCost: 10000000 });
  assert.ok(!update.includes('transportation_type ='));
  assert.match(update, /transport_mode = \?/); assert.equal(values[6], 'air');
});

test('omitted quote is rejected instead of silently approving free freight', () => {
  assert.throws(() => calculateBookingQuote('shared_stall', 2, {}));
  for (const value of [undefined, null, '', 0, -1, NaN, Infinity]) {
    assert.throws(() => calculateBookingQuote('dedicated_charter', 3, { transportCost: value }));
    assert.throws(() => calculateBookingQuote('dedicated_charter', 3, { totalCost: value }));
    assert.throws(() => calculateBookingQuote('shared_stall', 2, { bookingType: 'shared_stall', quotedHorseCount: 2, stallUnitPrice: value }));
  }
  assert.equal(calculateBookingQuote('dedicated_charter', 3, { transportCost: 10000000 }).transportCost, 10000000);
});

test('all six booking/insurance combinations persist freight plus insurance exactly once at approval', async () => {
  for (const booking of ['shared_stall', 'dedicated_charter']) for (const insurancePackage of ['basic', 'standard', 'premium']) {
    const count = booking === 'shared_stall' ? 2 : 3;
    const insuranceFee = calculateInsurance({ declaredValue: 100000000, insurancePackage }).insuranceFee * count;
    let written;
    const store = new OrdersStore(); store.transaction = action => action({ execute: async (sql, args) => {
      if (sql.startsWith('SELECT')) return [[{ insurance_fee: insuranceFee, booking_type: booking, requested_horse_count: count }]];
      if (sql.startsWith('UPDATE shipment')) written = args;
      return [{ affectedRows: 1 }];
    } });
    const quote = { bookingType: booking, quotedHorseCount: count, ...(booking === 'shared_stall' ? { stallUnitPrice: 2000000 } : { transportCost: 10000000 }) };
    await store.updateShipmentApproval(7, 9, 'approved', null, 0, 'road', quote);
    const freight = booking === 'shared_stall' ? 4000000 : 10000000;
    assert.equal(written[3], freight + insuranceFee); assert.equal(written[4], freight);
  }
});

test('detailed plan rejects each undersized road vehicle before saving anything', async () => {
  let saved = false;
  const service = new RoutesService({ findRouteByShipmentId: async () => ({ id: 3, planStatus: 'draft' }),
    saveDetailedPlan: async () => { saved = true; }, findRouteById: async () => ({ id: 3 }) },
  { findById: async () => ({ id: 7, requestedHorseCount: 5 }) },
  { findVehiclesByIds: async () => [{ id: 1, capacity: 1 }], assignVehicles: async () => {} }, {}, {}, {});
  await assert.rejects(service.buildDetailedPlan({}, 7, { routeName: 'Test', legs: [{ legType: 'road', vehicleId: 1 }], stops: [] }));
  assert.equal(saved, false);
});

test('sandbox success never updates operational route/shipment readiness', async () => {
  const writes = []; const payment = { payment_id: 1, shipment_id: 7, status: 'pending' };
  const store = new MomoPaymentStore(); store.transaction = action => action({ execute: async sql => {
    if (sql.includes('SELECT * FROM shipment_sandbox_payment')) return [[payment]];
    if (sql.includes('SELECT event_id')) return [[]];
    if (sql.includes('SELECT route_id')) return [[{ route_id: 3, plan_status: 'confirmed' }]];
    if (sql.includes('COUNT(*) as total')) return [[{ total: 1, approved: 1 }]];
    writes.push(sql); return [{ affectedRows: 1 }];
  } });
  await store.apply(1, { status: 'succeeded', source: 'test', eventKey: 'test', message: 'test' });
  assert.equal(writes.filter(sql => /UPDATE (shipment|route) SET/.test(sql)).length, 0);
});

test('sandbox confirm is rejected when disabled or production even for an existing pending payment', async () => {
  const oldEnv = process.env.NODE_ENV, oldFlag = process.env.MOMO_SANDBOX_ENABLED;
  try {
    process.env.NODE_ENV = 'production'; process.env.MOMO_SANDBOX_ENABLED = 'false';
    let applied = false;
    const service = new MomoPaymentService({ latest: async () => ({ payment_id: 1, status: 'pending', updated_at: new Date() }),
      apply: async () => { applied = true; return { updated_at: new Date() }; } });
    await assert.rejects(service.confirmAtmSandbox({ id: 2, role: UserRole.CUSTOMER }, 7, {}));
    assert.equal(applied, false);
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    if (oldFlag === undefined) delete process.env.MOMO_SANDBOX_ENABLED; else process.env.MOMO_SANDBOX_ENABLED = oldFlag;
  }
});

test('sandbox reservation uses exact VND amount even below 100000', async () => {
  let amount; const payment = { payment_id: 1 };
  const store = new MomoPaymentStore(); store.transaction = action => action({ execute: async (sql, args) => {
    if (sql.includes('SELECT customer_id, status')) return [[{ customer_id: 2, status: 'confirmed', total_cost: 50000 }]];
    if (sql.includes('LEFT JOIN shipment_invoice')) return [[{ status: 'confirmed', total_cost: 50000, route_id: 3, plan_status: 'confirmed',
      staff_count: 1, unconfirmed_count: 0, invoice_id: 1, invoice_amount: 50000, issued_at: new Date(), snapshot: {} }]];
    if (sql.includes('AND (request_type')) return [[]];
    if (sql.includes('INSERT INTO shipment_sandbox_payment (')) amount = args[6];
    if (sql.includes('SELECT * FROM shipment_sandbox_payment WHERE order_id')) return [[payment]];
    return [{ affectedRows: 1 }];
  } });
  await store.reserve(7, 2, 'test'); assert.equal(amount, 50000);
});

test('customer cannot read another owner route or full operational plan', async () => {
  const service = new RoutesService({ findRouteByShipmentId: async () => ({ id: 3, legs: [] }) },
    { findById: async () => ({ id: 7, customerId: 99, status: 'approved', requestedHorseCount: 2 }) },
    { findAssignedVehicles: async () => [], findAssignedStaff: async () => [] }, {}, {}, {});
  const customer = { id: '2', role: UserRole.CUSTOMER };
  for (const read of [() => service.getRouteByShipmentId(7, customer), () => service.getFullTripPlan(7, customer)]) {
    await assert.rejects(read, error => error.getStatus?.() === 403);
  }
  const fleet = new FleetService({}, { findById: async () => ({ customerId: 99 }) }, {});
  await assert.rejects(fleet.getShipmentAssignments(7, customer), error => error.getStatus?.() === 403);
});

test('a real vehicle plate from an existing template is resolved before capacity validation', async () => {
  let saved;
  const service = new RoutesService({ findRouteByShipmentId: async () => ({ id: 3, planStatus: 'draft' }),
    saveDetailedPlan: async (id, dto) => { saved = dto; }, findRouteById: async () => ({ id: 3 }) },
  { findById: async () => ({ id: 7, requestedHorseCount: 2 }) },
  { findAllVehicles: async () => [{ id: 77, plateOrCode: 'ACTUAL-77', capacity: 4 }], findVehiclesByIds: async () => [{ id: 77, capacity: 4 }] }, {}, {}, {});
  await service.buildDetailedPlan({ id: '9' }, 7, { routeName: 'Test', legs: [{ legType: 'road', vehiclePlate: 'ACTUAL-77' }], stops: [] });
  assert.equal(saved.legs[0].vehicleId, 77);
});

test('assigned driver completes an in-transit shipment; completed retry does not rewrite delivery', async () => {
  const writes = []; let status = 'in_transit';
  const store = new OrdersStore(); store.transaction = action => action({ execute: async sql => {
    if (sql.includes('FROM shipment WHERE')) return [[{ status }]];
    if (sql.includes('FROM shipment_assignment')) return [[{ assignment_id: 1 }]];
    if (sql.includes('FROM shipment_vehicle')) return [[]];
    writes.push(sql); if (sql.startsWith('UPDATE shipment')) status = 'completed';
    return [{ affectedRows: 1 }];
  } });
  assert.equal(await store.completeShipment(7, 88, true), true); const count = writes.length;
  assert.equal(await store.completeShipment(7, 88, true), false); assert.equal(writes.length, count);
});
