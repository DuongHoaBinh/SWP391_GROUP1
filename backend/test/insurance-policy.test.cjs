const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateInsurance, totalInsuranceFee, insurancePolicy } = require('../dist/modules/orders/insurance-policy');

test('basic is free with the transport cap; standard and premium use declared value', () => {
  assert.deepEqual([calculateInsurance({}).insuranceFee, calculateInsurance({}).maxCompensation], [0, 50000000]);
  const standard = calculateInsurance({ declaredValue: 100000000, insurancePackage: 'standard' });
  assert.equal(standard.insuranceFee, 1500000); assert.equal(standard.maxCompensation, 80000000); assert.equal(standard.emergencyVetCovered, false);
  const premium = calculateInsurance({ declaredValue: 100000000, insurancePackage: 'premium' });
  assert.equal(premium.insuranceFee, 3000000); assert.equal(premium.maxCompensation, 100000000); assert.equal(premium.emergencyVetCovered, true);
});

test('fees round once per horse to whole VND and multiply by quantity', () => {
  assert.equal(calculateInsurance({ declaredValue: 100, insurancePackage: 'standard' }).insuranceFee, 2);
  assert.equal(calculateInsurance({ declaredValue: 33.33, insurancePackage: 'standard' }).insuranceFee, 0);
  assert.equal(totalInsuranceFee([{ insuranceFee: 1500000, quantity: 2 }, { insuranceFee: 3000000, quantity: 1 }]), 6000000);
});

test('invalid values, unknown packages, missing paid valuations and overflowing totals are rejected', () => {
  for (const declaredValue of [-1, NaN, Infinity, 1.001, 10000000000000]) assert.throws(() => calculateInsurance({ declaredValue }));
  assert.throws(() => calculateInsurance({ declaredValue: 0, insurancePackage: 'premium' }));
  assert.throws(() => calculateInsurance({ declaredValue: 1, insurancePackage: 'fake' }));
  assert.throws(() => totalInsuranceFee([{ insuranceFee: 300000000000, quantity: 100 }]));
  assert.throws(() => totalInsuranceFee([{ insuranceFee: 1, quantity: 0 }]));
});

test('USD requires a server rate and a persisted rate keeps historical valuations unchanged', () => {
  const previous = process.env.INSURANCE_USD_TO_VND;
  try {
    delete process.env.INSURANCE_USD_TO_VND;
    assert.equal(insurancePolicy().usdToVnd, null);
    assert.throws(() => calculateInsurance({ declaredValue: 10000, declaredCurrency: 'USD', insurancePackage: 'standard' }));
    process.env.INSURANCE_USD_TO_VND = '25000';
    const a = calculateInsurance({ declaredValue: 10000, declaredCurrency: 'USD', insurancePackage: 'standard' });
    assert.equal(a.declaredValueVnd, 250000000); assert.equal(a.insuranceFee, 3750000);
    process.env.INSURANCE_USD_TO_VND = '30000';
    assert.equal(calculateInsurance({ declaredValue: 10000, declaredCurrency: 'USD', insurancePackage: 'standard' }, a.exchangeRate).insuranceFee, a.insuranceFee);
    process.env.INSURANCE_USD_TO_VND = 'invalid'; assert.throws(insurancePolicy);
  } finally { if (previous === undefined) delete process.env.INSURANCE_USD_TO_VND; else process.env.INSURANCE_USD_TO_VND = previous; }
});
