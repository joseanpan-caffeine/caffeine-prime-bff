import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedCustomer, CurrentCustomer } from '../../common/decorators';
import {
  CancelDto,
  DiscountDto,
  PauseDto,
  PreviewDto,
  RecurrenceDto,
  SchedulingDto,
} from '../../common/dto';
import {
  ApiOkType,
  CatalogSchema,
  PricePreviewSchema,
  ReasonOptionSchema,
  ScheduledChangeSchema,
  SubscriptionSchema,
} from '../../common/swagger-schemas';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@ApiBearerAuth()
@Controller('me')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Get('subscription')
  @ApiOperation({ summary: 'Assinatura atual (404 se não há)' })
  @ApiOkType(SubscriptionSchema)
  get(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.get(c.customerId);
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Catálogo para edição da caixa' })
  @ApiOkType(CatalogSchema)
  catalog() {
    return this.service.getCatalog();
  }

  @Post('subscription/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview de preço da caixa (cálculo local)' })
  @ApiOkType(PricePreviewSchema)
  preview(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: PreviewDto) {
    return this.service.preview(c.customerId, dto);
  }

  @Post('subscription/scheduling')
  @HttpCode(201)
  @ApiOperation({ summary: 'Agenda mudança de itens/plano (403 EDIT_WINDOW_CLOSED na janela D-2)' })
  @ApiOkType(ScheduledChangeSchema)
  scheduling(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: SchedulingDto) {
    return this.service.createScheduling(c.customerId, dto);
  }

  @Delete('subscription/scheduling')
  @HttpCode(204)
  @ApiOperation({ summary: 'Desfaz a mudança agendada' })
  async deleteScheduling(@CurrentCustomer() c: AuthenticatedCustomer) {
    await this.service.deleteScheduling(c.customerId);
  }

  @Patch('subscription/items/:itemId/recurrence')
  @ApiOperation({ summary: 'Recorrência 60 dias de um item (422 se todos ficariam on/off)' })
  @ApiOkType(SubscriptionSchema)
  recurrence(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Param('itemId') itemId: string,
    @Body() dto: RecurrenceDto,
  ) {
    return this.service.updateItemRecurrence(c.customerId, itemId, dto.recurrence);
  }

  @Patch('subscription/discount')
  @ApiOperation({ summary: 'Aplica cupom' })
  @ApiOkType(SubscriptionSchema)
  discount(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: DiscountDto) {
    return this.service.updateDiscount(c.customerId, dto.code);
  }

  @Post('subscription/pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pausa a assinatura (403 com reason quando não permitido)' })
  @ApiOkType(SubscriptionSchema)
  pause(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: PauseDto) {
    return this.service.pause(c.customerId, dto);
  }

  @Post('subscription/resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retoma a assinatura pausada' })
  @ApiOkType(SubscriptionSchema)
  resume(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.resume(c.customerId);
  }

  @Post('subscription/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela a assinatura' })
  @ApiOkType(SubscriptionSchema)
  cancel(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: CancelDto) {
    return this.service.cancel(c.customerId, dto);
  }

  @Post('subscription/reactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reativa a assinatura cancelada' })
  @ApiOkType(SubscriptionSchema)
  reactivate(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.reactivate(c.customerId);
  }

  @Get('subscription/cancel-reasons')
  @ApiOkType(ReasonOptionSchema, true)
  cancelReasons() {
    return this.service.cancelReasons();
  }

  @Get('subscription/pause-reasons')
  @ApiOkType(ReasonOptionSchema, true)
  pauseReasons() {
    return this.service.pauseReasons();
  }
}
