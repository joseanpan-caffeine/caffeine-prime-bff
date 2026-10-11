import { Module } from '@nestjs/common';
import { PaymentsController, VindiConfigController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ controllers: [VindiConfigController, PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
