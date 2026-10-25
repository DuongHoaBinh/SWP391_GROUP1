import { Module } from '@nestjs/common';
import { HorsesController } from './horses.controller';
import { HorsesService } from './horses.service';
import { HorsesStore } from './horses.store';

@Module({
  controllers: [HorsesController],
  providers: [HorsesService, HorsesStore],
  exports: [HorsesService, HorsesStore],
})
export class HorsesModule {}
