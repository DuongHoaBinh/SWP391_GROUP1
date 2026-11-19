const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyTemperature,
  classifyHeartRate,
  evaluateEquineHealthAlert,
  DEFAULT_EQUINE_VITAL_CONFIG,
} = require('../dist/modules/tracking/vitals-policy');
const { TrackingService } = require('../dist/modules/tracking/tracking.service');
const { UserRole } = require('../dist/modules/auth/auth.types');

const cfg = DEFAULT_EQUINE_VITAL_CONFIG;

/**
 * Node native `node:test` wrapper exposing Jest/Vitest-style `test.each(cases)(name, fn)`.
 */
test.each = (cases) => (name, fn) => {
  for (const row of cases) {
    const label = Array.isArray(row) ? `${name} [${row.map((v) => String(v)).join(', ')}]` : name;
    test(label, () => (Array.isArray(row) ? fn(...row) : fn(row)));
  }
};

function toAlertLevel(alertTier) {
  if (alertTier === 'green') return 'green';
  if (alertTier === 'red') return 'red';
  if (alertTier === 'amber_escalatable' || alertTier === 'amber_observational') return 'amber';
  throw new Error(`Unexpected alertTier: ${alertTier}`);
}

function createInMemoryTrackingHarness() {
  const healthLogs = [];
  const notifications = [];
  let seqId = 1;

  const mockStore = {
    findShipmentById: async (shipmentId) => ({
      shipment_id: shipmentId,
      customer_id: 90,
      status: 'in_transit',
      request_code: `REQ-${shipmentId}`,
      origin_location: 'TP.HCM, Vietnam',
      destination_location: 'Singapore',
    }),
    findAssignedStaff: async () => [{ user_id: 15, role_in_shipment: 'escort' }],
    findRouteByShipmentId: async () => null,
    findActiveVitalConfig: async () => ({ ...cfg }),
    findLatestHealthLogForHorse: async (shipmentId, horseId, horseName) => {
      const matches = healthLogs.filter((l) => {
        if (l.shipmentId !== shipmentId) return false;
        if (horseId !== null && horseId !== undefined) return Number(l.horseId) === Number(horseId);
        return String(l.horseName || '').toLowerCase() === String(horseName || '').toLowerCase();
      });
      const latest = matches[matches.length - 1];
      return latest
        ? { id: latest.id, alertTier: latest.alertTier, recordedAt: latest.recordedAt }
        : null;
    },
    createHorseHealthLog: async (entry) => {
      const id = seqId++;
      healthLogs.push({
        id,
        shipmentId: entry.shipmentId,
        horseId: entry.horseId ?? null,
        horseName: entry.horseName,
        legName: entry.legName ?? null,
        recordedBy: entry.recordedBy,
        recordedByRole: entry.recordedByRole,
        conditionStatus: entry.conditionStatus,
        temperatureC: entry.temperatureC ?? null,
        heartRateBpm: entry.heartRateBpm ?? null,
        alertTier: entry.alertTier,
        alertReason: entry.alertReason,
        notes: entry.notes ?? null,
        attachments: [],
        recordedAt: entry.recordedAt instanceof Date ? entry.recordedAt.toISOString() : String(entry.recordedAt),
      });
      return id;
    },
    findHorseHealthLogs: async (shipmentId) => healthLogs.filter((l) => l.shipmentId === shipmentId),
  };

  const mockNotifications = {
    createNotification: async (...args) => notifications.push({ kind: 'user', args }),
    notifyRole: async (...args) => notifications.push({ kind: 'role', args }),
  };

  const service = new TrackingService(mockStore, mockNotifications, {}, null);
  const escortUser = {
    id: '15',
    role: UserRole.DRIVER_ESCORT,
    email: 'escort@test.local',
    specialization: 'escort',
  };

  return { service, escortUser, healthLogs, notifications };
}

describe('BR-F4-03: Equine Vital Signs Classification (Pure Functions)', () => {
  describe('Temperature boundary partition (t °C)', () => {
    test.each([
      [36.99, 'red'],
      [37.0, 'amber'],
      [37.49, 'amber'],
      [37.5, 'green'],
      [38.5, 'green'],
      [38.51, 'amber'],
      [38.55, 'amber'],
      [39.29, 'amber'],
      [39.3, 'red'],
      [39.31, 'red'],
    ])('classifyTemperature & evaluateEquineHealthAlert at exact temperature boundary', (tempC, expectedBand) => {
      assert.equal(classifyTemperature(tempC, cfg), expectedBand);

      const evaluated = evaluateEquineHealthAlert(
        {
          conditionStatus: 'stable',
          temperatureC: tempC,
          heartRateBpm: 36,
          recordedAt: '2026-11-19T10:00:00.000Z',
        },
        null,
        cfg,
      );
      assert.equal(toAlertLevel(evaluated.alertTier), expectedBand);
      if (expectedBand === 'amber') {
        assert.equal(evaluated.alertTier, 'amber_escalatable');
      } else {
        assert.equal(evaluated.alertTier, expectedBand);
      }
    });
  });

  describe('Heart rate boundary partition (hr bpm)', () => {
    test.each([
      [23, 'red'],
      [24, 'amber'],
      [27, 'amber'],
      [28, 'green'],
      [44, 'green'],
      [45, 'amber'],
      [59, 'amber'],
      [60, 'red'],
    ])('classifyHeartRate & evaluateEquineHealthAlert at exact heart rate boundary', (hrBpm, expectedBand) => {
      assert.equal(classifyHeartRate(hrBpm, cfg), expectedBand);

      const evaluated = evaluateEquineHealthAlert(
        {
          conditionStatus: 'stable',
          temperatureC: 38.0,
          heartRateBpm: hrBpm,
          recordedAt: '2026-11-19T10:00:00.000Z',
        },
        null,
        cfg,
      );
      assert.equal(toAlertLevel(evaluated.alertTier), expectedBand);
      if (expectedBand === 'amber') {
        assert.equal(evaluated.alertTier, 'amber_escalatable');
      } else {
        assert.equal(evaluated.alertTier, expectedBand);
      }
    });
  });

  describe('Condition status classification', () => {
    test.each([
      ['stable', 38.0, 36, 'green', 'green'],
      ['stable', undefined, undefined, 'green', 'green'],
      ['stable', null, null, 'green', 'green'],
      ['not_eating', 38.0, 36, 'amber', 'amber_escalatable'],
      ['not_eating', undefined, undefined, 'amber', 'amber_escalatable'],
      ['stressed', 38.0, 36, 'amber', 'amber_escalatable'],
      ['stressed', undefined, undefined, 'amber', 'amber_escalatable'],
      ['climate_change', 38.0, 36, 'amber', 'amber_observational'],
      ['climate_change', undefined, undefined, 'amber', 'amber_observational'],
      ['other', 38.0, 36, 'amber', 'amber_observational'],
      ['other', undefined, undefined, 'amber', 'amber_observational'],
    ])(
      'condition_status maps to expected level and sub-tier',
      (conditionStatus, temperatureC, heartRateBpm, expectedLevel, expectedTier) => {
        const res = evaluateEquineHealthAlert(
          { conditionStatus, temperatureC, heartRateBpm, recordedAt: '2026-11-19T10:00:00.000Z' },
          null,
          cfg,
        );
        assert.equal(toAlertLevel(res.alertTier), expectedLevel);
        assert.equal(res.alertTier, expectedTier);
      },
    );
  });

  describe('Combined severity takes the MAX of (t, hr, condition_status)', () => {
    test.each([
      // [tempC, hrBpm, conditionStatus, expectedLevel, expectedTier]
      [36.99, 36, 'stable', 'red', 'red'],
      [39.3, 45, 'not_eating', 'red', 'red'],
      [38.0, 23, 'stable', 'red', 'red'],
      [37.49, 60, 'climate_change', 'red', 'red'],
      [39.31, 60, 'stressed', 'red', 'red'],
      [38.55, 36, 'stable', 'amber', 'amber_escalatable'],
      [38.0, 25, 'stable', 'amber', 'amber_escalatable'],
      [37.0, 44, 'climate_change', 'amber', 'amber_escalatable'],
      [37.5, 59, 'other', 'amber', 'amber_escalatable'],
      [38.0, 36, 'not_eating', 'amber', 'amber_escalatable'],
      [38.0, 36, 'stressed', 'amber', 'amber_escalatable'],
      [38.0, 36, 'climate_change', 'amber', 'amber_observational'],
      [38.0, 36, 'other', 'amber', 'amber_observational'],
      [37.5, 28, 'stable', 'green', 'green'],
      [38.5, 44, 'stable', 'green', 'green'],
    ])(
      'evaluateEquineHealthAlert returns highest severity among t, hr, and condition_status',
      (temperatureC, heartRateBpm, conditionStatus, expectedLevel, expectedTier) => {
        const res = evaluateEquineHealthAlert(
          { conditionStatus, temperatureC, heartRateBpm, recordedAt: '2026-11-19T10:00:00.000Z' },
          null,
          cfg,
        );
        assert.equal(toAlertLevel(res.alertTier), expectedLevel);
        assert.equal(res.alertTier, expectedTier);
      },
    );
  });

  describe('Partial vital inputs (missing temperatureC or heartRateBpm)', () => {
    test.each([
      [undefined, undefined, 'stable', 'green', 'green'],
      [null, null, 'stable', 'green', 'green'],
      [undefined, undefined, 'stressed', 'amber', 'amber_escalatable'],
      [null, null, 'climate_change', 'amber', 'amber_observational'],
      [38.0, undefined, 'stable', 'green', 'green'],
      [38.55, undefined, 'stable', 'amber', 'amber_escalatable'],
      [39.3, undefined, 'stable', 'red', 'red'],
      [undefined, 36, 'stable', 'green', 'green'],
      [undefined, 24, 'stable', 'amber', 'amber_escalatable'],
      [undefined, 23, 'stable', 'red', 'red'],
      [null, 59, 'other', 'amber', 'amber_escalatable'],
      [37.49, null, 'not_eating', 'amber', 'amber_escalatable'],
    ])(
      'evaluateEquineHealthAlert evaluates only provided measurements when temperatureC or heartRateBpm is omitted',
      (temperatureC, heartRateBpm, conditionStatus, expectedLevel, expectedTier) => {
        const res = evaluateEquineHealthAlert(
          { conditionStatus, temperatureC, heartRateBpm, recordedAt: '2026-11-19T10:00:00.000Z' },
          null,
          cfg,
        );
        assert.equal(toAlertLevel(res.alertTier), expectedLevel);
        assert.equal(res.alertTier, expectedTier);
      },
    );
  });
});

describe('AC-F4-03: Consecutive Amber Escalation & Per-Horse Isolation', () => {
  test('AC-F4-03 (pure): Log 1 (stable, 38.55, 25) -> amber, consecutive Log 2 (not_eating, 38.0, 40) -> red', () => {
    const t1 = '2026-11-19T12:00:00.000Z';
    const t2 = '2026-11-19T15:00:00.000Z';

    const log1 = evaluateEquineHealthAlert(
      { conditionStatus: 'stable', temperatureC: 38.55, heartRateBpm: 25, recordedAt: t1 },
      null,
      cfg,
    );
    assert.equal(toAlertLevel(log1.alertTier), 'amber');
    assert.equal(log1.alertTier, 'amber_escalatable');

    const log2 = evaluateEquineHealthAlert(
      { conditionStatus: 'not_eating', temperatureC: 38.0, heartRateBpm: 40, recordedAt: t2 },
      { alertTier: log1.alertTier, recordedAt: t1 },
      cfg,
    );
    assert.equal(toAlertLevel(log2.alertTier), 'red');
    assert.equal(log2.alertTier, 'red');
  });

  test('Green log between two Amber logs resets consecutiveness -> stays amber (no escalation)', () => {
    const t1 = '2026-11-19T08:00:00.000Z';
    const t2 = '2026-11-19T09:00:00.000Z';
    const t3 = '2026-11-19T10:00:00.000Z';

    const firstAmber = evaluateEquineHealthAlert(
      { conditionStatus: 'stable', temperatureC: 38.55, heartRateBpm: 25, recordedAt: t1 },
      null,
      cfg,
    );
    assert.equal(toAlertLevel(firstAmber.alertTier), 'amber');

    const interveningGreen = evaluateEquineHealthAlert(
      { conditionStatus: 'stable', temperatureC: 38.0, heartRateBpm: 36, recordedAt: t2 },
      { alertTier: firstAmber.alertTier, recordedAt: t1 },
      cfg,
    );
    assert.equal(interveningGreen.alertTier, 'green');

    const secondAmberAfterGreen = evaluateEquineHealthAlert(
      { conditionStatus: 'not_eating', temperatureC: 38.0, heartRateBpm: 40, recordedAt: t3 },
      { alertTier: interveningGreen.alertTier, recordedAt: t2 },
      cfg,
    );
    assert.equal(toAlertLevel(secondAmberAfterGreen.alertTier), 'amber');
    assert.equal(secondAmberAfterGreen.alertTier, 'amber_escalatable');
  });

  test('TrackingService.createHealthLog: two Amber logs on DIFFERENT horses do NOT escalate; same-horse consecutive Amber logs DO escalate', async () => {
    const { service, escortUser } = createInMemoryTrackingHarness();

    // Horse A Log 1: (stable, 38.55, 25) -> amber
    const hA1 = await service.createHealthLog(escortUser, 501, {
      horseId: 101,
      horseName: 'Thunderbolt',
      conditionStatus: 'stable',
      temperatureC: 38.55,
      heartRateBpm: 25,
      recordedAt: '2026-11-19T08:00:00.000Z',
    });
    assert.equal(toAlertLevel(hA1.alertTier), 'amber');
    assert.equal(hA1.alertTier, 'amber_escalatable');

    // Horse B Log 1 right after Horse A: (not_eating, 38.0, 40) -> stays amber (independent horse)
    const hB1 = await service.createHealthLog(escortUser, 501, {
      horseId: 102,
      horseName: 'Midnight',
      conditionStatus: 'not_eating',
      temperatureC: 38.0,
      heartRateBpm: 40,
      recordedAt: '2026-11-19T09:00:00.000Z',
    });
    assert.equal(toAlertLevel(hB1.alertTier), 'amber');
    assert.equal(hB1.alertTier, 'amber_escalatable');

    // Horse A Log 2 (consecutive for Horse A despite Horse B logging in between): -> red
    const hA2 = await service.createHealthLog(escortUser, 501, {
      horseId: 101,
      horseName: 'Thunderbolt',
      conditionStatus: 'not_eating',
      temperatureC: 38.0,
      heartRateBpm: 40,
      recordedAt: '2026-11-19T11:00:00.000Z',
    });
    assert.equal(toAlertLevel(hA2.alertTier), 'red');
    assert.equal(hA2.alertTier, 'red');
  });

  test('TrackingService.createHealthLog: intervening green log on same horse prevents Red escalation on next Amber log', async () => {
    const { service, escortUser } = createInMemoryTrackingHarness();

    const l1 = await service.createHealthLog(escortUser, 502, {
      horseId: 201,
      horseName: 'Starlight',
      conditionStatus: 'stable',
      temperatureC: 38.55,
      heartRateBpm: 25,
      recordedAt: '2026-11-19T08:00:00.000Z',
    });
    assert.equal(l1.alertTier, 'amber_escalatable');

    const l2 = await service.createHealthLog(escortUser, 502, {
      horseId: 201,
      horseName: 'Starlight',
      conditionStatus: 'stable',
      temperatureC: 38.0,
      heartRateBpm: 36,
      recordedAt: '2026-11-19T09:00:00.000Z',
    });
    assert.equal(l2.alertTier, 'green');

    const l3 = await service.createHealthLog(escortUser, 502, {
      horseId: 201,
      horseName: 'Starlight',
      conditionStatus: 'not_eating',
      temperatureC: 38.0,
      heartRateBpm: 40,
      recordedAt: '2026-11-19T10:00:00.000Z',
    });
    assert.equal(toAlertLevel(l3.alertTier), 'amber');
    assert.equal(l3.alertTier, 'amber_escalatable');
  });
});
