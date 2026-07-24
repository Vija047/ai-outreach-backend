import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthUserPayload,
} from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  UpdateAccountDto,
} from './dto/auth.dto';
import { GoogleAuthGuard } from './google-auth.guard';

interface GoogleProfile {
  email: string;
  name: string;
  avatarUrl?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** Alias for register — frontend legacy path */
  @Public()
  @Post('signup')
  signup(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Passport redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request & { user?: GoogleProfile },
    @Res() res: Response,
  ) {
    const profile = req.user;
    const frontend =
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:3000';

    if (!profile?.email) {
      res.redirect(
        `${frontend.replace(/\/$/, '')}/login?error=${encodeURIComponent('Google sign-in failed')}`,
      );
      return;
    }

    try {
      const result = await this.authService.upsertGoogleUser(profile);
      res.redirect(
        `${frontend.replace(/\/$/, '')}/auth/callback?token=${result.accessToken}`,
      );
    } catch {
      res.redirect(
        `${frontend.replace(/\/$/, '')}/login?error=${encodeURIComponent('Google sign-in failed')}`,
      );
    }
  }

  @ApiBearerAuth()
  @Get('me')
  getMe(@CurrentUser() user: AuthUserPayload) {
    return this.authService.getMe(user.id);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.authService.updateMe(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('logout')
  logout() {
    return this.authService.logout();
  }
}
