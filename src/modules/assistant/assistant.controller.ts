import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuthenticatedCustomer,
  CurrentCustomer,
  OwnedResource,
  RequiresConsent,
} from '../../common/decorators';
import { AssistantSendDto } from '../../common/dto';
import {
  ApiOkType,
  AssistantConfigSchema,
  AssistantSendResponseSchema,
  AssistantThreadSchema,
} from '../../common/swagger-schemas';
import { AssistantService } from './assistant.service';

const ASSISTANT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** Configuração do assistente: autenticada, mas sem exigir consentimento (o app decide se oferece). */
@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantConfigController {
  constructor(private readonly service: AssistantService) {}

  @Get('config')
  @ApiOperation({ summary: 'Flag, aviso obrigatório, sugestões e limite diário' })
  @ApiOkType(AssistantConfigSchema)
  config() {
    return this.service.config();
  }
}

/** Conversas do Prime IA (frente 5). Exige consentimento `ai_assistant` na versão vigente. */
@ApiTags('assistant')
@ApiBearerAuth()
@Controller('me/assistant')
@RequiresConsent('ai_assistant', 'assistant')
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Get('threads')
  @ApiOkType(AssistantThreadSchema, true)
  listThreads(@CurrentCustomer() c: AuthenticatedCustomer) {
    return this.service.listThreads(c.customerId);
  }

  @Get('threads/:id')
  @OwnedResource('assistantThread', 'id')
  @ApiOkType(AssistantThreadSchema)
  getThread(@CurrentCustomer() c: AuthenticatedCustomer, @Param('id') id: string) {
    return this.service.getThread(c.customerId, id);
  }

  @Post('messages')
  @HttpCode(200)
  @Throttle(ASSISTANT_THROTTLE)
  @ApiOperation({ summary: 'Envia uma mensagem (nova conversa quando threadId ausente)' })
  @ApiOkType(AssistantSendResponseSchema)
  send(@CurrentCustomer() c: AuthenticatedCustomer, @Body() dto: AssistantSendDto) {
    return this.service.send(c.customerId, dto);
  }

  @Delete('threads/:id')
  @HttpCode(204)
  @OwnedResource('assistantThread', 'id')
  async deleteThread(@CurrentCustomer() c: AuthenticatedCustomer, @Param('id') id: string) {
    await this.service.deleteThread(c.customerId, id);
  }
}
