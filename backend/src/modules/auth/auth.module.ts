import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import { MailService } from './mail.service';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthStore, MailService, RateLimitGuard],
  exports: [MailService],
})
export class AuthModule {}
