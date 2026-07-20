import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const clientId = this.configService.get<string>('app.googleClientId');
    const clientSecret = this.configService.get<string>('app.googleClientSecret');
    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }
    return super.canActivate(context);
  }
}
