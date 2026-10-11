import { Global, Module } from '@nestjs/common';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/** Global porque o `ConsentGuard` (APP_GUARD) e os módulos das frentes 2/5 dependem do serviço. */
@Global()
@Module({
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
