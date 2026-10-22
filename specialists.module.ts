import { Module } from '@nestjs/common';
import { SpecialistsController } from './specialists.controller';
import { SpecialistsService } from './specialists.service';
import { OverpassService } from './overpass.service';

@Module({
  controllers: [SpecialistsController],
  providers: [SpecialistsService, OverpassService],
})
export class SpecialistsModule {}
