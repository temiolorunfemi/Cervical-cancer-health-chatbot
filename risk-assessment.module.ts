import { Module } from '@nestjs/common';
import { RiskAssessmentController } from './risk-assessment.controller';
import { RiskAssessmentService } from './risk-assessment.service';
import { RiskScoringEngine } from './risk-scoring.engine';

@Module({
  controllers: [RiskAssessmentController],
  providers: [RiskAssessmentService, RiskScoringEngine],
})
export class RiskAssessmentModule {}
