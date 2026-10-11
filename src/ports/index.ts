/**
 * Portas (interfaces) da arquitetura hexagonal. Os módulos Nest dependem só destas interfaces;
 * `AdaptersModule` escolhe a implementação (fake em memória ou real) pela env `ADAPTERS`.
 */
import {
  AddCardRequest,
  AddressQuote,
  AssistantMessage,
  AssistantThread,
  Banner,
  Bill,
  CancelRequest,
  Catalog,
  CheckIn,
  Consent,
  ConsentKind,
  Dashboard,
  Fulfillment,
  HealthDailySample,
  HealthSummary,
  ItemRecurrence,
  NotificationPreferences,
  PauseRequest,
  PauseType,
  PaymentProfile,
  PayWithNewCardRequest,
  ReasonOption,
  RegisterDeviceRequest,
  RegisterRequest,
  RoutinePlan,
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
export const CONSENT_STORE = Symbol('ConsentStore');
export const ROUTINE_STORE = Symbol('RoutineStore');
export const HEALTH_STORE = Symbol('HealthStore');
export const ASSISTANT_STORE = Symbol('AssistantStore');
export const ASSISTANT_PROVIDER = Symbol('AssistantProvider');
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

// ---------- Push (Expo / FCM / APNs) ----------
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type PushProvider = NonNullable<RegisterDeviceRequest['pushProvider']>;

/** Destino de push: token + provedor que o emitiu (Expo no RN; FCM/APNs no Flutter). */
export interface PushTarget {
  token: string;
  provider: PushProvider;
}

export interface PushSender {
  send(targets: PushTarget[], message: PushMessage): Promise<void>;
}

/** Converte dispositivos registrados em destinos de push (padrão `expo` para registros antigos). */
export function toPushTargets(
  devices: Pick<DeviceRecord, 'pushToken' | 'pushProvider'>[],
): PushTarget[] {
  return devices
    .filter((d) => Boolean(d.pushToken))
    .map((d) => ({ token: d.pushToken, provider: d.pushProvider ?? 'expo' }));
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

// ---------- Consentimentos (LGPD) ----------
export interface ConsentStore {
  list(customerId: string): Promise<Consent[]>;
  get(customerId: string, kind: ConsentKind): Promise<Consent | null>;
  upsert(customerId: string, consent: Consent): Promise<Consent>;
  removeAllForCustomer(customerId: string): Promise<void>;
}

// ---------- Rotina (frente 2) ----------
export interface StoredRoutinePlan extends RoutinePlan {
  customerId: string;
  updatedAt: Date;
}

export interface CheckInRecord extends CheckIn {
  customerId: string;
}

export interface RoutineStore {
  getPlan(customerId: string): Promise<StoredRoutinePlan | null>;
  savePlan(customerId: string, plan: RoutinePlan): Promise<StoredRoutinePlan>;
  /** Planos com ao menos um lembrete ativo (varredura do scheduler). */
  listPlansWithReminders(): Promise<StoredRoutinePlan[]>;
  /** Idempotente por (customerId, routineItemId, date): devolve o existente quando já há. */
  addCheckIn(
    record: Omit<CheckInRecord, 'id'>,
  ): Promise<{ checkIn: CheckInRecord; created: boolean }>;
  removeCheckIn(customerId: string, checkInId: string): Promise<boolean>;
  /** Check-ins do cliente com `date >= fromDate` (YYYY-MM-DD), ordenados por data. */
  listCheckIns(customerId: string, fromDate?: string): Promise<CheckInRecord[]>;
  removeAllForCustomer(customerId: string): Promise<void>;
}

// ---------- Saúde / wearables (frente 2) ----------
export interface HealthSyncMeta {
  provider?: NonNullable<HealthSummary['provider']>;
  lastSyncAt: Date;
}

export interface HealthStore {
  /** Upsert por (customerId, date, metric). */
  upsertSamples(customerId: string, samples: HealthDailySample[]): Promise<void>;
  listSamples(customerId: string, fromDate: string, toDate: string): Promise<HealthDailySample[]>;
  saveSyncMeta(customerId: string, meta: HealthSyncMeta): Promise<void>;
  getSyncMeta(customerId: string): Promise<HealthSyncMeta | null>;
  removeAllForCustomer(customerId: string): Promise<void>;
}

// ---------- Assistente de IA (frente 5) ----------
export interface AssistantThreadRecord extends AssistantThread {
  customerId: string;
}

export interface AssistantStore {
  listThreads(customerId: string): Promise<AssistantThread[]>;
  getThread(customerId: string, threadId: string): Promise<AssistantThreadRecord | null>;
  createThread(
    customerId: string,
    title: string | undefined,
    now: Date,
  ): Promise<AssistantThreadRecord>;
  appendMessages(
    customerId: string,
    threadId: string,
    messages: AssistantMessage[],
  ): Promise<AssistantThreadRecord>;
  deleteThread(customerId: string, threadId: string): Promise<boolean>;
  /** Mensagens do cliente (role user) enviadas no intervalo [from, to) — o "dia" em São Paulo. */
  countUserMessagesBetween(customerId: string, from: Date, to: Date): Promise<number>;
  removeAllForCustomer(customerId: string): Promise<void>;
}

/** Contexto injetado no assistente (sem PII: nada de nome, CPF, e-mail ou endereço). */
export interface AssistantCustomerContext {
  planName?: string;
  frequency?: string;
  status?: string;
  nextBillingAt?: string;
  boxItems: { handle: string; title: string; quantity: number }[];
  capabilities?: Record<string, boolean>;
  routine?: {
    currentStreakDays: number;
    weekCompletion: number;
    todayCompletion: number;
    items: { title: string; slot: string; done: boolean }[];
  };
  screen?: string;
}

export interface AssistantReplyInput {
  customerContext: AssistantCustomerContext;
  /** Histórico da conversa (já inclui a mensagem nova por último). */
  thread: Pick<AssistantMessage, 'role' | 'content'>[];
  message: string;
}

export interface AssistantReply {
  content: string;
  actions?: { label: string; deepLink: string }[];
}

export interface AssistantProvider {
  reply(input: AssistantReplyInput): Promise<AssistantReply>;
}
