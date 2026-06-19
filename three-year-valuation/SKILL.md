---
name: three-year-valuation
description: Analyze companies, investment cases, valuation ranges, and stock-selection decisions using a three-year valuation framework. Use when the user asks to evaluate a stock or business by estimating year-three net profit, assigning a reasonable PE multiple, requiring margin of safety, checking ability circle, moat, financial statement quality, cyclical earnings, official annual/quarterly reports, or A-share CNINFO disclosures.
---

# Three-Year Valuation

Use this skill to apply a three-year valuation framework as educational analysis, not as personalized financial advice.

## Core Workflow

1. Define the task: company analysis, valuation, stock-selection screen, portfolio review, or method explanation.
2. Gather inputs: business description, latest annual/interim reports, financial statements, management discussion, segment data, competitors, valuation data, and user assumptions.
   - For A-share official reports from 巨潮资讯网, use `references/cninfo-reports.md` and `scripts/cninfo_download_reports.py`.
3. Read `references/framework.md` before producing substantive analysis.
4. If the user asks for a company report, also use `references/company-analysis-template.md`.
5. If numeric valuation is requested, use `scripts/valuation.py` or reproduce the same formula transparently.
6. State assumptions, uncertainty, missing data, and whether the company is outside the available ability circle.
7. Avoid definitive personalized buy/sell instructions. Frame outputs as educational analysis, scenario ranges, and decision checklists.

## Decision Discipline

Apply the framework in this order:

1. Ability circle: mark "cannot judge" if the business model, customer choice, competitive barrier, and future durability cannot be explained.
2. Business quality: prefer simple businesses with durable competitive advantages, high-quality earnings, high historical ROE, low leverage, and long reinvestment runway.
3. Financial exclusion: use financial statements first to reject questionable companies, not to force a buy thesis.
4. Valuation: estimate year-three net profit, assign a justified PE multiple, then require a large safety margin.
5. Portfolio sizing: size by certainty and understanding depth, not by recent price movement or desire to average down.
6. Sell review: sell mainly when the thesis breaks, an extreme overvaluation appears, or liquidity is needed.

## Resources

- `references/framework.md`: distilled investment philosophy, three-year valuation method, stock-selection rules, financial statement exclusion rules, and portfolio/sell discipline.
- `references/company-analysis-template.md`: report structure for analyzing one company.
- `scripts/valuation.py`: calculator for three-year valuation scenarios.
- `references/cyclical-stocks.md`: special branch for cyclical businesses, normalized earnings, through-cycle data, and cycle-risk controls.
- `references/cninfo-reports.md`: official CNINFO workflow for finding and downloading A-share annual, interim, and quarterly reports.
- `scripts/cninfo_download_reports.py`: reusable CNINFO report downloader that saves PDFs and a source manifest.

## Output Expectations

- Separate facts, assumptions, inferences, and judgments.
- Prefer ranges and scenarios over point estimates.
- Explain why the company may be rejected before discussing why it may be attractive.
- Show the valuation math clearly.
- Include a concise "what would change my mind" section.
- Remind the user that the result is not investment advice when the output could affect trading decisions.
