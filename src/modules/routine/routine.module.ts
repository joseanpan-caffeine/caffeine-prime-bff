import { Module } from '@nestjs/common';
import { RemindersScheduler } from './reminders.scheduler';
import { RoutineController } from './routine.controller';
import { RoutineService } from './routine.service';

@Module({
  controllers: [RoutineController],
  providers: [RoutineService, RemindersScheduler],
  exports: [RoutineService],
})
export class RoutineModule {}
