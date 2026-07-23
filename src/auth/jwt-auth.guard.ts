import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private supabase: SupabaseClient;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {
    const url = this.configService.get<string>('app.supabaseUrl') ?? '';
    const anonKey = this.configService.get<string>('app.supabaseAnonKey') ?? '';
    this.supabase = createClient(url, anonKey);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid token');
    }

    const token = authHeader.split(' ')[1];
    const { data: { user: supabaseUser }, error } = await this.supabase.auth.getUser(token);

    if (error || !supabaseUser) {
      throw new UnauthorizedException(error?.message || 'Unauthorized');
    }

    const email = supabaseUser.email || supabaseUser.user_metadata?.email || '';
    const name =
      supabaseUser.user_metadata?.full_name ||
      supabaseUser.user_metadata?.name ||
      email.split('@')[0] ||
      'User';

    let user = await this.usersService.findById(supabaseUser.id);
    if (!user) {
      // Just-in-time provisioning of Supabase Auth users in our database
      user = await this.authService.createUserFromSupabase(
        supabaseUser.id,
        email,
        name,
      );
    }

    request.user = { id: user.id, email: user.email, plan: user.plan };
    return true;
  }
}
