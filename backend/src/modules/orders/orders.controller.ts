import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
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
  @ApiOperation({ summary: 'Customer views their own transport requests with pagination, filter and sort' })
  @ApiQuery({ name: 'status', enum: ShipmentStatus, required: false })
  @ApiQuery({ name: 'departureDateFrom', required: false, description: 'Filter by departure date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'departureDateTo', required: false, description: 'Filter by departure date to (YYYY-MM-DD)' })
  @ApiQuery({ name: 'sortBy', enum: ['createdAt', 'totalCost', 'requestedDate'], required: false })
  @ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (10 or 20, default: 10)' })
  getMyOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ShipmentStatus,
    @Query('departureDateFrom') departureDateFrom?: string,
    @Query('departureDateTo') departureDateTo?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'totalCost' | 'requestedDate',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.getMyOrders(user, {
      status,
      departureDateFrom,
      departureDateTo,
      sortBy,
      sortOrder,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get()
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager views all transport requests with pagination, filter and sort' })
  @ApiQuery({ name: 'status', enum: ShipmentStatus, required: false })
  @ApiQuery({ name: 'departureDateFrom', required: false })
  @ApiQuery({ name: 'departureDateTo', required: false })
  @ApiQuery({ name: 'sortBy', enum: ['createdAt', 'totalCost', 'requestedDate'], required: false })
  @ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getAllOrders(
    @Query('status') status?: ShipmentStatus,
    @Query('departureDateFrom') departureDateFrom?: string,
    @Query('departureDateTo') departureDateTo?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'totalCost' | 'requestedDate',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.getAllOrders({
      status,
      departureDateFrom,
      departureDateTo,
      sortBy,
      sortOrder,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
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
}
