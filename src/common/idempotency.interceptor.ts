import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, of, tap } from 'rxjs';
import { AuthenticatedCustomer } from './decorators';

interface StoredResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

const TTL_MS = 10 * 60_000;

/**
 * Suporte a `Idempotency-Key` em POST/PATCH/DELETE sob /me: a mesma chave para o mesmo cliente
 * dentro de 10 minutos devolve a resposta armazenada sem reexecutar a ação.
 * Armazenamento em memória (uma instância); em produção com várias réplicas trocar por Redis.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly cache = new Map<string, StoredResponse>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { customer?: AuthenticatedCustomer }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header('idempotency-key');
    const mutating = ['POST', 'PATCH', 'DELETE'].includes(req.method);
    if (!key || !mutating || !req.customer || !req.path.includes('/me')) return next.handle();

    this.sweep();
    const cacheKey = `${req.customer.customerId}:${req.method}:${req.path}:${key}`;
    const stored = this.cache.get(cacheKey);
    if (stored) {
      res.status(stored.status);
      res.setHeader('Idempotent-Replayed', 'true');
      return of(stored.body);
    }

    return next.handle().pipe(
      tap((body) => {
        this.cache.set(cacheKey, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
      }),
    );
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.cache) if (v.expiresAt < now) this.cache.delete(k);
  }
}
