import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

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
  ],
})
export class AppModule {}
