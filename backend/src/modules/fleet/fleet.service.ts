import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FleetStore } from './fleet.store';
import { OrdersStore } from '../orders/orders.store';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  AvailableStaff,
  ShipmentStaffAssignment,
  ShipmentVehicleAssignment,
  VehicleEntity,
  VehicleStatus,
  VehicleType,
} from './fleet.types';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { AssignVehiclesDto } from './dto/assign-vehicles.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { ShipmentStatus } from '../orders/orders.types';

@Injectable()
export class FleetService {
  constructor(
    private readonly fleetStore: FleetStore,
    private readonly ordersStore: OrdersStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getAllVehicles(status?: VehicleStatus, type?: VehicleType): Promise<VehicleEntity[]> {
    return this.fleetStore.findAllVehicles(status, type);
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

    const id = await this.fleetStore.createVehicle(dto);
    return (await this.fleetStore.findVehicleById(id))!;
  }

  async getAvailableStaff(): Promise<AvailableStaff[]> {
    return this.fleetStore.findAvailableStaff();
  }

  async getShipmentAssignments(shipmentId: number): Promise<{
    vehicles: ShipmentVehicleAssignment[];
    staff: ShipmentStaffAssignment[];
  }> {
    const order = await this.ordersStore.findById(shipmentId);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn vận chuyển #${shipmentId}`);
    }

    const [vehicles, staff] = await Promise.all([
      this.fleetStore.findAssignedVehicles(shipmentId),
      this.fleetStore.findAssignedStaff(shipmentId),
    ]);

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
      order.status !== ShipmentStatus.IN_TRANSIT
    ) {
      throw new BadRequestException(
        `Chỉ có thể phân công phương tiện cho đơn hàng đã duyệt hoặc đang lập kế hoạch (Trạng thái hiện tại: ${order.status})`,
      );
    }

    const vehicles = await this.fleetStore.findVehiclesByIds(dto.vehicleIds);
    if (vehicles.length !== dto.vehicleIds.length) {
      throw new BadRequestException('Một hoặc nhiều phương tiện được chọn không tồn tại trong hệ thống');
    }

    // Key rule Flow 3: A vehicle/capacity assignment cannot exceed availability or horse capacity.
    const totalCapacity = vehicles.reduce((sum, v) => sum + v.capacity, 0);
    if (totalCapacity < order.requestedHorseCount) {
      throw new BadRequestException(
        `Tổng sức chứa của các xe được chọn (${totalCapacity} con) nhỏ hơn số lượng ngựa cần chuyển của đơn (${order.requestedHorseCount} con). Vui lòng chọn thêm xe hoặc xe có sức chứa lớn hơn.`,
      );
    }

    // Lưu liên kết
    await this.fleetStore.assignVehicles(shipmentId, dto.vehicleIds);

    // Cập nhật trạng thái xe thành in_use
    await this.fleetStore.updateVehiclesStatus(dto.vehicleIds, VehicleStatus.IN_USE);

    // Chuyển trạng thái đơn sang planning nếu đang là approved
    if (order.status === ShipmentStatus.APPROVED) {
      await this.ordersStore.updateStatus(shipmentId, ShipmentStatus.PLANNING);
    }

    const assigned = await this.fleetStore.findAssignedVehicles(shipmentId);

    // Gửi thông báo
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

    await this.fleetStore.assignStaff(shipmentId, dto.assignments);
    const assigned = await this.fleetStore.findAssignedStaff(shipmentId);

    // Thông báo cho từng nhân sự được phân công
    for (const item of dto.assignments) {
      await this.notificationsService.createNotification(
        item.userId,
        'Phân công nhiệm vụ chuyến đi mới',
        `Bạn được phân công làm vai trò "${item.roleInShipment}" cho đơn vận chuyển #${order.requestCode || shipmentId}.`,
        'status_update',
        shipmentId,
      );
    }

    return assigned;
  }
}
