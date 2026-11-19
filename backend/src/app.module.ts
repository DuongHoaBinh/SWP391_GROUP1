import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HorsesModule } from './modules/horses/horses.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { RoutesModule } from './modules/routes/routes.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { ReportsModule } from './modules/reports/reports.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { HealthController } from './modules/health/health.controller';
import { ShipmentLifecycleModule } from './common/shipment-lifecycle';
import { DatabaseModule } from './common/database/database.module';
import { getJwtExpiresIn, getJwtSecret } from './common/config/jwt.config';

@Module({
  imports: [
    DatabaseModule,
    ShipmentLifecycleModule,
    JwtModule.register({
      global: true,
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() as any },
    }),
    AuthModule,
    OrdersModule,
    NotificationsModule,
    DocumentsModule,
    HorsesModule,
    FleetModule,
    RoutesModule,
    TrackingModule,
    ReportsModule,
    IncidentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
