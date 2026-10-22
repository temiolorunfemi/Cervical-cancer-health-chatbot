import { Body, Controller, Post } from '@nestjs/common';
import { SpecialistsService } from './specialists.service';
import { NearbyHospitalsDto } from './dto/nearby-hospitals.dto';

// Route matches specialist_screen.dart: POST {baseUrl}nearby-hospitals
@Controller('nearby-hospitals')
export class SpecialistsController {
  constructor(private readonly specialistsService: SpecialistsService) {}

  @Post()
  findNearby(@Body() dto: NearbyHospitalsDto) {
    return this.specialistsService.findNearby(dto);
  }
}
