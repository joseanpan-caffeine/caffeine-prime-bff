import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedCustomer,
  CurrentCustomer,
  OwnedResource,
  RequiresConsent,
} from '../../common/decorators';
import { CheckInDto, UpdateRoutinePlanDto } from '../../common/dto';
import { AppError } from '../../common/errors';
import {
  ApiOkType,
  CheckInSchema,
  RoutinePlanSchema,
  RoutineSummarySchema,
} from '../../common/swagger-schemas';
import { RoutineService } from './routine.service';

/** Rotina (frente 2). Exige consentimento `routine_data` na versão vigente. */
@ApiTags('routine')
@ApiBearerAuth()
@Controller('me/routine')
@RequiresConsent('routine_data', 'routine')
export class RoutineController {
  constructor(private readonly service: RoutineService) {}

  @Get()
  @ApiOperation({ summary: 'Plano de rotina (padrão derivado da caixa quando ainda não editado)' })
  @ApiOkType(RoutinePlanSchema)
  getPlan(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.getPlan(c.customerId);
  }

  @Put()
  @ApiOperation({ summary: 'Edita itens, horários de lembrete, meta semanal e fuso do plano' })
  @ApiOkType(RoutinePlanSchema)
  updatePlan(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: UpdateRoutinePlanDto) {
    return this.service.updatePlan(c.customerId, dto);
  }

  @Post('check-ins')
  @HttpCode(201)
  @ApiOperation({ summary: 'Marca um item como feito no dia (idempotente por item+data)' })
  @ApiOkType(CheckInSchema)
  checkIn(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: CheckInDto) {
    return this.service.checkIn(c.customerId, dto);
  }

  @Delete('check-ins/:id')
  @HttpCode(204)
  @OwnedResource('checkIn', 'id')
  async removeCheckIn(@CurrentCustomer() c: AuthenticatedCustomer, @Param('id') id: string) {
    await this.service.removeCheckIn(c.customerId, id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Streaks, meta semanal, últimos 28 dias e previsão de estoque' })
  @ApiQuery({ name: 'days', required: false, example: 28 })
  @ApiOkType(RoutineSummarySchema)
  summary(@CurrentCustomer() c: AuthenticatedCustomer, @Query('days') days?: string) {
    let n = 28;
    if (days !== undefined) {
      n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 28) {
        throw AppError.badRequest('INVALID_DAYS', 'days deve ser um inteiro entre 1 e 28.');
      }
    }
    return this.service.summary(c.customerId, n);
  }
}
