import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HorsesService } from './horses.service';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@ApiTags('Horses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('horses')
export class HorsesController {
  constructor(private readonly horsesService: HorsesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách ngựa của người dùng hiện tại' })
  getMyHorses(@CurrentUser() user: AuthenticatedUser) {
    return this.horsesService.getMyHorses(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một con ngựa theo ID' })
  getHorseById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.horsesService.getHorseById(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo mới một con ngựa' })
  createHorse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHorseDto,
  ) {
    return this.horsesService.createHorse(user, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin con ngựa' })
  updateHorse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHorseDto,
  ) {
    return this.horsesService.updateHorse(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa hoặc chuyển trạng thái retired cho con ngựa' })
  deleteHorse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.horsesService.deleteHorse(user, id);
  }
}
