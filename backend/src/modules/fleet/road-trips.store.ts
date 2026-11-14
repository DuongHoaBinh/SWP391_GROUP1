import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { CreateRoadTripDto } from './dto/create-road-trip.dto';
import { RouteLegDto } from '../routes/dto/build-detailed-plan.dto';
import { assertRoadCapacity } from './capacity-policy';

@Injectable()
export class RoadTripsStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  onModuleInit() {
    this.pool = createPool({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'horse_transport_system', user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '', connectionLimit: 5 });
  }
  async onModuleDestroy() { await this.pool?.end(); }

  async list() {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT t.*, v.plate_or_code, v.capacity,
      COALESCE(SUM(CASE WHEN s.status NOT IN ('cancelled','rejected') THEN l.stalls_booked ELSE 0 END), 0) AS booked_stalls
      FROM road_trip t JOIN vehicle v ON v.vehicle_id = t.vehicle_id
      LEFT JOIN route_leg l ON l.road_trip_id = t.road_trip_id
      LEFT JOIN route r ON r.route_id = l.route_id LEFT JOIN shipment s ON s.shipment_id = r.shipment_id
      GROUP BY t.road_trip_id, v.vehicle_id ORDER BY t.planned_departure, t.road_trip_id`);
    return rows.map(t => ({ id: Number(t.road_trip_id), vehicleId: Number(t.vehicle_id), vehiclePlate: t.plate_or_code,
      capacity: Number(t.capacity), bookedStalls: Number(t.booked_stalls), bookingType: t.booking_type,
      originLocation: t.origin_location, destinationLocation: t.destination_location,
      plannedDeparture: new Date(t.planned_departure).toISOString(), plannedArrival: new Date(t.planned_arrival).toISOString() }));
  }

  async create(dto: CreateRoadTripDto, actorId: number) {
    if (!dto.originLocation.trim() || !dto.destinationLocation.trim() || !Number.isFinite(new Date(dto.plannedDeparture).getTime()) ||
      !Number.isFinite(new Date(dto.plannedArrival).getTime()) || new Date(dto.plannedArrival) <= new Date(dto.plannedDeparture)) {
      throw new BadRequestException('Cần tuyến và khoảng thời gian chuyến đường bộ hợp lệ');
    }
    const [vehicles] = await this.pool.execute<RowDataPacket[]>('SELECT * FROM vehicle WHERE vehicle_id = ?', [dto.vehicleId]);
    if (!vehicles[0] || vehicles[0].vehicle_type === 'aircraft_stall' || vehicles[0].status === 'maintenance') {
      throw new BadRequestException('Cần phương tiện đường bộ hoạt động');
    }
    const [result] = await this.pool.execute<any>(`INSERT INTO road_trip
      (vehicle_id, booking_type, origin_location, destination_location, planned_departure, planned_arrival, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [dto.vehicleId, dto.bookingType, dto.originLocation.trim(), dto.destinationLocation.trim(),
      new Date(dto.plannedDeparture), new Date(dto.plannedArrival), actorId]);
    return { id: Number(result.insertId) };
  }

  // Call inside the plan transaction, after locking shipment/route and before replacing legs.
  // Every reservation locks vehicle rows in ID order; the vehicle lock serializes capacity decisions.
  async prepareLegs(db: PoolConnection, order: RowDataPacket, legs: RouteLegDto[], actorId: number, oldVehicleIds: number[] = []) {
    const prepared = legs.map(l => ({ ...l }));
    for (const leg of prepared) {
      if (leg.roadTripId && leg.legType !== 'road') throw new BadRequestException('Chuyến ghép đường bộ không áp dụng cho chặng bay');
      if (!leg.roadTripId) continue;
      const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM road_trip WHERE road_trip_id = ? FOR SHARE', [leg.roadTripId]);
      const trip = rows[0];
      if (!trip) throw new NotFoundException('Không tìm thấy chuyến đường bộ');
      if (trip.booking_type !== order.booking_type) throw new BadRequestException('Hình thức chuyến không khớp lựa chọn của khách');
      Object.assign(leg, { vehicleId: Number(trip.vehicle_id), originLocation: trip.origin_location, destinationLocation: trip.destination_location,
        plannedDeparture: new Date(trip.planned_departure).toISOString(), plannedArrival: new Date(trip.planned_arrival).toISOString() });
    }
    const roadLegs = prepared.filter(l => l.legType === 'road');
    for (let i = 0; i < roadLegs.length; i++) for (let j = i + 1; j < roadLegs.length; j++) {
      const a = roadLegs[i], b = roadLegs[j];
      if (a.vehicleId && a.vehicleId === b.vehicleId && a.plannedDeparture && a.plannedArrival && b.plannedDeparture && b.plannedArrival &&
        new Date(a.plannedDeparture) < new Date(b.plannedArrival) && new Date(a.plannedArrival) > new Date(b.plannedDeparture)) {
        throw new BadRequestException('Các chặng của cùng xe không được trùng thời gian');
      }
    }
    const ids = [...new Set([...oldVehicleIds, ...roadLegs.filter(l => l.vehicleId).map(l => l.vehicleId!)])].sort((a, b) => a - b);
    if (!ids.length) return prepared;
    const [vehicles] = await db.execute<RowDataPacket[]>(`SELECT * FROM vehicle WHERE vehicle_id IN (${ids.map(() => '?').join(',')}) ORDER BY vehicle_id FOR UPDATE`, ids);
    assertRoadCapacity(Number(order.requested_horse_count), roadLegs.filter(l => l.vehicleId).map(l => l.vehicleId!), vehicles.map(v => ({ id: Number(v.vehicle_id), capacity: Number(v.capacity) })));
    const usedTrips = new Set<number>();
    for (const leg of roadLegs) {
      if (!leg.vehicleId) continue; // Draft legs may remain incomplete; confirmation rejects incomplete legs.
      const vehicle = vehicles.find(v => Number(v.vehicle_id) === leg.vehicleId)!;
      if (vehicle.vehicle_type === 'aircraft_stall' || vehicle.status === 'maintenance') throw new BadRequestException('Phương tiện đường bộ không hoạt động');
      if (!leg.plannedDeparture || !leg.plannedArrival) throw new BadRequestException('Cần giờ đi/đến để giữ chỗ xe');
      const start = new Date(leg.plannedDeparture), end = new Date(leg.plannedArrival);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new BadRequestException('Khoảng thời gian giữ chỗ xe không hợp lệ');
      if (leg.roadTripId && usedTrips.has(leg.roadTripId)) throw new BadRequestException('Một đơn chỉ được có một phân bổ trên cùng chuyến đường bộ');
      const [conflicts] = await db.execute<RowDataPacket[]>(`SELECT l.road_trip_id, l.stalls_booked, s.booking_type, s.requested_horse_count
        FROM route_leg l JOIN route r ON r.route_id = l.route_id JOIN shipment s ON s.shipment_id = r.shipment_id
        WHERE l.vehicle_id = ? AND s.shipment_id <> ? AND s.status NOT IN ('completed','cancelled','rejected')
        AND (
          (l.planned_departure IS NOT NULL AND l.planned_arrival IS NOT NULL AND l.planned_departure < ? AND l.planned_arrival > ?)
          OR
          (l.planned_departure IS NULL AND s.requested_date IS NOT NULL AND s.requested_date >= DATE_SUB(?, INTERVAL 2 DAY) AND s.requested_date <= DATE_ADD(?, INTERVAL 2 DAY))
        )`,
        [leg.vehicleId, order.shipment_id, end, start, start, end]);
      const [unscheduled] = await db.execute<RowDataPacket[]>(`SELECT sv.shipment_id FROM shipment_vehicle sv JOIN shipment s ON s.shipment_id = sv.shipment_id
        WHERE sv.vehicle_id = ? AND s.shipment_id <> ? AND s.status NOT IN ('completed','cancelled','rejected')
        AND NOT EXISTS (SELECT 1 FROM route_leg l JOIN route r ON r.route_id = l.route_id WHERE r.shipment_id = s.shipment_id AND l.vehicle_id = sv.vehicle_id)`, [leg.vehicleId, order.shipment_id]);
      if (unscheduled.length) throw new BadRequestException('Xe đã phân công cho đơn khác chưa có lịch; cần điều phối lại trước khi giữ chỗ');
      if (conflicts.some(c => !leg.roadTripId || Number(c.road_trip_id) !== leg.roadTripId ||
        c.booking_type === 'dedicated_charter' || order.booking_type === 'dedicated_charter')) {
        throw new BadRequestException('Xe đã có chuyến khác trùng thời gian hoặc đang được bao riêng');
      }
      const booked = conflicts.reduce((n, c) => n + Number(c.stalls_booked || c.requested_horse_count), 0);
      if (booked + Number(order.requested_horse_count) > Number(vehicle.capacity)) throw new BadRequestException('Chuyến đường bộ không còn đủ ô chuồng');
      if (!leg.roadTripId) {
        const [created] = await db.execute<any>(`INSERT INTO road_trip (vehicle_id, booking_type, origin_location, destination_location, planned_departure, planned_arrival, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [leg.vehicleId, order.booking_type, leg.originLocation, leg.destinationLocation, start, end, actorId]);
        leg.roadTripId = Number(created.insertId);
      }
      usedTrips.add(leg.roadTripId);
      leg.stallsBooked = Number(order.requested_horse_count);
    }
    return prepared;
  }
}
