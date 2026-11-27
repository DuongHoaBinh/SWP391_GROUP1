import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import { basename, join } from 'path';
import { HorsesStore } from './horses.store';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { HorseEntity, HorseStatus } from './horses.types';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { verifyUploadedFileMagicBytes } from '../../common/utils/upload-validation';

@Injectable()
export class HorsesService {
  constructor(private readonly horsesStore: HorsesStore) {}

  async getMyHorses(user: AuthenticatedUser): Promise<HorseEntity[]> {
    const ownerId = Number(user.id);
    return this.horsesStore.findByOwnerId(ownerId);
  }

  async getHorseById(user: AuthenticatedUser, horseId: number): Promise<HorseEntity> {
    const horse = await this.horsesStore.findById(horseId);
    if (!horse) {
      throw new NotFoundException(`Horse #${horseId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && horse.ownerId !== Number(user.id)) {
      throw new ForbiddenException('You can only view horses belonging to your account');
    }
    if (user.role === UserRole.DRIVER_ESCORT) {
      const assigned =
        typeof this.horsesStore.isHorseAssignedToDriver === 'function'
          ? await this.horsesStore.isHorseAssignedToDriver(horseId, Number(user.id))
          : false;
      if (!assigned) {
        throw new ForbiddenException('Bạn chỉ được phép xem hồ sơ ngựa thuộc chuyến đi được phân công cho mình.');
      }
    }

    return horse;
  }

  async createHorse(user: AuthenticatedUser, dto: CreateHorseDto): Promise<HorseEntity> {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền tạo hồ sơ ngựa.');
    }
    const ownerId = Number(user.id);

    const cleanPassport = dto.passportNo?.trim() || '';
    if (!cleanPassport) {
      throw new BadRequestException('Vui lòng nhập FEI Passport Number (Số hộ chiếu FEI).');
    }
    const cleanMicrochip = dto.microchipNo?.trim() || '';
    if (!cleanMicrochip) {
      throw new BadRequestException('Vui lòng nhập Microchip Number (Số vi mạch).');
    }
    if (!/^[A-Za-z0-9-]{9,20}$/.test(cleanMicrochip)) {
      throw new BadRequestException(
        'Mã Microchip không hợp lệ (cần chuẩn ISO 11784/11785 gồm 15 chữ số, tối thiểu 9 ký tự chữ-số).',
      );
    }

    // Kiểm tra không được trùng tên ngựa trong tài khoản của khách
    const existingHorses = await this.horsesStore.findByOwnerId(ownerId);
    const isDuplicate = existingHorses.some(
      (h) =>
        h.name.trim().toLowerCase() === dto.name.trim().toLowerCase() &&
        h.status !== HorseStatus.RETIRED,
    );
    if (isDuplicate) {
      throw new BadRequestException(
        `Bạn đã có một con ngựa mang tên "${dto.name.trim()}". Mỗi con ngựa phải có tên riêng biệt.`,
      );
    }

    // Kiểm tra trùng toàn cục (kể cả khác tài khoản hoặc đã retired vì DB đặt UNIQUE)
    if (typeof this.horsesStore.findByMicrochipNo === 'function') {
      const dupChipGlobal = await this.horsesStore.findByMicrochipNo(cleanMicrochip);
      if (dupChipGlobal) {
        throw new ConflictException(`Mã Microchip "${cleanMicrochip}" đã tồn tại trên một hồ sơ ngựa khác trong hệ thống.`);
      }
    }
    if (typeof this.horsesStore.findByPassportNo === 'function') {
      const dupPassGlobal = await this.horsesStore.findByPassportNo(cleanPassport);
      if (dupPassGlobal) {
        throw new ConflictException(`Số hộ chiếu FEI "${cleanPassport}" đã tồn tại trên một hồ sơ ngựa khác trong hệ thống.`);
      }
    }

    dto.microchipNo = cleanMicrochip;
    dto.passportNo = cleanPassport;
    dto.quantity = 1;

    const horseId = await this.horsesStore.create(ownerId, dto);
    const created = await this.horsesStore.findById(horseId);
    if (!created) {
      throw new BadRequestException('Failed to retrieve newly created horse');
    }
    return created;
  }

  async updateHorse(
    user: AuthenticatedUser,
    horseId: number,
    dto: UpdateHorseDto,
  ): Promise<HorseEntity> {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền chỉnh sửa hồ sơ ngựa.');
    }
    const horse = await this.horsesStore.findById(horseId);
    if (!horse) {
      throw new NotFoundException(`Horse #${horseId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && horse.ownerId !== Number(user.id)) {
      throw new ForbiddenException('You can only edit horses belonging to your account');
    }

    if (dto.microchipNo !== undefined) {
      const cleanMicrochip = dto.microchipNo.trim();
      if (!/^[A-Za-z0-9-]{9,20}$/.test(cleanMicrochip)) {
        throw new BadRequestException(
          'Mã Microchip không hợp lệ (cần chuẩn ISO 11784/11785 gồm 15 chữ số, tối thiểu 9 ký tự chữ-số).',
        );
      }
      if (typeof this.horsesStore.findByMicrochipNo === 'function') {
        const dupChipGlobal = await this.horsesStore.findByMicrochipNo(cleanMicrochip);
        if (dupChipGlobal && dupChipGlobal.id !== horseId) {
          throw new ConflictException(`Mã Microchip "${cleanMicrochip}" đã tồn tại trên một hồ sơ ngựa khác trong hệ thống.`);
        }
      }
      dto.microchipNo = cleanMicrochip;
    }

    if (dto.passportNo !== undefined) {
      const cleanPassport = dto.passportNo.trim();
      if (!cleanPassport) {
        throw new BadRequestException('Số hộ chiếu FEI (Passport Number) không được để trống.');
      }
      if (typeof this.horsesStore.findByPassportNo === 'function') {
        const dupPassGlobal = await this.horsesStore.findByPassportNo(cleanPassport);
        if (dupPassGlobal && dupPassGlobal.id !== horseId) {
          throw new ConflictException(`Số hộ chiếu FEI "${cleanPassport}" đã tồn tại trên một hồ sơ ngựa khác trong hệ thống.`);
        }
      }
      dto.passportNo = cleanPassport;
    }

    // Không cho phép khách hàng tự ý đổi trạng thái ngựa đang được giữ/vận chuyển về lại 'active'
    if (
      horse.status === HorseStatus.IN_TRANSIT &&
      dto.status === HorseStatus.ACTIVE
    ) {
      dto.status = horse.status;
    }

    await this.horsesStore.update(horseId, dto);
    const updated = await this.horsesStore.findById(horseId);
    return updated!;
  }

  async deleteHorse(user: AuthenticatedUser, horseId: number): Promise<{ success: boolean; message: string }> {
    if (user.role === UserRole.DRIVER_ESCORT) {
      throw new ForbiddenException('Tài xế không có quyền xóa hồ sơ ngựa.');
    }
    const horse = await this.horsesStore.findById(horseId);
    if (!horse) {
      throw new NotFoundException(`Horse #${horseId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && horse.ownerId !== Number(user.id)) {
      throw new ForbiddenException('You can only delete horses belonging to your account');
    }

    if (horse.status === HorseStatus.IN_TRANSIT) {
      throw new BadRequestException('Không thể xóa ngựa đang trong quá trình vận chuyển.');
    }

    const isInShipments = await this.horsesStore.isHorseInShipments(horseId);
    if (isInShipments) {
      // Soft-delete to preserve shipment audit history
      await this.horsesStore.softDelete(horseId);
      return {
        success: true,
        message: 'Con ngựa này đã từng tham gia chuyến vận chuyển nên đã được chuyển sang trạng thái "retired" để bảo toàn lịch sử.',
      };
    }

    await this.horsesStore.delete(horseId);
    return {
      success: true,
      message: 'Xóa con ngựa thành công.',
    };
  }

  async uploadHorsePhoto(
    user: AuthenticatedUser,
    horseId: number,
    file?: Express.Multer.File,
  ): Promise<HorseEntity> {
    if (user.role === UserRole.DRIVER_ESCORT) {
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      throw new ForbiddenException('Tài xế không có quyền cập nhật ảnh hồ sơ ngựa.');
    }
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh đại diện cho con ngựa');
    }
    verifyUploadedFileMagicBytes(file, 'image');

    const horse = await this.horsesStore.findById(horseId);
    if (!horse) {
      if (file.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      throw new NotFoundException(`Horse #${horseId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && horse.ownerId !== Number(user.id)) {
      if (file.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      throw new ForbiddenException('Bạn chỉ có thể cập nhật ảnh cho ngựa thuộc tài khoản của bạn');
    }

    const oldPhotoUrl = horse.photoUrl;
    const photoUrl = `/uploads/horses/${file.filename}`;
    await this.horsesStore.update(horseId, { photoUrl });

    if (oldPhotoUrl && oldPhotoUrl.startsWith('/uploads/horses/')) {
      const oldPath = join(process.cwd(), 'uploads', 'horses', basename(oldPhotoUrl));
      if (oldPath !== file.path && fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    }

    const updated = await this.horsesStore.findById(horseId);
    return updated!;
  }

  async uploadPhoto(file?: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh');
    }
    verifyUploadedFileMagicBytes(file, 'image');
    return {
      url: `/uploads/horses/${file.filename}`,
    };
  }
}
