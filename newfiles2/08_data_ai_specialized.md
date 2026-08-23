# 08 — DATA & AI (SPECIALIZED) ROLES — Question-Template Library
Family: data_ai · Depts: aids/aiml/cse/ece

---

### NLP Engineer — data_ai · aiml/aids/cse · product/analytics · fresher→
Builds language-understanding systems.
**STACK** — Core (5): text preprocessing (tokenization, stemming/lemmatization, stopwords, n-grams) · embeddings (word2vec/GloVe/fastText, contextual — BERT) · **transformers & attention** · NLP tasks (classification, NER, POS, sentiment, summarization, QA, translation) · Python + PyTorch/TF + Hugging Face. Tools (3): spaCy/NLTK · Hugging Face · vector DBs. Emerging (2): LLMs/prompting/RAG · fine-tuning (LoRA) · evaluation (BLEU/ROUGE/perplexity).
**ROUNDS** — coding → NLP/DL depth → NLP system design → project+HR.
**ASKABLE** — *Preprocessing:* `[E]` tokenization; stemming vs lemmatization. `[M]` handle OOV; TF-IDF vs embeddings; n-grams. `[H]` subword tokenization (BPE/WordPiece). *Embeddings:* `[M]` word2vec (CBOW/skip-gram); why contextual embeddings; cosine similarity. `[H]` sentence embeddings; embedding bias. *Transformers:* `[M]` self-attention intuition; encoder vs decoder; positional encoding; BERT vs GPT. `[H]` attention math; why transformers over RNNs; fine-tuning vs feature extraction. *Tasks:* `[M]` build a text classifier / NER; handle imbalanced text; evaluation metrics (F1, BLEU/ROUGE). `[H]` design a QA/summarization/RAG system; handle long documents. *Coding:* `[M]` text cleaning; implement cosine similarity / TF-IDF.
**STRONG/WEAK** — Strong: transformer fundamentals + practical NLP + evaluation. Weak: library-only, no attention understanding, no eval. **RED FLAGS** — can't explain attention; no metric awareness.

---

### Computer Vision Engineer — data_ai · aiml/aids/ece · product/core · fresher→
Builds image/video understanding systems.
**STACK** — Core (5): image processing (filtering, edges, histograms, morphology) · **OpenCV** · **CNNs** (convolution, pooling, architectures — ResNet/VGG/YOLO) · CV tasks (classification, object detection, segmentation, tracking) · Python + PyTorch/TF. Tools (3): OpenCV · PyTorch/TF · augmentation libs. Emerging (2): vision transformers (ViT) · multimodal (CLIP) · edge deployment.
**ROUNDS** — coding → CV/DL depth → CV system design → project+HR.
**ASKABLE** — *Image processing:* `[E]` grayscale/RGB; what is a kernel/filter. `[M]` edge detection (Sobel/Canny); histogram equalization; blurring/sharpening; morphological ops. `[H]` image registration; feature detection (SIFT/ORB). *CNNs:* `[E]` what is convolution/pooling. `[M]` receptive field; stride/padding; why CNNs for images; transfer learning; data augmentation. `[H]` object detection (YOLO/Faster-RCNN); segmentation (U-Net/Mask-RCNN); IoU/mAP; anchor boxes. *Design:* `[M]` design a system to detect/count/track <objects>; handle class imbalance & small objects. `[H]` real-time inference on edge; scale a vision pipeline. *Coding:* `[M]` OpenCV ops; implement IoU.
**STRONG/WEAK** — Strong: CV fundamentals + CNN depth + deployment. Weak: OpenCV-button knowledge, no CNN intuition. **RED FLAGS** — can't explain convolution; no metric (mAP/IoU) awareness.

---

### MLOps Engineer — data_ai · aiml/aids/cse · product/analytics · fresher→
Operationalizes and monitors ML in production.
**STACK** — Core (5): ML basics · **CI/CD for ML** · **Docker & Kubernetes** · **model serving** (REST/gRPC, batch vs real-time) · **monitoring** (data/model drift, performance). Tools (3): MLflow/Kubeflow · Docker/K8s · cloud ML · feature stores. Emerging (2): LLMOps · data/model versioning (DVC) · pipeline orchestration.
**ROUNDS** — coding/scripting → MLOps depth → ML infra design → project+HR.
**ASKABLE** — *Serving:* `[E]` how to serve a model. `[M]` REST vs gRPC; batch vs real-time; containerize + expose; autoscaling inference. `[H]` low-latency serving; multi-model; GPU serving. *CI/CD-ML:* `[M]` pipeline for training→validation→deploy; model + data versioning; automated retraining triggers. `[H]` shadow/canary model deploys; rollback; reproducibility. *Monitoring:* `[E]` why monitor models. `[M]` data drift vs model drift; metrics to track; alerting. `[H]` drift detection (KL/PSI); feature/label skew; closed-loop retraining. *Infra:* `[M]` design an ML platform (train/serve/monitor/feature store). `[H]` scale + cost + reliability.
**STRONG/WEAK** — Strong: SWE + infra + ML lifecycle. Weak: notebook mindset, no serving/monitoring. **RED FLAGS** — no drift/monitoring; treats models as static.

---

### Analytics Consultant / Decision Scientist — data_ai · aids/aiml/cse · analytics · fresher→
Solves business problems with analytics / drives decisions quantitatively.
**STACK** — Core (5): statistics + hypothesis testing · SQL · Python/R · **structured problem-solving + business framing** · experiment design (A/B, causal inference basics). Tools (3): SQL · Python/R · Excel/viz. Emerging (2): causal inference · optimization · storytelling.
**ROUNDS** — case (analytics) → SQL/stats technical → guesstimate → behavioral.
**ASKABLE** — *Case:* `[M]` "client's <metric> is declining — analyze with data"; frame → hypothesize → data → validate → recommend; design an experiment to test a business change. `[H]` causal vs correlational; optimize a decision under constraints. *Stats/SQL:* `[M]` hypothesis testing; A/B design + significance; SQL windows/funnels. `[H]` power analysis; confounders; regression interpretation. *Guesstimate:* `[M]` market/impact sizing with assumptions. *Communication:* explain a model result to a non-technical client.
**STRONG/WEAK** — Strong: rigor + business framing + clear recommendation. Weak: technical-only or hand-wavy. **RED FLAGS** — no experiment/causal awareness; can't turn analysis into a decision.

---

### Research Analyst — data_ai/business_product · aids/cse/eee · analytics/general · fresher→
Conducts research and synthesizes findings.
**STACK** — Core (5): research methodology · data analysis + statistics basics · SQL/Excel · **report writing + synthesis** · secondary research + critical thinking. Tools (3): Excel · SQL · viz · survey tools. Emerging (2): LLM-assisted research · data storytelling.
**ROUNDS** — case/analytical → domain/research → behavioral.
**ASKABLE** — *Research:* `[M]` how would you research <a market/question>; primary vs secondary; survey design; source credibility. `[H]` synthesize conflicting sources; design a study. *Analysis:* `[M]` interpret data/trends; basic stats; SQL/Excel. *Communication:* structure a report; lead with the finding.
**STRONG/WEAK** — Strong: structured, critical, clear synthesis. Weak: unstructured, uncritical of sources. **RED FLAGS** — trusts single source; no synthesis.

---

### Big Data / Analytics Engineer / Data Architect — data_ai · aids/aiml/cse · analytics/product · fresher→
Scaled data processing / analytics-ready data models / data architecture.
**STACK** — Core (5): **Spark/Hadoop** (distributed processing, partitioning, shuffles) · **SQL + dbt (analytics engineering)** · data modeling (star/snowflake, dimensional) · data warehousing/lakehouse (Snowflake/BigQuery/Databricks, Delta/Iceberg) · pipelines/orchestration. Tools (3): Spark · dbt · Airflow · cloud data. Emerging (2): streaming · data governance/quality · lakehouse.
**ROUNDS** — coding (SQL/Spark) → data modeling/architecture → pipeline design → project+HR.
**ASKABLE** — *Spark:* `[M]` RDD vs DataFrame; lazy eval; what causes a shuffle; partitioning. `[H]` optimize a Spark job (skew/broadcast/cache). *Modeling:* `[M]` star vs snowflake; fact/dimension; SCD types; dbt models/tests. `[H]` design a warehouse schema for <domain>; incremental models. *Architecture:* `[M]` batch vs streaming; lambda/kappa; data lake vs warehouse vs lakehouse. `[H]` design an end-to-end data platform; governance + quality + cost. *SQL:* `[M]` windows, optimization, dedup.
**STRONG/WEAK** — Strong: modeling + scale + quality thinking. Weak: script-level, no modeling/quality. **RED FLAGS** — no dimensional modeling; unaware of shuffles/skew.

---
*Next: `07_software_specialized.md`, then electronics/mechanical/civil/electrical/chemical/finance/business/design/sales specialized.*
