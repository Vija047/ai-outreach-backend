import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleAuthGuard } from './google-auth.guard';
import { GoogleStrategy } from './google.strategy';
import { OtpService } from './otp.service';
import { EmailService } from './email.service';
import { UsersModule } from '../users/users.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [
    UsersModule,
    CreditsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwtSecret') ?? 'change-me',
        signOptions: {
          expiresIn: (config.get<string>('app.jwtExpiresIn') ?? '7d') as '7d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    GoogleAuthGuard,
    OtpService,
    EmailService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
