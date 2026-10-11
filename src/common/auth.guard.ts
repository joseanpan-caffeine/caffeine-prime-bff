import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppError } from './errors';
import { IS_PUBLIC_KEY } from './decorators';

export interface AccessTokenPayload {
  sub: string; // shopifyCustomerId
  sid?: string; // id da sessão (hash curto do refresh token)
  typ: 'access';
}

/** Guard global: exige `Authorization: Bearer <accessToken>` exceto em rotas `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { customer?: unknown }>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token)
      throw AppError.unauthorized('MISSING_TOKEN', 'Token de acesso ausente.');

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      if (payload.typ !== 'access' || !payload.sub) throw new Error('tipo inválido');
      req.customer = { customerId: payload.sub, sessionId: payload.sid };
      return true;
    } catch {
      throw AppError.unauthorized('INVALID_TOKEN', 'Token de acesso inválido ou expirado.');
    }
  }
}
