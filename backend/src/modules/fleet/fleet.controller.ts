import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FleetService } from './fleet.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { AssignVehiclesDto } from './dto/assign-vehicles.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { VehicleStatus, VehicleType } from './fleet.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';

@ApiTags('Fleet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Lấy danh sách tất cả phương tiện vận chuyển' })
  @ApiQuery({ name: 'status', enum: VehicleStatus, required: false })
  @ApiQuery({ name: 'type', enum: VehicleType, required: false })
  getVehicles(
    @Query('status') status?: VehicleStatus,
    @Query('type') type?: VehicleType,
  ) {
    return this.fleetService.getAllVehicles(status, type);
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Lấy chi tiết một phương tiện theo ID' })
  getVehicleById(@Param('id', ParseIntPipe) id: number) {
    return this.fleetService.getVehicleById(id);
  }

  @Post('vehicles')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Fleet Coordinator tạo mới phương tiện vận chuyển' })
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.fleetService.createVehicle(dto);
  }

  @Get('staff')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách tài xế, hộ tống và nhân sự vận hành sẵn sàng' })
  getAvailableStaff() {
    return this.fleetService.getAvailableStaff();
  }

  @Post('staff')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager khởi tạo tài khoản nhân sự vận hành mới (Provision Staff)' })
  provisionStaff(@Body() dto: CreateStaffDto) {
    return this.fleetService.provisionStaff(dto);
  }

  @Get('shipments/:id/assignments')
  @ApiOperation({ summary: 'Lấy danh sách xe và nhân sự đã phân công cho đơn vận chuyển' })
  getShipmentAssignments(@Param('id', ParseIntPipe) id: number) {
    return this.fleetService.getShipmentAssignments(id);
  }

  @Post('shipments/:id/assign-vehicles')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Phân công phương tiện xe/máy bay cho đơn hàng (Kiểm tra sức chứa capacity)' })
  assignVehicles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignVehiclesDto,
  ) {
    return this.fleetService.assignVehicles(user, id, dto);
  }

  @Post('shipments/:id/assign-staff')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Phân công tài xế (driver) và hộ tống (escort) cho chuyến đi' })
  assignStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignStaffDto,
  ) {
    return this.fleetService.assignStaff(user, id, dto);
  }
}
