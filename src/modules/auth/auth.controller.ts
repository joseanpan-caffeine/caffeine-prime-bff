import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import {
  LoginDto,
  MagicLinkDto,
  MagicLinkExchangeDto,
  RefreshDto,
  RegisterDto,
  SocialLoginDto,
} from '../../common/dto';
import { AuthResponseSchema, AuthTokensSchema, ApiOkType } from '../../common/swagger-schemas';
import { AuthService } from './auth.service';

/** Rotas públicas de autenticação. Rate limit: 5 req/min por IP. */
@ApiTags('auth')
@Controller('auth')
@Public()
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login com e-mail e senha (Shopify)' })
  @ApiOkType(AuthResponseSchema)
  login(@Body() dto: LoginDto) {
    return this.auth.loginWithPassword(dto.email, dto.password, dto.deviceName);
  }

  @Post('google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login com Google (id_token)' })
  @ApiOkType(AuthResponseSchema)
  google(@Body() dto: SocialLoginDto) {
    return this.auth.loginWithGoogle(dto.idToken, dto.fullName, dto.deviceName);
  }

  @Post('apple')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login com Apple (identityToken)' })
  @ApiOkType(AuthResponseSchema)
  apple(@Body() dto: SocialLoginDto) {
    return this.auth.loginWithApple(dto.idToken, dto.fullName, dto.deviceName);
  }

  @Post('magic-link')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Envia link mágico por e-mail (202 {sent:true}; fake inclui debugToken)',
  })
  magicLink(@Body() dto: MagicLinkDto) {
    return this.auth.sendMagicLink(dto.email);
  }

  @Post('magic-link/exchange')
  @HttpCode(200)
  @ApiOperation({ summary: 'Troca o token do link mágico por sessão' })
  @ApiOkType(AuthResponseSchema)
  exchange(@Body() dto: MagicLinkExchangeDto) {
    return this.auth.exchangeMagicLink(dto.token, dto.deviceName);
  }

  @Post('register')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cadastro de cliente (espelha auth/register da loja)' })
  @ApiOkType(AuthResponseSchema)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renova a sessão (rotaciona o refresh token)' })
  @ApiOkType(AuthTokensSchema)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoga o refresh token' })
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }
}
