import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const clientID =
      configService.get<string>('app.googleClientId') || 'not-configured';
    const clientSecret =
      configService.get<string>('app.googleClientSecret') || 'not-configured';

    super({
      clientID,
      clientSecret,
      callbackURL:
        configService.get<string>('app.googleCallbackUrl') ??
        'http://localhost:3001/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account has no email'), undefined);
      return;
    }

    done(null, {
      googleId: profile.id,
      email: email.toLowerCase(),
      name: profile.displayName || email.split('@')[0],
    } satisfies GoogleProfile);
  }
}
