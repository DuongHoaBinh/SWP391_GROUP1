import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AuthStore } from './auth.store';
import { AuthUser, PendingRegistration, UserRole } from './auth.types';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  private readonly otpTtlMs = 10 * 60 * 1000;

  constructor(
    private readonly authStore: AuthStore,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }
    if (await this.authStore.findUser(email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const otp = randomInt(100000, 1000000).toString();
    const pending: PendingRegistration = {
      otpId: 0,
      email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      otp,
      expiresAt: Date.now() + this.otpTtlMs,
      createdAt: new Date().toISOString(),
    };
    await this.authStore.savePending(pending);
    await this.mailService.sendRegistrationOtp(email, otp);
    const response: { message: string; email: string; developmentOtp?: string } = {
      message: 'Registration started. Verify the OTP sent to your email.',
      email,
    };
    if (process.env.NODE_ENV !== 'production' && process.env.AUTH_EXPOSE_DEV_OTP === 'true') {
      response.developmentOtp = otp;
    }
    return response;
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.trim().toLowerCase();
    const pending = await this.authStore.findPending(email);
    if (!pending || pending.expiresAt < Date.now()) {
      await this.authStore.deletePending(email);
      throw new BadRequestException('OTP is invalid or expired');
    }
    if (pending.otp !== dto.otp) {
      throw new BadRequestException('OTP is invalid or expired');
    }

    const user: AuthUser = {
      id: randomUUID(),
      email,
      fullName: email,
      passwordHash: pending.passwordHash,
      role: UserRole.CUSTOMER,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    };
    const userId = await this.authStore.addUserFromRecord(user);
    await this.authStore.completePending(email, userId);

    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      email,
      role: user.role,
    });

    return {
      message: 'Registration completed. You can now log in.',
      email,
      accessToken,
      user: { id: userId, email, fullName: user.fullName, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.authStore.findUser(email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email address has not been verified');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }
}
