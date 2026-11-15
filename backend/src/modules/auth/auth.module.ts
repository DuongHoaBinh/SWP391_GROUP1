import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import { MailService } from './mail.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'development-only-secret',
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '24h') as any },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthStore, MailService],
})
export class AuthModule {}
