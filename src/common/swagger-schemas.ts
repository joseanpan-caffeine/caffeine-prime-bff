/**
 * Classes somente para documentação Swagger/OpenAPI das respostas. O contrato real é
 * `contracts/api.ts`; estas classes o espelham campo a campo para gerar o `openapi.yaml`.
 */
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ApiOkType = (type: any, isArray = false) =>
  applyDecorators(ApiExtraModels(type), ApiOkResponse({ type, isArray }));

export class MoneySchema {
  @ApiProperty({ example: 144.9 }) amount: number;
  @ApiProperty({ enum: ['BRL'] }) currency: 'BRL';
}

export class UserProfileSchema {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiPropertyOptional({ example: '***.***.123-45' }) cpf?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() gender?: string;
  @ApiProperty() hasSubscription: boolean;
}

export class AuthTokensSchema {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ example: 900 }) expiresIn: number;
}

export class AuthResponseSchema extends AuthTokensSchema {
  @ApiProperty({ type: UserProfileSchema }) user: UserProfileSchema;
}

export class ProductItemSchema {
  @ApiProperty() id: string;
  @ApiProperty() handle: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() flavor?: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiPropertyOptional() sku?: string;
  @ApiProperty() quantity: number;
  @ApiProperty({ type: MoneySchema }) price: MoneySchema;
  @ApiProperty() discountPercentage: number;
  @ApiProperty({ type: MoneySchema }) finalPrice: MoneySchema;
  @ApiProperty({ enum: ['on', 'off'], nullable: true }) recurrence: 'on' | 'off' | null;
  @ApiPropertyOptional() cyclesLeft?: number;
  @ApiPropertyOptional() isGift?: boolean;
}

export class DiscountSchema {
  @ApiPropertyOptional() code?: string;
  @ApiProperty() percentage: number;
  @ApiPropertyOptional() temporaryCode?: string;
  @ApiPropertyOptional() temporaryPercentage?: number;
  @ApiPropertyOptional() temporaryCycles?: number;
}

export class PaymentProfileSchema {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Visa' }) brand: string;
  @ApiProperty({ example: '4242' }) lastFour: string;
  @ApiProperty() holderName: string;
  @ApiProperty({ example: '08/2029' }) expiration: string;
  @ApiProperty() isDefault: boolean;
}

export class ShippingAddressSchema {
  @ApiProperty() id: string;
  @ApiProperty() recipient: string;
  @ApiProperty() postalCode: string;
  @ApiProperty() street: string;
  @ApiProperty() number: string;
  @ApiPropertyOptional() complement?: string;
  @ApiProperty() neighborhood: string;
  @ApiProperty() city: string;
  @ApiProperty() state: string;
  @ApiPropertyOptional() deliveryMethod?: string;
  @ApiPropertyOptional() deliveryEstimateDays?: number;
}

export class SubscriptionPauseSchema {
  @ApiProperty() cycles: number;
  @ApiProperty() remainingCycles: number;
  @ApiProperty() pausedAt: string;
  @ApiProperty() resumeAt: string;
  @ApiPropertyOptional({ enum: ['User', 'Offer'], description: 'Offer = pausa de retenção' })
  pauseType?: string;
}

export class ScheduledChangeSchema {
  @ApiProperty() id: string;
  @ApiProperty() appliesAt: string;
  @ApiProperty({ enum: ['Mensal', 'Trimestral', 'Semestral', 'Anual'] }) frequency: string;
  @ApiProperty() planName: string;
  @ApiProperty({ type: [ProductItemSchema] }) items: ProductItemSchema[];
  @ApiProperty({ type: MoneySchema }) total: MoneySchema;
  @ApiProperty() nextCycleOnly: boolean;
}

export class SubscriptionSchema {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['active', 'future', 'paused', 'canceled', 'fraud_review'] }) status: string;
  @ApiPropertyOptional({ description: 'Status original quando fora do enum conhecido' })
  rawStatus?: string;
  @ApiProperty({ enum: ['Mensal', 'Trimestral', 'Semestral', 'Anual'] }) frequency: string;
  @ApiProperty() planName: string;
  @ApiProperty() startedAt: string;
  @ApiProperty() nextBillingAt: string;
  @ApiProperty() currentCycle: number;
  @ApiProperty() paidCycles: number;
  @ApiProperty({ description: '-1 para Mensal' }) remainingCommitmentMonths: number;
  @ApiProperty() pauseCreditsLeft: number;
  @ApiProperty({ type: [ProductItemSchema] }) items: ProductItemSchema[];
  @ApiProperty({ type: DiscountSchema }) discount: DiscountSchema;
  @ApiPropertyOptional({ type: PaymentProfileSchema }) paymentProfile?: PaymentProfileSchema;
  @ApiPropertyOptional({ type: ShippingAddressSchema }) shippingAddress?: ShippingAddressSchema;
  @ApiPropertyOptional({ type: SubscriptionPauseSchema }) pause?: SubscriptionPauseSchema;
  @ApiPropertyOptional({ type: ScheduledChangeSchema }) scheduledChange?: ScheduledChangeSchema;
  @ApiProperty({ type: MoneySchema }) subtotal: MoneySchema;
  @ApiProperty({ type: MoneySchema }) totalDiscount: MoneySchema;
  @ApiProperty({ type: MoneySchema }) total: MoneySchema;
}

export class TrackingEventSchema {
  @ApiProperty() status: string;
  @ApiProperty() description: string;
  @ApiProperty() occurredAt: string;
  @ApiPropertyOptional() location?: string;
}

export class FulfillmentSchema {
  @ApiProperty({
    enum: [
      'pending',
      'processing',
      'shipped',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'failed',
    ],
  })
  status: string;
  @ApiPropertyOptional() carrier?: string;
  @ApiPropertyOptional() trackingCode?: string;
  @ApiPropertyOptional() trackingUrl?: string;
  @ApiPropertyOptional() estimatedDeliveryAt?: string;
  @ApiProperty({ type: [TrackingEventSchema] }) events: TrackingEventSchema[];
}

export class PixChargeSchema {
  @ApiProperty() qrCodeImageUrl: string;
  @ApiProperty() qrCodeText: string;
  @ApiProperty() expiresAt: string;
}

export class BillSchema {
  @ApiProperty() id: string;
  @ApiProperty() cycle: number;
  @ApiProperty({ enum: ['pending', 'paid', 'canceled', 'review'] }) status: string;
  @ApiProperty() issuedAt: string;
  @ApiProperty() dueAt: string;
  @ApiPropertyOptional() paidAt?: string;
  @ApiProperty({ type: MoneySchema }) amount: MoneySchema;
  @ApiPropertyOptional({ enum: ['credit_card', 'pix'] }) paymentMethod?: string;
  @ApiPropertyOptional({ type: PaymentProfileSchema }) paymentProfile?: PaymentProfileSchema;
  @ApiPropertyOptional({ type: PixChargeSchema }) pix?: PixChargeSchema;
  @ApiProperty({ type: [ProductItemSchema] }) items: ProductItemSchema[];
  @ApiPropertyOptional({ type: FulfillmentSchema }) fulfillment?: FulfillmentSchema;
  @ApiPropertyOptional({ description: 'Fatura R$ 0,00 de ciclo pausado (esperado, não erro)' })
  pausedCycle?: boolean;
}

const REASONS = [
  'EDIT_WINDOW_CLOSED',
  'SUBSCRIPTION_NOT_ACTIVE',
  'FREQUENCY_NOT_ELIGIBLE',
  'NO_PAUSE_CREDITS',
  'MIN_PAID_CYCLES',
  'PAUSE_WINDOW_CLOSED',
  'RESUME_WINDOW_CLOSED',
  'PENDING_BILL',
  'NOT_PAUSED',
  'NOT_CANCELED',
  'CANCELLATION_BLOCKED',
  'COMMITMENT_ACTIVE',
  'CANCEL_WINDOW_CLOSED',
  'UNDER_REVIEW',
];

export class CapabilitySchema {
  @ApiProperty() allowed: boolean;
  @ApiPropertyOptional({ enum: REASONS }) reason?: string;
  @ApiPropertyOptional({ description: 'Quando reabre (ISO, São Paulo)' }) until?: string;
  @ApiPropertyOptional({ description: 'Quando a ação deixa de ser permitida (ISO, São Paulo)' })
  closesAt?: string;
}

export class PauseCapabilitySchema extends CapabilitySchema {
  @ApiPropertyOptional() creditsLeft?: number;
  @ApiPropertyOptional() maxCycles?: number;
}

export class CancelCapabilitySchema extends CapabilitySchema {
  @ApiPropertyOptional() remainingCommitmentMonths?: number;
  @ApiPropertyOptional() earlyWindow?: boolean;
  @ApiPropertyOptional({ description: 'Estimativa ISO do fim da fidelidade' })
  commitmentEndsAt?: string;
}

export class PendingBillSchema {
  @ApiProperty() id: string;
  @ApiProperty({ type: MoneySchema }) amount: MoneySchema;
  @ApiProperty() dueAt: string;
  @ApiProperty() pixAvailable: boolean;
}

export class CapabilitiesSchema {
  @ApiProperty({ type: CapabilitySchema }) canEdit: CapabilitySchema;
  @ApiProperty({ type: PauseCapabilitySchema }) canPause: PauseCapabilitySchema;
  @ApiProperty({ type: CapabilitySchema }) canResume: CapabilitySchema;
  @ApiProperty({ type: CancelCapabilitySchema }) canCancel: CancelCapabilitySchema;
  @ApiProperty({ type: CapabilitySchema }) canReactivate: CapabilitySchema;
  @ApiProperty({ type: CapabilitySchema }) canChangeCard: CapabilitySchema;
  @ApiProperty({ type: CapabilitySchema }) canChangeAddress: CapabilitySchema;
  @ApiProperty() hasPendingBill: boolean;
  @ApiPropertyOptional({ type: PendingBillSchema }) pendingBill?: PendingBillSchema;
}

export class BannerSchema {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() subtitle?: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiPropertyOptional() deepLink?: string;
}

export class LastCanceledSchema {
  @ApiProperty() canceledAt: string;
  @ApiPropertyOptional() reason?: string;
  @ApiProperty() subscriptionId: string;
}

export class SavingsSchema {
  @ApiProperty({ type: MoneySchema }) last12Months: MoneySchema;
  @ApiProperty({ type: MoneySchema }) sinceStart: MoneySchema;
}

export class WalletSchema {
  @ApiProperty() points: number;
  @ApiProperty() label: string;
}

export class DashboardSchema {
  @ApiProperty({ type: UserProfileSchema }) user: UserProfileSchema;
  @ApiProperty({ type: SubscriptionSchema, nullable: true })
  subscription: SubscriptionSchema | null;
  @ApiPropertyOptional({ type: LastCanceledSchema }) lastCanceled?: LastCanceledSchema;
  @ApiProperty({ type: CapabilitiesSchema }) capabilities: CapabilitiesSchema;
  @ApiPropertyOptional({ type: BillSchema }) latestBill?: BillSchema;
  @ApiPropertyOptional({ type: FulfillmentSchema }) tracking?: FulfillmentSchema;
  @ApiProperty({ type: SavingsSchema }) savings: SavingsSchema;
  @ApiProperty({ type: WalletSchema }) wallet: WalletSchema;
  @ApiProperty({ type: [BannerSchema] }) banners: BannerSchema[];
}

export class PlanSchema {
  @ApiProperty({ enum: ['Mensal', 'Trimestral', 'Semestral', 'Anual'] }) frequency: string;
  @ApiProperty() name: string;
  @ApiProperty() commitmentMonths: number;
  @ApiProperty() discountPercentage: number;
  @ApiProperty() pauseCredits: number;
  @ApiPropertyOptional() highlight?: string;
}

export class FlavorSchema {
  @ApiProperty() handle: string;
  @ApiProperty() title: string;
  @ApiProperty() inStock: boolean;
}

export class CatalogProductSchema {
  @ApiProperty() handle: string;
  @ApiProperty() title: string;
  @ApiProperty() category: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty({ type: MoneySchema }) price: MoneySchema;
  @ApiPropertyOptional({ type: [FlavorSchema] }) flavors?: FlavorSchema[];
  @ApiProperty() inStock: boolean;
  @ApiProperty() minQuantity: number;
  @ApiProperty() maxQuantity: number;
  @ApiPropertyOptional({ description: 'Para que serve / como tomar' }) usageHint?: string;
  @ApiPropertyOptional({ description: 'Doses por unidade (previsão de estoque)' })
  dosesPerUnit?: number;
}

export class DiscountTierSchema {
  @ApiProperty() minItems: number;
  @ApiProperty() discountPercentage: number;
  @ApiProperty() label: string;
}

export class GiftSchema {
  @ApiProperty() handle: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiPropertyOptional({ type: [String] }) requiresPlan?: string[];
}

export class CatalogSchema {
  @ApiProperty({ type: [PlanSchema] }) plans: PlanSchema[];
  @ApiProperty({ type: [CatalogProductSchema] }) products: CatalogProductSchema[];
  @ApiProperty({ type: [DiscountTierSchema] }) discountTiers: DiscountTierSchema[];
  @ApiProperty({ type: [GiftSchema] }) gifts: GiftSchema[];
}

export class PricePreviewItemSchema {
  @ApiProperty() handle: string;
  @ApiProperty() quantity: number;
  @ApiPropertyOptional({ enum: ['on', 'off'], nullable: true }) recurrence?: string | null;
  @ApiProperty() title: string;
  @ApiProperty({ type: MoneySchema }) unitPrice: MoneySchema;
  @ApiProperty() discountPercentage: number;
  @ApiProperty({ type: MoneySchema }) finalUnitPrice: MoneySchema;
}

export class PricePreviewSchema {
  @ApiProperty({ enum: ['Mensal', 'Trimestral', 'Semestral', 'Anual'] }) frequency: string;
  @ApiProperty({ type: [PricePreviewItemSchema] }) items: PricePreviewItemSchema[];
  @ApiProperty({ type: MoneySchema }) subtotal: MoneySchema;
  @ApiProperty({ type: MoneySchema }) totalDiscount: MoneySchema;
  @ApiProperty({ type: MoneySchema }) total: MoneySchema;
  @ApiProperty() appliedDiscountPercentage: number;
  @ApiPropertyOptional() couponApplied?: string;
  @ApiProperty({ type: [String] }) warnings: string[];
}

export class FollowUpSchema {
  @ApiProperty() question: string;
  @ApiProperty({ type: [String] }) options: string[];
}

export class ReasonOptionSchema {
  @ApiProperty() code: string;
  @ApiProperty() label: string;
  @ApiPropertyOptional({ type: FollowUpSchema }) followUp?: FollowUpSchema;
}

export class VindiConfigSchema {
  @ApiProperty() publicKey: string;
  @ApiProperty() apiUrl: string;
  @ApiProperty() sandbox: boolean;
}

export class AddressQuoteOptionSchema {
  @ApiProperty() id: string;
  @ApiProperty() method: string;
  @ApiProperty() carrier: string;
  @ApiProperty() estimateDays: number;
  @ApiProperty({ type: MoneySchema }) price: MoneySchema;
}

export class AddressQuoteSchema {
  @ApiProperty() postalCode: string;
  @ApiProperty() city: string;
  @ApiProperty() state: string;
  @ApiPropertyOptional() street?: string;
  @ApiPropertyOptional() neighborhood?: string;
  @ApiProperty({ type: [AddressQuoteOptionSchema] }) options: AddressQuoteOptionSchema[];
}

export class NotificationPreferencesSchema {
  @ApiProperty() billing: boolean;
  @ApiProperty() shipping: boolean;
  @ApiProperty() renewal: boolean;
  @ApiProperty() marketing: boolean;
  @ApiPropertyOptional({ description: 'Lembretes da rotina' }) routine?: boolean;
}

export class AppConfigLinksSchema {
  @ApiProperty() privacy: string;
  @ApiProperty() terms: string;
  @ApiProperty() support: string;
  @ApiProperty() subscribeUrl: string;
  @ApiPropertyOptional() healthPrivacy?: string;
}

const CONSENT_KINDS = ['push', 'health_data', 'routine_data', 'ai_assistant', 'analytics'];

export class AppConfigSchema {
  @ApiProperty() minSupportedVersion: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } }) features: Record<
    string,
    boolean
  >;
  @ApiProperty({ type: AppConfigLinksSchema }) links: AppConfigLinksSchema;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Versões vigentes dos termos de consentimento por tipo',
  })
  consentVersions: Record<string, string>;
}

// ---------- Consentimentos ----------

export class ConsentSchema {
  @ApiProperty({ enum: CONSENT_KINDS }) kind: string;
  @ApiProperty() granted: boolean;
  @ApiPropertyOptional() grantedAt?: string;
  @ApiProperty({ example: '2026-10-11' }) version: string;
}

// ---------- Rotina ----------

const ROUTINE_SLOTS = ['morning', 'pre_workout', 'afternoon', 'evening'];

export class RoutineItemSchema {
  @ApiProperty() id: string;
  @ApiProperty() productHandle: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty({ enum: ROUTINE_SLOTS }) slot: string;
  @ApiPropertyOptional({ example: '07:30' }) reminderTime?: string;
  @ApiProperty() reminderEnabled: boolean;
  @ApiProperty() dosesPerDay: number;
  @ApiPropertyOptional() usageHint?: string;
}

export class RoutinePlanSchema {
  @ApiProperty({ type: [RoutineItemSchema] }) items: RoutineItemSchema[];
  @ApiProperty({ minimum: 1, maximum: 7 }) weeklyGoalDays: number;
  @ApiProperty({ example: 'America/Sao_Paulo' }) timezone: string;
}

export class CheckInSchema {
  @ApiProperty() id: string;
  @ApiProperty() routineItemId: string;
  @ApiProperty({ example: '2026-10-11' }) date: string;
  @ApiProperty() doneAt: string;
  @ApiProperty({ enum: ['manual', 'reminder', 'wearable'] }) source: string;
}

export class RoutineTodayItemSchema {
  @ApiProperty() routineItemId: string;
  @ApiProperty() done: boolean;
}

export class RoutineTodaySchema {
  @ApiProperty() date: string;
  @ApiProperty({ type: [RoutineTodayItemSchema] }) items: RoutineTodayItemSchema[];
  @ApiProperty({ description: '0–1' }) completion: number;
}

export class RoutineDaySchema {
  @ApiProperty() date: string;
  @ApiProperty({ description: '0–1' }) completion: number;
}

export class StockForecastSchema {
  @ApiProperty() productHandle: string;
  @ApiProperty() dosesLeft: number;
  @ApiPropertyOptional() runsOutAt?: string;
  @ApiPropertyOptional() nextBoxAt?: string;
}

export class RoutineSummarySchema {
  @ApiProperty({ type: RoutineTodaySchema }) today: RoutineTodaySchema;
  @ApiProperty() currentStreakDays: number;
  @ApiProperty() longestStreakDays: number;
  @ApiProperty({ description: '0–1' }) weekCompletion: number;
  @ApiProperty({ type: [RoutineDaySchema] }) last28Days: RoutineDaySchema[];
  @ApiPropertyOptional({ type: [StockForecastSchema] }) stockForecast?: StockForecastSchema[];
}

// ---------- Saúde ----------

export class HealthDaySchema {
  @ApiProperty() date: string;
  @ApiPropertyOptional() steps?: number;
  @ApiPropertyOptional() activeMinutes?: number;
  @ApiPropertyOptional() workouts?: number;
  @ApiPropertyOptional() sleepMinutes?: number;
}

export class HealthSuggestionSchema {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiPropertyOptional() productHandle?: string;
  @ApiPropertyOptional() deepLink?: string;
}

export class HealthSummarySchema {
  @ApiProperty() connected: boolean;
  @ApiPropertyOptional({ enum: ['apple_health', 'health_connect', 'none'] }) provider?: string;
  @ApiPropertyOptional() lastSyncAt?: string;
  @ApiProperty({ type: [HealthDaySchema] }) last7Days: HealthDaySchema[];
  @ApiProperty({ type: [HealthSuggestionSchema] }) suggestions: HealthSuggestionSchema[];
}

// ---------- Assistente ----------

export class AssistantMessageSchema {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['user', 'assistant'] }) role: string;
  @ApiProperty() content: string;
  @ApiProperty() createdAt: string;
}

export class AssistantThreadSchema {
  @ApiProperty() id: string;
  @ApiPropertyOptional() title?: string;
  @ApiProperty({ type: [AssistantMessageSchema], description: 'vazio na listagem' })
  messages: AssistantMessageSchema[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

export class AssistantActionSchema {
  @ApiProperty() label: string;
  @ApiProperty({ example: 'app://routine' }) deepLink: string;
}

export class AssistantSendResponseSchema {
  @ApiProperty() threadId: string;
  @ApiProperty({ type: AssistantMessageSchema }) reply: AssistantMessageSchema;
  @ApiPropertyOptional({ type: [AssistantActionSchema] }) actions?: AssistantActionSchema[];
  @ApiPropertyOptional({ description: 'Presente na primeira resposta de cada conversa' })
  disclaimer?: string;
}

export class AssistantConfigSchema {
  @ApiProperty() enabled: boolean;
  @ApiProperty() disclaimer: string;
  @ApiProperty({ type: [String] }) suggestedPrompts: string[];
  @ApiProperty() dailyMessageLimit: number;
}

export class IdSchema {
  @ApiProperty() id: string;
}

export class ApiErrorSchema {
  @ApiProperty({ example: 'EDIT_WINDOW_CLOSED' }) code: string;
  @ApiProperty() message: string;
  @ApiPropertyOptional() details?: unknown;
}
