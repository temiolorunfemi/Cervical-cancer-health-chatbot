import { Injectable } from '@nestjs/common';
import { parseNumericBucket, parseTestResult, parseYesNo } from './answer-parser';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface RiskFactor {
  label: string;
  points: number;
}

export interface RiskScoringResult {
  riskScore: number;
  riskLevel: RiskLevel;
  probability: string;
  keyFactors: string[];
  recommendations: string[];
  nextSteps: string[];
}

/**
 * A deterministic, rule-based scoring engine over the same feature set as the UCI
 * "Cervical Cancer (Risk Factors)" dataset (Fernandes, Cardoso & Fernandes, 2017) —
 * the assessment questions in the Flutter app were modelled on those columns.
 *
 * We deliberately did NOT train a classifier on that dataset directly. It has only
 * 858 rows with a heavily imbalanced target (~6% positive biopsies) and a lot of
 * missing data; a model trained on it directly would overfit and its predicted
 * probabilities would not be meaningfully calibrated to any general population. A
 * transparent, clinically-grounded point system is:
 *   - auditable (every point on the score can be traced to a specific answer),
 *   - safe to ship without a labelled training pipeline or model-drift monitoring,
 *   - easy to defend / tune once real usage data (see the RiskAssessment table)
 *     is available to validate the weights against.
 * The weights below encode well-established cervical cancer risk factors (HPV
 * infection, prior abnormal screening results, smoking, long-term hormonal
 * contraceptive use, multiple sexual partners, early sexual debut, lack of
 * screening) per WHO / CDC / ACS patient guidance — see README for citations.
 */
@Injectable()
export class RiskScoringEngine {
  score(answers: Record<string, unknown>): RiskScoringResult {
    const factors: RiskFactor[] = [];
    const add = (label: string, points: number) => {
      if (points > 0) factors.push({ label, points });
    };

    // --- Prior diagnostic test results (strongest signal: these are near-diagnostic) ---
    const biopsy = parseTestResult(answers.biopsy);
    if (biopsy === 'positive') add('Positive biopsy result', 35);
    else if (biopsy === 'abnormal') add('Abnormal biopsy result', 15);

    const schiller = parseTestResult(answers.schiller);
    if (schiller === 'positive') add('Positive Schiller test', 18);
    else if (schiller === 'abnormal') add('Abnormal Schiller test', 8);

    const hinselmann = parseTestResult(answers.hinselmann);
    if (hinselmann === 'positive') add('Positive Hinselmann test', 18);
    else if (hinselmann === 'abnormal') add('Abnormal Hinselmann test', 8);

    const citology = parseTestResult(answers.citology);
    if (citology === 'positive') add('Positive Pap smear (cytology)', 18);
    else if (citology === 'abnormal') add('Abnormal Pap smear (cytology)', 8);

    // --- Diagnosis history ---
    if (parseYesNo(answers.dx_cancer)) add('History of cancer diagnosis', 40);
    if (parseYesNo(answers.dx_cin)) add('History of CIN diagnosis', 22);
    if (parseYesNo(answers.dx_hpv)) add('History of HPV diagnosis', 18);

    // --- STDs ---
    if (parseYesNo(answers.stds)) {
      add('History of an STD', 6);
      if (parseYesNo(answers.stds_hpv)) add('HPV infection (primary cause of cervical cancer)', 15);
      if (parseYesNo(answers.stds_hiv) || parseYesNo(answers.stds_aids)) {
        add('HIV/AIDS (reduces ability to clear HPV)', 10);
      }
      const minorStdFlags = [
        'stds_condylomatosis',
        'stds_cervical_condylomatosis',
        'stds_syphilis',
        'stds_pelvic_inflammatory_disease',
        'stds_genital_herpes',
      ];
      for (const key of minorStdFlags) {
        if (parseYesNo(answers[key])) add(`STD history: ${key.replace('stds_', '').replace(/_/g, ' ')}`, 3);
      }
      const stdCount = Math.max(parseNumericBucket(answers.stds_number), parseNumericBucket(answers.std_diagnosis_count));
      if (stdCount > 0) add('Multiple STD diagnoses', Math.min(stdCount * 2, 10));
    }

    // --- Smoking ---
    if (parseYesNo(answers.smokes)) {
      add('Current or past smoker', 8);
      const years = parseNumericBucket(answers.smokes_years);
      if (years >= 10) add('Long-term smoking (10+ years)', 6);
      else if (years >= 3) add('Moderate-term smoking', 3);
      const packsPerYear = parseNumericBucket(answers.smokes_packs_year);
      if (packsPerYear >= 20) add('Heavy smoking (20+ pack-years)', 5);
    }

    // --- Hormonal contraceptives / IUD ---
    if (parseYesNo(answers.hormonal_contraceptives)) {
      const years = parseNumericBucket(answers.hormonal_contraceptives_years);
      add('Long-term hormonal contraceptive use', years >= 5 ? 8 : 4);
    }
    if (parseYesNo(answers.iud)) {
      // Evidence on IUD use and cervical cancer risk is mixed (some studies suggest a
      // protective association); we weight it low rather than omit it, so it's visible
      // in the breakdown without dominating the score.
      add('IUD use', 2);
    }

    // --- Sexual & reproductive history ---
    const partners = parseNumericBucket(answers.sexual_partners);
    if (partners >= 10) add('10+ lifetime sexual partners', 12);
    else if (partners >= 6) add('6-10 lifetime sexual partners', 9);
    else if (partners >= 4) add('4-5 lifetime sexual partners', 6);
    else if (partners >= 2) add('2-3 lifetime sexual partners', 3);

    const firstIntercourseAge = parseNumericBucket(answers.first_sexual_intercourse);
    if (firstIntercourseAge > 0 && firstIntercourseAge < 16) add('Early sexual debut (under 16)', 8);
    else if (firstIntercourseAge >= 16 && firstIntercourseAge <= 18) add('Sexual debut age 16-18', 4);

    const pregnancies = parseNumericBucket(answers.num_pregnancies);
    if (pregnancies >= 4) add('4+ pregnancies', 5);

    // --- Age ---
    const age = parseNumericBucket(answers.age);
    if (age >= 50) add('Age 50+', 5);
    else if (age >= 30) add('Age 30-49', 3);

    // --- Screening engagement ---
    const everTested = parseYesNo(answers.diagnosis_tests);
    if (!everTested && age >= 25) {
      add('No record of prior cervical cancer screening', 5);
    }

    const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
    const riskScore = Math.max(0, Math.min(100, Math.round(rawScore)));
    const riskLevel = this.levelFor(riskScore);

    factors.sort((a, b) => b.points - a.points);

    return {
      riskScore,
      riskLevel,
      probability: this.probabilityLabel(riskLevel),
      keyFactors: factors.slice(0, 5).map((f) => f.label),
      recommendations: this.recommendationsFor(riskLevel, everTested),
      nextSteps: this.nextStepsFor(riskLevel),
    };
  }

  private levelFor(score: number): RiskLevel {
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'MODERATE';
    return 'LOW';
  }

  /**
   * Deliberately qualitative rather than a fabricated "1 in N" statistic: the scoring
   * engine has no calibration data tying its point total to real population incidence,
   * so presenting a precise-looking probability would be misleading in a health context.
   */
  private probabilityLabel(level: RiskLevel): string {
    switch (level) {
      case 'HIGH':
        return 'Above-average risk profile — clinical follow-up recommended';
      case 'MODERATE':
        return 'Moderately elevated risk profile';
      default:
        return 'Below-average risk profile for the factors assessed';
    }
  }

  private recommendationsFor(level: RiskLevel, everTested: boolean): string[] {
    const common = ['Discuss your HPV vaccination status with a healthcare provider'];
    if (level === 'HIGH') {
      return [
        'Book a Pap smear / HPV test as soon as possible',
        'See a gynaecologist for a full clinical evaluation',
        ...common,
        'Ask about colposcopy if your provider recommends it',
      ];
    }
    if (level === 'MODERATE') {
      return [
        'Book a Pap smear within the next few weeks if you have not had one recently',
        'Visit a gynaecologist for a check-up',
        ...common,
        'Continue routine screening every 3 years (or as advised)',
      ];
    }
    return [
      everTested
        ? 'Continue routine screening on your provider\'s recommended schedule'
        : 'Book a routine Pap smear even though your risk factors are currently low',
      ...common,
      'Maintain a smoke-free lifestyle and use protection to reduce STD risk',
    ];
  }

  private nextStepsFor(level: RiskLevel): string[] {
    if (level === 'HIGH') {
      return [
        'Call your nearest health centre today',
        'Bring your health history records to your appointment',
        'Ask about STD testing while you are there',
      ];
    }
    if (level === 'MODERATE') {
      return [
        'Schedule a screening appointment in the next month',
        'Ask your provider which tests are due given your history',
      ];
    }
    return [
      'Keep your next routine screening appointment on your calendar',
      'Re-take this assessment if your circumstances change',
    ];
  }
}
