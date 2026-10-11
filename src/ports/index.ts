/**
 * Portas (interfaces) da arquitetura hexagonal. Os módulos Nest dependem só destas interfaces;
 * `AdaptersModule` escolhe a implementação (fake em memória ou real) pela env `ADAPTERS`.
 */
import {
  AddCardRequest,
  AddressQuote,
  Banner,
  Bill,
  CancelRequest,
  Catalog,
  Dashboard,
  Fulfillment,
  ItemRecurrence,
  NotificationPreferences,
  PauseRequest,
  PauseType,
  PaymentProfile,
  PayWithNewCardRequest,
  ReasonOption,
  RegisterDeviceRequest,
  RegisterRequest,
  ScheduledChange,
  SchedulingRequest,
  ShippingAddress,
  UpdateAddressRequest,
  UpdateProfileRequest,
  UserProfile,
  VindiConfig,
} from '../contracts/api';
import { SubscriptionDetail } from '../core/capabilities.service';
import { Coupon } from '../core/pricing.service';

// ---------- Tokens de injeção ----------
export const SUBSCRIPTION_GATEWAY = Symbol('SubscriptionGateway');
export const IDENTITY_PROVIDER = Symbol('IdentityProvider');
export const PAYMENT_GATEWAY = Symbol('PaymentGateway');
export const CATALOG_SOURCE = Symbol('CatalogSource');
export const SHIPPING_QUOTER = Symbol('ShippingQuoter');
export const POINTS_WALLET = Symbol('PointsWallet');
export const PUSH_SENDER = Symbol('PushSender');
export const REFRESH_TOKEN_STORE = Symbol('RefreshTokenStore');
export const DEVICE_STORE = Symbol('DeviceStore');
export const NOTIFICATION_PREFERENCES_STORE = Symbol('NotificationPreferencesStore');
export const WEBHOOK_EVENT_STORE = Symbol('WebhookEventStore');
export const DELETE_REQUEST_STORE = Symbol('DeleteRequestStore');
export const CLOCK = Symbol('Clock');

// ---------- Relógio (injetável para testes) ----------
export interface Clock {
  now(): Date;
}

// ---------- Identidade (Shopify) ----------
/** Perfil vindo do provedor de identidade; `hasSubscription` é composto pelo BFF. */
export type IdentityProfile = Omit<UserProfile, 'hasSubscription'>;

export interface IdentityProvider {
  loginWithPassword(email: string, password: string): Promise<IdentityProfile>;
  loginWithGoogleIdToken(idToken: string, fullName?: string): Promise<IdentityProfile>;
  loginWithAppleIdentityToken(identityToken: string, fullName?: string): Promise<IdentityProfile>;
  /** Envia o e-mail; devolve o token só em modo fake (para testes). */
  sendMagicLink(email: string): Promise<{ debugToken?: string }>;
  exchangeMagicLink(token: string): Promise<IdentityProfile>;
  register(request: RegisterRequest): Promise<IdentityProfile>;
  getProfile(customerId: string): Promise<IdentityProfile | null>;
  updateProfile(customerId: string, request: UpdateProfileRequest): Promise<IdentityProfile>;
}

// ---------- Assinatura (Prime API) ----------
export interface LastCanceled {
  canceledAt: string;
  reason?: string;
  subscriptionId: string;
}

export interface TrackingUpdate {
  status: Fulfillment['status'];
  description: string;
  occurredAt: string;
  carrier?: string;
  trackingCode?: string;
  trackingUrl?: string;
  location?: string;
}

export interface SubscriptionGateway {
  getByCustomer(customerId: string): Promise<SubscriptionDetail | null>;
  getLastCanceled(customerId: string): Promise<LastCanceled | null>;
  getBills(customerId: string): Promise<Bill[]>;
  getBill(customerId: string, billId: string): Promise<Bill | null>;
  /** Localiza uma fatura por id independentemente do cliente (uso interno: webhooks). */
  findBill(billId: string): Promise<{ customerId: string; bill: Bill } | null>;
  createScheduling(subscriptionId: string, request: SchedulingRequest): Promise<ScheduledChange>;
  deleteScheduling(subscriptionId: string, scheduleId: string): Promise<void>;
  /**
   * Pausa iniciada pelo cliente (`pauseType: 'User'`, padrão): consome 1 crédito por ciclo e cada
   * ciclo pausado gera fatura de R$ 0,00 que não conta para a fidelidade. `'Offer'` é a pausa de
   * retenção (CS): ignora elegibilidade e não consome crédito; nunca exposta na rota pública.
   */
  pause(
    subscriptionId: string,
    request: PauseRequest,
    now: Date,
    pauseType?: PauseType,
  ): Promise<SubscriptionDetail>;
  resume(subscriptionId: string): Promise<SubscriptionDetail>;
  cancel(subscriptionId: string, request: CancelRequest, now: Date): Promise<SubscriptionDetail>;
  reactivate(subscriptionId: string): Promise<SubscriptionDetail>;
  updateItemRecurrence(
    subscriptionId: string,
    itemId: string,
    recurrence: ItemRecurrence,
  ): Promise<SubscriptionDetail>;
  updateDiscount(subscriptionId: string, code: string): Promise<SubscriptionDetail>;
  getShippingAddress(subscriptionId: string): Promise<ShippingAddress | null>;
  updateShippingAddress(
    subscriptionId: string,
    addressId: string,
    request: UpdateAddressRequest,
    quote: AddressQuote['options'][number],
  ): Promise<ShippingAddress>;
  getSavings(customerId: string): Promise<Dashboard['savings']>;
  /**
   * Eventos de webhook: marcam a fatura como paga / atualizam o rastreio e devolvem o cliente
   * afetado (para push). Em produção a Prime API já processa o evento; o BFF só localiza o
   * cliente para notificar e invalidar cache.
   */
  applyBillPaid(billId: string, paidAt: Date): Promise<{ customerId: string; bill: Bill } | null>;
  applyTrackingUpdate(
    orderExternalId: string,
    update: TrackingUpdate,
  ): Promise<{ customerId: string; bill: Bill } | null>;
}

// ---------- Pagamento (Vindi) ----------
export interface PaymentGateway {
  listProfiles(customerId: string): Promise<PaymentProfile[]>;
  createProfileFromGatewayToken(
    customerId: string,
    request: AddCardRequest,
  ): Promise<PaymentProfile>;
  deleteProfile(customerId: string, profileId: string): Promise<void>;
  createPixCharge(customerId: string, billId: string, now: Date): Promise<Bill>;
  chargeCurrentCard(customerId: string, billId: string, now: Date): Promise<Bill>;
  chargeNewCard(
    customerId: string,
    billId: string,
    request: PayWithNewCardRequest,
    now: Date,
  ): Promise<Bill>;
  getVindiConfig(): VindiConfig;
}

// ---------- Catálogo (metaobjects Shopify) ----------
export interface CatalogSource {
  getCatalog(): Promise<Catalog>;
  getCancelReasons(): Promise<ReasonOption[]>;
  getPauseReasons(): Promise<ReasonOption[]>;
  getBanners(): Promise<Banner[]>;
  getCoupon(code: string): Promise<Coupon | null>;
}

// ---------- Frete (Intelipost) ----------
export interface ShippingQuoter {
  quote(postalCode: string): Promise<AddressQuote>;
}

// ---------- Pontos (Caffeine X) ----------
export interface PointsWallet {
  getBalance(customerId: string): Promise<Dashboard['wallet']>;
}

// ---------- Push (Expo) ----------
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSender {
  send(expoPushTokens: string[], message: PushMessage): Promise<void>;
}

// ---------- Stores (dados próprios do BFF) ----------
export interface RefreshTokenRecord {
  tokenHash: string;
  customerId: string;
  deviceName?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedBy?: string | null;
}

export interface RefreshTokenStore {
  save(record: RefreshTokenRecord): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(tokenHash: string, replacedBy?: string): Promise<void>;
  revokeAllForCustomer(customerId: string): Promise<void>;
}

export interface DeviceRecord extends RegisterDeviceRequest {
  id: string;
  customerId: string;
  createdAt: Date;
}

export interface DeviceStore {
  upsert(customerId: string, request: RegisterDeviceRequest): Promise<DeviceRecord>;
  remove(customerId: string, deviceId: string): Promise<boolean>;
  listByCustomer(customerId: string): Promise<DeviceRecord[]>;
  removeAllForCustomer(customerId: string): Promise<void>;
}

export interface NotificationPreferencesStore {
  get(customerId: string): Promise<NotificationPreferences>;
  update(
    customerId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences>;
}

export interface WebhookEventStore {
  /** Registra o evento; devolve `false` se já havia sido recebido (deduplicação). */
  register(source: string, externalId: string, payload?: unknown): Promise<boolean>;
  markProcessed(source: string, externalId: string): Promise<void>;
}

export interface DeleteRequestStore {
  create(customerId: string, reason?: string): Promise<{ id: string }>;
}
