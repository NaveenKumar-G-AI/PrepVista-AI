# 16 — FINANCE-TECH ROLES — Question-Template Library
Family: finance_tech · Depts: cse/aids/mba/commerce/any

---

### Quantitative Analyst (Quant) — finance_tech · cse/aids/eee/mech · product/general · fresher→
Builds mathematical models for trading/pricing/risk.
**STACK** — Core (5): **probability & statistics** (distributions, expectation, variance, conditional prob, Bayes, stochastic processes) · **mental math + brainteasers** (fast arithmetic, estimation, logic puzzles) · **mathematics** (linear algebra, calculus, optimization) · **finance basics** (options, pricing, risk, Black-Scholes intuition) · programming (Python/C++, DSA). Tools (3): Python (NumPy/pandas) · C++ · Excel. Emerging (2): ML in finance · high-frequency systems.
**ROUNDS** — probability/brainteasers → math/stats depth → coding → finance/case → behavioral.
**ASKABLE** — *Probability:* `[E]` fair coin/dice expected value; conditional probability. `[M]` classic problems (Monty Hall, birthday, gambler's ruin, expected rolls); Bayes; variance of a portfolio. `[H]` stochastic processes (random walk, martingale, Brownian motion intuition); Markov chains; expected value of a game. *Brainteasers/mental math:* `[E]` fast arithmetic; estimation. `[M]` logic puzzles; "100 prisoners", "poison wine", weighing puzzles. `[H]` game-theory/optimal-strategy puzzles. *Math:* `[M]` derivatives/integrals; matrix operations; optimization (Lagrange). `[H]` PDEs intuition; numerical methods. *Finance:* `[E]` what is an option (call/put). `[M]` option payoffs; put-call parity; Black-Scholes intuition; risk-neutral pricing idea. `[H]` Greeks; hedging; VaR. *Coding:* `[M]` DSA; simulate a process; implement a pricing/statistic.
**STRONG/WEAK** — Strong: fast + rigorous probability, clean reasoning under pressure, strong math + coding. Weak: slow/error-prone, memorized without reasoning. **RED FLAGS** — arithmetic errors without noticing; can't reason through a probability problem.

---

### Quant Developer — finance_tech · cse/ece · product/general · fresher→
Builds high-performance trading/quant systems.
**STACK** — Core (5): **C++ (performance)** (memory, low-latency, concurrency, templates) · DSA + complexity (strong) · **systems/low-latency** (caches, networking, threading) · probability/math basics · finance/market microstructure basics. Tools (3): C++ · Linux · profilers. Emerging (2): FPGA/hardware acceleration · lock-free programming.
**ROUNDS** — coding (C++/DSA, hard) → systems/low-latency → math/prob → behavioral.
**ASKABLE** — *C++/perf:* `[M]` memory management; move semantics; cache locality; why C++ for HFT; latency sources. `[H]` lock-free data structures; memory ordering; template metaprogramming; optimize a hot path. *DSA:* `[M]/[H]` hard array/tree/graph problems; order-book data structure. *Systems:* `[M]` threading; kernel-bypass idea; measure latency. `[H]` NUMA; false sharing; nanosecond optimization. *Math/finance:* `[M]` probability; order-book/market-microstructure basics.
**STRONG/WEAK** — Strong: C++ + latency + DSA depth. Weak: high-level mindset, no perf awareness. **RED FLAGS** — no memory/latency understanding; weak C++.

---

### Risk Analyst — finance_tech · aids/mba/commerce · analytics/general · fresher→
Assesses and manages financial/operational risk.
**STACK** — Core (5): **statistics/probability** · **risk metrics** (VaR, expected shortfall, stress testing) · **financial products** (credit, market, operational risk) · SQL/Excel + modeling · regulatory basics (Basel). Tools (3): Excel/VBA · SQL · Python/R. Emerging (2): ML for risk · model risk management.
**ROUNDS** — quantitative/stats → risk/finance → case → behavioral.
**ASKABLE** — *Statistics:* `[M]` distributions; hypothesis testing; correlation; regression. `[H]` Monte Carlo; time-series basics. *Risk metrics:* `[E]` what is risk; types of risk. `[M]` VaR (historical/parametric); stress testing; sensitivity; probability of default. `[H]` expected shortfall; VaR limitations; scenario analysis. *Finance:* `[M]` credit vs market vs operational risk; Basel basics; portfolio risk (diversification). `[H]` credit modeling; capital adequacy. *Case:* `[M]` assess the risk of <a scenario>; how would you quantify it.
**STRONG/WEAK** — Strong: quantitative + risk-metric understanding + judgment. Weak: rote, no metric understanding. **RED FLAGS** — no VaR/risk-type understanding.

---

### Financial Analyst / Investment-Banking Analyst — finance_tech · mba/commerce/cse · analytics/general · fresher→
Financial analysis, valuation, and modeling.
**STACK** — Core (5): **accounting** (three statements, linkages) · **financial modeling** (Excel — DCF, projections) · **valuation** (DCF, comparables/multiples, precedent transactions) · corporate finance (WACC, NPV/IRR, capital structure) · Excel/PowerPoint. Tools (3): Excel · PowerPoint · financial databases. Emerging (2): automation/Python in finance.
**ROUNDS** — finance technical → modeling/valuation → market/behavioral.
**ASKABLE** — *Accounting:* `[E]` three financial statements; what links them. `[M]` how does depreciation flow through the 3 statements; working capital; accrual vs cash. `[H]` walk $10 of depreciation through the statements; adjustments. *Valuation:* `[E]` what is DCF. `[M]` DCF steps (FCF, discount rate, terminal value); comparables (EV/EBITDA, P/E); when each method. `[H]` build a DCF; sensitivity; LBO basics. *Corporate finance:* `[E]` NPV vs IRR. `[M]` WACC; cost of equity (CAPM); capital structure; NPV/IRR decision. `[H]` capital budgeting; M&A rationale/accretion-dilution. *Market/behavioral:* why finance/IB; a stock pitch; markets awareness.
**STRONG/WEAK** — Strong: accounting linkages + valuation + clean modeling. Weak: memorized without linkage. **RED FLAGS** — can't link the 3 statements; no valuation understanding.

---

### Actuarial Analyst / Credit Analyst / FinTech Product Analyst — finance_tech · aids/mba/commerce/cse · analytics/general · fresher→
Actuarial modeling / credit assessment / fintech product analytics.
**STACK & QUESTIONS** —
- **Actuarial Analyst:** core: probability & statistics (strong), financial math (interest theory, annuities), risk/insurance, Excel/R, actuarial exams (P/FM). `[E]` present/future value; annuity. `[M]` probability distributions; life tables; expected claims; interest theory. `[H]` reserving basics; pricing; survival models.
- **Credit Analyst:** core: financial statement analysis, credit metrics (DSCR, leverage, coverage), risk assessment, ratios. `[E]` what is creditworthiness. `[M]` financial ratios (liquidity/leverage/coverage); DSCR; assess a borrower; probability of default. `[H]` credit scoring; covenant analysis.
- **FinTech Product Analyst:** core: SQL, product metrics (fintech — activation, GTV, take rate), A/B testing, finance domain, data viz. `[M]` SQL; fintech metrics; funnel/retention; A/B test; regulatory awareness. `[H]` fraud/risk metrics; unit economics.
**STRONG/WEAK / RED FLAGS** — Strong: quantitative + domain + judgment. Red flag: no core metric/statistics understanding.

---
*Next: business specialized, design specialized, sales/writing/support, infra/network specialized.*
