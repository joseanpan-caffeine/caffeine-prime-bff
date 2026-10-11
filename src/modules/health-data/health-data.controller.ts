import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedCustomer, CurrentCustomer, RequiresConsent } from '../../common/decorators';
import { HealthSyncDto } from '../../common/dto';
import { ApiOkType, HealthSummarySchema } from '../../common/swagger-schemas';
import { HealthDataService } from './health-data.service';

/** Saúde / wearables (frente 2). Exige consentimento `health_data` na versão vigente. */
@ApiTags('health-data')
@ApiBearerAuth()
@Controller('me/health')
@RequiresConsent('health_data', 'health')
export class HealthDataController {
  constructor(private readonly service: HealthDataService) {}

  @Post('sync')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Envia agregados diários (upsert por dia+métrica); nunca séries brutas',
  })
  async sync(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: HealthSyncDto) {
    await this.service.sync(c.customerId, dto);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Últimos 7 dias e sugestões de uso dos produtos (regras, não medicina)',
  })
  @ApiOkType(HealthSummarySchema)
  summary(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.summary(c.customerId);
  }
}
