import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiError, CapabilityReason } from '../contracts/api';

/**
 * Erro de aplicação já no formato público `{code, message, details?}`.
 * O filtro global converte qualquer outra exceção para este formato.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details } satisfies ApiError, status);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppError(HttpStatus.BAD_REQUEST, code, message, details);
  }
  static unauthorized(
    code = 'UNAUTHORIZED',
    message = 'Credenciais inválidas ou sessão expirada.',
  ) {
    return new AppError(HttpStatus.UNAUTHORIZED, code, message);
  }
  static forbidden(
    code = 'FORBIDDEN',
    message = 'Você não tem acesso a este recurso.',
    details?: unknown,
  ) {
    return new AppError(HttpStatus.FORBIDDEN, code, message, details);
  }
  static notFound(code: string, message: string) {
    return new AppError(HttpStatus.NOT_FOUND, code, message);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new AppError(HttpStatus.CONFLICT, code, message, details);
  }
  static unprocessable(code: string, message: string, details?: unknown) {
    return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
  }
  /** 403 com a razão da capability (ex.: EDIT_WINDOW_CLOSED). */
  static capabilityDenied(reason: CapabilityReason, details?: unknown) {
    return new AppError(HttpStatus.FORBIDDEN, reason, CAPABILITY_MESSAGES[reason], details);
  }
}

export const CAPABILITY_MESSAGES: Record<CapabilityReason, string> = {
  EDIT_WINDOW_CLOSED: 'Edições ficam bloqueadas nos 2 dias anteriores à cobrança.',
  SUBSCRIPTION_NOT_ACTIVE: 'A assinatura não está ativa.',
  FREQUENCY_NOT_ELIGIBLE: 'Apenas planos Semestral e Anual podem ser pausados.',
  NO_PAUSE_CREDITS: 'Você não tem mais créditos de pausa neste período.',
  PENDING_BILL: 'Há uma fatura pendente. Pague-a para liberar esta ação.',
  NOT_PAUSED: 'A assinatura não está pausada.',
  NOT_CANCELED: 'A assinatura não está cancelada.',
  CANCELLATION_BLOCKED: 'O cancelamento está bloqueado para esta assinatura.',
  UNDER_REVIEW: 'A assinatura está em análise; nenhuma ação disponível.',
};
