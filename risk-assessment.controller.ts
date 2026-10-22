import { Body, Controller, Post } from '@nestjs/common';
import { RiskAssessmentService } from './risk-assessment.service';
import { AssessRiskDto } from './dto/assess-risk.dto';

// Route matches risk_assessment_screen.dart: POST {baseUrl}risk-assessment
@Controller('risk-assessment')
export class RiskAssessmentController {
  constructor(private readonly riskAssessmentService: RiskAssessmentService) {}

  @Post()
  assess(@Body() dto: AssessRiskDto) {
    return this.riskAssessmentService.assess(dto);
  }
}
