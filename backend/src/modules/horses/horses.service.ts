import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HorsesStore } from './horses.store';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { HorseEntity, HorseStatus } from './horses.types';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';

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

    return horse;
  }

  async createHorse(user: AuthenticatedUser, dto: CreateHorseDto): Promise<HorseEntity> {
    const ownerId = Number(user.id);

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
    const horse = await this.horsesStore.findById(horseId);
    if (!horse) {
      throw new NotFoundException(`Horse #${horseId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && horse.ownerId !== Number(user.id)) {
      throw new ForbiddenException('You can only edit horses belonging to your account');
    }

    await this.horsesStore.update(horseId, dto);
    const updated = await this.horsesStore.findById(horseId);
    return updated!;
  }

  async deleteHorse(user: AuthenticatedUser, horseId: number): Promise<{ success: boolean; message: string }> {
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
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh đại diện cho con ngựa');
    }

    const horse = await this.horsesStore.findById(horseId);
    if (!horse) {
      throw new NotFoundException(`Horse #${horseId} not found`);
    }

    if (user.role === UserRole.CUSTOMER && horse.ownerId !== Number(user.id)) {
      throw new ForbiddenException('Bạn chỉ có thể cập nhật ảnh cho ngựa thuộc tài khoản của bạn');
    }

    const photoUrl = `/uploads/horses/${file.filename}`;
    await this.horsesStore.update(horseId, { photoUrl });
    const updated = await this.horsesStore.findById(horseId);
    return updated!;
  }

  async uploadPhoto(file?: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh');
    }
    return {
      url: `/uploads/horses/${file.filename}`,
    };
  }
}
