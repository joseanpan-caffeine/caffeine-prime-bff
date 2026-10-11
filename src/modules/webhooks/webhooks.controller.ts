import { Body, Controller, Headers, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { AppError } from '../../common/errors';
import { Env, ENV } from '../../config/env';
import { VindiWebhookPayload, WebhooksService } from './webhooks.service';

/** Entrada de eventos externos; sem sessão de usuário, com validação de origem. */
@ApiTags('webhooks')
@Controller('webhooks')
@Public()
export class WebhooksController {
  constructor(
    private readonly service: WebhooksService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('vindi')
  @HttpCode(200)
  @ApiOperation({ summary: 'Postback Vindi (bill_paid, charge_rejected…) — valida ?secret=' })
  vindi(@Query('secret') secret: string | undefined, @Body() body: VindiWebhookPayload) {
    if (!this.env.webhooks.vindiSecret || secret !== this.env.webhooks.vindiSecret) {
      throw AppError.unauthorized('INVALID_WEBHOOK_SECRET', 'Segredo do webhook inválido.');
    }
    return this.service.handleVindi(body);
  }

  @Post('estoca')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rastreio Estoca (payload cru v1 ou v2) — Bearer FREIGHT_SERVICE_ACCESS_TOKEN',
  })
  estoca(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!this.env.webhooks.freightToken || token !== this.env.webhooks.freightToken) {
      throw AppError.unauthorized('INVALID_WEBHOOK_TOKEN', 'Token do webhook inválido.');
    }
    return this.service.handleEstoca(body);
  }
}
