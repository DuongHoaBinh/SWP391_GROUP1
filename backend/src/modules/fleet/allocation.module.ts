import { Module } from '@nestjs/common';
import { AllocationStore } from './allocation.store';
import { AllocationService } from './allocation.service';

/**
 * Phân bổ xe, giờ cấm đô thị, cấu hình hệ thống (Step 9). Không import module khác để OrdersModule
 * (báo giá, tạo đơn) dùng được mà không tạo vòng phụ thuộc với FleetModule.
 */
@Module({
  providers: [AllocationStore, AllocationService],
  exports: [AllocationStore, AllocationService],
})
export class AllocationModule {}
