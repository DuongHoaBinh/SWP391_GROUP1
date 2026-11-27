import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RowDataPacket } from 'mysql2/promise';
import { AllocationStore } from './allocation.store';
import {
  allowedWindowsForDate,
  applicableRules,
  CityRestrictionRule,
  DEFAULT_TZ,
} from './city-restriction-policy';
import {
  DEFAULT_JOURNEY_RULES,
  JourneyRules,
  normalizeJourneyRules,
  validateJourneyRules,
} from './journey-time-policy';
import { CityRestrictionDto, CityRestrictionExceptionDto, JourneyRulesDto, SwapReservedVehicleDto } from './dto/city-restriction.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { findShipmentReservations, INACTIVE_SHIPMENT_SQL, releaseShipmentReservations, reserveVehicles } from './vehicle-reservation';
import { loadRequiredStallSlots } from './capacity-policy';

export const JOURNEY_RULES_KEY = 'journey.rules';

/** Cấu hình giờ cấm đô thị, tham số nghỉ (B4) và đổi xe đã giữ chỗ (Step 9). */
@Injectable()
export class AllocationService {
  constructor(private readonly store: AllocationStore) {}

  // --- Giờ cấm ---
  async listCityRestrictions() {
    const [rules, exceptions] = await Promise.all([this.store.listRestrictionRules(), this.store.listRestrictionExceptions()]);
    return {
      rules,
      exceptions,
      disclaimerVi: 'Dữ liệu demo — cần đối chiếu văn bản gốc của UBND/Sở GTVT trước khi dùng thật.',
    };
  }

  private toRule(dto: CityRestrictionDto): CityRestrictionRule {
    if (dto.bannedFrom === dto.bannedTo) throw new BadRequestException('Giờ bắt đầu và giờ kết thúc cấm không được trùng nhau');
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('effectiveTo phải sau effectiveFrom');
    return {
      city: dto.city.trim(),
      centerLat: dto.centerLat,
      centerLng: dto.centerLng,
      radiusKm: dto.radiusKm,
      appliesToHeavyTruck: dto.appliesToHeavyTruck ?? true,
      bannedFrom: dto.bannedFrom,
      bannedTo: dto.bannedTo,
      daysOfWeek: [...new Set(dto.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7])].sort(),
      legalReference: dto.legalReference.trim(),
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? null,
      isDemoData: dto.isDemoData ?? true,
      isActive: dto.isActive ?? true,
    };
  }

  async createCityRestriction(dto: CityRestrictionDto) {
    const id = await this.store.createRestrictionRule(this.toRule(dto));
    return this.store.findRestrictionRule(id);
  }

  async updateCityRestriction(id: number, dto: CityRestrictionDto) {
    if (!(await this.store.findRestrictionRule(id))) throw new NotFoundException(`Không tìm thấy quy tắc giờ cấm #${id}`);
    await this.store.updateRestrictionRule(id, this.toRule(dto));
    return this.store.findRestrictionRule(id);
  }

  async createException(dto: CityRestrictionExceptionDto) {
    if (dto.bannedFrom === dto.bannedTo) throw new BadRequestException('Giờ bắt đầu và giờ kết thúc cấm không được trùng nhau');
    try {
      const id = await this.store.createRestrictionException({ ...dto, city: dto.city.trim() });
      return { id, ...dto };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new ConflictException('Ngoại lệ cho thành phố, ngày và giờ bắt đầu này đã tồn tại');
      throw err;
    }
  }

  async deleteException(id: number) {
    if (!(await this.store.deleteRestrictionException(id))) throw new NotFoundException(`Không tìm thấy ngoại lệ #${id}`);
    return { success: true };
  }

  /** Khung giờ được phép cho một điểm trong một ngày (UI chọn giờ đón). */
  async checkPoint(lat: number, lng: number, date: string, heavy: boolean) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException('Thiếu tọa độ lat/lng hợp lệ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    const [rules, exceptions] = await Promise.all([this.store.listRestrictionRules(true), this.store.listRestrictionExceptions()]);
    const point = { lat, lng };
    const zones = applicableRules(point, heavy, rules);
    const allowedWindows = allowedWindowsForDate(date, point, heavy, rules, exceptions);
    const restricted = allowedWindows.length !== 1 || allowedWindows[0].from !== '00:00' || allowedWindows[0].to !== '24:00';
    const holiday = exceptions.filter((e) => e.exceptionDate === date && zones.some((z) => z.city === e.city));
    return {
      date,
      timezone: DEFAULT_TZ,
      heavy,
      restricted,
      cities: [...new Set(zones.map((z) => z.city))],
      allowedWindows,
      holidayExceptions: holiday,
      legalReferences: zones.map((z) => z.legalReference),
      isDemoData: zones.some((z) => z.isDemoData !== false),
      messageVi: restricted
        ? `Xe tải nặng chỉ được vào nội đô ${[...new Set(zones.map((z) => z.city))].join(', ')} trong các khung: ${allowedWindows
            .map((w) => `${w.from}–${w.to}`)
            .join(', ')}`
        : null,
    };
  }

  // --- Tham số nghỉ B4 ---
  async getJourneyRules(): Promise<JourneyRules> {
    const raw = await this.store.getSetting(JOURNEY_RULES_KEY);
    return normalizeJourneyRules(raw ?? DEFAULT_JOURNEY_RULES);
  }

  async updateJourneyRules(user: AuthenticatedUser, dto: JourneyRulesDto): Promise<JourneyRules> {
    const rules = normalizeJourneyRules(dto);
    validateJourneyRules(rules);
    await this.store.setSetting(JOURNEY_RULES_KEY, rules, Number(user.id));
    return rules;
  }

  // --- Xe đã giữ chỗ của đơn ---
  async getShipmentReservations(user: AuthenticatedUser, shipmentId: number) {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xem thông tin giữ chỗ / phân bổ đội xe của đơn hàng');
    }
    const pool = this.store.getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT shipment_id, customer_id, allocation_option_code, allocation_snapshot, pickup_at, night_surcharge_applied FROM shipment WHERE shipment_id = ?',
      [shipmentId],
    );
    const order = rows[0];
    if (!order) throw new NotFoundException(`Không tìm thấy đơn #${shipmentId}`);
    if (user.role === UserRole.CUSTOMER && Number(order.customer_id) !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ xem được đơn của chính mình');
    }
    const snapshot = typeof order.allocation_snapshot === 'string' ? JSON.parse(order.allocation_snapshot) : order.allocation_snapshot;
    return {
      shipmentId,
      optionCode: order.allocation_option_code ?? null,
      pickupAt: order.pickup_at ? new Date(order.pickup_at).toISOString() : null,
      nightSurchargeApplied: Boolean(order.night_surcharge_applied),
      snapshot: snapshot ?? null,
      reservations: await findShipmentReservations(pool, shipmentId, user.role !== UserRole.CUSTOMER),
    };
  }

  /**
   * Manager đổi một xe đã giữ sang xe khác (bắt buộc lý do): nhả reservation cũ, giữ xe mới cùng khung
   * giờ với cơ chế khóa vehicle_id ASC, cập nhật chặng chưa chạy dùng xe cũ và ghi lại lịch sử.
   */
  async swapReservedVehicle(user: AuthenticatedUser, shipmentId: number, dto: SwapReservedVehicleDto) {
    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 5) throw new BadRequestException('Lý do đổi xe phải có ít nhất 5 ký tự');
    if (dto.fromVehicleId === dto.toVehicleId) throw new BadRequestException('Xe thay thế phải khác xe đang giữ');
    const db = await this.store.getPool().getConnection();
    try {
      await db.beginTransaction();
      const [orders] = await db.execute<RowDataPacket[]>(
        `SELECT shipment_id, status, requested_horse_count, allocation_snapshot FROM shipment WHERE shipment_id = ? FOR UPDATE`,
        [shipmentId],
      );
      const order = orders[0];
      if (!order) throw new NotFoundException(`Không tìm thấy đơn #${shipmentId}`);
      if (INACTIVE_SHIPMENT_SQL.includes(`'${order.status}'`) || order.status === 'in_transit') {
        throw new ConflictException('Đơn đã kết thúc hoặc đang chạy, không thể đổi xe đã giữ');
      }
      const current = await findShipmentReservations(db, shipmentId);
      const from = current.find((r) => r.vehicleId === dto.fromVehicleId);
      if (!from) throw new NotFoundException('Xe cần đổi không nằm trong danh sách xe đang giữ của đơn');

      const [toRows] = await db.execute<RowDataPacket[]>('SELECT vehicle_id, capacity, vehicle_type FROM vehicle WHERE vehicle_id = ?', [dto.toVehicleId]);
      if (!toRows[0] || toRows[0].vehicle_type === 'aircraft_stall') throw new BadRequestException('Xe thay thế phải là xe đường bộ');
      const sameDirection = current.filter((r) => r.direction === from.direction && r.vehicleId !== from.vehicleId);
      const newCapacity = sameDirection.reduce((s, r) => s + r.capacity, 0) + Number(toRows[0].capacity);
      const required = await loadRequiredStallSlots(db as any, shipmentId, Number(order.requested_horse_count));
      if (newCapacity < required) {
        throw new BadRequestException(`Sau khi đổi, tổng sức chứa (${newCapacity} chỗ) không đủ ${required} chỗ chuồng của đơn`);
      }

      await reserveVehicles(db, {
        shipmentId,
        vehicleIds: [dto.toVehicleId],
        start: new Date(from.startAt),
        end: new Date(from.endAt),
        direction: from.direction,
        actorId: Number(user.id),
      });
      await releaseShipmentReservations(db, shipmentId, 'manager_swap', [dto.fromVehicleId]);

      const [routes] = await db.execute<RowDataPacket[]>('SELECT route_id FROM route WHERE shipment_id = ? ORDER BY route_id DESC LIMIT 1', [shipmentId]);
      const routeId = routes[0] ? Number(routes[0].route_id) : null;
      if (routeId) {
        await db.execute(
          `UPDATE route_leg SET vehicle_id = ?, allocation_override_reason = ?
           WHERE route_id = ? AND vehicle_id = ? AND status = 'pending'`,
          [dto.toVehicleId, reason, routeId, dto.fromVehicleId],
        );
        await db.execute(
          `INSERT INTO trip_status_log (shipment_id, route_id, previous_status, new_status, milestone_type, milestone_name, notes, updated_by, updated_by_role)
           VALUES (?, ?, ?, ?, 'allocation_override', ?, ?, ?, ?)`,
          [shipmentId, routeId, `vehicle:${dto.fromVehicleId}`, `vehicle:${dto.toVehicleId}`, 'Đổi xe đã giữ chỗ', reason, Number(user.id), String(user.role)],
        );
      }

      // Lịch sử đổi xe nối thêm vào snapshot phân bổ (không sửa phương án gốc khách đã chọn)
      const snapshot = (typeof order.allocation_snapshot === 'string' ? JSON.parse(order.allocation_snapshot) : order.allocation_snapshot) || {};
      const overrides = Array.isArray(snapshot.overrides) ? snapshot.overrides : [];
      overrides.push({ fromVehicleId: dto.fromVehicleId, toVehicleId: dto.toVehicleId, reason, by: Number(user.id), at: new Date().toISOString() });
      await db.execute('UPDATE shipment SET allocation_snapshot = ? WHERE shipment_id = ?', [JSON.stringify({ ...snapshot, overrides }), shipmentId]);

      await db.commit();
    } catch (err) {
      await db.rollback();
      throw err;
    } finally {
      db.release();
    }
    return this.getShipmentReservations(user, shipmentId);
  }
}

