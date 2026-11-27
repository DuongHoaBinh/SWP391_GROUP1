import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { FleetStore } from './fleet.store';
import { OrdersStore } from '../orders/orders.store';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  AvailableStaff,
  DepotEntity,
  VehicleClass,
  ShipmentStaffAssignment,
  ShipmentVehicleAssignment,
  VehicleEntity,
  VehicleStatus,
  VehicleType,
} from './fleet.types';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { AssignVehiclesDto } from './dto/assign-vehicles.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffShiftDto } from './dto/update-staff-shift.dto';
import { CreateDepotDto, UpdateDepotDto } from './dto/depot.dto';
import { VehicleWriteInput } from './fleet.store';

const VEHICLE_TYPE_BY_MODE: Record<VehicleClass['mode'], VehicleType> = {
  road: VehicleType.TRUCK,
  air: VehicleType.AIRCRAFT_STALL,
  sea: VehicleType.CONTAINER,
};
import { ShipmentStatus } from '../orders/orders.types';
import { UserRole } from '../auth/auth.types';

@Injectable()
export class FleetService {
  private readonly logger = new Logger(FleetService.name);

  constructor(
    private readonly fleetStore: FleetStore,
    private readonly ordersStore: OrdersStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getAllVehicles(status?: VehicleStatus, type?: VehicleType, depotId?: number): Promise<VehicleEntity[]> {
    return this.fleetStore.findAllVehicles(status, type, depotId);
  }

  async getVehicleById(id: number): Promise<VehicleEntity> {
    const v = await this.fleetStore.findVehicleById(id);
    if (!v) {
      throw new NotFoundException(`Không tìm thấy phương tiện #${id}`);
    }
    return v;
  }

  async createVehicle(dto: CreateVehicleDto): Promise<VehicleEntity> {
    const existing = await this.fleetStore.findAllVehicles();
    const isDuplicate = existing.some(
      (v) => v.plateOrCode.trim().toLowerCase() === dto.plateOrCode.trim().toLowerCase(),
    );
    if (isDuplicate) {
      throw new BadRequestException(`Biển số/Mã phương tiện "${dto.plateOrCode}" đã tồn tại trên hệ thống`);
    }

    // Step 3: loại phương tiện quyết định vehicleType + sức chứa; xe đường bộ phải thuộc một trạm
    let vehicleType: VehicleType;
    let capacity: number;
    let vehicleClassCode: string | null = null;
    if (dto.vehicleClassCode) {
      const cls = await this.resolveVehicleClass(dto.vehicleClassCode);
      vehicleClassCode = cls.code;
      vehicleType = VEHICLE_TYPE_BY_MODE[cls.mode];
      capacity = this.capacityForClass(cls, dto.capacity);
    } else {
      if (!dto.vehicleType || !dto.capacity) {
        throw new BadRequestException('Vui lòng chọn loại phương tiện (vehicleClassCode) hoặc gửi vehicleType và capacity');
      }
      vehicleType = dto.vehicleType;
      capacity = dto.capacity;
    }
    const depotId = await this.resolveDepotId(dto.depotId);
    if (vehicleType === VehicleType.TRUCK && depotId === null) {
      throw new BadRequestException('Xe đường bộ phải thuộc một trạm xe (depotId)');
    }

    const input: VehicleWriteInput = {
      vehicleType,
      vehicleClassCode,
      plateOrCode: dto.plateOrCode,
      capacity,
      status: dto.status,
      currentLocation: dto.currentLocation,
      depotId,
    };
    const id = await this.fleetStore.createVehicle(input);
    return (await this.fleetStore.findVehicleById(id))!;
  }

  async updateVehicle(id: number, dto: UpdateVehicleDto): Promise<VehicleEntity> {
    const current = await this.fleetStore.findVehicleById(id);
    if (!current) {
      throw new NotFoundException(`Không tìm thấy phương tiện #${id}`);
    }

    if (dto.plateOrCode && dto.plateOrCode.trim().toLowerCase() !== current.plateOrCode.trim().toLowerCase()) {
      const existing = await this.fleetStore.findAllVehicles();
      const dup = existing.some(
        (v) => v.id !== id && v.plateOrCode.trim().toLowerCase() === dto.plateOrCode!.trim().toLowerCase(),
      );
      if (dup) {
        throw new BadRequestException(`Biển số/Mã phương tiện "${dto.plateOrCode}" đã tồn tại trên hệ thống`);
      }
    }

    const patch: Partial<VehicleWriteInput> = {
      vehicleType: dto.vehicleType,
      plateOrCode: dto.plateOrCode,
      capacity: dto.capacity,
      status: dto.status,
      currentLocation: dto.currentLocation,
    };
    const effectiveClassCode = dto.vehicleClassCode ?? current.vehicleClassCode ?? null;
    if (effectiveClassCode) {
      const cls = await this.resolveVehicleClass(effectiveClassCode);
      patch.vehicleClassCode = cls.code;
      patch.vehicleType = VEHICLE_TYPE_BY_MODE[cls.mode];
      patch.capacity = this.capacityForClass(cls, dto.capacity ?? current.capacity);
    }
    if (dto.depotId !== undefined) {
      patch.depotId = await this.resolveDepotId(dto.depotId);
    }

    await this.fleetStore.updateVehicle(id, patch);
    return (await this.fleetStore.findVehicleById(id))!;
  }

  // --- Loại phương tiện & trạm xe (Step 3, review 11/2026) ---

  async getVehicleClasses(): Promise<VehicleClass[]> {
    return this.fleetStore.findVehicleClasses();
  }

  private async resolveVehicleClass(code: string): Promise<VehicleClass> {
    const cls = await this.fleetStore.findVehicleClassByCode(code);
    if (!cls) {
      throw new BadRequestException(`Loại phương tiện "${code}" không có trong danh mục`);
    }
    return cls;
  }

  /** Sức chứa lấy theo loại; loại không cố định sức chứa thì dùng giá trị nhập. */
  private capacityForClass(cls: VehicleClass, requested?: number): number {
    if (cls.horseCapacity !== null) return cls.horseCapacity;
    if (!requested || requested < 1) {
      throw new BadRequestException(`Loại "${cls.nameVi}" cần nhập sức chứa (số ngựa)`);
    }
    return requested;
  }

  private async resolveDepotId(depotId?: number | null): Promise<number | null> {
    if (depotId === undefined || depotId === null) return null;
    const depot = await this.fleetStore.findDepotById(depotId);
    if (!depot) throw new BadRequestException(`Trạm xe #${depotId} không tồn tại`);
    if (!depot.isActive) throw new BadRequestException(`Trạm "${depot.name}" đang tạm ngưng, không thể gán xe`);
    return depot.id;
  }

  async getDepots(): Promise<DepotEntity[]> {
    return this.fleetStore.findDepots();
  }

  async getDepotById(id: number): Promise<DepotEntity & { vehicles: VehicleEntity[] }> {
    const depot = await this.fleetStore.findDepotById(id);
    if (!depot) throw new NotFoundException(`Không tìm thấy trạm xe #${id}`);
    const vehicles = await this.fleetStore.findAllVehicles(undefined, undefined, id);
    return { ...depot, vehicles };
  }

  async createDepot(dto: CreateDepotDto): Promise<DepotEntity> {
    if (await this.fleetStore.findDepotByCode(dto.code)) {
      throw new ConflictException(`Mã trạm "${dto.code.toUpperCase()}" đã tồn tại`);
    }
    const id = await this.fleetStore.createDepot(dto);
    return (await this.fleetStore.findDepotById(id))!;
  }

  async updateDepot(id: number, dto: UpdateDepotDto): Promise<DepotEntity> {
    const current = await this.fleetStore.findDepotById(id);
    if (!current) throw new NotFoundException(`Không tìm thấy trạm xe #${id}`);
    if (dto.code && dto.code.trim().toUpperCase() !== current.code) {
      const dup = await this.fleetStore.findDepotByCode(dto.code);
      if (dup && dup.id !== id) throw new ConflictException(`Mã trạm "${dto.code.toUpperCase()}" đã tồn tại`);
    }
    await this.fleetStore.updateDepot(id, dto);
    return (await this.fleetStore.findDepotById(id))!;
  }

  async deleteDepot(id: number): Promise<{ success: boolean; message: string }> {
    const depot = await this.fleetStore.findDepotById(id);
    if (!depot) throw new NotFoundException(`Không tìm thấy trạm xe #${id}`);
    if ((depot.vehicleCount ?? 0) > 0) {
      throw new ConflictException(
        `Trạm "${depot.name}" còn ${depot.vehicleCount} xe. Hãy chuyển xe sang trạm khác hoặc tạm ngưng trạm thay vì xóa.`,
      );
    }
    await this.fleetStore.deleteDepot(id);
    return { success: true, message: `Đã xóa trạm "${depot.name}".` };
  }

  async deleteVehicle(id: number): Promise<{ success: boolean; message: string }> {
    const existingList = await this.fleetStore.findAllVehicles();
    const vehicle = existingList.find((v) => v.id === id);
    if (!vehicle) {
      throw new NotFoundException(`Không tìm thấy phương tiện #${id}`);
    }
    if (vehicle.status === VehicleStatus.IN_USE) {
      throw new BadRequestException(`Phương tiện "${vehicle.plateOrCode}" đang được phân công trong chuyến đi, không thể xóa.`);
    }

    await this.fleetStore.deleteVehicle(id);
    return {
      success: true,
      message: `Đã xóa phương tiện "${vehicle.plateOrCode}" thành công.`,
    };
  }

  async getAvailableStaff(): Promise<AvailableStaff[]> {
    return this.fleetStore.findAvailableStaff();
  }

  async provisionStaff(
    dto: CreateStaffDto,
    actor?: AuthenticatedUser,
  ): Promise<AvailableStaff & { temporaryPassword?: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.fleetStore.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException(`Email "${normalizedEmail}" đã tồn tại trong hệ thống!`);
    }

    const targetRoleName = await this.fleetStore.findRoleNameById(dto.roleId);
    if (!targetRoleName) {
      throw new BadRequestException(`Vai trò ID #${dto.roleId} không tồn tại.`);
    }
    const normalizedTarget = targetRoleName.toLowerCase();
    if (normalizedTarget === 'admin' || normalizedTarget === 'customer') {
      throw new ForbiddenException('Không thể khởi tạo tài khoản Admin hoặc Customer qua cổng nhân sự vận hành.');
    }
    if (
      normalizedTarget.includes('logistics manager') &&
      actor?.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Chỉ quản trị viên hệ thống (Admin) mới có quyền khởi tạo tài khoản Logistics Manager.');
    }

    const providedPassword = dto.password?.trim();
    const generatedPassword = providedPassword ? undefined : `${randomBytes(8).toString('base64url')}1A!`;
    const passwordToHash = providedPassword || generatedPassword!;
    const passwordHash = await bcrypt.hash(passwordToHash, 12);
    const resolvedSpec = dto.roleId === 5 ? (dto.specialization || 'driver') : undefined;
    const createdBy = actor?.id && Number.isSafeInteger(Number(actor.id)) ? Number(actor.id) : null;

    const created = await this.fleetStore.createStaffUser({
      fullName: dto.fullName.trim(),
      email: normalizedEmail,
      phone: dto.phone?.trim() || undefined,
      roleId: dto.roleId,
      specialization: resolvedSpec,
      passwordHash,
      createdBy,
    });

    return generatedPassword ? { ...created, temporaryPassword: generatedPassword } : created;
  }

  async updateStaffShift(
    userId: number,
    dto: UpdateStaffShiftDto,
  ): Promise<{ success: boolean; userId: number; currentShift: string; dutyStatus: string; activeTrips: number }> {
    const shouldRelease = dto.releaseActiveTrips === true && dto.dutyStatus !== 'ON_DUTY';
    const ok = await this.fleetStore.updateStaffShift(userId, dto.currentShift, dto.dutyStatus, shouldRelease);
    if (!ok) {
      throw new NotFoundException(`Không tìm thấy nhân sự #${userId}`);
    }
    return {
      success: true,
      userId,
      currentShift: dto.currentShift.trim(),
      dutyStatus: dto.dutyStatus,
      activeTrips: shouldRelease ? 0 : undefined as any,
    };
  }

  async getShipmentAssignments(shipmentId: number, user?: AuthenticatedUser): Promise<{
    vehicles: ShipmentVehicleAssignment[];
    staff: ShipmentStaffAssignment[];
  }> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (user?.role === UserRole.CUSTOMER && order.customerId !== Number(user.id)) throw new ForbiddenException('Bạn chỉ được xem phân công đơn của mình');

    const [vehicles, staff] = await Promise.all([
      this.fleetStore.findAssignedVehicles(shipmentId),
      this.fleetStore.findAssignedStaff(shipmentId),
    ]);

    if (user?.role === UserRole.DRIVER_ESCORT) {
      const isAssigned = staff.some((s) => Number(s.userId) === Number(user.id));
      if (!isAssigned) {
        throw new ForbiddenException('Bạn chỉ được phép xem phân công của chuyến đi được phân công cho mình');
      }
    }

    return { vehicles, staff };
  }

  async assignVehicles(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: AssignVehiclesDto,
  ): Promise<ShipmentVehicleAssignment[]> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (
      order.status !== ShipmentStatus.APPROVED &&
      order.status !== ShipmentStatus.PLANNING &&
      order.status !== ShipmentStatus.IN_TRANSIT &&
      order.status !== ShipmentStatus.RETURN_PENDING
    ) {
      throw new BadRequestException(
        `Chỉ có thể phân công phương tiện cho đơn hàng đã duyệt hoặc đang lập kế hoạch (Trạng thái hiện tại: ${order.status})`,
      );
    }

    const vehicles = await this.fleetStore.findVehiclesByIds(dto.vehicleIds);
    if (vehicles.length !== dto.vehicleIds.length) {
      throw new BadRequestException('Một hoặc nhiều phương tiện được chọn không tồn tại trong hệ thống');
    }
    const ownVehicleIds = new Set<number>();
    if (vehicles.some((v) => v.status === VehicleStatus.IN_USE)) {
      const assignedList = await this.fleetStore.findAssignedVehicles(shipmentId);
      for (const a of assignedList) ownVehicleIds.add(a.vehicleId);
      if (typeof this.fleetStore.findShipmentReservations === 'function') {
        const reservedList = await this.fleetStore.findShipmentReservations(shipmentId);
        for (const r of reservedList) {
          if (r.status === 'active' || r.status === 'consumed') ownVehicleIds.add(r.vehicleId);
        }
      }
    }
    if (
      vehicles.some(
        (v) =>
          v.status === VehicleStatus.MAINTENANCE ||
          (v.status === VehicleStatus.IN_USE && !ownVehicleIds.has(v.id) && v.assignedShipmentId !== shipmentId),
      )
    ) {
      throw new BadRequestException('Xe đang được sử dụng hoặc bảo trì. Ghép chuyến phải chọn chuyến đường bộ trong kế hoạch để kiểm tra chỗ');
    }

    const totalCapacity = vehicles.reduce((sum, v) => sum + v.capacity, 0);
    const requiredSlots = typeof this.fleetStore.findRequiredStallSlots === 'function'
      ? await this.fleetStore.findRequiredStallSlots(shipmentId, order.requestedHorseCount)
      : order.requestedHorseCount;
    if (totalCapacity < requiredSlots) {
      throw new BadRequestException(
        `Tổng sức chứa của các xe được chọn (${totalCapacity} chỗ) nhỏ hơn số chỗ chuồng cần cho đơn (${requiredSlots} chỗ). Vui lòng chọn thêm xe hoặc xe có sức chứa lớn hơn.`,
      );
    }

    await this.fleetStore.assignVehicles(shipmentId, dto.vehicleIds);
    await this.fleetStore.updateVehiclesStatus(dto.vehicleIds, VehicleStatus.IN_USE);

    if (order.status === ShipmentStatus.APPROVED) {
      await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.PLANNING);
    }

    const assigned = await this.fleetStore.findAssignedVehicles(shipmentId);

    await this.notificationsService.createNotification(
      order.customerId,
      'Đã phân công phương tiện vận chuyển',
      `Đơn vận chuyển #${order.requestCode || shipmentId} đã được phân công ${vehicles.length} phương tiện (${vehicles.map((v) => v.plateOrCode).join(', ')}).`,
      'status_update',
      shipmentId,
    );

    return assigned;
  }

  async assignStaff(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: AssignStaffDto,
  ): Promise<ShipmentStaffAssignment[]> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    if (['in_transit', 'return_pending', 'completed', 'cancelled', 'cancelled_operational', 'rejected'].includes(order.status)) {
      throw new ConflictException(
        `Không thể thay đổi phân công nhân sự khi đơn đang ở trạng thái "${order.status}"`,
      );
    }

    // 1. Validate staff role & schedule overlap on non-sibling active trips
    if (typeof this.fleetStore.validateStaffEligibilityAndSchedule === 'function') {
      await this.fleetStore.validateStaffEligibilityAndSchedule(
        shipmentId,
        dto.assignments.map((a) => a.userId),
        dto.assignments,
      );
    }

    // 2. Check khóa phân công sau khi đã confirmed (trừ trường hợp thay thế người từ chối / chưa xác nhận) & không phân công lại người đã từ chối
    const existingStaff = await this.fleetStore.findAssignedStaff(shipmentId);
    if (['confirmed', 'ready_to_depart'].includes(order.status)) {
      const hasPendingOrDeclined = existingStaff.some(
        (s) => !s.isConfirmed || Boolean(s.confirmationNotes?.includes('TỪ CHỐI')),
      );
      if (!hasPendingOrDeclined) {
        throw new ConflictException(
          'Toàn bộ nhân sự đã xác nhận nhận chuyến; không thể phân công lại sau khi chuyến đi đã xác nhận và phát hành hóa đơn',
        );
      }
    }

    for (const item of dto.assignments) {
      const prevDeclined = existingStaff.find(
        (s) => s.userId === item.userId && s.roleInShipment === item.roleInShipment && s.confirmationNotes?.includes('TỪ CHỐI'),
      );
      if (prevDeclined) {
        throw new ConflictException(
          `Nhân sự ${prevDeclined.user?.fullName || 'này'} đã từ chối chuyến này trước đó (${prevDeclined.confirmationNotes}). Vui lòng chọn nhân sự khác đang rảnh thay thế!`,
        );
      }
    }

    await this.fleetStore.assignStaff(shipmentId, dto.assignments);
    const assigned = await this.fleetStore.findAssignedStaff(shipmentId);

    for (const item of dto.assignments) {
      const staffRecord = assigned.find((a) => a.userId === item.userId && a.roleInShipment === item.roleInShipment);
      if (staffRecord && staffRecord.isConfirmed) {
        continue;
      }

      await this.notificationsService.createNotification(
        item.userId,
        'Phân công nhiệm vụ chuyến đi mới',
        `Bạn được phân công làm vai trò "${item.roleInShipment}" cho đơn vận chuyển #${order.requestCode || shipmentId}.`,
        'status_update',
        shipmentId,
      );
    }

    try {
      const siblingShipmentIds = await this.fleetStore.findSiblingShipmentsOnSameRoadTrip(shipmentId);
      for (const sibId of siblingShipmentIds) {
        await this.fleetStore.assignStaff(sibId, dto.assignments);
        const sibOrder = await this.ordersStore.findById(sibId);
        for (const item of dto.assignments) {
          await this.notificationsService.createNotification(
            item.userId,
            'Phân công nhiệm vụ chuyến đi ghép',
            `Bạn được phân công làm vai trò "${item.roleInShipment}" cho đơn ghép #${sibOrder?.requestCode || sibId}.`,
            'status_update',
            sibId,
          );
        }
      }
    } catch (syncErr) {
      this.logger.error('Lỗi tự động đồng bộ nhân sự cho đơn ghép', syncErr as Error);
    }

    return assigned;
  }
}
