import { Module } from '@nestjs/common';
import { CirculationController } from './circulation.controller.js';
import { CirculationService } from './circulation.service.js';

@Module({ controllers: [CirculationController], providers: [CirculationService] })
export class CirculationModule {}
