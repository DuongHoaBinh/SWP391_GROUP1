import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthStore } from './auth.store';
import {
  AuthUser,
  hasLocalPasswordHash,
  PendingRegistration,
  UserRole,
} from './auth.types';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  private readonly otpTtlMs = 10 * 60 * 1000;
  private readonly maxOtpAttempts = 5;
  private readonly otpAttempts = new Map<string, number>();
  private readonly googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private readonly authStore: AuthStore,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private resolvePersona(user: AuthUser): 'driver' | 'escort' | null {
    if (user.role !== UserRole.DRIVER_ESCORT) {
      return null;
    }
    if (user.specialization === 'escort' || user.email.toLowerCase().includes('escort')) {
      return 'escort';
    }
    return 'driver';
  }

  private assertActiveAccount(user: AuthUser): void {
    if (user.status && user.status !== 'active') {
      throw new UnauthorizedException(
        'Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa. Vui lòng liên hệ quản trị viên.',
      );
    }
  }

  private hasLocalPassword(user: AuthUser): boolean {
    return user.hasPassword ?? hasLocalPasswordHash(user.passwordHash);
  }

  private buildUserResponse(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName || '',
      name: user.fullName || user.email.split('@')[0],
      phone: user.phone || '',
      address: user.address || '',
      avatarUrl: user.avatarUrl || '',
      authProvider: user.authProvider ?? 'local',
      hasPassword: this.hasLocalPassword(user),
      specialization: user.specialization ?? null,
      persona: this.resolvePersona(user),
    };
  }

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
    this.otpAttempts.delete(`reg:${email}`);
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
    const attemptKey = `reg:${email}`;
    const pending = await this.authStore.findPending(email);
    if (!pending || pending.expiresAt < Date.now()) {
      await this.authStore.deletePending(email);
      this.otpAttempts.delete(attemptKey);
      throw new BadRequestException('OTP is invalid or expired');
    }

    if (pending.otp !== dto.otp) {
      const nextAttempts = (this.otpAttempts.get(attemptKey) ?? 0) + 1;
      if (nextAttempts >= this.maxOtpAttempts) {
        await this.authStore.deletePending(email);
        this.otpAttempts.delete(attemptKey);
        throw new BadRequestException(
          'Bạn đã nhập sai OTP quá nhiều lần. Vui lòng yêu cầu mã OTP mới.',
        );
      }
      this.otpAttempts.set(attemptKey, nextAttempts);
      throw new BadRequestException('OTP is invalid or expired');
    }

    this.otpAttempts.delete(attemptKey);
    const user: AuthUser = {
      id: randomUUID(),
      email,
      passwordHash: pending.passwordHash,
      role: UserRole.CUSTOMER,
      emailVerified: true,
      status: 'active',
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

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.authStore.findUser(email);

    const genericMessage =
      'Nếu email này tồn tại trong hệ thống, mã OTP khôi phục mật khẩu đã được gửi tới hộp thư của bạn.';

    if (!user || (user.status && user.status !== 'active')) {
      return { message: genericMessage, email };
    }

    const otp = randomInt(100000, 1000000).toString();
    this.otpAttempts.delete(`reset:${email}`);
    await this.authStore.savePasswordResetOtp(
      email,
      Number(user.id),
      otp,
      Date.now() + this.otpTtlMs,
    );
    await this.mailService.sendPasswordResetOtp(email, otp);

    const response: { message: string; email: string; developmentOtp?: string } = {
      message: genericMessage,
      email,
    };
    if (process.env.NODE_ENV !== 'production' && process.env.AUTH_EXPOSE_DEV_OTP === 'true') {
      response.developmentOtp = otp;
    }
    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const attemptKey = `reset:${email}`;
    const record = await this.authStore.findPasswordResetOtp(email);
    if (!record || record.expiresAt < Date.now()) {
      await this.authStore.deletePasswordResetOtp(email);
      this.otpAttempts.delete(attemptKey);
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    if (record.otp !== dto.otp.trim()) {
      const nextAttempts = (this.otpAttempts.get(attemptKey) ?? 0) + 1;
      if (nextAttempts >= this.maxOtpAttempts) {
        await this.authStore.deletePasswordResetOtp(email);
        this.otpAttempts.delete(attemptKey);
        throw new BadRequestException(
          'Bạn đã nhập sai OTP quá 5 lần. Vui lòng yêu cầu cấp lại mã mới.',
        );
      }
      this.otpAttempts.set(attemptKey, nextAttempts);
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.authStore.findUser(email);
    if (!user) {
      throw new NotFoundException('Tài khoản không tồn tại');
    }
    this.assertActiveAccount(user);

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.authStore.updateUserPassword(user.id, newHash);
    await this.authStore.completePasswordResetOtp(email);
    this.otpAttempts.delete(attemptKey);

    return {
      message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.',
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.authStore.findUser(email);
    if (
      !user ||
      !this.hasLocalPassword(user) ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    this.assertActiveAccount(user);
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
      user: this.buildUserResponse(user),
    };
  }

  async getProfile(userId: string) {
    const user = await this.authStore.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    this.assertActiveAccount(user);
    return {
      ...this.buildUserResponse(user),
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
        ...this.buildUserResponse(updated),
        createdAt: updated.createdAt,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const user = await this.authStore.findUserById(userId);
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    const userHasPassword = this.hasLocalPassword(user);
    if (userHasPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại');
      }
      if (dto.currentPassword === dto.newPassword) {
        throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại');
      }
      const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!isMatch) {
        throw new BadRequestException('Mật khẩu hiện tại không chính xác');
      }
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.authStore.updateUserPassword(userId, newHash);

    return {
      message: userHasPassword
        ? 'Mật khẩu đã được thay đổi thành công'
        : 'Thiết lập mật khẩu thành công. Bạn có thể đăng nhập bằng Email/Mật khẩu hoặc Google.',
      hasPassword: true,
    };
  }

  async verifyGoogleToken(token: string): Promise<{
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw new UnauthorizedException(
        'Đăng nhập Google chưa được cấu hình (GOOGLE_CLIENT_ID).',
      );
    }

    // 1. Try verifying as Google ID Token (JWT)
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (payload && payload.email && payload.email_verified === true) {
        return {
          googleId: payload.sub,
          email: payload.email.toLowerCase(),
          name: payload.name || payload.email.split('@')[0],
          picture: payload.picture,
        };
      }
    } catch {
      // Fallback to access_token verification with audience check
    }

    // 2. Verify OAuth access_token via Google tokeninfo (strict aud/azp & email_verified check)
    try {
      const infoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      );
      if (infoRes.ok) {
        const info = (await infoRes.json()) as {
          aud?: string;
          azp?: string;
          sub?: string;
          email?: string;
          email_verified?: string | boolean;
        };
        const matchesClient = info.aud === clientId || info.azp === clientId;
        const verified =
          info.email_verified === true || info.email_verified === 'true';

        if (matchesClient && verified && info.email) {
          const userInfoRes = await fetch(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (userInfoRes.ok) {
            const profile = (await userInfoRes.json()) as {
              sub?: string;
              email?: string;
              email_verified?: boolean;
              name?: string;
              picture?: string;
            };
            if (profile.email && profile.email_verified !== false) {
              return {
                googleId: profile.sub || info.sub || '',
                email: profile.email.toLowerCase(),
                name: profile.name || profile.email.split('@')[0],
                picture: profile.picture,
              };
            }
          }
        }
      }
    } catch {
      // Fall through to unauthorized exception
    }

    throw new UnauthorizedException(
      'Token xác thực Google không hợp lệ, chưa xác minh email hoặc đã hết hạn',
    );
  }

  async loginWithGoogle(dto: GoogleLoginDto) {
    const rawToken = dto.token?.trim() || '';
    if (!rawToken) {
      throw new BadRequestException('Token Google không được để trống');
    }

    const googleInfo = await this.verifyGoogleToken(rawToken);
    const user = await this.authStore.findOrCreateGoogleUser(googleInfo);
    this.assertActiveAccount(user);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: this.buildUserResponse(user),
    };
  }
}
