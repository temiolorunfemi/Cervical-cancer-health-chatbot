import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RiskAssessmentModule } from './risk-assessment/risk-assessment.module';
import { ChatModule } from './chat/chat.module';
import { SpecialistsModule } from './specialists/specialists.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RiskAssessmentModule,
    ChatModule,
    SpecialistsModule,
  ],
})
export class AppModule {}
