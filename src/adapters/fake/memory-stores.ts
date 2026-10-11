import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AssistantMessage,
  AssistantThread,
  Consent,
  ConsentKind,
  HealthDailySample,
  NotificationPreferences,
  RegisterDeviceRequest,
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

/**
 * Stores em memória, usados quando `DATABASE_URL` não está definido.
 * Mesma semântica dos stores Prisma, sem persistência entre reinícios.
 */

@Injectable()
export class MemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly tokens = new Map<string, RefreshTokenRecord>();

  async save(record: RefreshTokenRecord): Promise<void> {
    this.tokens.set(record.tokenHash, { ...record });
  }
  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const r = this.tokens.get(tokenHash);
    return r ? { ...r } : null;
  }
  async revoke(tokenHash: string, replacedBy?: string): Promise<void> {
    const r = this.tokens.get(tokenHash);
    if (r) {
      r.revokedAt = new Date();
      if (replacedBy) r.replacedBy = replacedBy;
    }
  }
  async revokeAllForCustomer(customerId: string): Promise<void> {
    for (const r of this.tokens.values()) {
      if (r.customerId === customerId && !r.revokedAt) r.revokedAt = new Date();
    }
  }
}

@Injectable()
export class MemoryDeviceStore implements DeviceStore {
  private readonly devices = new Map<string, DeviceRecord>();

  async upsert(customerId: string, request: RegisterDeviceRequest): Promise<DeviceRecord> {
    const existing = [...this.devices.values()].find(
      (d) => d.customerId === customerId && d.pushToken === request.pushToken,
    );
    const record: DeviceRecord = {
      id: existing?.id ?? randomUUID(),
      customerId,
      createdAt: existing?.createdAt ?? new Date(),
      ...request,
    };
    this.devices.set(record.id, record);
    return { ...record };
  }
  async remove(customerId: string, deviceId: string): Promise<boolean> {
    const d = this.devices.get(deviceId);
    if (!d || d.customerId !== customerId) return false;
    this.devices.delete(deviceId);
    return true;
  }
  async listByCustomer(customerId: string): Promise<DeviceRecord[]> {
    return [...this.devices.values()].filter((d) => d.customerId === customerId);
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    for (const [id, d] of this.devices) if (d.customerId === customerId) this.devices.delete(id);
  }
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  billing: true,
  shipping: true,
  renewal: true,
  marketing: false,
  routine: true,
};

@Injectable()
export class MemoryNotificationPreferencesStore implements NotificationPreferencesStore {
  private readonly prefs = new Map<string, NotificationPreferences>();

  async get(customerId: string): Promise<NotificationPreferences> {
    return { ...(this.prefs.get(customerId) ?? DEFAULT_NOTIFICATION_PREFERENCES) };
  }
  async update(
    customerId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const next = { ...(await this.get(customerId)), ...patch };
    this.prefs.set(customerId, next);
    return { ...next };
  }
}

@Injectable()
export class MemoryWebhookEventStore implements WebhookEventStore {
  private readonly events = new Map<
    string,
    { receivedAt: Date; processedAt?: Date; payload?: unknown }
  >();

  async register(source: string, externalId: string, payload?: unknown): Promise<boolean> {
    const key = `${source}:${externalId}`;
    if (this.events.has(key)) return false;
    this.events.set(key, { receivedAt: new Date(), payload });
    return true;
  }
  async markProcessed(source: string, externalId: string): Promise<void> {
    const e = this.events.get(`${source}:${externalId}`);
    if (e) e.processedAt = new Date();
  }
}

@Injectable()
export class MemoryDeleteRequestStore implements DeleteRequestStore {
  readonly requests: Array<{ id: string; customerId: string; reason?: string; createdAt: Date }> =
    [];

  async create(customerId: string, reason?: string): Promise<{ id: string }> {
    const id = randomUUID();
    this.requests.push({ id, customerId, reason, createdAt: new Date() });
    return { id };
  }
}

@Injectable()
export class MemoryConsentStore implements ConsentStore {
  private readonly consents = new Map<string, Map<ConsentKind, Consent>>();

  async list(customerId: string): Promise<Consent[]> {
    return [...(this.consents.get(customerId)?.values() ?? [])].map((c) => ({ ...c }));
  }
  async get(customerId: string, kind: ConsentKind): Promise<Consent | null> {
    const c = this.consents.get(customerId)?.get(kind);
    return c ? { ...c } : null;
  }
  async upsert(customerId: string, consent: Consent): Promise<Consent> {
    if (!this.consents.has(customerId)) this.consents.set(customerId, new Map());
    this.consents.get(customerId)!.set(consent.kind, { ...consent });
    return { ...consent };
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    this.consents.delete(customerId);
  }
}

@Injectable()
export class MemoryRoutineStore implements RoutineStore {
  private readonly plans = new Map<string, StoredRoutinePlan>();
  private readonly checkIns = new Map<string, CheckInRecord>();

  async getPlan(customerId: string): Promise<StoredRoutinePlan | null> {
    const p = this.plans.get(customerId);
    return p ? structuredClone(p) : null;
  }
  async savePlan(customerId: string, plan: RoutinePlan): Promise<StoredRoutinePlan> {
    const stored: StoredRoutinePlan = {
      ...structuredClone(plan),
      customerId,
      updatedAt: new Date(),
    };
    this.plans.set(customerId, stored);
    return structuredClone(stored);
  }
  async listPlansWithReminders(): Promise<StoredRoutinePlan[]> {
    return [...this.plans.values()]
      .filter((p) => p.items.some((i) => i.reminderEnabled && i.reminderTime))
      .map((p) => structuredClone(p));
  }
  async addCheckIn(
    record: Omit<CheckInRecord, 'id'>,
  ): Promise<{ checkIn: CheckInRecord; created: boolean }> {
    const existing = [...this.checkIns.values()].find(
      (c) =>
        c.customerId === record.customerId &&
        c.routineItemId === record.routineItemId &&
        c.date === record.date,
    );
    if (existing) return { checkIn: { ...existing }, created: false };
    const checkIn: CheckInRecord = { id: randomUUID(), ...record };
    this.checkIns.set(checkIn.id, checkIn);
    return { checkIn: { ...checkIn }, created: true };
  }
  async removeCheckIn(customerId: string, checkInId: string): Promise<boolean> {
    const c = this.checkIns.get(checkInId);
    if (!c || c.customerId !== customerId) return false;
    this.checkIns.delete(checkInId);
    return true;
  }
  async listCheckIns(customerId: string, fromDate?: string): Promise<CheckInRecord[]> {
    return [...this.checkIns.values()]
      .filter((c) => c.customerId === customerId && (!fromDate || c.date >= fromDate))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => ({ ...c }));
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    this.plans.delete(customerId);
    for (const [id, c] of this.checkIns) if (c.customerId === customerId) this.checkIns.delete(id);
  }
}

@Injectable()
export class MemoryHealthStore implements HealthStore {
  /** customerId → `${date}:${metric}` → amostra */
  private readonly samples = new Map<string, Map<string, HealthDailySample>>();
  private readonly meta = new Map<string, HealthSyncMeta>();

  async upsertSamples(customerId: string, samples: HealthDailySample[]): Promise<void> {
    if (!this.samples.has(customerId)) this.samples.set(customerId, new Map());
    const bucket = this.samples.get(customerId)!;
    for (const s of samples) bucket.set(`${s.date}:${s.metric}`, { ...s });
  }
  async listSamples(
    customerId: string,
    fromDate: string,
    toDate: string,
  ): Promise<HealthDailySample[]> {
    return [...(this.samples.get(customerId)?.values() ?? [])]
      .filter((s) => s.date >= fromDate && s.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ ...s }));
  }
  async saveSyncMeta(customerId: string, meta: HealthSyncMeta): Promise<void> {
    this.meta.set(customerId, { ...meta });
  }
  async getSyncMeta(customerId: string): Promise<HealthSyncMeta | null> {
    const m = this.meta.get(customerId);
    return m ? { ...m } : null;
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    this.samples.delete(customerId);
    this.meta.delete(customerId);
  }
}

@Injectable()
export class MemoryAssistantStore implements AssistantStore {
  private readonly threads = new Map<string, AssistantThreadRecord>();

  private strip(t: AssistantThreadRecord): AssistantThread {
    const { customerId: _c, ...pub } = t;
    return structuredClone(pub);
  }

  async listThreads(customerId: string): Promise<AssistantThread[]> {
    return [...this.threads.values()]
      .filter((t) => t.customerId === customerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => ({ ...this.strip(t), messages: [] }));
  }
  async getThread(customerId: string, threadId: string): Promise<AssistantThreadRecord | null> {
    const t = this.threads.get(threadId);
    return t && t.customerId === customerId ? structuredClone(t) : null;
  }
  async createThread(
    customerId: string,
    title: string | undefined,
    now: Date,
  ): Promise<AssistantThreadRecord> {
    const t: AssistantThreadRecord = {
      id: randomUUID(),
      customerId,
      ...(title ? { title } : {}),
      messages: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.threads.set(t.id, t);
    return structuredClone(t);
  }
  async appendMessages(
    customerId: string,
    threadId: string,
    messages: AssistantMessage[],
  ): Promise<AssistantThreadRecord> {
    const t = this.threads.get(threadId);
    if (!t || t.customerId !== customerId) throw new Error('thread não encontrada');
    t.messages.push(...structuredClone(messages));
    t.updatedAt = messages[messages.length - 1]?.createdAt ?? t.updatedAt;
    return structuredClone(t);
  }
  async deleteThread(customerId: string, threadId: string): Promise<boolean> {
    const t = this.threads.get(threadId);
    if (!t || t.customerId !== customerId) return false;
    this.threads.delete(threadId);
    return true;
  }
  async countUserMessagesBetween(customerId: string, from: Date, to: Date): Promise<number> {
    let n = 0;
    for (const t of this.threads.values()) {
      if (t.customerId !== customerId) continue;
      for (const m of t.messages) {
        const at = new Date(m.createdAt).getTime();
        if (m.role === 'user' && at >= from.getTime() && at < to.getTime()) n++;
      }
    }
    return n;
  }
  async removeAllForCustomer(customerId: string): Promise<void> {
    for (const [id, t] of this.threads) if (t.customerId === customerId) this.threads.delete(id);
  }
}
