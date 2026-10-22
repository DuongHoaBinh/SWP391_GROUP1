import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import {
  AirlineEntity,
  AirportEntity,
  LegType,
  MasterStopEntity,
  PlanStatus,
  RouteEntity,
  RouteLegEntity,
  RouteStatus,
  RouteStopEntity,
  RouteStopStatus,
  RouteStopType,
  RouteStopUpdateEntity,
  RouteStopUpdateStatus,
} from './routes.types';
import { RouteStopItemDto } from './dto/create-route.dto';
import { RecordStopProgressDto } from './dto/record-stop-progress.dto';
import { SetStrategicFrameworkDto } from './dto/set-strategic-framework.dto';
import { BuildDetailedPlanDto, RouteLegDto } from './dto/build-detailed-plan.dto';

interface RouteRow extends RowDataPacket {
  route_id: number;
  shipment_id: number;
  route_name: string | null;
  total_distance_km: number | string | null;
  status: RouteStatus;
  plan_status: PlanStatus;
  assigned_coordinator_id: number | null;
  coordinator_name: string | null;
  manager_vehicle_type: string | null;
  manager_airline_id: number | null;
  airline_name: string | null;
  manager_departure_airport_id: number | null;
  departure_airport_code: string | null;
  manager_arrival_airport_id: number | null;
  arrival_airport_code: string | null;
  manager_main_corridor: string | null;
  strategic_notes: string | null;
  rejection_reason: string | null;
  approved_by: number | null;
  approver_name: string | null;
  approved_at: Date | null;
  created_at: Date;
}

interface RouteLegRow extends RowDataPacket {
  leg_id: number;
  route_id: number;
  sequence_no: number;
  leg_type: LegType;
  origin_location: string;
  destination_location: string;
  distance_km: number | string | null;
  duration_hours: number | string | null;
  planned_departure: Date | null;
  planned_arrival: Date | null;
  vehicle_id: number | null;
  vehicle_plate: string | null;
  airline_id: number | null;
  airline_name: string | null;
  flight_number: string | null;
  departure_airport_id: number | null;
  departure_airport_code: string | null;
  arrival_airport_id: number | null;
  arrival_airport_code: string | null;
  booking_reference: string | null;
  stalls_booked: number;
  status: 'pending' | 'active' | 'completed';
  created_at: Date;
}

interface RouteStopRow extends RowDataPacket {
  route_stop_id: number;
  route_id: number;
  leg_id: number | null;
  sequence_no: number;
  stop_type: RouteStopType;
  location_name: string;
  country: string | null;
  planned_arrival: Date | null;
  planned_departure: Date | null;
  status: RouteStopStatus;
}

interface RouteStopUpdateRow extends RowDataPacket {
  update_id: number;
  route_stop_id: number;
  updated_by: number;
  actual_arrival: Date | null;
  actual_departure: Date | null;
  status: RouteStopUpdateStatus;
  notes: string | null;
  created_at: Date;
}

interface AirlineRow extends RowDataPacket {
  airline_id: number;
  code: string;
  name: string;
  cargo_service_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_active: boolean | number;
}

interface AirportRow extends RowDataPacket {
  airport_id: number;
  iata_code: string;
  icao_code: string | null;
  name: string;
  city: string;
  country: string;
  has_quarantine_facility: boolean | number;
  has_equine_cargo_ramp: boolean | number;
  lat: number | string | null;
  lng: number | string | null;
}

interface MasterStopRow extends RowDataPacket {
  stop_id: number;
  name: string;
  stop_type: RouteStopType;
  address: string | null;
  city: string | null;
  country: string;
  has_veterinarian: boolean | number;
  has_stalls: boolean | number;
  lat: number | string | null;
  lng: number | string | null;
}

@Injectable()
export class RoutesStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit(): Promise<void> {
    this.pool = createPool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'horse_transport_system',
      user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      connectionLimit: 10,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  // --- Master Data Queries ---
  async findAllAirlines(): Promise<AirlineEntity[]> {
    const [rows] = await this.pool.execute<AirlineRow[]>(
      'SELECT * FROM airline WHERE is_active = TRUE ORDER BY name ASC',
    );
    return rows.map((r) => ({
      id: r.airline_id,
      code: r.code,
      name: r.name,
      cargoServiceName: r.cargo_service_name,
      contactPhone: r.contact_phone,
      contactEmail: r.contact_email,
      isActive: Boolean(r.is_active),
    }));
  }

  async findAllAirports(): Promise<AirportEntity[]> {
    const [rows] = await this.pool.execute<AirportRow[]>(
      'SELECT * FROM airport ORDER BY country ASC, city ASC',
    );
    return rows.map((r) => ({
      id: r.airport_id,
      iataCode: r.iata_code,
      icaoCode: r.icao_code,
      name: r.name,
      city: r.city,
      country: r.country,
      hasQuarantineFacility: Boolean(r.has_quarantine_facility),
      hasEquineCargoRamp: Boolean(r.has_equine_cargo_ramp),
      lat: r.lat !== null ? Number(r.lat) : null,
      lng: r.lng !== null ? Number(r.lng) : null,
    }));
  }

  async findAllMasterStops(): Promise<MasterStopEntity[]> {
    const [rows] = await this.pool.execute<MasterStopRow[]>(
      'SELECT * FROM master_stop ORDER BY country ASC, name ASC',
    );
    return rows.map((r) => ({
      id: r.stop_id,
      name: r.name,
      stopType: r.stop_type,
      address: r.address,
      city: r.city,
      country: r.country,
      hasVeterinarian: Boolean(r.has_veterinarian),
      hasStalls: Boolean(r.has_stalls),
      lat: r.lat !== null ? Number(r.lat) : null,
      lng: r.lng !== null ? Number(r.lng) : null,
    }));
  }

  // --- Route & Legs Queries ---
  private getRouteSelectQuery(): string {
    return `
      SELECT r.*,
             u_coord.full_name AS coordinator_name,
             u_appr.full_name AS approver_name,
             al.name AS airline_name,
             ap_dep.iata_code AS departure_airport_code,
             ap_arr.iata_code AS arrival_airport_code
      FROM route r
      LEFT JOIN \`user\` u_coord ON r.assigned_coordinator_id = u_coord.user_id
      LEFT JOIN \`user\` u_appr ON r.approved_by = u_appr.user_id
      LEFT JOIN airline al ON r.manager_airline_id = al.airline_id
      LEFT JOIN airport ap_dep ON r.manager_departure_airport_id = ap_dep.airport_id
      LEFT JOIN airport ap_arr ON r.manager_arrival_airport_id = ap_arr.airport_id
    `;
  }

  async findActiveIncident(shipmentId: number): Promise<{
    id: number;
    incidentType: string;
    description: string;
    severity: string;
    status: string;
    reportedAt: string;
  } | null> {
    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT incident_id, incident_type, description, severity, status, reported_at
         FROM incident_report
         WHERE shipment_id = ? AND status IN ('open', 'in_review')
         ORDER BY incident_id DESC LIMIT 1`,
        [shipmentId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.incident_id,
        incidentType: r.incident_type,
        description: r.description,
        severity: r.severity,
        status: r.status,
        reportedAt: new Date(r.reported_at).toISOString(),
      };
    } catch {
      return null;
    }
  }

  async reportIncident(data: {
    shipmentId: number;
    reportedBy: number;
    incidentType: string;
    description: string;
    severity?: string;
  }): Promise<number> {
    const [res] = await this.pool.execute(
      `INSERT INTO incident_report (shipment_id, reported_by, incident_type, description, severity, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [
        data.shipmentId,
        data.reportedBy,
        data.incidentType,
        data.description,
        data.severity || 'high',
      ],
    );
    return (res as any).insertId;
  }

  async resolveIncident(incidentId: number): Promise<void> {
    await this.pool.execute(
      `UPDATE incident_report
       SET status = 'resolved', resolved_at = NOW()
       WHERE incident_id = ?`,
      [incidentId],
    );
  }

  async findRouteByShipmentId(shipmentId: number): Promise<RouteEntity | undefined> {
    const sql = `${this.getRouteSelectQuery()} WHERE r.shipment_id = ? ORDER BY r.route_id DESC LIMIT 1`;
    const [rows] = await this.pool.execute<RouteRow[]>(sql, [shipmentId]);
    const r = rows[0];
    if (!r) return undefined;

    const [stops, legs, activeIncident] = await Promise.all([
      this.findStopsByRouteId(r.route_id),
      this.findLegsByRouteId(r.route_id),
      this.findActiveIncident(shipmentId),
    ]);

    return {
      ...this.mapRouteRow(r),
      stops,
      legs,
      activeIncident,
    };
  }

  async findRouteById(routeId: number): Promise<RouteEntity | undefined> {
    const sql = `${this.getRouteSelectQuery()} WHERE r.route_id = ? LIMIT 1`;
    const [rows] = await this.pool.execute<RouteRow[]>(sql, [routeId]);
    const r = rows[0];
    if (!r) return undefined;

    const [stops, legs, activeIncident] = await Promise.all([
      this.findStopsByRouteId(r.route_id),
      this.findLegsByRouteId(r.route_id),
      this.findActiveIncident(r.shipment_id),
    ]);

    return {
      ...this.mapRouteRow(r),
      stops,
      legs,
      activeIncident,
    };
  }

  async findLegsByRouteId(routeId: number): Promise<RouteLegEntity[]> {
    const [rows] = await this.pool.execute<RouteLegRow[]>(
      `SELECT rl.*, v.plate_or_code AS vehicle_plate
       FROM route_leg rl
       LEFT JOIN vehicle v ON rl.vehicle_id = v.vehicle_id
       WHERE rl.route_id = ?
       ORDER BY rl.sequence_no ASC`,
      [routeId],
    );

    return rows.map((r) => ({
      id: r.leg_id,
      routeId: r.route_id,
      sequenceNo: Number(r.sequence_no),
      legType: r.leg_type,
      originLocation: r.origin_location,
      destinationLocation: r.destination_location,
      distanceKm: r.distance_km !== null ? Number(r.distance_km) : null,
      durationHours: r.duration_hours !== null ? Number(r.duration_hours) : null,
      plannedDeparture: r.planned_departure ? new Date(r.planned_departure).toISOString() : null,
      plannedArrival: r.planned_arrival ? new Date(r.planned_arrival).toISOString() : null,
      vehicleId: r.vehicle_id,
      vehiclePlate: r.vehicle_plate,
      airlineId: r.airline_id,
      airlineName: r.airline_name,
      flightNumber: r.flight_number,
      departureAirportId: r.departure_airport_id,
      departureAirportCode: r.departure_airport_code,
      arrivalAirportId: r.arrival_airport_id,
      arrivalAirportCode: r.arrival_airport_code,
      bookingReference: r.booking_reference,
      stallsBooked: Number(r.stalls_booked || 0),
      status: r.status,
    }));
  }

  async replaceRouteLegs(routeId: number, legs: RouteLegDto[]): Promise<void> {
    await this.pool.execute('DELETE FROM route_leg WHERE route_id = ?', [routeId]);

    for (const leg of legs) {
      let vehicleId = leg.vehicleId ?? null;
      if (!vehicleId && leg.vehiclePlate) {
        try {
          const [vRows] = await this.pool.execute<any[]>(
            'SELECT vehicle_id FROM vehicle WHERE plate_or_code = ? LIMIT 1',
            [leg.vehiclePlate],
          );
          if (vRows.length > 0) {
            vehicleId = vRows[0].vehicle_id;
          }
        } catch {
          // ignore lookup error
        }
      }

      await this.pool.execute(
        `INSERT INTO route_leg (
          route_id, sequence_no, leg_type, origin_location, destination_location,
          distance_km, duration_hours, planned_departure, planned_arrival,
          vehicle_id, airline_id, airline_name, flight_number,
          departure_airport_id, departure_airport_code, arrival_airport_id, arrival_airport_code,
          booking_reference, stalls_booked, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          routeId,
          leg.sequenceNo,
          leg.legType,
          leg.originLocation,
          leg.destinationLocation,
          leg.distanceKm ?? null,
          leg.durationHours ?? null,
          leg.plannedDeparture ? new Date(leg.plannedDeparture) : null,
          leg.plannedArrival ? new Date(leg.plannedArrival) : null,
          vehicleId,
          leg.airlineId ?? null,
          leg.airlineName ?? null,
          leg.flightNumber ?? null,
          leg.departureAirportId ?? null,
          leg.departureAirportCode ?? null,
          leg.arrivalAirportId ?? null,
          leg.arrivalAirportCode ?? null,
          leg.bookingReference ?? null,
          leg.stallsBooked ?? 0,
        ],
      );
    }
  }

  // --- Step 1a: Manager Sets Strategic Framework ---
  async saveStrategicFramework(shipmentId: number, dto: SetStrategicFrameworkDto): Promise<number> {
    const existing = await this.findRouteByShipmentId(shipmentId);
    if (existing) {
      await this.pool.execute(
        `UPDATE route
         SET assigned_coordinator_id = ?,
             manager_vehicle_type = ?,
             manager_airline_id = ?,
             manager_departure_airport_id = ?,
             manager_arrival_airport_id = ?,
             manager_main_corridor = ?,
             strategic_notes = ?,
             plan_status = 'draft'
         WHERE route_id = ?`,
        [
          dto.assignedCoordinatorId ?? null,
          dto.managerVehicleType,
          dto.managerAirlineId ?? null,
          dto.managerDepartureAirportId ?? null,
          dto.managerArrivalAirportId ?? null,
          dto.managerMainCorridor ?? null,
          dto.strategicNotes ?? null,
          existing.id,
        ],
      );
      return existing.id;
    }

    const [result] = await this.pool.execute(
      `INSERT INTO route (
        shipment_id, route_name, status, plan_status,
        assigned_coordinator_id, manager_vehicle_type, manager_airline_id,
        manager_departure_airport_id, manager_arrival_airport_id, manager_main_corridor,
        strategic_notes
      ) VALUES (?, ?, 'planned', 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      [
        shipmentId,
        `Tuyến đường chuyến #${shipmentId}`,
        dto.assignedCoordinatorId ?? null,
        dto.managerVehicleType,
        dto.managerAirlineId ?? null,
        dto.managerDepartureAirportId ?? null,
        dto.managerArrivalAirportId ?? null,
        dto.managerMainCorridor ?? null,
        dto.strategicNotes ?? null,
      ],
    );

    return (result as { insertId: number }).insertId;
  }

  // --- Step 1b: Coordinator Builds Detailed Plan ---
  async saveDetailedPlan(routeId: number, dto: BuildDetailedPlanDto): Promise<void> {
    await this.pool.execute(
      `UPDATE route
       SET route_name = ?,
           total_distance_km = ?
       WHERE route_id = ?`,
      [dto.routeName, dto.totalDistanceKm ?? null, routeId],
    );

    await this.replaceRouteLegs(routeId, dto.legs);
    await this.replaceRouteStops(routeId, dto.stops);
  }

  async updatePlanStatus(
    routeId: number,
    status: PlanStatus,
    rejectionReason?: string,
    approvedBy?: number,
  ): Promise<void> {
    await this.pool.execute(
      `UPDATE route
       SET plan_status = ?,
           rejection_reason = ?,
           approved_by = COALESCE(?, approved_by),
           approved_at = CASE WHEN ? = 'approved' THEN NOW() ELSE approved_at END
       WHERE route_id = ?`,
      [status, rejectionReason ?? null, approvedBy ?? null, status, routeId],
    );
  }

  async createRoute(
    shipmentId: number,
    routeName?: string,
    totalDistanceKm?: number,
  ): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO route (shipment_id, route_name, total_distance_km, status, plan_status) VALUES (?, ?, ?, ?, ?)',
      [shipmentId, routeName ?? null, totalDistanceKm ?? null, RouteStatus.PLANNED, PlanStatus.DRAFT],
    );
    return (result as { insertId: number }).insertId;
  }

  async updateRouteDetails(
    routeId: number,
    routeName?: string,
    totalDistanceKm?: number,
  ): Promise<void> {
    await this.pool.execute(
      'UPDATE route SET route_name = COALESCE(?, route_name), total_distance_km = COALESCE(?, total_distance_km) WHERE route_id = ?',
      [routeName ?? null, totalDistanceKm ?? null, routeId],
    );
  }

  async updateRouteStatus(routeId: number, status: RouteStatus): Promise<void> {
    await this.pool.execute('UPDATE route SET status = ? WHERE route_id = ?', [status, routeId]);
  }

  async findStopsByRouteId(routeId: number): Promise<RouteStopEntity[]> {
    const [rows] = await this.pool.execute<RouteStopRow[]>(
      'SELECT route_stop_id, route_id, leg_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status FROM route_stop WHERE route_id = ? ORDER BY sequence_no ASC',
      [routeId],
    );
    return rows.map((r) => this.mapRouteStopRow(r));
  }

  async findStopById(stopId: number): Promise<RouteStopEntity | undefined> {
    const [rows] = await this.pool.execute<RouteStopRow[]>(
      'SELECT route_stop_id, route_id, leg_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status FROM route_stop WHERE route_stop_id = ? LIMIT 1',
      [stopId],
    );
    const r = rows[0];
    return r ? this.mapRouteStopRow(r) : undefined;
  }

  async replaceRouteStops(routeId: number, stops: RouteStopItemDto[]): Promise<void> {
    await this.pool.execute('DELETE FROM route_stop WHERE route_id = ?', [routeId]);

    for (const s of stops) {
      await this.pool.execute(
        `INSERT INTO route_stop (route_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          routeId,
          s.sequenceNo,
          s.stopType,
          s.locationName,
          s.country ?? null,
          s.plannedArrival ? new Date(s.plannedArrival) : null,
          s.plannedDeparture ? new Date(s.plannedDeparture) : null,
          RouteStopStatus.PENDING,
        ],
      );
    }
  }

  async updateStopSchedule(
    stopId: number,
    plannedArrival?: string,
    plannedDeparture?: string,
  ): Promise<void> {
    await this.pool.execute(
      `UPDATE route_stop
       SET planned_arrival = COALESCE(?, planned_arrival),
           planned_departure = COALESCE(?, planned_departure)
       WHERE route_stop_id = ?`,
      [
        plannedArrival ? new Date(plannedArrival) : null,
        plannedDeparture ? new Date(plannedDeparture) : null,
        stopId,
      ],
    );
  }

  async updateStopStatus(stopId: number, status: RouteStopStatus): Promise<void> {
    await this.pool.execute('UPDATE route_stop SET status = ? WHERE route_stop_id = ?', [
      status,
      stopId,
    ]);
  }

  async createStopUpdate(
    stopId: number,
    updatedBy: number,
    dto: RecordStopProgressDto,
  ): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO route_stop_update (route_stop_id, updated_by, actual_arrival, actual_departure, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        stopId,
        updatedBy,
        dto.actualArrival ? new Date(dto.actualArrival) : null,
        dto.actualDeparture ? new Date(dto.actualDeparture) : null,
        dto.status,
        dto.notes ?? null,
      ],
    );

    let stopStatus = RouteStopStatus.PENDING;
    if (dto.status === RouteStopUpdateStatus.ARRIVED) {
      stopStatus = RouteStopStatus.ARRIVED;
    } else if (dto.status === RouteStopUpdateStatus.CUSTOMS_CLEARED) {
      stopStatus = RouteStopStatus.CLEARED;
    } else if (dto.status === RouteStopUpdateStatus.DEPARTED) {
      stopStatus = RouteStopStatus.DEPARTED;
    } else if (dto.status === RouteStopUpdateStatus.DELIVERED) {
      stopStatus = RouteStopStatus.CLEARED;
    }
    await this.updateStopStatus(stopId, stopStatus);

    return (result as { insertId: number }).insertId;
  }

  async findStopUpdates(stopId: number): Promise<RouteStopUpdateEntity[]> {
    const [rows] = await this.pool.execute<RouteStopUpdateRow[]>(
      `SELECT update_id, route_stop_id, updated_by, actual_arrival, actual_departure, status, notes, created_at
       FROM route_stop_update
       WHERE route_stop_id = ?
       ORDER BY update_id DESC`,
      [stopId],
    );

    return rows.map((r) => ({
      id: r.update_id,
      routeStopId: r.route_stop_id,
      updatedBy: r.updated_by,
      actualArrival: r.actual_arrival ? new Date(r.actual_arrival).toISOString() : null,
      actualDeparture: r.actual_departure ? new Date(r.actual_departure).toISOString() : null,
      status: r.status,
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  // --- Step 3: Driver / Staff Confirmation ---
  async confirmStaffAssignment(
    shipmentId: number,
    userId: number,
    notes?: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment_assignment
       SET is_confirmed = TRUE,
           confirmed_at = NOW(),
           confirmation_notes = COALESCE(?, confirmation_notes)
       WHERE shipment_id = ? AND user_id = ?`,
      [notes ?? null, shipmentId, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async declineStaffAssignment(
    shipmentId: number,
    userId: number,
    reason: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment_assignment
       SET is_confirmed = FALSE,
           confirmed_at = NOW(),
           confirmation_notes = ?
       WHERE shipment_id = ? AND user_id = ?`,
      [`TỪ CHỐI: ${reason}`, shipmentId, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async checkAllDriversConfirmed(shipmentId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_drivers,
              SUM(CASE WHEN is_confirmed = TRUE THEN 1 ELSE 0 END) AS confirmed_drivers
       FROM shipment_assignment
       WHERE shipment_id = ? AND role_in_shipment IN ('driver', 'escort')`,
      [shipmentId],
    );
    const r = rows[0] as { total_drivers: number; confirmed_drivers: number };
    const total = Number(r.total_drivers || 0);
    const confirmed = Number(r.confirmed_drivers || 0);
    return total > 0 && total === confirmed;
  }

  private mapRouteRow(r: RouteRow): RouteEntity {
    return {
      id: r.route_id,
      shipmentId: r.shipment_id,
      routeName: r.route_name,
      totalDistanceKm: r.total_distance_km !== null ? Number(r.total_distance_km) : null,
      status: r.status,
      planStatus: (r.plan_status as PlanStatus) || PlanStatus.DRAFT,
      assignedCoordinatorId: r.assigned_coordinator_id,
      assignedCoordinatorName: r.coordinator_name,
      managerVehicleType: r.manager_vehicle_type,
      managerAirlineId: r.manager_airline_id,
      managerAirlineName: r.airline_name,
      managerDepartureAirportId: r.manager_departure_airport_id,
      managerDepartureAirportCode: r.departure_airport_code,
      managerArrivalAirportId: r.manager_arrival_airport_id,
      managerArrivalAirportCode: r.arrival_airport_code,
      managerMainCorridor: r.manager_main_corridor,
      strategicNotes: r.strategic_notes,
      rejectionReason: r.rejection_reason,
      approvedBy: r.approved_by,
      approvedByName: r.approver_name,
      approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  private mapRouteStopRow(r: RouteStopRow): RouteStopEntity {
    return {
      id: r.route_stop_id,
      routeId: r.route_id,
      legId: r.leg_id,
      sequenceNo: Number(r.sequence_no),
      stopType: r.stop_type,
      locationName: r.location_name,
      country: r.country,
      plannedArrival: r.planned_arrival ? new Date(r.planned_arrival).toISOString() : null,
      plannedDeparture: r.planned_departure ? new Date(r.planned_departure).toISOString() : null,
      status: r.status,
    };
  }
}
