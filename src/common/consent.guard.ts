import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Env, ENV } from '../config/env';
import { ConsentService } from '../modules/consent/consent.service';
import { AuthenticatedCustomer, REQUIRES_CONSENT_KEY, RequiresConsentMeta } from './decorators';
import { AppError } from './errors';

/**
 * Lê `@RequiresConsent(kind, feature?)` (handler ou controller) e bloqueia com 403
 * `CONSENT_REQUIRED` quando o cliente não concedeu o consentimento na versão vigente. Feature
 * desligada por env → 404 `FEATURE_DISABLED`. Roda depois do AuthGuard.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly consents: ConsentService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequiresConsentMeta | undefined>(
      REQUIRES_CONSENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;
    if (meta.feature && !this.env.features[meta.feature]) {
      throw AppError.notFound('FEATURE_DISABLED', 'Este recurso não está disponível.');
    }
    const req = context.switchToHttp().getRequest();
    const customer = req.customer as AuthenticatedCustomer | undefined;
    if (!customer) throw AppError.unauthorized();
    await this.consents.assertGranted(customer.customerId, meta.kind);
    return true;
  }
}
