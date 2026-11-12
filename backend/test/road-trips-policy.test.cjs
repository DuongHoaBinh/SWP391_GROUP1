const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RoadTripsStore } = require('../dist/modules/fleet/road-trips.store');
const order = { shipment_id: 7, requested_horse_count: 2, booking_type: 'shared_stall' };
const leg = { sequenceNo: 1, legType: 'road', roadTripId: 11, originLocation: 'Old', destinationLocation: 'Old' };
function database(conflicts = [], capacity = 4, type = 'shared_stall') {
  return { execute: async sql => {
    if (sql.includes('SELECT * FROM road_trip')) return [[{ road_trip_id: 11, vehicle_id: 1, booking_type: type,
      origin_location: 'A', destination_location: 'B', planned_departure: new Date('2099-01-01T08:00:00Z'), planned_arrival: new Date('2099-01-01T12:00:00Z') }]];
    if (sql.includes('SELECT * FROM vehicle')) return [[{ vehicle_id: 1, vehicle_type: 'truck', capacity, status: 'available' }]];
    if (sql.includes('SELECT l.road_trip_id')) return [conflicts];
    if (sql.includes('SELECT sv.shipment_id')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  } };
}
test('shared reservations use canonical trip fields and server-owned stall count', async () => {
  const [row] = await new RoadTripsStore().prepareLegs(database([{ road_trip_id: 11, stalls_booked: 2, booking_type: 'shared_stall' }]), order, [{ ...leg, stallsBooked: 999 }], 9);
  assert.equal(row.stallsBooked, 2); assert.equal(row.vehicleId, 1); assert.equal(row.originLocation, 'A');
  assert.equal(row.plannedDeparture, '2099-01-01T08:00:00.000Z');
});
test('shared reservations reject exhausted capacity, not just individual order size', async () => {
  await assert.rejects(new RoadTripsStore().prepareLegs(database([{ road_trip_id: 11, stalls_booked: 3, booking_type: 'shared_stall' }]), order, [leg], 9), /không còn đủ/);
});
test('overlapping reservations on a different trip cannot use the same vehicle', async () => {
  await assert.rejects(new RoadTripsStore().prepareLegs(database([{ road_trip_id: 12, stalls_booked: 1, booking_type: 'shared_stall' }]), order, [leg], 9), /trùng thời gian/);
});
test('dedicated reservation rejects any other active occupant despite spare physical stalls', async () => {
  await assert.rejects(new RoadTripsStore().prepareLegs(database([{ road_trip_id: 11, stalls_booked: 1, booking_type: 'dedicated_charter' }], 10, 'dedicated_charter'),
    { ...order, booking_type: 'dedicated_charter' }, [leg], 9), /bao riêng/);
});
test('selected trip booking must match customer choice and is never accepted for an air leg', async () => {
  await assert.rejects(new RoadTripsStore().prepareLegs(database([], 4, 'dedicated_charter'), order, [leg], 9), /không khớp/);
  await assert.rejects(new RoadTripsStore().prepareLegs(database(), order, [{ ...leg, legType: 'flight' }], 9), /không áp dụng/);
});
test('road capacity is enforced for every selected leg and no guessed schedule reserves a vehicle', async () => {
  await assert.rejects(new RoadTripsStore().prepareLegs(database([], 1), order, [leg], 9), /đủ ô/);
  await assert.rejects(new RoadTripsStore().prepareLegs(database(), order, [{ ...leg, roadTripId: undefined, vehicleId: 1 }], 9), /giờ đi/);
});
