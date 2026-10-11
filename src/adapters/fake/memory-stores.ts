import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NotificationPreferences, RegisterDeviceRequest } from '../../contracts/api';
import {
  DeleteRequestStore,
  DeviceRecord,
  DeviceStore,
  NotificationPreferencesStore,
  RefreshTokenRecord,
  RefreshTokenStore,
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
      (d) => d.customerId === customerId && d.expoPushToken === request.expoPushToken,
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
