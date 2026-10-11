/**
 * Contrato público do BFF Caffeine Prime (v1).
 * Fonte única de verdade para o app e para o BFF. Copiado para o app em src/api/contracts.ts.
 * Mantido em sincronia com openapi.yaml.
 */

// ---------- Tipos básicos ----------

export type SubscriptionStatus = 'active' | 'future' | 'paused' | 'canceled' | 'fraud_review';
export type Frequency = 'Mensal' | 'Trimestral' | 'Semestral' | 'Anual';
export type BillStatus = 'pending' | 'paid' | 'canceled' | 'review';
export type ItemRecurrence = null | 'on' | 'off'; // null = todo ciclo; on/off = alterna a cada 60 dias

export interface Money {
  amount: number; // em reais, 2 casas
  currency: 'BRL';
}

// ---------- Auth ----------

export interface LoginRequest {
  email: string;
  password: string;
  deviceName?: string;
}
export interface SocialLoginRequest {
  idToken: string;
  fullName?: string;
  deviceName?: string;
}
export interface MagicLinkRequest {
  email: string;
}
export interface MagicLinkExchangeRequest {
  token: string;
  deviceName?: string;
}
export interface RefreshRequest {
  refreshToken: string;
}
export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  cpf: string;
  phone: string;
  birthDate: string; // ISO date
}

export interface AuthTokens {
  accessToken: string; // JWT, 15 min
  refreshToken: string; // opaco, 30 dias, rotativo
  expiresIn: number; // segundos
}

export interface AuthResponse extends AuthTokens {
  user: UserProfile;
}

// ---------- Perfil ----------

export interface UserProfile {
  id: string; // shopifyCustomerId numérico como string
  email: string;
  firstName: string;
  lastName: string;
  cpf?: string; // mascarado: ***.***.123-45
  phone?: string;
  gender?: string;
  hasSubscription: boolean;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: string;
}

// ---------- Assinatura ----------

export interface ProductItem {
  id: string;
  handle: string;
  title: string;
  flavor?: string;
  imageUrl?: string;
  sku?: string;
  quantity: number;
  price: Money; // preço cheio unitário
  discountPercentage: number; // 0–100
  finalPrice: Money; // unitário com desconto
  recurrence: ItemRecurrence;
  cyclesLeft?: number; // item temporário
  isGift?: boolean;
}

export interface Discount {
  code?: string;
  percentage: number;
  temporaryCode?: string;
  temporaryPercentage?: number;
  temporaryCycles?: number;
}

export interface PaymentProfile {
  id: string;
  brand: string; // Visa, Mastercard, Elo…
  lastFour: string;
  holderName: string;
  expiration: string; // MM/YYYY
  isDefault: boolean;
}

export interface ShippingAddress {
  id: string;
  recipient: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  deliveryMethod?: string;
  deliveryEstimateDays?: number;
}

/**
 * Origem da pausa (docs/contexto-prime.md §6.2): `User` é pedida pelo cliente e consome 1 crédito
 * por ciclo; `Offer` é a pausa de retenção oferecida pelo CS, ignora elegibilidade e não consome
 * crédito. O app só cria pausas `User`.
 */
export type PauseType = 'User' | 'Offer';

export interface SubscriptionPause {
  cycles: number;
  remainingCycles: number;
  pausedAt: string;
  resumeAt: string; // ISO
  pauseType?: PauseType; // ausente = 'User'
}

export interface ScheduledChange {
  id: string;
  appliesAt: string; // ISO (= nextBillingAt)
  frequency: Frequency;
  planName: string;
  items: ProductItem[];
  total: Money;
  nextCycleOnly: boolean;
}

export interface Subscription {
  /**
   * Nunca guardar como permanente: numa troca de plano a Prime API cria uma assinatura nova
   * (`future`) e cancela a atual, então o id muda (docs/contexto-prime.md §4.3, caso B).
   */
  id: string;
  status: SubscriptionStatus;
  /**
   * Presente só quando a Prime API devolveu um status fora do enum conhecido (o campo lá é
   * string livre). Nesse caso `status` vem normalizado para 'active' e o app mostra um estado
   * genérico "Status: {rawStatus}" sem quebrar (docs/contexto-prime.md §8 item 5).
   */
  rawStatus?: string;
  frequency: Frequency;
  planName: string;
  startedAt: string;
  nextBillingAt: string;
  currentCycle: number;
  paidCycles: number;
  remainingCommitmentMonths: number; // remainingCancelation; -1 para Mensal
  pauseCreditsLeft: number;
  items: ProductItem[];
  discount: Discount;
  paymentProfile?: PaymentProfile;
  shippingAddress?: ShippingAddress;
  pause?: SubscriptionPause;
  scheduledChange?: ScheduledChange;
  subtotal: Money;
  totalDiscount: Money;
  total: Money;
}

// ---------- Faturas / pedidos ----------

export interface TrackingEvent {
  status: string;
  description: string;
  occurredAt: string;
  location?: string;
}

export interface Fulfillment {
  status:
    | 'pending'
    | 'processing'
    | 'shipped'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'failed';
  carrier?: string;
  trackingCode?: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: string;
  events: TrackingEvent[];
}

export interface PixCharge {
  qrCodeImageUrl: string;
  qrCodeText: string; // copia e cola
  expiresAt: string;
}

export interface Bill {
  id: string;
  cycle: number;
  status: BillStatus;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  amount: Money;
  paymentMethod?: 'credit_card' | 'pix';
  paymentProfile?: PaymentProfile;
  pix?: PixCharge; // presente se há cobrança PIX pendente
  items: ProductItem[];
  fulfillment?: Fulfillment;
  /**
   * Fatura de ciclo pausado: durante a pausa a Vindi continua gerando uma fatura por ciclo com
   * valor R$ 0,00 (100% de desconto). É esperado, não é erro; o app mostra "Ciclo pausado"
   * (docs/contexto-prime.md §5.3).
   */
  pausedCycle?: boolean;
}

// ---------- Capacidades (regras calculadas no servidor) ----------

/**
 * Razões de bloqueio (regras oficiais em docs/contexto-prime.md §6.1, calculadas no BFF em
 * America/Sao_Paulo):
 * - EDIT_WINDOW_CLOSED: edição bloqueada de D-3 00:00 até a cobrança.
 * - MIN_PAID_CYCLES: pausa só a partir da 4ª cobrança (3 cobranças pagas).
 * - PAUSE_WINDOW_CLOSED: pedido de pausa só até D-3 da cobrança.
 * - RESUME_WINDOW_CLOSED: desfazer a pausa só até D-5 da cobrança do ciclo pausado.
 * - COMMITMENT_ACTIVE: cancelamento travado enquanto há fidelidade restante.
 * - CANCEL_WINDOW_CLOSED: fidelidade cumprida, mas já é o dia da cobrança seguinte.
 */
export type CapabilityReason =
  | 'EDIT_WINDOW_CLOSED'
  | 'SUBSCRIPTION_NOT_ACTIVE'
  | 'FREQUENCY_NOT_ELIGIBLE'
  | 'NO_PAUSE_CREDITS'
  | 'MIN_PAID_CYCLES'
  | 'PAUSE_WINDOW_CLOSED'
  | 'RESUME_WINDOW_CLOSED'
  | 'PENDING_BILL'
  | 'NOT_PAUSED'
  | 'NOT_CANCELED'
  | 'CANCELLATION_BLOCKED'
  | 'COMMITMENT_ACTIVE'
  | 'CANCEL_WINDOW_CLOSED'
  | 'UNDER_REVIEW';

export interface Capability {
  allowed: boolean;
  reason?: CapabilityReason;
  /** Quando bloqueada por janela: instante (ISO, offset de São Paulo) em que a ação reabre. */
  until?: string;
  /**
   * Quando permitida e sujeita a janela: instante (ISO, offset de São Paulo) em que a ação deixa
   * de ser permitida (ex.: canEdit → D-3 00:00; canResume → D-5 00:00; canCancel com fidelidade
   * cumprida → 00:00 do dia da cobrança). O app exibe "até {data}" sem calcular prazo localmente.
   */
  closesAt?: string;
}

export interface Capabilities {
  canEdit: Capability;
  canPause: Capability & { creditsLeft?: number; maxCycles?: number };
  canResume: Capability;
  canCancel: Capability & {
    remainingCommitmentMonths?: number;
    earlyWindow?: boolean;
    /**
     * Estimativa (ISO) de quando a fidelidade termina: nextBillingAt + meses restantes.
     * Ausente para Mensal (sem fidelidade). É estimativa porque o ciclo é de 30 dias, não
     * um dia fixo do mês (docs/contexto-prime.md §6.3).
     */
    commitmentEndsAt?: string;
  };
  canReactivate: Capability;
  canChangeCard: Capability;
  canChangeAddress: Capability;
  hasPendingBill: boolean;
  pendingBill?: { id: string; amount: Money; dueAt: string; pixAvailable: boolean };
}

// ---------- Dashboard ----------

export interface Dashboard {
  user: UserProfile;
  subscription: Subscription | null;
  lastCanceled?: { canceledAt: string; reason?: string; subscriptionId: string };
  capabilities: Capabilities;
  latestBill?: Bill;
  tracking?: Fulfillment;
  savings: { last12Months: Money; sinceStart: Money };
  wallet: { points: number; label: string };
  banners: Banner[];
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
}

// ---------- Catálogo ----------

export interface Plan {
  frequency: Frequency;
  name: string;
  commitmentMonths: number;
  discountPercentage: number;
  pauseCredits: number;
  highlight?: string;
}

export interface CatalogProduct {
  handle: string;
  title: string;
  category: string;
  imageUrl?: string;
  price: Money;
  flavors?: { handle: string; title: string; inStock: boolean }[];
  inStock: boolean;
  minQuantity: number;
  maxQuantity: number;
  /** Texto curto "para que serve / como tomar" (metaobject); alimenta `RoutineItem.usageHint`. */
  usageHint?: string;
  /** Doses por unidade (ex.: lata 380g = 25 doses); base da previsão de estoque da rotina. */
  dosesPerUnit?: number;
}

export interface DiscountTier {
  minItems: number;
  discountPercentage: number;
  label: string;
}

export interface Catalog {
  plans: Plan[];
  products: CatalogProduct[];
  discountTiers: DiscountTier[];
  gifts: { handle: string; title: string; imageUrl?: string; requiresPlan?: Frequency[] }[];
}

// ---------- Edição / agendamento ----------

export interface BoxItemInput {
  handle: string;
  quantity: number;
  recurrence?: ItemRecurrence;
}

export interface PreviewRequest {
  frequency: Frequency;
  items: BoxItemInput[];
  couponCode?: string;
}

export interface PricePreview {
  frequency: Frequency;
  items: (BoxItemInput & {
    title: string;
    unitPrice: Money;
    discountPercentage: number;
    finalUnitPrice: Money;
  })[];
  subtotal: Money;
  totalDiscount: Money;
  total: Money;
  appliedDiscountPercentage: number;
  couponApplied?: string;
  warnings: string[];
}

export interface SchedulingRequest extends PreviewRequest {
  giftHandles?: string[];
  nextCycleOnly?: boolean;
  reason?: string;
}

export interface PauseRequest {
  cycles: number;
  reason: string;
  answers?: { question: string; answer: string }[];
}
export interface CancelRequest {
  reason: string;
  answers?: { question: string; answer: string }[];
}
export interface ReasonOption {
  code: string;
  label: string;
  followUp?: { question: string; options: string[] };
}

// ---------- Pagamento ----------

export interface VindiConfig {
  publicKey: string;
  apiUrl: string;
  sandbox: boolean;
}
export interface AddCardRequest {
  gatewayToken: string;
  paymentCompanyCode?: string;
  setAsDefault?: boolean;
}
export interface PayWithNewCardRequest {
  gatewayToken: string;
  paymentCompanyCode?: string;
}

// ---------- Endereço ----------

export interface AddressQuoteRequest {
  postalCode: string;
}
export interface AddressQuote {
  postalCode: string;
  city: string;
  state: string;
  street?: string;
  neighborhood?: string;
  options: { id: string; method: string; carrier: string; estimateDays: number; price: Money }[];
}
export interface UpdateAddressRequest
  extends Omit<ShippingAddress, 'id' | 'deliveryMethod' | 'deliveryEstimateDays'> {
  quoteOptionId: string;
}

// ---------- Dispositivos / config ----------

export interface RegisterDeviceRequest {
  /** Token de push: Expo (RN) ou FCM/APNs (Flutter). */
  pushToken: string;
  pushProvider?: 'expo' | 'fcm' | 'apns';
  /** @deprecated use pushToken */
  expoPushToken?: string;
  platform: 'ios' | 'android';
  appVersion: string;
  deviceName?: string;
}
export interface NotificationPreferences {
  billing: boolean;
  shipping: boolean;
  renewal: boolean;
  marketing: boolean;
  /** Lembretes da rotina (frente 2). */
  routine?: boolean;
}

// ---------- Consentimentos (LGPD) ----------

export type ConsentKind = 'push' | 'health_data' | 'routine_data' | 'ai_assistant' | 'analytics';
export interface Consent {
  kind: ConsentKind;
  granted: boolean;
  grantedAt?: string;
  version: string;
}
export interface UpdateConsentRequest {
  kind: ConsentKind;
  granted: boolean;
  version: string;
}

// ---------- Rotina (frente 2: hábitos e suplementação) ----------

export type RoutineSlot = 'morning' | 'pre_workout' | 'afternoon' | 'evening';
export interface RoutineItem {
  id: string;
  productHandle: string; // item da caixa
  title: string;
  imageUrl?: string;
  slot: RoutineSlot;
  reminderTime?: string; // "07:30" (hora local do aparelho)
  reminderEnabled: boolean;
  dosesPerDay: number;
  /** Texto curto "para que serve / como tomar", vindo dos metaobjects. */
  usageHint?: string;
}
export interface RoutinePlan {
  items: RoutineItem[];
  weeklyGoalDays: number; // meta de dias por semana (1–7)
  timezone: string; // IANA, ex.: America/Sao_Paulo
}
export interface UpdateRoutinePlanRequest {
  items?: Omit<RoutineItem, 'title' | 'imageUrl' | 'usageHint'>[];
  weeklyGoalDays?: number;
  timezone?: string;
}
export interface CheckIn {
  id: string;
  routineItemId: string;
  date: string; // YYYY-MM-DD (fuso do plano)
  doneAt: string; // ISO
  source: 'manual' | 'reminder' | 'wearable';
}
export interface CheckInRequest {
  routineItemId: string;
  date: string;
  source?: CheckIn['source'];
}
export interface RoutineSummary {
  today: { date: string; items: { routineItemId: string; done: boolean }[]; completion: number };
  currentStreakDays: number;
  longestStreakDays: number;
  weekCompletion: number; // 0–1
  last28Days: { date: string; completion: number }[];
  /** Estimativa de consumo x estoque da caixa (latas chegando vs doses). */
  stockForecast?: {
    productHandle: string;
    dosesLeft: number;
    runsOutAt?: string;
    nextBoxAt?: string;
  }[];
}

// ---------- Saúde / wearables (frente 2, dados de HealthKit / Health Connect) ----------

export type HealthMetric =
  | 'steps'
  | 'active_minutes'
  | 'workouts'
  | 'sleep_minutes'
  | 'resting_heart_rate'
  | 'water_ml';
export interface HealthDailySample {
  date: string;
  metric: HealthMetric;
  value: number;
  source?: string;
}
/** O app envia só agregados diários (nunca séries brutas); exige consentimento `health_data`. */
export interface HealthSyncRequest {
  samples: HealthDailySample[];
  /** Origem dos agregados (HealthKit no iOS, Health Connect no Android). */
  provider?: 'apple_health' | 'health_connect';
}
export interface HealthSummary {
  connected: boolean;
  provider?: 'apple_health' | 'health_connect' | 'none';
  lastSyncAt?: string;
  last7Days: {
    date: string;
    steps?: number;
    activeMinutes?: number;
    workouts?: number;
    sleepMinutes?: number;
  }[];
  /** Recomendações simples baseadas em regras (ex.: treinou hoje → Morning Shot pré-treino). */
  suggestions: {
    id: string;
    title: string;
    body: string;
    productHandle?: string;
    deepLink?: string;
  }[];
}

// ---------- Assistente de IA (frente 5: Prime IA) ----------

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
export interface AssistantThread {
  id: string;
  title?: string;
  messages: AssistantMessage[];
  createdAt: string;
  updatedAt: string;
}
export interface AssistantSendRequest {
  threadId?: string; // ausente = nova conversa
  message: string;
  /** Contexto opcional que o app pode anexar (ex.: tela atual). O BFF já injeta caixa, rotina e plano. */
  context?: { screen?: string };
}
export interface AssistantSendResponse {
  threadId: string;
  reply: AssistantMessage;
  /** Ações sugeridas que o app pode renderizar como botões. */
  actions?: { label: string; deepLink: string }[];
  /** Aviso obrigatório exibido na primeira resposta de cada conversa. */
  disclaimer?: string;
}
export interface AssistantConfig {
  enabled: boolean;
  disclaimer: string;
  suggestedPrompts: string[];
  dailyMessageLimit: number;
}
export interface AppConfig {
  minSupportedVersion: string;
  /** Flags: routine, health, assistant, clubeVantagens, caffeineX… */
  features: Record<string, boolean>;
  links: {
    privacy: string;
    terms: string;
    support: string;
    subscribeUrl: string;
    healthPrivacy?: string;
  };
  /** Versões vigentes dos termos de consentimento. */
  consentVersions: Partial<Record<ConsentKind, string>>;
}

// ---------- Erros ----------

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
