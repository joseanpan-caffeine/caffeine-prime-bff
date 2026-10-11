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

export interface SubscriptionPause {
  cycles: number;
  remainingCycles: number;
  pausedAt: string;
  resumeAt: string; // ISO
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
  id: string;
  status: SubscriptionStatus;
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
}

// ---------- Capacidades (regras calculadas no servidor) ----------

export type CapabilityReason =
  | 'EDIT_WINDOW_CLOSED'
  | 'SUBSCRIPTION_NOT_ACTIVE'
  | 'FREQUENCY_NOT_ELIGIBLE'
  | 'NO_PAUSE_CREDITS'
  | 'PENDING_BILL'
  | 'NOT_PAUSED'
  | 'NOT_CANCELED'
  | 'CANCELLATION_BLOCKED'
  | 'UNDER_REVIEW';

export interface Capability {
  allowed: boolean;
  reason?: CapabilityReason;
  until?: string;
}

export interface Capabilities {
  canEdit: Capability;
  canPause: Capability & { creditsLeft?: number; maxCycles?: number };
  canResume: Capability;
  canCancel: Capability & { remainingCommitmentMonths?: number; earlyWindow?: boolean };
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
  expoPushToken: string;
  platform: 'ios' | 'android';
  appVersion: string;
  deviceName?: string;
}
export interface NotificationPreferences {
  billing: boolean;
  shipping: boolean;
  renewal: boolean;
  marketing: boolean;
}
export interface AppConfig {
  minSupportedVersion: string;
  features: Record<string, boolean>;
  links: { privacy: string; terms: string; support: string; subscribeUrl: string };
}

// ---------- Erros ----------

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
