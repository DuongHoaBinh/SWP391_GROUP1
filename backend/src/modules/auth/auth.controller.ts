import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 10, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:register' })
  @ApiOperation({ summary: 'Start customer registration and send OTP' })
  @ApiBody({ type: RegisterDto })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-otp')
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 15, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:verify-otp' })
  @ApiOperation({ summary: 'Verify OTP and create the customer account' })
  @ApiBody({ type: VerifyOtpDto })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 20, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:login' })
  @ApiOperation({ summary: 'Log in a verified customer or pre-provisioned staff account' })
  @ApiBody({ type: LoginDto })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:forgot-password' })
  @ApiOperation({ summary: 'Send a 6-digit OTP to reset account password' })
  @ApiBody({ type: ForgotPasswordDto })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 10, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:reset-password' })
  @ApiOperation({ summary: 'Verify reset OTP and set a new password' })
  @ApiBody({ type: ResetPasswordDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('google')
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 20, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:google' })
  @ApiOperation({ summary: 'Log in or auto-register a customer via Google OAuth' })
  @ApiBody({ type: GoogleLoginDto })
  loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile (full name, phone, address, avatar)' })
  @ApiBody({ type: UpdateProfileDto })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for logged-in user' })
  @ApiBody({ type: ChangePasswordDto })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }
}
