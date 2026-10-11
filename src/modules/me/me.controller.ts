import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedCustomer, CurrentCustomer } from '../../common/decorators';
import { DeleteRequestDto, UpdateProfileDto } from '../../common/dto';
import {
  ApiOkType,
  DashboardSchema,
  FulfillmentSchema,
  SavingsSchema,
  UserProfileSchema,
  WalletSchema,
} from '../../common/swagger-schemas';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiOperation({ summary: 'Perfil do cliente logado' })
  @ApiOkType(UserProfileSchema)
  profile(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.me.getProfile(c.customerId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Atualiza nome, telefone e gênero' })
  @ApiOkType(UserProfileSchema)
  updateProfile(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(c.customerId, dto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard agregado (uma chamada) com capabilities calculadas' })
  @ApiOkType(DashboardSchema)
  dashboard(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.me.getDashboard(c.customerId);
  }

  @Get('tracking')
  @ApiOperation({ summary: 'Rastreio do último pedido (404 se não há)' })
  @ApiOkType(FulfillmentSchema)
  tracking(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.me.getTracking(c.customerId);
  }

  @Get('savings')
  @ApiOperation({ summary: 'Economia acumulada' })
  @ApiOkType(SavingsSchema)
  savings(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.me.getSavings(c.customerId);
  }

  @Get('wallet')
  @ApiOperation({ summary: 'Pontos Caffeine X' })
  @ApiOkType(WalletSchema)
  wallet(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.me.getWallet(c.customerId);
  }

  @Post('delete-request')
  @HttpCode(202)
  @ApiOperation({ summary: 'Pedido de exclusão de conta (LGPD / lojas)' })
  deleteRequest(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: DeleteRequestDto) {
    return this.me.requestDeletion(c.customerId, dto.reason);
  }
}
