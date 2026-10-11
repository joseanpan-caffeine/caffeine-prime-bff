import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { ApiOkType, AppConfigSchema } from '../../common/swagger-schemas';
import { AppConfig } from '../../contracts/api';
import { Env, ENV } from '../../config/env';

@ApiTags('config')
@Controller('config')
export class ConfigController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Versão mínima, feature flags e links' })
  @ApiOkType(AppConfigSchema)
  config(): AppConfig {
    return {
      minSupportedVersion: this.env.app.minSupportedVersion,
      features: {
        socialLoginGoogle: true,
        socialLoginApple: true,
        magicLink: true,
        pix: true,
        singlePurchase: false,
        wallet: true,
      },
      links: this.env.app.links,
    };
  }
}
