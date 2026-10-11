import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedCustomer, CurrentCustomer, OwnedResource } from '../../common/decorators';
import { NotificationPreferencesPatchDto, RegisterDeviceDto } from '../../common/dto';
import { AppError } from '../../common/errors';
import { RegisterDeviceRequest } from '../../contracts/api';
import { ApiOkType, IdSchema, NotificationPreferencesSchema } from '../../common/swagger-schemas';
import {
  DEVICE_STORE,
  DeviceStore,
  NOTIFICATION_PREFERENCES_STORE,
  NotificationPreferencesStore,
} from '../../ports';

/** Dispositivos (push) e preferências de notificação — dados só do BFF. */
@ApiTags('devices')
@ApiBearerAuth()
@Controller('me')
export class DevicesController {
  constructor(
    @Inject(DEVICE_STORE) private readonly devices: DeviceStore,
    @Inject(NOTIFICATION_PREFERENCES_STORE) private readonly prefs: NotificationPreferencesStore,
  ) {}

  @Post('devices')
  @HttpCode(201)
  @ApiOperation({ summary: 'Registra o token de push do dispositivo' })
  @ApiOkType(IdSchema)
  async register(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: RegisterDeviceDto) {
    // `expoPushToken` é alias deprecado: vira `pushToken` com provedor `expo`.
    const pushToken = dto.pushToken ?? dto.expoPushToken;
    if (!pushToken) throw AppError.badRequest('MISSING_PUSH_TOKEN', 'Informe pushToken.');
    const request: RegisterDeviceRequest = {
      pushToken,
      pushProvider: dto.pushProvider ?? 'expo',
      platform: dto.platform,
      appVersion: dto.appVersion,
      ...(dto.deviceName ? { deviceName: dto.deviceName } : {}),
    };
    const device = await this.devices.upsert(c.customerId, request);
    return { id: device.id };
  }

  @Delete('devices/:id')
  @HttpCode(204)
  @OwnedResource('device', 'id')
  async remove(@CurrentCustomer() c: AuthenticatedCustomer, @Param('id') id: string) {
    const removed = await this.devices.remove(c.customerId, id);
    if (!removed) throw AppError.forbidden();
  }

  @Get('notification-preferences')
  @ApiOkType(NotificationPreferencesSchema)
  getPrefs(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.prefs.get(c.customerId);
  }

  @Patch('notification-preferences')
  @ApiOkType(NotificationPreferencesSchema)
  patchPrefs(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: NotificationPreferencesPatchDto,
  ) {
    // Remove chaves undefined (o ValidationPipe com transform cria todas as propriedades do DTO).
    const patch = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    return this.prefs.update(c.customerId, patch);
  }
}
