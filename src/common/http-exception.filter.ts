import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiError } from '../contracts/api';

/** Converte toda exceção para `{code, message, details?}` com o HTTP adequado. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.normalize(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(status).json(body);
  }

  private normalize(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload && 'code' in payload) {
        const p = payload as ApiError;
        return {
          status,
          body: {
            code: p.code,
            message: p.message,
            ...(p.details !== undefined ? { details: p.details } : {}),
          },
        };
      }
      // Exceções padrão do Nest (ValidationPipe, NotFound de rota, Throttler…)
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      const details = Array.isArray(message) ? message : undefined;
      return {
        status,
        body: {
          code: DEFAULT_CODES[status] ?? 'HTTP_ERROR',
          message: Array.isArray(message) ? 'Dados inválidos.' : String(message),
          ...(details ? { details } : {}),
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' },
    };
  }
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  501: 'NOT_IMPLEMENTED',
};
