import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

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

export type OwnedResourceKind = 'bill' | 'paymentProfile' | 'device' | 'subscriptionItem';

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
