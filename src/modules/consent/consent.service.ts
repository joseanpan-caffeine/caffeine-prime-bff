import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { Env, ENV } from '../../config/env';
import { Consent, ConsentKind, UpdateConsentRequest } from '../../contracts/api';
import { CLOCK, Clock, CONSENT_STORE, ConsentStore } from '../../ports';

/**
 * Consentimentos LGPD (docs/contexto-prime.md §9: mínimo necessário, consentimento explícito para
 * push e para dados de saúde e hábito da frente 2). A versão vigente de cada termo vem da env; o
 * consentimento só vale se foi dado nessa versão.
 */
@Injectable()
export class ConsentService {
  constructor(
    @Inject(CONSENT_STORE) private readonly store: ConsentStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  currentVersion(kind: ConsentKind): string {
    return this.env.consentVersions[kind];
  }

  /** Lista todos os tipos: os não respondidos aparecem como `granted: false` na versão vigente. */
  async list(customerId: string): Promise<Consent[]> {
    const stored = await this.store.list(customerId);
    return (Object.keys(this.env.consentVersions) as ConsentKind[]).map((kind) => {
      const c = stored.find((s) => s.kind === kind);
      return c ?? { kind, granted: false, version: this.currentVersion(kind) };
    });
  }

  async update(customerId: string, request: UpdateConsentRequest): Promise<Consent> {
    const required = this.currentVersion(request.kind);
    if (request.version !== required) {
      throw AppError.unprocessable(
        'CONSENT_VERSION_OUTDATED',
        'A versão do termo não é a vigente. Atualize o app e tente de novo.',
        { kind: request.kind, requiredVersion: required },
      );
    }
    const consent: Consent = {
      kind: request.kind,
      granted: request.granted,
      version: request.version,
      ...(request.granted ? { grantedAt: this.clock.now().toISOString() } : {}),
    };
    return this.store.upsert(customerId, consent);
  }

  async isGranted(customerId: string, kind: ConsentKind): Promise<boolean> {
    const c = await this.store.get(customerId, kind);
    return Boolean(c && c.granted && c.version === this.currentVersion(kind));
  }

  async assertGranted(customerId: string, kind: ConsentKind): Promise<void> {
    if (!(await this.isGranted(customerId, kind))) {
      throw AppError.consentRequired(kind, this.currentVersion(kind));
    }
  }
}
