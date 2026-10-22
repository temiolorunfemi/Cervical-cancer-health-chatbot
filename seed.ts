/**
 * Seeds the RAG knowledge base (knowledge_chunks). Content is adapted/expanded from
 * the offline fallback answers already hardcoded in the Flutter app's faq_screen.dart
 * (which were themselves written for the four supported app languages), plus general
 * WHO/CDC/ACS cervical cancer patient guidance already referenced in
 * information_center_screen.dart. Each chunk is embedded locally at seed time with the
 * same model the retrieval path uses (Xenova/all-MiniLM-L6-v2), so vectors are always
 * consistent with the query embeddings generated at request time.
 *
 * Run with: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import { pipeline } from '@xenova/transformers';

const prisma = new PrismaClient();

interface SeedChunk {
  category: string;
  language: string;
  title: string;
  content: string;
  sourceUrl?: string;
}

const CHUNKS: SeedChunk[] = [
  // ── What is cervical cancer ──────────────────────────────────────────────
  {
    category: 'overview',
    language: 'en',
    title: 'What is cervical cancer?',
    content:
      'Cervical cancer starts in the cells of the cervix, the lower part of the womb (uterus) that connects to the vagina. It usually grows slowly, over years, and can be detected before it becomes serious through regular screening (Pap smear / HPV test). HPV (Human Papillomavirus) causes the vast majority of cases — it is a very common virus spread through sexual contact, and most sexually active people are exposed to some strain of it at some point. With early detection, cervical cancer is highly treatable and often curable.',
    sourceUrl: 'https://www.who.int/news-room/fact-sheets/detail/cervical-cancer',
  },
  {
    category: 'overview',
    language: 'es',
    title: 'Qué es el cáncer cervical',
    content:
      'El cáncer cervical (cáncer de cuello uterino) comienza en el cuello uterino, la parte inferior del útero que conecta con la vagina. Generalmente crece lentamente y puede detectarse antes de que se vuelva grave con exámenes regulares. El VPH (Virus del Papiloma Humano) es la causa principal de la mayoría de los casos. El tratamiento puede ser muy eficaz si se detecta a tiempo.',
  },
  // ── Symptoms ──────────────────────────────────────────────────────────────
  {
    category: 'symptoms',
    language: 'en',
    title: 'Cervical cancer symptoms',
    content:
      'Common cervical cancer symptoms include: vaginal bleeding between periods, after sex, or after menopause; pelvic or lower back pain; unusual vaginal discharge, sometimes with an odour; and pain during sex. Early stages very often have no symptoms at all, which is exactly why regular screening matters — it can catch abnormal changes long before symptoms appear. Anyone noticing these signs should see a doctor promptly rather than waiting.',
    sourceUrl: 'https://www.cdc.gov/cervical-cancer/symptoms/index.html',
  },
  {
    category: 'symptoms',
    language: 'es',
    title: 'Síntomas del cáncer cervical',
    content:
      'Los síntomas del cáncer cervical incluyen sangrado vaginal entre períodos, después del sexo o después de la menopausia; dolor en la pelvis o la espalda baja; flujo vaginal inusual, a veces con mal olor; y dolor durante las relaciones sexuales. Las etapas iniciales a menudo no presentan síntomas, por eso los exámenes regulares son tan importantes.',
  },
  // ── Prevention ────────────────────────────────────────────────────────────
  {
    category: 'prevention',
    language: 'en',
    title: 'How to prevent cervical cancer',
    content:
      'Most cervical cancers are preventable. Key steps: get the HPV vaccine, ideally before becoming sexually active, though it can still help afterwards; have regular Pap smear and/or HPV tests on the recommended schedule; avoid smoking, which weakens the immune system\'s ability to clear HPV infections; use condoms during sex to reduce (not eliminate) HPV transmission risk; and be aware that a higher number of sexual partners raises HPV exposure risk. Prevention is always better than treatment.',
    sourceUrl: 'https://www.cdc.gov/cervical-cancer/prevention/index.html',
  },
  {
    category: 'prevention',
    language: 'es',
    title: 'Cómo prevenir el cáncer cervical',
    content:
      'La mayoría de los cánceres cervicales se pueden prevenir. Pasos clave: vacunarse contra el VPH, idealmente antes de la actividad sexual; hacerse pruebas de Papanicolaou y/o VPH con regularidad; no fumar; usar condón durante las relaciones sexuales; y reducir el número de parejas sexuales. La prevención siempre es mejor que el tratamiento.',
  },
  // ── HPV vaccine ───────────────────────────────────────────────────────────
  {
    category: 'vaccine',
    language: 'en',
    title: 'The HPV vaccine',
    content:
      'The HPV vaccine is most effective for girls and women aged 9-26, but women aged 27-45 may still benefit and should ask their doctor. It requires up to 3 doses depending on age at first dose (schedules commonly given at months 0, 2, and 6). It protects against the HPV types most strongly linked to cervical cancer. Even people who are already sexually active can still benefit from vaccination, since it protects against HPV types they may not yet have been exposed to.',
    sourceUrl: 'https://www.cdc.gov/hpv/vaccines/index.html',
  },
  {
    category: 'vaccine',
    language: 'es',
    title: 'La vacuna contra el VPH',
    content:
      'La vacuna contra el VPH es más eficaz para niñas y mujeres de 9 a 26 años; las mujeres de 27 a 45 años también pueden beneficiarse, previa consulta médica. Se necesitan hasta 3 dosis (meses 0, 2 y 6). Protege contra los tipos de VPH más asociados al cáncer cervical.',
  },
  // ── Screening ─────────────────────────────────────────────────────────────
  {
    category: 'screening',
    language: 'en',
    title: 'Cervical cancer screening schedule',
    content:
      'Recommended screening: a Pap smear every 3 years for women aged 21-65. From age 30 onward, a combined Pap smear + HPV test every 5 years is an accepted alternative. Anyone with higher risk factors (e.g. HIV, a weakened immune system, prior abnormal results) may need annual screening — ask a provider what schedule fits your history. The test itself is quick and usually only mildly uncomfortable, not painful, and it can catch precancerous changes years before they would become cancer.',
    sourceUrl: 'https://www.cancer.org/cancer/types/cervical-cancer/detection-diagnosis-staging/cervical-cancer-screening-guidelines.html',
  },
  {
    category: 'screening',
    language: 'es',
    title: 'Calendario de pruebas de detección',
    content:
      'Se recomienda un Papanicolaou cada 3 años para mujeres de 21 a 65 años. A partir de los 30 años, la combinación de Papanicolaou y prueba de VPH cada 5 años es una alternativa aceptada. Quienes tengan mayor riesgo pueden necesitar exámenes anuales.',
  },
  // ── Risk factors ──────────────────────────────────────────────────────────
  {
    category: 'risk_factors',
    language: 'en',
    title: 'Cervical cancer risk factors',
    content:
      'Risk factors for cervical cancer include: persistent HPV infection (the primary cause, spread through sexual contact); smoking; having multiple sexual partners over a lifetime; starting sexual activity at a young age; not being vaccinated against HPV; lack of regular screening; a weakened immune system, including HIV/AIDS; long-term use of hormonal contraceptives; and a history of other sexually transmitted infections. Having one or more of these factors does not mean cancer is certain — it means screening and preventive care are especially important. This app\'s Risk Assessment feature gives a personalised, explainable breakdown based on your own answers.',
    sourceUrl: 'https://www.cdc.gov/cervical-cancer/risk-factors/index.html',
  },
  {
    category: 'risk_factors',
    language: 'es',
    title: 'Factores de riesgo del cáncer cervical',
    content:
      'Los factores de riesgo incluyen: infección persistente por VPH; fumar; tener múltiples parejas sexuales; iniciar la actividad sexual a una edad temprana; no vacunarse contra el VPH; falta de exámenes regulares; un sistema inmunológico debilitado, incluido el VIH/SIDA; y uso prolongado de anticonceptivos hormonales.',
  },
  // ── Diagnosis & treatment overview ───────────────────────────────────────
  {
    category: 'diagnosis',
    language: 'en',
    title: 'Understanding Pap smear, HPV test, colposcopy and biopsy results',
    content:
      'A Pap smear (cytology) checks cervical cells for abnormal changes. An HPV test checks for the virus itself. If either comes back abnormal, a colposcopy (a closer visual exam of the cervix) and sometimes a biopsy (a small tissue sample) may follow to confirm whether changes are present and how serious they are. A "positive" or "abnormal" result on any of these tests is common and does NOT automatically mean cancer — many abnormal Pap results resolve on their own or are early-stage changes that are very treatable when monitored and managed properly. A positive biopsy is the most definitive of these results and warrants prompt follow-up with a specialist.',
  },
  {
    category: 'support',
    language: 'en',
    title: 'Coping with a risk assessment or abnormal result',
    content:
      'Receiving a higher-risk assessment or an abnormal screening result can feel frightening, but it is important to remember that these are indicators for follow-up, not a diagnosis. Cervical cancer, when caught early, is one of the most treatable cancers. The most useful next step is almost always the same: book an appointment with a healthcare provider or gynaecologist to discuss the specific result and appropriate next tests. This app\'s Specialists feature can help locate nearby clinics and hospitals.',
  },
];

async function main() {
  console.log('Loading local embedding model...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  console.log(`Seeding ${CHUNKS.length} knowledge chunks...`);
  for (const chunk of CHUNKS) {
    const output = await extractor(`${chunk.title}\n${chunk.content}`, {
      pooling: 'mean',
      normalize: true,
    });
    const vector = Array.from(output.data as Float32Array);
    const literal = `[${vector.join(',')}]`;

    const existing = await prisma.knowledgeChunk.findFirst({
      where: { title: chunk.title, language: chunk.language },
    });

    if (existing) {
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_chunks SET content = $1, category = $2, "sourceUrl" = $3, embedding = $4::vector, "updatedAt" = now() WHERE id = $5`,
        chunk.content,
        chunk.category,
        chunk.sourceUrl ?? null,
        literal,
        existing.id,
      );
      console.log(`Updated: [${chunk.language}] ${chunk.title}`);
    } else {
      const created = await prisma.knowledgeChunk.create({
        data: {
          category: chunk.category,
          language: chunk.language,
          title: chunk.title,
          content: chunk.content,
          sourceUrl: chunk.sourceUrl,
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2`,
        literal,
        created.id,
      );
      console.log(`Created: [${chunk.language}] ${chunk.title}`);
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
