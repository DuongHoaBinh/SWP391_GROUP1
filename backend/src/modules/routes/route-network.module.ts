import { Module } from '@nestjs/common';
import { DistanceModule } from './distance.module';
import { RouteNetworkService } from './route-network.service';
import { RouteNetworkStore } from './route-network.store';

/** Mạng lưới vận tải + bộ lập tuyến, dùng chung cho routes (bản đồ) và orders (báo giá). */
@Module({
  imports: [DistanceModule],
  providers: [RouteNetworkStore, RouteNetworkService],
  exports: [RouteNetworkService],
})
export class RouteNetworkModule {}
