# 02 — DATA & AI ROLES — Question-Template Library
Family: data_ai · Depts: aids/aiml/cse/ece/it

> Note: within this family the roles diverge sharply. Analyst-leaning = SQL + wrangling + business;
> ML-leaning = algorithms + coding + deployment; DE = infrastructure/pipelines. Each template reflects
> that. SQL appears in 90%+ of data interviews, ML 85%+, Python 80%+.

---

## Data Scientist
Family data_ai · Depts aids/aiml/cse · Hires analytics/product/general · Seniority fresher→
Builds models and extracts insight; tested across 5 areas: stats, ML, coding (Python/SQL), product sense, behavioral.

### TECH STACK
- **Core (5):** **Statistics & probability** (descriptive stats, distributions — normal/binomial/Poisson, CLT, hypothesis testing, p-value, Type I/II errors, confidence intervals, Bayes theorem, correlation vs causation, sampling) · **Machine learning** (linear & logistic regression + assumptions, decision trees, random forest, gradient boosting/XGBoost, SVM, KNN, Naive Bayes, k-means, PCA/t-SNE, bias-variance, overfitting/underfitting, regularization L1/L2, cross-validation, gradient descent, feature engineering & selection, model evaluation — accuracy/precision/recall/F1/ROC-AUC/RMSE, imbalanced data) · **Python** (pandas, NumPy, regex, data wrangling) · **SQL** (joins, GROUP BY, subqueries, **window functions**, CTEs)
- **Core (4):** **A/B testing & experimentation** (hypothesis, power, significance, metric selection) · **Product sense / metrics** (define success metrics, diagnose changes) · data visualization (matplotlib/seaborn, storytelling) · communication (explain to non-technical)
- **Tools (3):** scikit-learn · Jupyter · Git · Tableau/Power BI basics
- **Emerging (2):** deep learning basics · **LLMs/GenAI & RAG** · MLOps basics · responsible AI · model monitoring (drift: KL divergence, PSI, chi-squared)

### ROUND STRUCTURE
1. Recruiter/role-fit — 30 min · 2. **Coding screen (Python/SQL, pass-fail)** — 45 min · 3. SQL round — 45 min · 4. ML/modeling round — 60 min · 5. Product/case (metrics + A/B) — 60 min · 6. Behavioral — 30 min · (sometimes a take-home)

### ASKABLE QUESTIONS (by topic)
- **Statistics:** `[E]` mean/median/mode; variance/std; what is a p-value. `[M]` explain hypothesis testing; Type I vs II; confidence interval interpretation; central limit theorem; correlation vs causation; how to handle missing values/outliers. `[H]` derive/explain MLE; Bayesian vs frequentist; power analysis; multiple-testing correction; selection bias.
- **Probability:** `[M]` conditional probability / Bayes problem; expected value; distributions and when each. `[H]` Monty Hall; birthday paradox; a probability brainteaser with reasoning.
- **Machine learning:** `[E]` supervised vs unsupervised; classification vs regression; what is overfitting. `[M]` bias-variance trade-off; L1 vs L2 regularization; how a decision tree/random forest works; how to handle imbalanced data (SMOTE/weights); feature selection (filter/wrapper/embedded); cross-validation; precision vs recall (and when each matters); ROC-AUC. `[H]` how gradient boosting works (XGBoost); PCA math/intuition; why/when deep learning over classical; explain gradient descent + variants; model interpretability (SHAP); concept/data drift + monitoring.
- **Case: "walk me through building a model for X":** `[M]` churn prediction / fraud detection / recommendation — frame problem, data, features, model, evaluation, deployment. `[H]` handle leakage, imbalance, cold-start, and the wrong-answer plan.
- **SQL:** `[E]` select with WHERE/ORDER BY; count/group. `[M]` joins; GROUP BY + HAVING; 2nd-highest; running total (window); rank; date filtering. `[H]` complex window functions; funnel/retention query; median in SQL; self-join.
- **Python:** `[M]` pandas: filter/groupby/merge/pivot; find duplicates; apply/vectorize; regex extract. `[H]` implement a metric/algorithm from scratch (e.g., k-means, a train/test split, a confusion matrix).
- **Product/metrics/A-B:** `[M]` define success metrics for <a feature>; "comments-per-user dropped but users grew — diagnose"; design an A/B test (hypothesis, metric, sample size, duration); how to know if a result is significant. `[H]` conflicting metrics; novelty/network effects; when NOT to ship despite a positive test.
- **Behavioral:** STAR stories on ambiguity, stakeholder conflict, a project that failed, explaining technical work to non-technical.

### COMMON FOLLOW-UPS
Why that model/metric; what are the assumptions; how would you validate; what if the data is biased/imbalanced; how do you monitor it in production; explain this to a marketing manager.

### STRONG vs WEAK
**Strong:** knows the "why" behind each algorithm, reasons about assumptions and pitfalls, connects analysis to business, communicates clearly, structures cases. **Weak:** names algorithms without understanding; ignores assumptions/leakage; can't translate to business; weak SQL.

### RED FLAGS
Can't write a GROUP BY; thinks accuracy is always the right metric; no A/B or product sense; over-relies on "throw a neural net at it".

---

## Data Analyst
Family data_ai · Depts aids/cse/ece · Hires analytics/product/general · Seniority fresher→
Analyzes data and builds reports/dashboards; SQL + business, light ML.

### TECH STACK
- **Core (5):** **SQL** (joins, aggregations, subqueries, **window functions**, CTEs, date functions) · **Excel** (pivot tables, VLOOKUP/XLOOKUP, formulas, charts) · data visualization (**Tableau or Power BI**, dashboard design, storytelling) · **statistics basics** (mean/median, distributions, hypothesis testing, correlation) · data cleaning/wrangling (Python pandas or SQL)
- **Core (3):** business/metrics sense (KPIs, funnels, cohorts) · A/B testing basics · reporting/communication
- **Tools (3):** Excel · Tableau/Power BI · SQL · Python (pandas) or R
- **Emerging (2):** analytics engineering (dbt) · LLM-assisted analysis · advanced DAX

### ROUND STRUCTURE
1. Recruiter — 30 min · 2. **SQL technical (heavy)** — 45 min · 3. Case study (metrics/business) — 45 min · 4. Excel/viz + behavioral — 30 min

### ASKABLE QUESTIONS (by topic)
- **SQL:** `[E]` filter/sort/aggregate; count distinct; GROUP BY. `[M]` joins (inner/left/right/full); HAVING; subqueries; 2nd/Nth highest; running total, rank, lag/lead (windows); date grouping (day/week/month); pivot. `[H]` funnel conversion; retention/cohort; sessionization; median; find gaps in sequences.
- **Excel:** `[E]` common formulas; SUM/AVERAGE/COUNTIF. `[M]` pivot tables; VLOOKUP/INDEX-MATCH/XLOOKUP; conditional formatting; charts. `[H]` dynamic dashboard; array formulas.
- **Visualization/Storytelling:** `[M]` which chart for <data>; design a dashboard for <stakeholder>; how to present a decline to executives. `[H]` avoid misleading viz; lead with the recommendation not the chart.
- **Statistics/metrics:** `[E]` mean vs median; what is a KPI. `[M]` correlation vs causation; is a difference significant; define metrics for <a business>; diagnose a metric drop. `[H]` A/B test interpretation; seasonality; confounders.
- **Case:** `[M]` "sales dropped 15% last month — investigate"; "which product line to invest in given this data"; sanity-check a dataset for quality issues.

### COMMON FOLLOW-UPS
What would you check first; is that difference meaningful; what's your recommendation; how would you validate the data; who's the audience.

### STRONG vs WEAK
**Strong:** fluent SQL, structured investigation, leads with the business recommendation, checks data quality. **Weak:** shaky joins/windows; jumps to conclusions; buries the insight in charts.

### RED FLAGS
Can't write a join or window function; no business framing; trusts data without sanity checks.

---

## Data Engineer
Family data_ai · Depts aids/aiml/cse · Hires analytics/product/general · Seniority fresher→
Builds data pipelines and infrastructure; infra/pipelines over modeling theory.

### TECH STACK
- **Core (5):** **SQL** (advanced — windows, optimization) · **Python** (data processing, scripting) · **ETL/ELT** (extraction, transformation, loading; batch vs streaming) · **data warehousing** (star/snowflake schema, fact/dimension, OLAP vs OLTP, Redshift/BigQuery/Snowflake) · **big data** (Hadoop/**Spark** — RDD/DataFrame, partitioning, shuffles)
- **Core (3):** data modeling · pipeline orchestration (**Airflow**) · **streaming** (Kafka) · NoSQL (when/why)
- **Tools (3):** SQL · Spark · Airflow · cloud data services · Git · Docker · dbt
- **Emerging (2):** lakehouse (Delta/Iceberg) · data quality/observability · real-time processing · DataOps

### ROUND STRUCTURE
1. Coding (SQL + Python) — 45 min · 2. Technical (ETL/warehouse/Spark/modeling) — 45 min · 3. Data-pipeline system design — 45 min · 4. Project + behavioral — 30 min

### ASKABLE QUESTIONS (by topic)
- **SQL:** `[M]` windows; optimize a slow query; deduplicate; incremental logic. `[H]` complex transformations; slowly-changing dimensions in SQL.
- **Data modeling/warehousing:** `[E]` OLTP vs OLAP; what is a data warehouse. `[M]` star vs snowflake schema; fact vs dimension; normalization vs denormalization for analytics; slowly-changing dimensions (Type 1/2/3). `[H]` design a schema for <domain> analytics; partitioning/clustering strategy.
- **ETL/pipelines:** `[E]` ETL vs ELT. `[M]` design a batch pipeline (source → transform → warehouse); idempotency; handling late/duplicate data; incremental loads; Airflow DAG design. `[H]` design a streaming pipeline (Kafka → processing → sink); exactly-once vs at-least-once; backfills; schema evolution.
- **Spark/Big data:** `[E]` why distributed processing; Hadoop vs Spark. `[M]` RDD vs DataFrame; transformations vs actions (lazy); partitioning; what causes a shuffle. `[H]` optimize a Spark job (skew, broadcast join, caching); handle a huge join.
- **Design:** `[M]` design a pipeline to ingest and serve <data> daily. `[H]` design a real-time analytics pipeline (scale, reliability, data quality, cost).

### COMMON FOLLOW-UPS
How do you handle duplicate/late data; how do you make it idempotent; what if the source schema changes; how do you monitor data quality; cost at scale.

### STRONG vs WEAK
**Strong:** reasons about idempotency, schema evolution, and failure; designs for scale and cost; strong SQL. **Weak:** treats pipelines as scripts; no data-quality or failure thinking; weak on Spark internals.

### RED FLAGS
No idempotency/late-data handling; doesn't know what a shuffle is; no data-quality mindset.

---

## Machine Learning Engineer
Family data_ai · Depts aiml/aids/cse · Hires analytics/product · Seniority fresher→
Builds and deploys ML systems; algorithms + coding + deployment (coding-heavy, fewer business Qs).

### TECH STACK
- **Core (5):** ML (as Data Scientist, deeper on algorithms) · **deep learning** (neural nets, backprop, CNNs, RNNs/LSTMs, transformers/attention, activation/loss functions, optimizers) · **coding/DSA** (strong — MLE is a software role) · **Python** (NumPy/pandas + PyTorch/TensorFlow) · **model deployment / MLOps** (serving, APIs, containers, CI/CD for ML, monitoring)
- **Core (3):** feature engineering/pipelines · model evaluation & tuning (hyperparameter search) · software engineering (clean code, testing, APIs)
- **Tools (3):** PyTorch/TensorFlow · scikit-learn · Docker/Kubernetes · MLflow · cloud ML · Git
- **Emerging (2):** **LLMs/GenAI** (fine-tuning, RAG, prompting) · vector DBs · distributed training · model optimization (quantization) · feature stores

### ROUND STRUCTURE
1. Coding / DSA — 45 min · 2. ML/DL depth — 60 min · 3. ML system design (deploy a model) — 45 min · 4. Project + behavioral — 30 min

### ASKABLE QUESTIONS (by topic)
- **ML/DL:** `[M]` bias-variance; regularization; how CNNs work (convolution/pooling); vanishing gradients; batch norm/dropout; optimizers (SGD/Adam); loss functions. `[H]` transformer/attention mechanism; backprop derivation; handle overfitting in DL; transfer learning; why an architecture for a task.
- **Coding:** `[M]` DSA (arrays/strings/trees); implement a metric/loss; NumPy vectorization. `[H]` implement k-means / logistic regression / a small NN forward+backward pass from scratch.
- **ML system design:** `[M]` design an ML system to <recommend / detect / rank>; data pipeline → training → serving → monitoring; batch vs real-time inference. `[H]` scale inference (latency, throughput); A/B a model; retraining strategy; feature store; handle drift.
- **MLOps/deployment:** `[E]` how do you serve a model. `[M]` containerize + expose via API; versioning models/data; CI/CD for ML; monitoring in production. `[H]` shadow/canary deploys; feature/label leakage in production; rollback.
- **LLM/GenAI:** `[M]` prompting vs fine-tuning vs RAG; embeddings + vector search; hallucination handling. `[H]` design a RAG system; evaluate an LLM app; cost/latency trade-offs.

### COMMON FOLLOW-UPS
How do you deploy/monitor this; how do you handle drift; how do you reduce latency; why that architecture; how do you evaluate it.

### STRONG vs WEAK
**Strong:** solid DL fundamentals + strong coding + real deployment thinking. **Weak:** notebook-only, no deployment/monitoring, weak coding, memorized architectures.

### RED FLAGS
Can't code DSA; no MLOps/deployment awareness; treats models as static artifacts.

---

## AI Engineer / GenAI / LLM Engineer
Family data_ai · Depts aiml/aids/cse · Hires product/analytics · Seniority fresher→
Builds AI-powered features and LLM applications.

### TECH STACK
- **Core (5):** **LLM fundamentals** (tokens, context window, temperature, prompting, in-context learning) · **RAG** (chunking, embeddings, **vector databases** — FAISS/Pinecone/Weaviate, retrieval, re-ranking) · **prompt engineering** (few-shot, chain-of-thought, structured output, system prompts) · software engineering (Python, APIs, DSA) · **evaluation** (LLM-as-judge, hallucination detection, groundedness, offline/online metrics)
- **Core (3):** ML/DL basics · model integration (OpenAI/Anthropic/HF APIs) · responsible AI (safety, guardrails, PII, injection defense)
- **Tools (3):** Python · LangChain/LlamaIndex · a vector DB · an LLM API · Git · Docker
- **Emerging (2):** fine-tuning (LoRA/PEFT, DPO) · agents/tool-use · multimodal · cost/latency optimization · prompt-injection defense

### ROUND STRUCTURE
1. Coding — 45 min · 2. LLM/AI depth (RAG/prompting/evals) — 60 min · 3. AI system design — 45 min · 4. Project + behavioral — 30 min

### ASKABLE QUESTIONS (by topic)
- **LLM basics:** `[E]` what is a token/context window; what is temperature; what is a hallucination. `[M]` prompting vs fine-tuning vs RAG (when each); few-shot vs zero-shot; chain-of-thought; why structured output. `[H]` how attention works; why LLMs hallucinate + mitigation; context-window limits + strategies.
- **RAG:** `[M]` design a RAG pipeline (ingest → chunk → embed → store → retrieve → generate); chunking strategies; why a vector DB; improving retrieval (hybrid search, re-ranking). `[H]` evaluate/debug a RAG system (retrieval vs generation failures); reduce hallucination with grounding + confidence gates; multi-document reasoning.
- **Prompt engineering:** `[M]` design a prompt for <task>; handle edge cases; enforce format; system vs user roles. `[H]` prompt-injection defense; robust prompts for untrusted input; eval-driven prompt iteration.
- **Evaluation:** `[M]` how do you evaluate an LLM feature (offline set, online metric, quality threshold); LLM-as-judge. `[H]` measure hallucination rate; A/B an AI feature; guardrails/safety eval.
- **AI system design:** `[M]` design an AI chatbot / document Q&A / summarizer (model choice, RAG, cost, latency, fallback). `[H]` design an agentic workflow with tools; scale + cost + safety.
- **Coding:** `[M]` DSA + string/data processing; implement embedding similarity (cosine); a simple retriever.

### COMMON FOLLOW-UPS
How do you know it's not hallucinating; how do you evaluate it; how do you reduce cost/latency; how do you handle a bad/injected input; when would you NOT use an LLM.

### STRONG vs WEAK
**Strong:** answers in numbers and trade-offs (hallucination rate, retrieval quality, cost/latency), builds evals, defends "ship it now despite model errors". **Weak:** "AI-washed" — adjectives not metrics; thinks every problem is a prompt away; no eval/safety thinking.

### RED FLAGS
No evaluation strategy; unaware of hallucination/injection; can't say when a rules engine or classic ML beats an LLM.

---

## BI Analyst / Product Analyst
Family data_ai · Depts aids/cse · Hires analytics/product/general · Seniority fresher→
BI: dashboards & analytics. Product Analyst: data-informed product decisions.

### TECH STACK
- **Core (5):** **SQL** (heavy) · **BI tools** (Power BI/Tableau, DAX for BI) · **product metrics** (DAU/MAU, retention, funnels, conversion, LTV) · **A/B testing & experimentation** · data modeling for analytics (star schema, DAX/measures)
- **Core (3):** Excel · statistics basics · storytelling/stakeholder communication · product sense
- **Tools (3):** SQL · Power BI/Tableau · Excel · Python (pandas) basics
- **Emerging (2):** analytics engineering (dbt) · experimentation platforms · LLM-assisted analytics

### ROUND STRUCTURE
1. **SQL technical** — 45 min · 2. Product/metrics case study — 60 min · 3. A/B testing + 1:1 with a PM — 45 min · 4. Behavioral — 30 min

### ASKABLE QUESTIONS (by topic)
- **SQL:** (see Data Analyst SQL bank — `[M]/[H]` joins, windows, funnels, retention).
- **Product metrics:** `[E]` define DAU/MAU; what is retention; what is a funnel. `[M]` define success metrics for <a feature/product>; "engagement up but revenue flat — why"; measure the impact of a launch; guardrail vs primary metrics. `[H]` conflicting-metric trade-off; choose a north-star metric; detect a metric anomaly's root cause.
- **A/B testing:** `[E]` what is an A/B test; control vs treatment. `[M]` design an experiment (hypothesis, metric, sample size, duration); is a result significant; p-value pitfalls. `[H]` novelty effects; network interference; sequential testing; when to stop; ship/no-ship reasoning.
- **BI/DAX:** `[M]` design a dashboard for <stakeholder>; DAX measures (calculated columns vs measures); relationships/modeling. `[H]` performance-tune a report; row-level security.
- **Case:** `[M]` "comments per user decreasing while users grow month-over-month — should we worry?"; evaluate/propose a feature with data.

### COMMON FOLLOW-UPS
What's your recommendation; is it significant; what would you check next; how would you present this to the PM; what could confound this.

### STRONG vs WEAK
**Strong:** strong SQL + sharp product sense + clear recommendations + rigorous A/B reasoning. **Weak:** SQL-only with no product judgment, or product opinions with no data rigor.

### RED FLAGS
Weak SQL; no experimentation understanding; can't turn data into a decision.

---
*Next file: `03_infra_quality_security.md` (DevOps, Cloud, SRE, QA, Security Analyst, Security Engineer).*
