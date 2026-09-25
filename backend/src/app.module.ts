import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'development-only-secret',
      signOptions: { expiresIn: '1h' },
    }),
    AuthModule,
  ],
})
export class AppModule {}
