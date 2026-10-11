import { Injectable } from '@nestjs/common';
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
      expoPushToken: row.expoPushToken,
      platform: row.platform,
      appVersion: row.appVersion,
      deviceName: row.deviceName ?? undefined,
      createdAt: row.createdAt,
    };
  }

  async upsert(customerId: string, request: RegisterDeviceRequest): Promise<DeviceRecord> {
    const row = await this.prisma.client.device.upsert({
      where: { customerId_expoPushToken: { customerId, expoPushToken: request.expoPushToken } },
      create: { customerId, ...request, deviceName: request.deviceName ?? null },
      update: {
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
