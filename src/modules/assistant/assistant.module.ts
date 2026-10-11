import { Module } from '@nestjs/common';
import { RoutineModule } from '../routine/routine.module';
import { AssistantConfigController, AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [RoutineModule],
  controllers: [AssistantConfigController, AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
