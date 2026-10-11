import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedCustomer, CurrentCustomer } from '../../common/decorators';
import { UpdateConsentDto } from '../../common/dto';
import { ApiOkType, ConsentSchema } from '../../common/swagger-schemas';
import { ConsentService } from './consent.service';

@ApiTags('consents')
@ApiBearerAuth()
@Controller('me/consents')
export class ConsentController {
  constructor(private readonly service: ConsentService) {}

  @Get()
  @ApiOperation({ summary: 'Consentimentos do cliente (todos os tipos, com a versão vigente)' })
  @ApiOkType(ConsentSchema, true)
  list(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.list(c.customerId);
  }

  @Put()
  @ApiOperation({ summary: 'Concede ou revoga um consentimento na versão vigente' })
  @ApiOkType(ConsentSchema)
  update(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: UpdateConsentDto) {
    return this.service.update(c.customerId, dto);
  }
}
