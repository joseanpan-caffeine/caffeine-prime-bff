import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Env, ENV } from '../config/env';

/** ThrottlerGuard que pode ser desligado por env (testes) e usa X-Forwarded-For atrás do Cloud Run. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  @Inject(ENV) private readonly env: Env;

  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return this.env.throttleDisabled;
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = (req.headers?.['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
    return forwarded || req.ip || 'unknown';
  }
}
