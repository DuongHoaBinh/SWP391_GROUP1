import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { RequestChangesDto } from './dto/request-changes.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ShipmentStatus } from './orders.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Customer creates and submits a new transport request' })
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user, dto);
  }

  @Get('my-orders')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Customer views their own transport requests' })
  getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getMyOrders(user);
  }

  @Get()
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager views all transport requests with optional status filter' })
  @ApiQuery({ name: 'status', enum: ShipmentStatus, required: false })
  getAllOrders(@Query('status') status?: ShipmentStatus) {
    return this.ordersService.getAllOrders(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transport request details by ID (Customer only views their own)' })
  getOrderById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.getOrderById(user, id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager approves a transport request' })
  approveOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveOrderDto,
  ) {
    return this.ordersService.approveOrder(user, id, dto);
  }

  @Patch(':id/reject')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager rejects a transport request with a reason' })
  rejectOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectOrderDto,
  ) {
    return this.ordersService.rejectOrder(user, id, dto);
  }

  @Patch(':id/request-changes')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager requests changes on a transport request' })
  requestChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestChangesDto,
  ) {
    return this.ordersService.requestChanges(user, id, dto);
  }

  @Put(':id')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Customer updates and resubmits a transport request after changes requested' })
  updateOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.updateOrder(user, id, dto);
  }

  @Patch(':id/complete')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN, UserRole.DRIVER_ESCORT)
  @ApiOperation({ summary: 'Mark shipment completed and horses delivered' })
  completeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.completeOrder(user, id);
  }
}
