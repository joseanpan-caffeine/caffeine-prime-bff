import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedCustomer, CurrentCustomer } from '../../common/decorators';
import { AddressQuoteDto, UpdateAddressDto } from '../../common/dto';
import { AddressQuoteSchema, ApiOkType, ShippingAddressSchema } from '../../common/swagger-schemas';
import { ShippingService } from './shipping.service';

@ApiTags('shipping')
@ApiBearerAuth()
@Controller('me/shipping-address')
export class ShippingController {
  constructor(private readonly service: ShippingService) {}

  @Get()
  @ApiOkType(ShippingAddressSchema)
  get(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.getAddress(c.customerId);
  }

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cotação de frete por CEP' })
  @ApiOkType(AddressQuoteSchema)
  quote(@Body() dto: AddressQuoteDto) {
    return this.service.quote(dto.postalCode);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualiza o endereço com a opção de frete escolhida' })
  @ApiOkType(ShippingAddressSchema)
  update(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: UpdateAddressDto) {
    return this.service.updateAddress(c.customerId, dto);
  }
}
