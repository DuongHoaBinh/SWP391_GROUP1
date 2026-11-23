const test = require('node:test');
const assert = require('node:assert/strict');

const { TrackingService } = require('../dist/modules/tracking/tracking.service');

function createMockStore(custom = {}) {
  return {
    findShipmentById: async (id) => ({
      shipment_id: id,
      customer_id: 101,
      request_code: 'TR-2026-TL01',
      customer_request_code: 'CUST-TL01',
      status: 'in_transit',
      trip_type: 'round_trip',
      origin_location: 'Hà Nội',
      destination_location: 'Đà Nẵng',
      created_at: new Date('2026-11-20T08:00:00Z'),
      paid_at: new Date('2026-11-20T09:00:00Z'),
      approved_at: new Date('2026-11-21T10:00:00Z'),
      ...custom.shipment,
    }),
    findRouteByShipmentId: async () => ({
      route_id: 50,
      total_distance_km: 750,
    }),
    findLegsByRouteId: async () => [
      {
        leg_id: 1,
        sequence_no: 1,
        direction: 'outbound',
        origin_location: 'Hà Nội',
        destination_location: 'Vinh',
        status: 'completed',
        planned_departure: '2026-11-23T08:00:00Z',
        actual_departure: '2026-11-23T08:15:00Z', // 15 mins late
        planned_arrival: '2026-11-23T14:00:00Z',
        actual_arrival: '2026-11-23T14:10:00Z', // 10 mins late
      },
      {
        leg_id: 2,
        sequence_no: 2,
        direction: 'return',
        origin_location: 'Đà Nẵng',
        destination_location: 'Hà Nội',
        status: 'pending',
        planned_departure: '2026-11-26T08:00:00Z',
        planned_arrival: '2026-11-26T20:00:00Z',
      },
    ],
    findStopsByRouteId: async () => [
      {
        route_stop_id: 101,
        sequence_no: 1,
        direction: 'outbound',
        stop_type: 'rest',
        location_name: 'Trạm dừng Ninh Bình',
        city: 'Ninh Bình',
        status: 'departed',
        planned_arrival: '2026-11-23T10:00:00Z',
        actual_arrival: '2026-11-23T10:05:00Z',
      },
      {
        route_stop_id: 102,
        sequence_no: 2,
        direction: 'outbound',
        stop_type: 'transfer_hub',
        location_name: 'Trạm trung chuyển Nghệ An',
        status: 'departed',
      },
    ],
    findAssignedStaff: async () => [
      { user_id: 201, full_name: 'Tài xế Nguyễn Văn A', role_in_shipment: 'driver' },
      { user_id: 202, full_name: 'Bác sĩ Thú y Trần B', role_in_shipment: 'escort' },
    ],
    findTripStatusLogs: async () => [
      {
        id: 1,
        milestoneType: 'leg_departure',
        legId: 1,
        createdAt: '2026-11-23T08:15:00Z',
        source: 'gps',
        updatedByName: 'Tài xế Nguyễn Văn A',
      },
    ],
    findHorseHealthLogs: async () => [
      {
        id: 1,
        route_stop_id: 101,
        horse_name: 'Bạch Long Mã',
        temperature_c: 38.2,
        heart_rate_bpm: 36,
        condition_status: 'stable',
        alert_tier: 'green',
      },
    ],
    getSetting: async (key) => {
      if (key === 'tracking.customer_vitals_detail') return true;
      return null;
    },
    ...custom.store,
  };
}

test('Step 11 Timeline: Customer isolation blocks other customers with 403', async () => {
  const store = createMockStore();
  const service = new TrackingService(store, {}, {});
  const foreignCustomer = { id: 999, role: 'CUSTOMER' };

  await assert.rejects(
    async () => service.getShipmentTimeline(foreignCustomer, 1),
    /không có quyền xem/i,
  );
});

test('Step 11 Timeline: Pre-trip, Outbound, Return, Post-trip groups and delay minutes correctly calculated', async () => {
  const store = createMockStore();
  const service = new TrackingService(store, {}, {});
  const manager = { id: 1, role: 'LOGISTICS_MANAGER' };

  const timeline = await service.getShipmentTimeline(manager, 1);
  assert.equal(timeline.shipmentId, 1);
  assert.equal(timeline.tripType, 'round_trip');
  assert.ok(timeline.items.length >= 6);

  // Pre-trip items
  const preItems = timeline.items.filter((it) => it.group === 'pre_trip');
  assert.equal(preItems.length, 4);
  assert.equal(preItems[0].kind, 'payment');
  assert.equal(preItems[0].status, 'done');

  // Outbound items
  const outboundItems = timeline.items.filter((it) => it.group === 'outbound');
  assert.ok(outboundItems.length >= 3);
  const pickup = outboundItems[0];
  assert.equal(pickup.kind, 'pickup');
  assert.equal(pickup.delayMinutes, 15); // 08:15 vs 08:00

  // Return items
  const returnItems = timeline.items.filter((it) => it.group === 'return');
  assert.ok(returnItems.length >= 1);
  assert.equal(returnItems[0].kind, 'return_start');

  // Post-trip items
  const postItems = timeline.items.filter((it) => it.group === 'post_trip');
  assert.ok(postItems.length >= 1);
});

test('Step 11 Timeline: Customer redaction conceals internal staff names and transfer_hub stops', async () => {
  const store = createMockStore();
  const service = new TrackingService(store, {}, {});
  const customer = { id: 101, role: 'CUSTOMER' };

  const timeline = await service.getShipmentTimeline(customer, 1);

  // Customer should use customer_request_code
  assert.equal(timeline.requestCode, 'CUST-TL01');

  // All actorLabels must be undefined for customer
  for (const item of timeline.items) {
    assert.equal(item.actorLabel, undefined);
  }

  // Transfer hub must be omitted for customer
  const transferItem = timeline.items.find((it) => it.kind === 'transfer');
  assert.equal(transferItem, undefined);
});

test('Step 11 Timeline: Handover, No-show and Refund failure states accurately displayed in post_trip', async () => {
  // Test No-Show
  const noShowStore = createMockStore({
    shipment: { return_no_show: true, status: 'no_show', return_cancelled_at: '2026-11-26T12:00:00Z' },
  });
  const noShowService = new TrackingService(noShowStore, {}, {});
  const noShowTimeline = await noShowService.getShipmentTimeline({ id: 1, role: 'ADMIN' }, 1);
  const noShowPost = noShowTimeline.items.find((it) => it.group === 'post_trip' && it.kind === 'no_show');
  assert.ok(noShowPost);
  assert.equal(noShowPost.status, 'failed');

  // Test Refunded
  const refundStore = createMockStore({
    shipment: { status: 'refunded', refunded_at: '2026-11-26T14:00:00Z' },
  });
  const refundService = new TrackingService(refundStore, {}, {});
  const refundTimeline = await refundService.getShipmentTimeline({ id: 1, role: 'ADMIN' }, 1);
  const refundPost = refundTimeline.items.find((it) => it.group === 'post_trip' && it.kind === 'refund');
  assert.ok(refundPost);
  assert.equal(refundPost.status, 'failed');
});
