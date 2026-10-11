import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuthenticatedCustomer,
  CurrentCustomer,
  OwnedResource,
  Public,
} from '../../common/decorators';
import { AddCardDto, PayWithNewCardDto } from '../../common/dto';
import {
  ApiOkType,
  BillSchema,
  PaymentProfileSchema,
  VindiConfigSchema,
} from '../../common/swagger-schemas';
import { PaymentsService } from './payments.service';

const PAYMENT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('payments')
@Controller('payments')
export class VindiConfigController {
  constructor(private readonly service: PaymentsService) {}

  @Get('vindi-config')
  @Public()
  @ApiOperation({ summary: 'Chave pública e URL da Vindi para tokenização no app' })
  @ApiOkType(VindiConfigSchema)
  vindiConfig() {
    return this.service.vindiConfig();
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('me')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get('payment-profiles')
  @ApiOkType(PaymentProfileSchema, true)
  listProfiles(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.listProfiles(c.customerId);
  }

  @Post('payment-profiles')
  @HttpCode(201)
  @Throttle(PAYMENT_THROTTLE)
  @ApiOperation({ summary: 'Adiciona cartão a partir do gateway_token da Vindi' })
  @ApiOkType(PaymentProfileSchema)
  addProfile(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: AddCardDto) {
    return this.service.addProfile(c.customerId, dto);
  }

  @Delete('payment-profiles/:id')
  @HttpCode(204)
  @OwnedResource('paymentProfile', 'id')
  async deleteProfile(@CurrentCustomer() c: AuthenticatedCustomer, @Param('id') id: string) {
    await this.service.deleteProfile(c.customerId, id);
  }

  @Get('bills')
  @ApiOkType(BillSchema, true)
  listBills(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.listBills(c.customerId);
  }

  @Get('bills/:billId')
  @OwnedResource('bill', 'billId')
  @ApiOkType(BillSchema)
  getBill(@CurrentCustomer() c: AuthenticatedCustomer, @Param('billId') billId: string) {
    return this.service.getBill(c.customerId, billId);
  }

  @Post('bills/:billId/pay/pix')
  @HttpCode(200)
  @Throttle(PAYMENT_THROTTLE)
  @OwnedResource('bill', 'billId')
  @ApiOperation({ summary: 'Gera cobrança PIX (fatura volta com `pix`)' })
  @ApiOkType(BillSchema)
  payPix(@CurrentCustomer() c: AuthenticatedCustomer, @Param('billId') billId: string) {
    return this.service.payWithPix(c.customerId, billId);
  }

  @Post('bills/:billId/pay/current-card')
  @HttpCode(200)
  @Throttle(PAYMENT_THROTTLE)
  @OwnedResource('bill', 'billId')
  @ApiOperation({ summary: 'Cobra no cartão atual da assinatura' })
  @ApiOkType(BillSchema)
  payCurrentCard(@CurrentCustomer() c: AuthenticatedCustomer, @Param('billId') billId: string) {
    return this.service.payWithCurrentCard(c.customerId, billId);
  }

  @Post('bills/:billId/pay/new-card')
  @HttpCode(200)
  @Throttle(PAYMENT_THROTTLE)
  @OwnedResource('bill', 'billId')
  @ApiOperation({ summary: 'Cobra em um cartão novo (gateway_token)' })
  @ApiOkType(BillSchema)
  payNewCard(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Param('billId') billId: string,
    @Body() dto: PayWithNewCardDto,
  ) {
    return this.service.payWithNewCard(c.customerId, billId, dto);
  }
}
