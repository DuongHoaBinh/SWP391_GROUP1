const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const {
  HorseGender,
  HorseStatus,
  parseAndNormalizeHorseWeight,
} = require('../dist/modules/horses/horses.types');
const { HorsesService } = require('../dist/modules/horses/horses.service');
const { HorsesStore } = require('../dist/modules/horses/horses.store');

test('parseAndNormalizeHorseWeight: accepts valid 150-1200 kg inputs and normalizes to "<num> kg"', () => {
  assert.equal(parseAndNormalizeHorseWeight('480'), '480 kg');
  assert.equal(parseAndNormalizeHorseWeight('480 kg'), '480 kg');
  assert.equal(parseAndNormalizeHorseWeight(' 480KG '), '480 kg');
  assert.equal(parseAndNormalizeHorseWeight('480.5 kg'), '480.5 kg');
  assert.equal(parseAndNormalizeHorseWeight('150'), '150 kg');
  assert.equal(parseAndNormalizeHorseWeight('1200 kg'), '1200 kg');
  assert.equal(parseAndNormalizeHorseWeight(520), '520 kg');
});

test('parseAndNormalizeHorseWeight: rejects 0, negative, text-mixed, and out-of-range values', () => {
  assert.equal(parseAndNormalizeHorseWeight('0'), null);
  assert.equal(parseAndNormalizeHorseWeight('0 kg'), null);
  assert.equal(parseAndNormalizeHorseWeight('-480'), null);
  assert.equal(parseAndNormalizeHorseWeight('480 abc'), null);
  assert.equal(parseAndNormalizeHorseWeight('abc'), null);
  assert.equal(parseAndNormalizeHorseWeight(''), null);
  assert.equal(parseAndNormalizeHorseWeight('   '), null);
  assert.equal(parseAndNormalizeHorseWeight('149'), null);
  assert.equal(parseAndNormalizeHorseWeight('1201 kg'), null);
  assert.equal(parseAndNormalizeHorseWeight('480 kg extra'), null);
});

test('HorsesService: rejects gelding/other gender, invalid weight, and out-of-range age', async () => {
  const createdPayloads = [];
  const updatedPayloads = [];
  const mockStore = {
    findByOwnerId: async () => [],
    findByMicrochipNo: async () => undefined,
    findByPassportNo: async () => undefined,
    findById: async (id) => ({
      id,
      ownerId: 10,
      name: 'Lightning',
      breed: 'Thoroughbred',
      gender: HorseGender.MALE,
      age: 5,
      microchipNo: '985141001248999',
      passportNo: 'FEI-VN-2026-999',
      color: 'Bay',
      weight: '480 kg',
      medicalStatus: null,
      specialRequirements: null,
      status: HorseStatus.ACTIVE,
      quantity: 1,
      photoUrl: null,
      createdAt: new Date().toISOString(),
    }),
    create: async (_ownerId, dto) => {
      createdPayloads.push({ ...dto });
      return 101;
    },
    update: async (_horseId, dto) => {
      updatedPayloads.push({ ...dto });
      return true;
    },
  };

  const service = new HorsesService(mockStore);
  const customer = { id: 10, role: 'customer', email: 'c@example.com' };

  const baseDto = {
    name: 'Lightning',
    breed: 'Thoroughbred',
    gender: HorseGender.MALE,
    age: 5,
    weight: '480',
    passportNo: 'FEI-VN-2026-999',
    microchipNo: '985141001248999',
  };

  // Gelding rejected
  await assert.rejects(
    () => service.createHorse(customer, { ...baseDto, gender: 'gelding' }),
    (err) => err instanceof BadRequestException && err.message.includes('male'),
  );

  // Invalid weights rejected
  for (const badWeight of ['0', '480 abc', '50 kg', '1500 kg', '']) {
    await assert.rejects(
      () => service.createHorse(customer, { ...baseDto, weight: badWeight }),
      (err) => err instanceof BadRequestException && err.message.includes('150'),
    );
  }

  // Invalid age rejected
  await assert.rejects(
    () => service.createHorse(customer, { ...baseDto, age: 0 }),
    (err) => err instanceof BadRequestException && err.message.includes('1 đến 35'),
  );

  // Valid create normalizes weight to "480 kg"
  const created = await service.createHorse(customer, { ...baseDto });
  assert.equal(created.id, 101);
  assert.equal(createdPayloads[0].weight, '480 kg');

  // Update rejects bad weight and accepts valid normalized weight
  await assert.rejects(
    () => service.updateHorse(customer, 101, { weight: '480 abc' }),
    (err) => err instanceof BadRequestException && err.message.includes('150'),
  );
  await service.updateHorse(customer, 101, { weight: '510.5', gender: HorseGender.FEMALE });
  assert.equal(updatedPayloads[0].weight, '510.5 kg');
  assert.equal(updatedPayloads[0].gender, HorseGender.FEMALE);
});

test('HorsesStore.mapHorseRow: normalizes legacy gelding to male and omits temperament', () => {
  const store = new HorsesStore();
  const mapped = store.mapHorseRow({
    horse_id: 7,
    owner_id: 2,
    name: 'Legacy Horse',
    breed: 'Arabian',
    gender: 'gelding',
    age: 6,
    microchip_no: '985141000000007',
    passport_no: 'FEI-VN-007',
    color: 'Bay',
    weight: '470 kg',
    medical_status: 'Healthy',
    special_requirements: null,
    photo_url: null,
    status: HorseStatus.ACTIVE,
    quantity: 1,
    created_at: new Date('2026-01-01T00:00:00Z'),
  });

  assert.equal(mapped.gender, HorseGender.MALE);
  assert.equal('temperament' in mapped, false);
});
