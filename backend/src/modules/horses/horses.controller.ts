import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { HorsesService } from './horses.service';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

const horsePhotoStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads/horses';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

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

  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: horsePhotoStorage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên ảnh đại diện cho con ngựa' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File hình ảnh đại diện (JPG, PNG, WEBP)',
        },
      },
    },
  })
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.horsesService.uploadHorsePhoto(user, id, file);
  }

  @Post('upload-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: horsePhotoStorage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên hình ảnh ngựa khi tạo mới (trả về URL)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File hình ảnh đại diện (JPG, PNG, WEBP)',
        },
      },
    },
  })
  uploadPhoto(@UploadedFile() file?: Express.Multer.File) {
    return this.horsesService.uploadPhoto(file);
  }
}

