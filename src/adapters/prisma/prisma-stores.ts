import { Injectable } from '@nestjs/common';
import {
  AssistantMessage,
  AssistantThread,
  Consent,
  ConsentKind,
  HealthDailySample,
  NotificationPreferences,
  RegisterDeviceRequest,
  RoutineItem,
  RoutinePlan,
} from '../../contracts/api';
import {
  AssistantStore,
  AssistantThreadRecord,
  CheckInRecord,
  ConsentStore,
  DeleteRequestStore,
  DeviceRecord,
  DeviceStore,
  HealthStore,
  HealthSyncMeta,
  NotificationPreferencesStore,
  RefreshTokenRecord,
  RefreshTokenStore,
  RoutineStore,
  StoredRoutinePlan,
  WebhookEventStore,
} from '../../ports';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../fake/memory-stores';
import { PrismaService } from './prisma.service';

/** Stores persistidos no Postgres (tabelas em prisma/schema.prisma). */

@Injectable()
export class PrismaRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(record: RefreshTokenRecord): Promise<void> {
    await this.prisma.client.refreshToken.create({
      data: {
        tokenHash: record.tokenHash,
        customerId: record.customerId,
        deviceName: record.deviceName ?? null,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt ?? null,
        replacedBy: record.replacedBy ?? null,
      },
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.prisma.client.refreshToken.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return {
      tokenHash: row.tokenHash,
      customerId: row.customerId,
      deviceName: row.deviceName ?? undefined,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      replacedBy: row.replacedBy,
    };
  }

  async revoke(tokenHash: string, replacedBy?: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), replacedBy: replacedBy ?? null },
    });
  }

  async revokeAllForCustomer(customerId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

@Injectable()
export class PrismaDeviceStore implements DeviceStore {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: any): DeviceRecord {
    return {
      id: row.id,
      customerId: row.customerId,
      pushToken: row.pushToken,
      pushProvider: row.pushProvider ?? 'expo',
      platform: row.platform,
      appVersion: row.appVersion,
      deviceName: row.deviceName ?? undefined,
      createdAt: row.createdAt,
    };
  }

  async upsert(customerId: string, request: RegisterDeviceRequest): Promise<DeviceRecord> {
    const provider = request.pushProvider ?? 'expo';
    const row = await this.prisma.client.device.upsert({
      where: { customerId_pushToken: { customerId, pushToken: request.pushToken } },
      create: {
        customerId,
        pushToken: request.pushToken,
        pushProvider: provider,
        platform: request.platform,
        appVersion: request.appVersion,
        deviceName: request.deviceName ?? null,
      },
      update: {
        pushProvider: provider,
        platform: request.platform,
        appVersion: request.appVersion,
        deviceName: request.deviceName ?? null,
      },
    });
    return this.map(row);
  }

  async remove(customerId: string, deviceId: string): Promise<boolean> {
    const result = await this.prisma.client.device.deleteMany({
      where: { id: deviceId, customerId },
    });
    return result.count > 0;
  }

  async listByCustomer(customerId: string): Promise<DeviceRecord[]> {
    const rows = await this.prisma.client.device.findMany({ where: { customerId } });
    return rows.map((r: any) => this.map(r));
  }

  async removeAllForCustomer(customerId: string): Promise<void> {
    await this.prisma.client.device.deleteMany({ where: { customerId } });
  }
}

@Injectable()
export class PrismaNotificationPreferencesStore implements NotificationPreferencesStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(customerId: string): Promise<NotificationPreferences> {
    const row = await this.prisma.client.notificationPreference.findUnique({
      where: { customerId },
    });
    if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    return {
      billing: row.billing,
      shipping: row.shipping,
      renewal: row.renewal,
      marketing: row.marketing,
      routine: row.routine ?? true,
    };
  }

  async update(
    customerId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.get(customerId);
    const next = { ...current, ...patch };
    await this.prisma.client.notificationPreference.upsert({
      where: { customerId },
      create: { customerId, ...next },
      update: next,
    });
    return next;
  }
}

@Injectable()
export class PrismaWebhookEventStore implements WebhookEventStore {
  constructor(private readonly prisma: PrismaService) {}

  async register(source: string, externalId: string, payload?: unknown): Promise<boolean> {
    try {
      await this.prisma.client.webhookEvent.create({
        data: { source, externalId, payload: payload === undefined ? undefined : (payload as any) },
      });
      return true;
    } catch (err: any) {
      // P2002 = violação de unique (source, externalId) → evento repetido
      if (err?.code === 'P2002') return false;
      throw err;
    }
  }

  async markProcessed(source: string, externalId: string): Promise<void> {
    await this.prisma.client.webhookEvent.updateMany({
      where: { source, externalId },
      data: { processedAt: new Date() },
    });
  }
}

@Injectable()
export class PrismaDeleteRequestStore implements DeleteRequestStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, reason?: string): Promise<{ id: string }> {
    const row = await this.prisma.client.deleteRequest.create({
      data: { customerId, reason: reason ?? null },
    });
    return { id: row.id };
  }
}

@Injectable()
export class PrismaConsentStore implements ConsentStore {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: any): Consent {
    return {
      kind: row.kind,
      granted: row.granted,
      version: row.version,
      ...(row.grantedAt ? { grantedAt: row.grantedAt.toISOString() } : {}),
    };
  }

  async list(customerId: string): Promise<Consent[]> {
    const rows = await this.prisma.client.consent.findMany({ where: { customerId } });
    return rows.map((r: any) => this.map(r));
  }
  async get(customerId: string, kind: ConsentKind): Promise<Consent | null> {
    const row = await this.prisma.client.consent.findUnique({
      where: { customerId_kind: { customerId, kind } },
    });
    return row ? this.map(row) : null;
  }
  async upsert(customerId: string, consent: Consent): Promise<Consent> {
    const data = {
      granted: consent.granted,
      version: consent.version,
      grantedAt: consent.grantedAt ? new Date(consent.grantedAt) : null,
    };
    const row = await this.prisma.client.consent.upsert({
      where: { customerId_kind: { customerId, kind: consent.kind } },
      create: { customerId, kind: consent.kind, ...data },
      update: data,
    });
    return this.map(row);
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    await this.prisma.client.consent.deleteMany({ where: { customerId } });
  }
}

@Injectable()
export class PrismaRoutineStore implements RoutineStore {
  constructor(private readonly prisma: PrismaService) {}

  private mapPlan(row: any): StoredRoutinePlan {
    return {
      customerId: row.customerId,
      timezone: row.timezone,
      weeklyGoalDays: row.weeklyGoalDays,
      items: (row.items ?? []) as RoutineItem[],
      updatedAt: row.updatedAt,
    };
  }
  private mapCheckIn(row: any): CheckInRecord {
    return {
      id: row.id,
      customerId: row.customerId,
      routineItemId: row.routineItemId,
      date: row.date,
      doneAt: row.doneAt.toISOString(),
      source: row.source,
    };
  }

  async getPlan(customerId: string): Promise<StoredRoutinePlan | null> {
    const row = await this.prisma.client.routinePlan.findUnique({ where: { customerId } });
    return row ? this.mapPlan(row) : null;
  }
  async savePlan(customerId: string, plan: RoutinePlan): Promise<StoredRoutinePlan> {
    const data = {
      timezone: plan.timezone,
      weeklyGoalDays: plan.weeklyGoalDays,
      items: plan.items as any,
    };
    const row = await this.prisma.client.routinePlan.upsert({
      where: { customerId },
      create: { customerId, ...data },
      update: data,
    });
    return this.mapPlan(row);
  }
  async listPlansWithReminders(): Promise<StoredRoutinePlan[]> {
    // Os itens ficam em JSON; filtra em memória (volume pequeno; em produção o scheduler vai
    // para um worker com índice próprio).
    const rows = await this.prisma.client.routinePlan.findMany();
    return rows
      .map((r: any) => this.mapPlan(r))
      .filter((p: StoredRoutinePlan) => p.items.some((i) => i.reminderEnabled && i.reminderTime));
  }
  async addCheckIn(
    record: Omit<CheckInRecord, 'id'>,
  ): Promise<{ checkIn: CheckInRecord; created: boolean }> {
    const where = {
      customerId_routineItemId_date: {
        customerId: record.customerId,
        routineItemId: record.routineItemId,
        date: record.date,
      },
    };
    const existing = await this.prisma.client.routineCheckIn.findUnique({ where });
    if (existing) return { checkIn: this.mapCheckIn(existing), created: false };
    try {
      const row = await this.prisma.client.routineCheckIn.create({
        data: {
          customerId: record.customerId,
          routineItemId: record.routineItemId,
          date: record.date,
          doneAt: new Date(record.doneAt),
          source: record.source,
        },
      });
      return { checkIn: this.mapCheckIn(row), created: true };
    } catch (err: any) {
      // Corrida entre dois toques: o unique garante um só registro.
      if (err?.code === 'P2002') {
        const row = await this.prisma.client.routineCheckIn.findUnique({ where });
        return { checkIn: this.mapCheckIn(row), created: false };
      }
      throw err;
    }
  }
  async removeCheckIn(customerId: string, checkInId: string): Promise<boolean> {
    const result = await this.prisma.client.routineCheckIn.deleteMany({
      where: { id: checkInId, customerId },
    });
    return result.count > 0;
  }
  async listCheckIns(customerId: string, fromDate?: string): Promise<CheckInRecord[]> {
    const rows = await this.prisma.client.routineCheckIn.findMany({
      where: { customerId, ...(fromDate ? { date: { gte: fromDate } } : {}) },
      orderBy: { date: 'asc' },
    });
    return rows.map((r: any) => this.mapCheckIn(r));
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    await this.prisma.client.routineCheckIn.deleteMany({ where: { customerId } });
    await this.prisma.client.routinePlan.deleteMany({ where: { customerId } });
  }
}

@Injectable()
export class PrismaHealthStore implements HealthStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsertSamples(customerId: string, samples: HealthDailySample[]): Promise<void> {
    await this.prisma.client.$transaction(
      samples.map((s) =>
        this.prisma.client.healthDailySample.upsert({
          where: { customerId_date_metric: { customerId, date: s.date, metric: s.metric } },
          create: {
            customerId,
            date: s.date,
            metric: s.metric,
            value: s.value,
            source: s.source ?? null,
          },
          update: { value: s.value, source: s.source ?? null },
        }),
      ),
    );
  }
  async listSamples(
    customerId: string,
    fromDate: string,
    toDate: string,
  ): Promise<HealthDailySample[]> {
    const rows = await this.prisma.client.healthDailySample.findMany({
      where: { customerId, date: { gte: fromDate, lte: toDate } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r: any) => ({
      date: r.date,
      metric: r.metric,
      value: r.value,
      ...(r.source ? { source: r.source } : {}),
    }));
  }
  async saveSyncMeta(customerId: string, meta: HealthSyncMeta): Promise<void> {
    const data = { provider: meta.provider ?? null, lastSyncAt: meta.lastSyncAt };
    await this.prisma.client.healthSync.upsert({
      where: { customerId },
      create: { customerId, ...data },
      update: data,
    });
  }
  async getSyncMeta(customerId: string): Promise<HealthSyncMeta | null> {
    const row = await this.prisma.client.healthSync.findUnique({ where: { customerId } });
    if (!row) return null;
    return { ...(row.provider ? { provider: row.provider } : {}), lastSyncAt: row.lastSyncAt };
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    await this.prisma.client.healthDailySample.deleteMany({ where: { customerId } });
    await this.prisma.client.healthSync.deleteMany({ where: { customerId } });
  }
}

@Injectable()
export class PrismaAssistantStore implements AssistantStore {
  constructor(private readonly prisma: PrismaService) {}

  private mapMessage(row: any): AssistantMessage {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private mapThread(row: any, messages: any[] = []): AssistantThreadRecord {
    return {
      id: row.id,
      customerId: row.customerId,
      ...(row.title ? { title: row.title } : {}),
      messages: messages.map((m) => this.mapMessage(m)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listThreads(customerId: string): Promise<AssistantThread[]> {
    const rows = await this.prisma.client.assistantThread.findMany({
      where: { customerId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r: any) => {
      const { customerId: _c, ...pub } = this.mapThread(r);
      return pub;
    });
  }
  async getThread(customerId: string, threadId: string): Promise<AssistantThreadRecord | null> {
    const row = await this.prisma.client.assistantThread.findFirst({
      where: { id: threadId, customerId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? this.mapThread(row, row.messages) : null;
  }
  async createThread(
    customerId: string,
    title: string | undefined,
    now: Date,
  ): Promise<AssistantThreadRecord> {
    const row = await this.prisma.client.assistantThread.create({
      data: { customerId, title: title ?? null, createdAt: now, updatedAt: now },
    });
    return this.mapThread(row);
  }
  async appendMessages(
    customerId: string,
    threadId: string,
    messages: AssistantMessage[],
  ): Promise<AssistantThreadRecord> {
    await this.prisma.client.assistantMessage.createMany({
      data: messages.map((m) => ({
        id: m.id,
        threadId,
        customerId,
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt),
      })),
    });
    const last = messages[messages.length - 1];
    await this.prisma.client.assistantThread.update({
      where: { id: threadId },
      data: { updatedAt: last ? new Date(last.createdAt) : new Date() },
    });
    const thread = await this.getThread(customerId, threadId);
    if (!thread) throw new Error('thread não encontrada');
    return thread;
  }
  async deleteThread(customerId: string, threadId: string): Promise<boolean> {
    const result = await this.prisma.client.assistantThread.deleteMany({
      where: { id: threadId, customerId },
    });
    return result.count > 0;
  }
  async countUserMessagesBetween(customerId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.client.assistantMessage.count({
      where: { customerId, role: 'user', createdAt: { gte: from, lt: to } },
    });
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    await this.prisma.client.assistantThread.deleteMany({ where: { customerId } });
  }
}
