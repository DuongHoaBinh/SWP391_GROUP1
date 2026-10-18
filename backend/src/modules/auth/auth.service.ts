import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
      user: { id: userId, email, role: user.role },
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
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName || '',
        name: user.fullName || user.email.split('@')[0],
        phone: user.phone || '',
        address: user.address || '',
        avatarUrl: user.avatarUrl || '',
        specialization: user.specialization ?? null,
        persona: user.specialization || (user.email.includes('escort') ? 'escort' : 'driver'),
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.authStore.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName || '',
      name: user.fullName || user.email.split('@')[0],
      phone: user.phone || '',
      address: user.address || '',
      avatarUrl: user.avatarUrl || '',
      specialization: user.specialization ?? null,
      persona: user.specialization || (user.email.includes('escort') ? 'escort' : 'driver'),
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updated = await this.authStore.updateUserProfile(userId, dto);
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'Profile updated successfully',
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        fullName: updated.fullName || '',
        name: updated.fullName || updated.email.split('@')[0],
        phone: updated.phone || '',
        address: updated.address || '',
        avatarUrl: updated.avatarUrl || '',
        createdAt: updated.createdAt,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại');
    }

    const user = await this.authStore.findUserById(userId);
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.authStore.updateUserPassword(userId, newHash);

    return {
      message: 'Mật khẩu đã được thay đổi thành công',
    };
  }
}
