import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ConsentKind } from '../contracts/api';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marca uma rota como acessível sem access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedCustomer {
  customerId: string;
  sessionId?: string;
}

/** Injeta o cliente autenticado (extraído do JWT pelo AuthGuard). */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
    const req = ctx.switchToHttp().getRequest();
    return req.customer as AuthenticatedCustomer;
  },
);

export type OwnedResourceKind =
  | 'bill'
  | 'paymentProfile'
  | 'device'
  | 'subscriptionItem'
  | 'checkIn'
  | 'assistantThread';

export const OWNED_RESOURCE_KEY = 'ownedResource';
export interface OwnedResourceMeta {
  kind: OwnedResourceKind;
  param: string;
}
/**
 * Declara que o parâmetro de rota `param` identifica um recurso que precisa pertencer ao cliente
 * logado. O OwnershipGuard devolve 403 quando não pertence (ou não existe).
 */
export const OwnedResource = (kind: OwnedResourceKind, param: string) =>
  SetMetadata<string, OwnedResourceMeta>(OWNED_RESOURCE_KEY, { kind, param });

export const REQUIRES_CONSENT_KEY = 'requiresConsent';
export interface RequiresConsentMeta {
  kind: ConsentKind;
  /** Feature flag (env) que precisa estar ligada; desligada → 404 FEATURE_DISABLED. */
  feature?: 'routine' | 'health' | 'assistant';
}
/**
 * Exige que o cliente tenha concedido o consentimento `kind` na versão vigente
 * (`AppConfig.consentVersions`). Caso contrário o ConsentGuard devolve 403 `CONSENT_REQUIRED`
 * com `details.kind`. Pode ser aplicado ao controller inteiro ou a um handler.
 */
export const RequiresConsent = (kind: ConsentKind, feature?: RequiresConsentMeta['feature']) =>
  SetMetadata<string, RequiresConsentMeta>(REQUIRES_CONSENT_KEY, { kind, feature });
