# canproject backend

NestJS + PostgreSQL (pgvector) + Prisma backend for the cervical cancer awareness Flutter
app. It implements the three endpoints the app already calls: risk assessment, the RAG
FAQ chatbot, and nearby-specialist search.

This document also answers the two questions this backend was built to make answerable:
**"how does the RAG knowledge base work?"** and **"what were the model's design choices
and results?"** — see [RAG knowledge base](#rag-knowledge-base-design) and
[Risk model: design choices and results](#risk-model-design-choices-and-results) below.

## Architecture

```
Flutter app (Dio, https://renewbuddy.com/api/ or a local backend)
        │
        ▼
NestJS API  (global prefix /api)
        │
   ┌────┼─────────────────┬─────────────────────┐
   ▼    ▼                 ▼                     ▼
Risk assessment      Chat / RAG              Specialists
(rule-based           (local embeddings +     (OpenStreetMap
 scoring engine)       OpenAI generation)      Overpass API)
        │                    │                      │
        └────────────────────┴──────────────────────┘
                              ▼
                    PostgreSQL + pgvector
                 (knowledge_chunks, chat_messages,
                  risk_assessments, specialist_cache)
```

Endpoints (all under `/api`, matching the paths the Flutter screens already call):

| Method | Path | Flutter caller | Request | Response |
|---|---|---|---|---|
| POST | `/risk-assessment` | `risk_assessment_screen.dart` | `{ assessment_data, modelId, timestamp }` | `{ risk_level, risk_score, probability, key_factors, recommendations, next_steps }` |
| POST | `/chat-faq` | `faq_screen.dart` | `{ message, language, language_name, conversation_history, context }` | `{ reply, message, content, sources }` |
| POST | `/nearby-hospitals` | `specialist_screen.dart` | `{ latitude, longitude, specialty, radius, modelId }` | `{ hospitals: [...] }` |

## RAG knowledge base design

**What it's built from.** The knowledge base (`knowledge_chunks` table) is seeded
(`prisma/seed.ts`) from short, factual passages on cervical cancer overview, symptoms,
prevention, the HPV vaccine, screening schedules, risk factors, diagnostic-test
interpretation, and emotional support/next-steps — the same topics the Flutter app's
offline fallback already covered, expanded and referenced against WHO/CDC/ACS patient
guidance (see `sourceUrl` on each chunk). This is a deliberately small, curated,
high-precision knowledge base rather than a large scraped corpus — for a health-adjacent
FAQ bot, precision (never answering outside what's verified) matters more than recall.

**Embedding model.** Chunks and incoming user questions are embedded with a **local**
sentence-transformer, `Xenova/all-MiniLM-L6-v2` (384 dimensions), run in-process via
`@xenova/transformers` — no API key, no network round-trip, no per-request cost. This
was chosen over an API-based embedding model (e.g. OpenAI's `text-embedding-3-small`)
because retrieval runs on every single chat message, and it lets the knowledge base be
freely re-embedded/re-seeded without incurring API cost.

**Storage & retrieval.** Vectors are stored in Postgres via the `pgvector` extension
(`ankane/pgvector` Docker image), in an `Unsupported("vector(384)")` Prisma column
(Prisma has no first-class pgvector type yet, so writes/reads go through raw SQL —
see `EmbeddingsService` and `RetrievalService`). Retrieval is top-**k** (k=4) nearest
neighbour search using cosine distance (`<=>` operator), with a distance cutoff
(`MAX_DISTANCE = 0.7`) so that when a question genuinely isn't covered by the knowledge
base, no chunk is force-fitted into context — this is what lets the system say "I don't
have verified information on that" instead of hallucinating.

**Generation.** The retrieved chunks are placed into a system prompt (see
`OpenAiService.generateReply`) instructing the model to answer *only* from the provided
excerpts, decline off-topic questions, and always reply in the user's selected app
language (en/es/sw/yo). Generation uses the OpenAI API (`gpt-4o-mini` by default,
configurable via `OPENAI_CHAT_MODEL`) — this is the one place an external LLM API is
used, since generation quality/fluency benefits far more from a large hosted model than
retrieval does. The response is returned non-streaming (a single JSON object), matching
the Flutter client's `await _dio.post(...)` call pattern rather than the SSE streaming
implied by the old, unused `ai_chat_service.dart`.

**Guardrails.** An explicit keyword-based off-topic filter (matching the one already in
the Flutter app's offline fallback, e.g. weather/sports/politics/crypto) short-circuits
retrieval and generation entirely for clearly off-topic messages, returning a static
redirect message instead of spending an LLM call on it.

**Known limitation / tradeoff.** Multi-language chunks currently only exist for
English and Spanish (the two languages with full source content available); Swahili
and Yoruba questions retrieve against the English chunks as a fallback. Expanding
translated chunk coverage is the main way to improve non-English answer quality.

## Risk model: design choices and results

**Design choice: rule-based scoring, not a trained classifier.** `RiskScoringEngine`
(`src/risk-assessment/risk-scoring.engine.ts`) is a transparent, weighted point system
over the same 30 features as the UCI "Cervical Cancer (Risk Factors)" dataset
(Fernandes, Cardoso & Fernandes, 2017) — the Flutter app's questionnaire was modelled on
those exact columns. We deliberately did **not** train a classifier (e.g. logistic
regression / random forest, as is commonly done on that dataset in papers) directly on
it, for three reasons:

1. **Data quality.** The dataset has only 858 rows, ~6% positive biopsies (heavily
   imbalanced), and substantial missing data (many fields are self-reported and
   frequently blank). A model trained on it directly tends to overfit and its output
   probabilities would not be meaningfully calibrated to a real population — presenting
   a health risk score from such a model as if it were a validated clinical prediction
   would be misleading.
2. **Explainability.** Every point in the score is directly traceable to a specific
   answer (see the `keyFactors` breakdown in the response). This matters for a
   consumer-facing health app — a user should be able to see *why* they got the score
   they got, which an opaque classifier would not easily provide.
3. **Operational simplicity.** No training pipeline, model versioning, or drift
   monitoring is needed to ship and maintain this; the scoring logic is auditable code.

**Weighting rationale.** Weights reflect established clinical risk factors per WHO/CDC/
ACS guidance: prior positive diagnostic tests (biopsy, Schiller, Hinselmann, cytology)
and diagnosis history (cancer/CIN/HPV) carry the heaviest weight since they are the
closest signal to an actual finding; HPV/HIV infection, smoking duration and long-term
hormonal contraceptive use carry moderate weight as well-evidenced risk factors; sexual/
reproductive history (partner count, early sexual debut, pregnancy count) and lack of
prior screening carry lighter weight as contributing-but-not-determinative factors.
Scores are capped at 100 and bucketed into LOW (<30) / MODERATE (30-59) / HIGH (60+).

**Design choice: no fabricated probability statistic.** Early drafts considered
returning something like "1 in 12 lifetime risk." This was deliberately rejected: the
scoring engine has no calibration data tying its point total to real-world incidence
rates, so a precise-looking number would misrepresent the system's actual certainty.
Instead, `probability` returns a qualitative, clearly-scoped descriptor (e.g.
"Above-average risk profile for the factors assessed") — accurate to what the system
actually knows, without borrowing false authority from a specific-sounding number.

**"Results."** Because this is a rule-based system rather than a trained model, there
is no train/test accuracy metric to report in the ML sense. The `risk_assessments`
table persists every submission's inputs, score, and level specifically so the weights
can later be validated/tuned against real usage patterns or, if a labelled outcome
dataset is ever available, checked for calibration — that data collection is itself
part of the model's design, not an afterthought.

**Known limitation / tradeoff: multilingual free-text parsing.** The Flutter client
sends the *displayed option text* the user tapped (already translated into one of 4
languages) rather than a stable option key or index. `answer-parser.ts` re-derives
meaning from that free text using per-language keyword lists (yes/no, positive/negative/
abnormal, numeric-range midpoints). This works for the current fixed option set but is
inherently more brittle than the client sending a stable key — documented here as a
known contract limitation rather than hidden.

## Nearby specialists

Uses the OpenStreetMap **Overpass API** (`overpass-api.de`) to query
`amenity=hospital|clinic|doctors` nodes/ways within the requested radius — free and
keyless, chosen over Google Places specifically to avoid API-key provisioning and
per-request billing. Results are ranked by a `confidence` score combining proximity and
a keyword match against gynaecology/women's-health/oncology terms in OSM tags (OSM has
no verified "specialty" field, so this is a best-effort text signal, not a credential
check — surfaced to the user as "AI match confidence," not a certification). Results are
cached in `specialist_cache` to reduce repeated Overpass calls for the same area.
**Tradeoff:** OSM data completeness (phone numbers, opening hours) is community-
maintained and inconsistent, especially outside major cities — this is a known
limitation versus a paid, commercially-maintained places API.

## Local setup

1. **Start Postgres+pgvector**: `docker compose up -d` (requires Docker Desktop
   running). This starts `ankane/pgvector` on port 5432 with the `canproject` database.
   If you don't want to use Docker, point `DATABASE_URL` at any Postgres 14+ instance
   that has the `vector` extension available.
2. **Configure environment**: copy `.env.example` to `.env` and fill in `OPENAI_API_KEY`.
3. **Install dependencies**: `npm install`
4. **Run migrations**: `npx prisma migrate dev --name init`
5. **Seed the knowledge base**: `npm run seed`
6. **Start the server**: `npm run start:dev` — listens on `http://localhost:3000/api`

## Pointing the Flutter app at this backend

The three screens (`risk_assessment_screen.dart`, `faq_screen.dart`,
`specialist_screen.dart`) currently hardcode `https://renewbuddy.com/api/` as
`_dio.options.baseUrl`. To test against this local backend, change that base URL to
`http://localhost:3000/api/` (or your machine's LAN IP if testing on a physical device)
in each of those three files.
