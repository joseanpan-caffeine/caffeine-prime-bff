/**
 * DTOs de entrada (class-validator) espelhando os tipos de `contracts/api.ts`.
 * Mantidos em um único arquivo para facilitar a sincronização com o contrato.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type * as Api from '../contracts/api';

export const FREQUENCIES: Api.Frequency[] = ['Mensal', 'Trimestral', 'Semestral', 'Anual'];
export const RECURRENCES = [null, 'on', 'off'] as const;

// ---------- Auth ----------

export class LoginDto implements Api.LoginRequest {
  @ApiProperty({ example: 'ativa@teste.com' }) @IsEmail() email: string;
  @ApiProperty({ example: 'prime123' }) @IsString() @MinLength(1) @MaxLength(128) password: string;
  @ApiPropertyOptional({ example: 'iPhone de Mariana' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceName?: string;
}

export class SocialLoginDto implements Api.SocialLoginRequest {
  @ApiProperty({ description: 'id_token (Google) ou identityToken (Apple). Fake: `fake:<email>`' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) deviceName?: string;
}

export class MagicLinkDto implements Api.MagicLinkRequest {
  @ApiProperty({ example: 'ativa@teste.com' }) @IsEmail() email: string;
}

export class MagicLinkExchangeDto implements Api.MagicLinkExchangeRequest {
  @ApiProperty() @IsString() @IsNotEmpty() token: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) deviceName?: string;
}

export class RefreshDto implements Api.RefreshRequest {
  @ApiProperty() @IsString() @IsNotEmpty() refreshToken: string;
}

export class RegisterDto implements Api.RegisterRequest {
  @ApiProperty() @IsString() @Length(1, 60) firstName: string;
  @ApiProperty() @IsString() @Length(1, 60) lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(128) password: string;
  @ApiProperty({ example: '123.456.789-01' })
  @IsString()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'cpf inválido' })
  cpf: string;
  @ApiProperty({ example: '+5511999999999' }) @IsString() @Length(8, 20) phone: string;
  @ApiProperty({ example: '1990-05-20' }) @IsISO8601({ strict: true }) birthDate: string;
}

// ---------- Perfil ----------

export class UpdateProfileDto implements Api.UpdateProfileRequest {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(8, 20) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) gender?: string;
}

// ---------- Caixa / agendamento ----------

export class BoxItemInputDto implements Api.BoxItemInput {
  @ApiProperty({ example: 'supercoffee-3-0-original-380g' })
  @IsString()
  @IsNotEmpty()
  handle: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(1) @Max(50) quantity: number;
  @ApiPropertyOptional({ enum: ['on', 'off'], nullable: true, description: 'null = todo ciclo' })
  @IsOptional()
  @IsIn(RECURRENCES as unknown as string[])
  recurrence?: Api.ItemRecurrence;
}

export class PreviewDto implements Api.PreviewRequest {
  @ApiProperty({ enum: FREQUENCIES }) @IsIn(FREQUENCIES) frequency: Api.Frequency;
  @ApiProperty({ type: [BoxItemInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BoxItemInputDto)
  items: BoxItemInputDto[];
  @ApiPropertyOptional({ example: 'PRIME10' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;
}

export class SchedulingDto extends PreviewDto implements Api.SchedulingRequest {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  giftHandles?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() nextCycleOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class RecurrenceDto {
  @ApiProperty({ enum: ['on', 'off'], nullable: true })
  @IsIn(RECURRENCES as unknown as string[])
  recurrence: Api.ItemRecurrence;
}

export class DiscountDto {
  @ApiProperty({ example: 'PRIME10' }) @IsString() @IsNotEmpty() @MaxLength(40) code: string;
}

export class AnswerDto {
  @ApiProperty() @IsString() question: string;
  @ApiProperty() @IsString() answer: string;
}

export class PauseDto implements Api.PauseRequest {
  @ApiProperty({ example: 1, minimum: 1, maximum: 2 }) @IsInt() @Min(1) @Max(2) cycles: number;
  @ApiProperty({ example: 'stock' }) @IsString() @IsNotEmpty() reason: string;
  @ApiPropertyOptional({ type: [AnswerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers?: AnswerDto[];
}

export class CancelDto implements Api.CancelRequest {
  @ApiProperty({ example: 'price' }) @IsString() @IsNotEmpty() reason: string;
  @ApiPropertyOptional({ type: [AnswerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers?: AnswerDto[];
}

// ---------- Pagamento ----------

export class AddCardDto implements Api.AddCardRequest {
  @ApiProperty({ example: 'tok_visa_4242' }) @IsString() @IsNotEmpty() gatewayToken: string;
  @ApiPropertyOptional({ example: 'visa' }) @IsOptional() @IsString() paymentCompanyCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() setAsDefault?: boolean;
}

export class PayWithNewCardDto implements Api.PayWithNewCardRequest {
  @ApiProperty({ example: 'tok_mastercard_5555' }) @IsString() @IsNotEmpty() gatewayToken: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentCompanyCode?: string;
}

// ---------- Endereço ----------

export class AddressQuoteDto implements Api.AddressQuoteRequest {
  @ApiProperty({ example: '01311-000' })
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'postalCode deve ter 8 dígitos' })
  postalCode: string;
}

export class UpdateAddressDto implements Api.UpdateAddressRequest {
  @ApiProperty() @IsString() @Length(1, 120) recipient: string;
  @ApiProperty({ example: '01311-000' }) @IsString() @Matches(/^\d{5}-?\d{3}$/) postalCode: string;
  @ApiProperty() @IsString() @Length(1, 160) street: string;
  @ApiProperty() @IsString() @Length(1, 20) number: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) complement?: string;
  @ApiProperty() @IsString() @Length(1, 80) neighborhood: string;
  @ApiProperty() @IsString() @Length(1, 80) city: string;
  @ApiProperty({ example: 'SP' }) @IsString() @Length(2, 2) state: string;
  @ApiProperty({ description: 'id da opção devolvida por /me/shipping-address/quote' })
  @IsString()
  @IsNotEmpty()
  quoteOptionId: string;
}

// ---------- Extras ----------

export class DeleteRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export const PUSH_PROVIDERS = ['expo', 'fcm', 'apns'] as const;

/**
 * Registro de dispositivo. `pushToken` é o campo atual; `expoPushToken` é alias deprecado (apps
 * antigos) e, quando é o único enviado, vira `pushToken` com `pushProvider: 'expo'`.
 */
export class RegisterDeviceDto {
  @ApiPropertyOptional({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @ValidateIf((o) => o.expoPushToken === undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  pushToken?: string;
  @ApiPropertyOptional({ enum: PUSH_PROVIDERS, description: 'padrão: expo' })
  @IsOptional()
  @IsIn(PUSH_PROVIDERS as unknown as string[])
  pushProvider?: Api.RegisterDeviceRequest['pushProvider'];
  @ApiPropertyOptional({ deprecated: true, description: 'use pushToken' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  expoPushToken?: string;
  @ApiProperty({ enum: ['ios', 'android'] }) @IsIn(['ios', 'android']) platform: 'ios' | 'android';
  @ApiProperty({ example: '1.0.0' }) @IsString() @IsNotEmpty() appVersion: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) deviceName?: string;
}

export class NotificationPreferencesPatchDto implements Partial<Api.NotificationPreferences> {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() billing?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shipping?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() renewal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketing?: boolean;
  @ApiPropertyOptional({ description: 'Lembretes da rotina' })
  @IsOptional()
  @IsBoolean()
  routine?: boolean;
}

// ---------- Consentimentos ----------

export const CONSENT_KINDS: Api.ConsentKind[] = [
  'push',
  'health_data',
  'routine_data',
  'ai_assistant',
  'analytics',
];

export class UpdateConsentDto implements Api.UpdateConsentRequest {
  @ApiProperty({ enum: CONSENT_KINDS }) @IsIn(CONSENT_KINDS) kind: Api.ConsentKind;
  @ApiProperty() @IsBoolean() granted: boolean;
  @ApiProperty({
    example: '2026-10-11',
    description: 'versão do termo (AppConfig.consentVersions)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  version: string;
}

// ---------- Rotina ----------

export const ROUTINE_SLOTS: Api.RoutineSlot[] = ['morning', 'pre_workout', 'afternoon', 'evening'];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class RoutineItemInputDto
  implements Omit<Api.RoutineItem, 'title' | 'imageUrl' | 'usageHint'>
{
  @ApiProperty({ description: 'id existente ou novo (o BFF gera se vazio)' })
  @IsString()
  @MaxLength(80)
  id: string;
  @ApiProperty({ example: 'supercoffee-3-0-original-380g' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  productHandle: string;
  @ApiProperty({ enum: ROUTINE_SLOTS }) @IsIn(ROUTINE_SLOTS) slot: Api.RoutineSlot;
  @ApiPropertyOptional({ example: '07:30' })
  @IsOptional()
  @Matches(TIME_HHMM, { message: 'reminderTime deve ser HH:mm' })
  reminderTime?: string;
  @ApiProperty() @IsBoolean() reminderEnabled: boolean;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) @Max(6) dosesPerDay: number;
}

export class UpdateRoutinePlanDto implements Api.UpdateRoutinePlanRequest {
  @ApiPropertyOptional({ type: [RoutineItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RoutineItemInputDto)
  items?: RoutineItemInputDto[];
  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weeklyGoalDays?: number;
  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export const CHECK_IN_SOURCES: Api.CheckIn['source'][] = ['manual', 'reminder', 'wearable'];

export class CheckInDto implements Api.CheckInRequest {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) routineItemId: string;
  @ApiProperty({ example: '2026-10-11' })
  @Matches(DATE_KEY, { message: 'date deve ser YYYY-MM-DD' })
  date: string;
  @ApiPropertyOptional({ enum: CHECK_IN_SOURCES })
  @IsOptional()
  @IsIn(CHECK_IN_SOURCES)
  source?: Api.CheckIn['source'];
}

// ---------- Saúde ----------

export const HEALTH_METRICS: Api.HealthMetric[] = [
  'steps',
  'active_minutes',
  'workouts',
  'sleep_minutes',
  'resting_heart_rate',
  'water_ml',
];

export class HealthDailySampleDto implements Api.HealthDailySample {
  @ApiProperty({ example: '2026-10-11' })
  @Matches(DATE_KEY, { message: 'date deve ser YYYY-MM-DD' })
  date: string;
  @ApiProperty({ enum: HEALTH_METRICS }) @IsIn(HEALTH_METRICS) metric: Api.HealthMetric;
  @ApiProperty({ example: 8200 }) @IsNumber() @Min(0) @Max(1_000_000) value: number;
  @ApiPropertyOptional({ example: 'Apple Watch' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}

export class HealthSyncDto implements Api.HealthSyncRequest {
  @ApiProperty({ type: [HealthDailySampleDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => HealthDailySampleDto)
  samples: HealthDailySampleDto[];
  @ApiPropertyOptional({ enum: ['apple_health', 'health_connect'] })
  @IsOptional()
  @IsIn(['apple_health', 'health_connect'])
  provider?: 'apple_health' | 'health_connect';
}

// ---------- Assistente ----------

export class AssistantContextDto {
  @ApiPropertyOptional({ example: 'box' }) @IsOptional() @IsString() @MaxLength(60) screen?: string;
}

export class AssistantSendDto implements Api.AssistantSendRequest {
  @ApiPropertyOptional({ description: 'ausente = nova conversa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  threadId?: string;
  @ApiProperty({ example: 'Quando posso pausar?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
  @ApiPropertyOptional({ type: AssistantContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context?: AssistantContextDto;
}
