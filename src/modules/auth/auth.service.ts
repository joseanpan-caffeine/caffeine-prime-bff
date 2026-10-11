import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AuthResponse, AuthTokens, RegisterRequest, UserProfile } from '../../contracts/api';
import { AppError } from '../../common/errors';
import { AccessTokenPayload } from '../../common/auth.guard';
import { Env, ENV } from '../../config/env';
import {
  CLOCK,
  Clock,
  DEVICE_STORE,
  DeviceStore,
  IDENTITY_PROVIDER,
  IdentityProfile,
  IdentityProvider,
  REFRESH_TOKEN_STORE,
  RefreshTokenStore,
  SUBSCRIPTION_GATEWAY,
  SubscriptionGateway,
} from '../../ports';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Casos de uso de autenticação. Qualquer método de login termina em `issueSession`, que emite o
 * access JWT (15 min, `sub` = shopifyCustomerId) e o refresh token opaco (30 dias, rotativo,
 * guardado só como hash sha256).
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(SUBSCRIPTION_GATEWAY) private readonly subscriptions: SubscriptionGateway,
    @Inject(REFRESH_TOKEN_STORE) private readonly refreshTokens: RefreshTokenStore,
    @Inject(DEVICE_STORE) private readonly devices: DeviceStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  async loginWithPassword(
    email: string,
    password: string,
    deviceName?: string,
  ): Promise<AuthResponse> {
    const profile = await this.identity.loginWithPassword(email, password);
    return this.issueSession(profile, deviceName);
  }

  async loginWithGoogle(
    idToken: string,
    fullName?: string,
    deviceName?: string,
  ): Promise<AuthResponse> {
    const profile = await this.identity.loginWithGoogleIdToken(idToken, fullName);
    return this.issueSession(profile, deviceName);
  }

  async loginWithApple(
    identityToken: string,
    fullName?: string,
    deviceName?: string,
  ): Promise<AuthResponse> {
    const profile = await this.identity.loginWithAppleIdentityToken(identityToken, fullName);
    return this.issueSession(profile, deviceName);
  }

  async sendMagicLink(email: string): Promise<{ sent: true; debugToken?: string }> {
    const result = await this.identity.sendMagicLink(email);
    // O token só sai na resposta com adaptadores fake (facilita testes e o app em dev).
    return this.env.isFake && result.debugToken
      ? { sent: true, debugToken: result.debugToken }
      : { sent: true };
  }

  async exchangeMagicLink(token: string, deviceName?: string): Promise<AuthResponse> {
    const profile = await this.identity.exchangeMagicLink(token);
    return this.issueSession(profile, deviceName);
  }

  async register(request: RegisterRequest): Promise<AuthResponse> {
    const profile = await this.identity.register(request);
    return this.issueSession(profile);
  }

  /** Rotação: o refresh usado é revogado e um novo par é emitido. Reuso de token revogado → 401. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const hash = sha256(refreshToken);
    const record = await this.refreshTokens.findByHash(hash);
    const now = this.clock.now();
    if (!record || record.revokedAt || record.expiresAt.getTime() <= now.getTime()) {
      if (record?.revokedAt) {
        // Possível roubo de token: derruba todas as sessões do cliente.
        await this.refreshTokens.revokeAllForCustomer(record.customerId);
      }
      throw AppError.unauthorized(
        'INVALID_REFRESH_TOKEN',
        'Sessão inválida ou expirada. Entre novamente.',
      );
    }
    const tokens = await this.mintTokens(record.customerId, record.deviceName);
    await this.refreshTokens.revoke(hash, sha256(tokens.refreshToken));
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = sha256(refreshToken);
    const record = await this.refreshTokens.findByHash(hash);
    if (record) await this.refreshTokens.revoke(hash);
  }

  async buildUserProfile(profile: IdentityProfile): Promise<UserProfile> {
    const sub = await this.subscriptions.getByCustomer(profile.id);
    return { ...profile, hasSubscription: Boolean(sub && sub.status !== 'canceled') };
  }

  private async issueSession(profile: IdentityProfile, deviceName?: string): Promise<AuthResponse> {
    const tokens = await this.mintTokens(profile.id, deviceName);
    const user = await this.buildUserProfile(profile);
    return { ...tokens, user };
  }

  private async mintTokens(customerId: string, deviceName?: string): Promise<AuthTokens> {
    const now = this.clock.now();
    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = sha256(refreshToken);
    await this.refreshTokens.save({
      tokenHash,
      customerId,
      deviceName,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.env.jwt.refreshTtlDays * 86_400_000),
      revokedAt: null,
      replacedBy: null,
    });
    const payload: AccessTokenPayload = {
      sub: customerId,
      sid: tokenHash.slice(0, 16),
      typ: 'access',
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.env.jwt.accessTtlSeconds,
    });
    return { accessToken, refreshToken, expiresIn: this.env.jwt.accessTtlSeconds };
  }
}
