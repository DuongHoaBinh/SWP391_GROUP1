import { BadRequestException } from '@nestjs/common';

export function assertRoadCapacity(horseCount: number, vehicleIds: number[], vehicles: Array<{ id: number; capacity: number }>) {
  if (!Number.isSafeInteger(horseCount) || horseCount < 1) throw new BadRequestException('Số ngựa của đơn không hợp lệ');
  for (const id of new Set(vehicleIds)) {
    const vehicle = vehicles.find(v => Number(v.id) === id);
    if (!vehicle || Number(vehicle.capacity) < horseCount) {
      throw new BadRequestException('Phương tiện của mỗi chặng phải có đủ ô chuồng cho toàn bộ số ngựa của đơn');
    }
  }
}
