import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HorsesModule } from './modules/horses/horses.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { RoutesModule } from './modules/routes/routes.module';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'development-only-secret',
      signOptions: { expiresIn: '1h' },
    }),
    AuthModule,
    OrdersModule,
    NotificationsModule,
    DocumentsModule,
    HorsesModule,
    FleetModule,
    RoutesModule,
  ],
})
export class AppModule {}
