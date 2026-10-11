import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Conexão Prisma com o Postgres do BFF. Só é instanciada quando `DATABASE_URL` está definido.
 * Rode `npm run prisma:generate` após alterar `prisma/schema.prisma`.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: PrismaClient;

  constructor(databaseUrl: string) {
    this.client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  }

  async onModuleInit() {
    await this.client.$connect();
    this.logger.log('Conectado ao Postgres');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
