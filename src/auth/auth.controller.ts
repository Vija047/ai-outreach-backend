import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  ResendSignupOtpDto,
  SendSignupOtpDto,
  UpdateAccountDto,
  VerifySignupOtpDto,
} from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthUserPayload,
} from '../common/decorators/current-user.decorator';
import { GoogleAuthGuard } from './google-auth.guard';
import type { GoogleProfile } from './google.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup/send-otp')
  sendSignupOtp(@Body() dto: SendSignupOtpDto) {
    return this.authService.sendSignupOtp(dto);
  }

  @Public()
  @Post('signup/resend-otp')
  resendSignupOtp(@Body() dto: ResendSignupOtpDto) {
    return this.authService.resendSignupOtp(dto);
  }

  @Public()
  @Post('signup/verify-otp')
  verifySignupOtp(@Body() dto: VerifySignupOtpDto) {
    return this.authService.verifySignupOtp(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
    if (!this.authService.isGoogleAuthConfigured()) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    try {
      if (!req.user) {
        return res.redirect(
          this.authService.buildGoogleErrorRedirect('Google sign-in failed'),
        );
      }
      const result = await this.authService.googleLogin(req.user);
      return res.redirect(
        this.authService.buildGoogleCallbackRedirect(result.accessToken),
      );
    } catch {
      return res.redirect(
        this.authService.buildGoogleErrorRedirect('Google sign-in failed'),
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
