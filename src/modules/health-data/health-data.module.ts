import { Module } from '@nestjs/common';
import { HealthDataController } from './health-data.controller';
import { HealthDataService } from './health-data.service';

@Module({ controllers: [HealthDataController], providers: [HealthDataService] })
export class HealthDataModule {}
