import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MailService } from './mail.service';
import { GoogleStrategy } from './google.strategy';
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
          expiresIn: (config.get<string>('app.jwtExpiresIn') ??
            '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService, GoogleStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
