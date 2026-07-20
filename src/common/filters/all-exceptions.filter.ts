import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        const nested =
          typeof body.message === 'object' && body.message !== null
            ? (body.message as Record<string, unknown>)
            : null;

        if (nested?.message && typeof nested.message === 'string') {
          message = nested.message;
          code = (nested.code as string | undefined) ?? code;
        } else if (typeof body.message === 'string') {
          message = body.message;
        }

        code = code ?? (body.code as string | undefined);
        if (Array.isArray(body.message)) {
          message = body.message.join(', ');
        }
      }
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(code ? { code } : {}),
    });
  }
}
