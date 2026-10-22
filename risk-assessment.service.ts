import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RiskScoringEngine, RiskScoringResult } from './risk-scoring.engine';
import { AssessRiskDto } from './dto/assess-risk.dto';

@Injectable()
export class RiskAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringEngine: RiskScoringEngine,
  ) {}

  async assess(dto: AssessRiskDto): Promise<
    RiskScoringResult & { risk_level: string; risk_score: number; key_factors: string[]; next_steps: string[] }
  > {
    const result = this.scoringEngine.score(dto.assessment_data);

    await this.prisma.riskAssessment.create({
      data: {
        answers: dto.assessment_data as any,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        probability: result.probability,
        keyFactors: result.keyFactors,
        recommendations: result.recommendations,
        nextSteps: result.nextSteps,
      },
    });

    // Response uses the exact field names AssessmentResultsScreen (Flutter) expects,
    // while also returning the camelCase equivalents for consistency with the rest of the API.
    return {
      ...result,
      risk_level: result.riskLevel,
      risk_score: result.riskScore,
      key_factors: result.keyFactors,
      next_steps: result.nextSteps,
    };
  }
}
