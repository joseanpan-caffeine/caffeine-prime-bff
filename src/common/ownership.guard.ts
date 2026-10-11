import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedCustomer, OWNED_RESOURCE_KEY, OwnedResourceMeta } from './decorators';
import { AppError } from './errors';
import { OwnershipService } from './ownership.service';

/**
 * Lê `@OwnedResource(kind, param)` do handler e confere que o id do parâmetro pertence ao
 * cliente autenticado. Deve rodar depois do AuthGuard (ordem dos APP_GUARDs no AppModule).
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ownership: OwnershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<OwnedResourceMeta | undefined>(
      OWNED_RESOURCE_KEY,
      context.getHandler(),
    );
    if (!meta) return true;
    const req = context.switchToHttp().getRequest();
    const customer = req.customer as AuthenticatedCustomer | undefined;
    if (!customer) throw AppError.unauthorized();
    const id = req.params?.[meta.param];
    if (!id) throw AppError.badRequest('MISSING_PARAM', `Parâmetro ${meta.param} ausente.`);
    await this.ownership.assertOwns(meta.kind, customer.customerId, String(id));
    return true;
  }
}
