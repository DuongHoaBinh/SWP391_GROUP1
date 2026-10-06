import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import {
  RouteEntity,
  RouteStatus,
  RouteStopEntity,
  RouteStopStatus,
  RouteStopType,
  RouteStopUpdateEntity,
  RouteStopUpdateStatus,
} from './routes.types';
import { RouteStopItemDto } from './dto/create-route.dto';
import { RecordStopProgressDto } from './dto/record-stop-progress.dto';

interface RouteRow extends RowDataPacket {
  route_id: number;
  shipment_id: number;
  route_name: string | null;
  total_distance_km: number | string | null;
  status: RouteStatus;
  created_at: Date;
}

interface RouteStopRow extends RowDataPacket {
  route_stop_id: number;
  route_id: number;
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

  async findRouteByShipmentId(shipmentId: number): Promise<RouteEntity | undefined> {
    const [rows] = await this.pool.execute<RouteRow[]>(
      'SELECT route_id, shipment_id, route_name, total_distance_km, status, created_at FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1',
      [shipmentId],
    );
    const r = rows[0];
    if (!r) return undefined;

    const stops = await this.findStopsByRouteId(r.route_id);
    return {
      ...this.mapRouteRow(r),
      stops,
    };
  }

  async findRouteById(routeId: number): Promise<RouteEntity | undefined> {
    const [rows] = await this.pool.execute<RouteRow[]>(
      'SELECT route_id, shipment_id, route_name, total_distance_km, status, created_at FROM route WHERE route_id = ? LIMIT 1',
      [routeId],
    );
    const r = rows[0];
    if (!r) return undefined;

    const stops = await this.findStopsByRouteId(r.route_id);
    return {
      ...this.mapRouteRow(r),
      stops,
    };
  }

  async createRoute(
    shipmentId: number,
    routeName?: string,
    totalDistanceKm?: number,
  ): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO route (shipment_id, route_name, total_distance_km, status) VALUES (?, ?, ?, ?)',
      [shipmentId, routeName ?? null, totalDistanceKm ?? null, RouteStatus.PLANNED],
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
      'SELECT route_stop_id, route_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status FROM route_stop WHERE route_id = ? ORDER BY sequence_no ASC',
      [routeId],
    );
    return rows.map((r) => this.mapRouteStopRow(r));
  }

  async findStopById(stopId: number): Promise<RouteStopEntity | undefined> {
    const [rows] = await this.pool.execute<RouteStopRow[]>(
      'SELECT route_stop_id, route_id, sequence_no, stop_type, location_name, country, planned_arrival, planned_departure, status FROM route_stop WHERE route_stop_id = ? LIMIT 1',
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

    // Đồng bộ trạng thái của route_stop tương ứng
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

  private mapRouteRow(r: RouteRow): RouteEntity {
    return {
      id: r.route_id,
      shipmentId: r.shipment_id,
      routeName: r.route_name,
      totalDistanceKm: r.total_distance_km !== null ? Number(r.total_distance_km) : null,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  private mapRouteStopRow(r: RouteStopRow): RouteStopEntity {
    return {
      id: r.route_stop_id,
      routeId: r.route_id,
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
