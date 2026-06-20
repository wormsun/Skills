# 三年估值法投资体系

This reference describes a reusable value-investing procedure built around business understanding, financial-statement exclusion, year-three profit estimation, reasonable PE assignment, and margin-of-safety discipline.

## 1. Worldview

- Stocks are partial ownership of businesses. Market quotes are service providers, not judges.
- Wealth is ultimately productive equity. Cash is an option to buy better equity, not the final destination.
- Long-term return comes from two sources: business value growth and price moving from undervalued to reasonable.
- Do not depend on a future buyer acting foolishly. Prefer assets that create cash flows even if the market closes.
- Macro prediction, market timing, and short-term sentiment are usually low-value inputs. Business understanding and valuation discipline dominate.
- The goal is not excitement, ranking wins, or being proven right. The goal is to avoid fatal mistakes and compound steadily.

## 2. Ability Circle

Reject or defer analysis when the following cannot be answered in plain language:

1. What product or service creates the profit?
2. Why do customers buy from this company instead of alternatives?
3. Why has competing capital not competed away the profit?
4. If an incumbent, peer, or giant enters with large capital, can the company preserve or expand share?

If the answer requires vague industry slogans, heroic forecasts, or untestable narratives, treat the company as outside the ability circle.

## 3. Business Quality

Prefer companies with:

- Simple business models: revenue drivers are understandable without specialist guesswork.
- Durable moat: brand, network, cost advantage, switching cost, regulation/licensing, scarce location/resource, scale, or habit.
- High historical ROE/ROIC: used as a clue to hidden economic goodwill, not as proof by itself.
- High-quality profit: cash earnings rather than receivables, asset disposals, fair-value changes, subsidies, or opaque related-party activity.
- Low leverage: lower risk of permanent capital loss and forced financing under stress.
- Low incremental capital burden: growth should not require endless external capital at poor returns.
- Management record: capital allocation, shareholder treatment, disclosure quality, and consistency between words and numbers.

Avoid or heavily discount:

- Businesses whose economics change too quickly to estimate several years out.
- Businesses that look cheap only because they are declining, highly levered, cyclical, or opaque.
- Companies where the main thesis is turnaround, policy rescue, concept hype, or a bigger fool.

## 4. Foundational Tests

Before valuation, require a clear pass or a clearly stated "unknown" on all three tests:

1. Profit is real:
   - Operating cash flow should roughly confirm net profit over several years.
   - Receivables, contract assets, related-party sales, and non-recurring gains should not explain most reported profit.
   - Audit opinions and restatements should not raise unresolved doubts.
2. Profit is durable:
   - The industry should not be in structural decline.
   - Competitive position, customer demand, substitution risk, and regulation should not obviously break the profit pool.
   - The business should be simple enough to estimate three years out.
3. Profit does not require excessive new capital:
   - Maintenance capex should not consume most apparent earnings.
   - Growth should not require repeated external financing at poor returns.
   - Working-capital needs should not turn accounting profit into weak free cash flow.

If any test fails, stop before valuation and classify the output as reject, outside ability circle, or watch-only. If data is missing, do not fill gaps with invented values; mark the item unknown and explain what data would resolve it.

## 5. Financial Statement Exclusion

Treat financial analysis primarily as a rejection tool. Investors are not courts: proof of fraud is unnecessary; material doubt is enough to pass.

Check:

- Revenue quality: receivables, contract assets, related-party sales, channel stuffing, abnormal credit terms.
- Cash conversion: net profit versus operating cash flow across cycles.
- Inventory: growth faster than sales, obsolescence risk, gross margin contradiction.
- Capex and depreciation: whether maintenance capex consumes apparent profit.
- Debt: short-term debt pressure, off-balance-sheet obligations, guarantees, interest coverage.
- Goodwill/intangibles: acquisition quality, impairment risk, whether reported goodwill masks weak economics.
- Financial assets and fair value: profit from market movements versus operations.
- Dividends and buybacks: whether distributions are supported by real free cash flow.
- Segment data: whether reported profit is driven by a weak or non-core segment.
- Accounting changes: whether changes improve appearance without improving economics.

Use `financial-statement-red-flags.md` for annual-report reviews or any case where reported profit quality is central to the decision.

Stop before valuation when any material red flag cannot be reasonably explained:

- Cash balance does not reconcile with interest income, restricted cash, debt needs, or cash-flow statement balances.
- Receivables, inventory, contract assets, prepayments, other receivables, or construction-in-progress rise much faster than the business.
- Operating cash flow persistently trails net profit without a credible reason.
- Profit depends on fair-value changes, asset disposals, subsidies, accounting policy changes, or impairment reversals.
- Audit opinions, restatements, related-party transactions, guarantees, or management disclosures create unresolved credibility doubts.

If financial statements are too complex to understand, reduce the valuation multiple, reduce sizing, or reject the company.

## 6. Three-Year Valuation Formula

The practical formula:

```text
Year-3 reasonable market cap = estimated year-3 net profit × reasonable PE
Buy-zone market cap = year-3 reasonable market cap × safety-margin ratio
High-leverage adjustment = buy-zone market cap × leverage-discount ratio
```

Default assumptions:

- Safety-margin ratio: 50%.
- High-leverage discount: 70% of the buy-zone value, when leverage or refinancing risk is material.

PE multiple:

- 15x: weak moat, uncertain durability, average business, or higher rates.
- 20x: conservative center for simple, profitable, reasonably durable businesses.
- 25x: strong moat, high certainty, good growth, low leverage.
- 30x or higher: only for exceptional certainty and durability; justify explicitly.

Inputs must be defended:

- Year-3 net profit should be based on business drivers, not blind extrapolation.
- Use multiple scenarios: conservative/base/optimistic.
- Use analyst forecasts only as raw material; average them for simple businesses if necessary, but identify dependency.
- Do not pay for distant growth unless near-term no-growth value is already acceptable; treat growth as margin of safety where possible.

Conceptual foundation:

- Intrinsic value is discounted future free cash flow.
- Exact DCF is usually false precision. The three-year profit plus PE method is a practical approximation with a large margin of safety.

Special cases:

- Financial businesses: the basic PE/free-cash-flow framing is often insufficient; use PB/ROE, capital adequacy, credit risk, float economics, or embedded value as appropriate.
- Loss-making or micro-profit businesses: do not force the method. Wait for stable earning power or use asset/runway analysis with clear caveats.
- Cyclical businesses: use mid-cycle earning power, full-cycle data, lower multiples, and `cyclical-stocks.md`; never value peak earnings as if they were normal.
- High-growth businesses: cap assumptions unless there is specific, quantified support. Treat unproven distant growth as upside, not as the base case.

## 7. Buy Discipline

Buy only when all are true:

- The company is inside the ability circle.
- Financial statements do not trigger exclusion.
- The business has durable competitive advantage or statistical undervaluation with adequate diversification.
- Current market cap is materially below estimated value, preferably near or below the buy-zone threshold.
- The position size fits the certainty level.

Do not buy merely because:

- Price fell a lot.
- There is a floating loss to average down.
- Someone respected bought it.
- PE/PB is low without understanding why.
- The story is exciting or the industry has a huge total addressable market.

## 8. Portfolio and Position Sizing

A practical portfolio can be concentrated but not reckless:

- A simple diversified version: 3-5 industries, 7-10 companies, mostly simple businesses with cash profits, high historical ROE, and low debt.
- Practical sizing bands: watch position, under 10%, 10-15%, 15-25%, above 25%.
- Higher certainty and deeper understanding justify larger sizing.
- Avoid leverage. A single permanent zero can destroy compounding.
- Holding cash is acceptable when understandable equities are clearly expensive.

## 9. Sell Discipline

Default posture: prefer not to sell excellent businesses. Selling high-quality equity is costly because replacement is hard.

Sell or reduce when:

- The original thesis is broken or understanding changes materially.
- Financial quality deteriorates or previously hidden risk emerges.
- The price reaches extreme overvaluation; a rough heuristic is reasonable value × 150% for high-quality holdings, but this must be contextual.
- A better opportunity is clearly cheaper and sufficiently understood.
- Real-life liquidity needs require cash.

Do not sell merely because:

- The price rose.
- The price fell.
- Macro commentary predicts decline.
- A temporary mark-to-market gain feels like real profit.

## 10. Company Analysis Procedure

1. Describe the business in one paragraph.
2. Answer the four ability-circle questions.
3. Apply the three foundational tests and stop if any fail.
4. Identify moat type and durability.
5. Reconcile profit with cash flow.
6. Inspect balance-sheet risk and red flags.
7. Assess capital allocation and shareholder treatment.
8. Build three profit scenarios for year three.
9. Assign PE range and justify it.
10. Compute buy-zone and overvaluation reference points.
11. Decide whether the output is: reject, outside ability circle, watch, small position candidate, or high-conviction candidate.

## 11. Common Failure Modes

- Mistaking a good product for a good investment.
- Mistaking high growth for durable value.
- Trusting accounting profit without cash verification.
- Averaging down because of loss aversion rather than value.
- Treating borrowed conviction as personal understanding.
- Believing a formula can replace business judgment.
- Confusing temporary market quotation with permanent capital loss.
- Skipping the foundational tests and jumping directly to valuation.
- Continuing a valuation after material unexplained financial red flags.
- Treating peak-cycle earnings as normal earning power.
- Using a high PE multiple to compensate for weak understanding.
- Ignoring non-standard audit opinions, major restatements, or repeated accounting policy changes.
- Presenting personalized buy/sell instructions instead of educational scenario analysis.
