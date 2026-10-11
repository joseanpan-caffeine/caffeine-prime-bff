import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiError, CapabilityReason, ConsentKind } from '../contracts/api';

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
  static tooManyRequests(code: string, message: string, details?: unknown) {
    return new AppError(HttpStatus.TOO_MANY_REQUESTS, code, message, details);
  }
  /** 403 quando falta consentimento (LGPD) na versão vigente; `details.kind` diz qual. */
  static consentRequired(kind: ConsentKind, requiredVersion: string) {
    return new AppError(
      HttpStatus.FORBIDDEN,
      'CONSENT_REQUIRED',
      'Para usar este recurso é preciso aceitar o termo correspondente no app.',
      { kind, requiredVersion },
    );
  }
  /** 403 com a razão da capability (ex.: EDIT_WINDOW_CLOSED). */
  static capabilityDenied(reason: CapabilityReason, details?: unknown) {
    return new AppError(HttpStatus.FORBIDDEN, reason, CAPABILITY_MESSAGES[reason], details);
  }
}

export const CAPABILITY_MESSAGES: Record<CapabilityReason, string> = {
  EDIT_WINDOW_CLOSED: 'Edições ficam bloqueadas a partir de 3 dias antes da cobrança.',
  SUBSCRIPTION_NOT_ACTIVE: 'A assinatura não está ativa.',
  FREQUENCY_NOT_ELIGIBLE: 'Apenas planos Semestral e Anual podem ser pausados.',
  NO_PAUSE_CREDITS: 'Você não tem mais créditos de pausa neste período.',
  MIN_PAID_CYCLES: 'A pausa fica disponível a partir da 4ª cobrança paga.',
  PAUSE_WINDOW_CLOSED: 'O pedido de pausa só pode ser feito até 3 dias antes da cobrança.',
  RESUME_WINDOW_CLOSED: 'Só é possível desfazer a pausa até 5 dias antes da cobrança.',
  PENDING_BILL: 'Há uma fatura pendente. Pague-a para liberar esta ação.',
  NOT_PAUSED: 'A assinatura não está pausada.',
  NOT_CANCELED: 'A assinatura não está cancelada.',
  CANCELLATION_BLOCKED: 'O cancelamento está bloqueado para esta assinatura.',
  COMMITMENT_ACTIVE:
    'Sua fidelidade ainda está em vigor; o cancelamento fica disponível depois do último pagamento.',
  CANCEL_WINDOW_CLOSED:
    'A janela de cancelamento fechou: hoje é o dia da cobrança. Sem cancelar, a assinatura renova.',
  UNDER_REVIEW: 'A assinatura está em análise; nenhuma ação disponível.',
};
