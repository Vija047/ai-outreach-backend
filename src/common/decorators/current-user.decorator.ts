import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export class AuthUserPayload {
  id: string;
  email: string;
  plan: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUserPayload }>();
    return request.user;
  },
);
