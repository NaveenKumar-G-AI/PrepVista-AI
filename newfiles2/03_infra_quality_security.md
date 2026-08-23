# 03 — INFRASTRUCTURE, QUALITY & SECURITY ROLES — Question-Template Library
Families: infrastructure, quality_security · Depts: cse/aids/ece/cyber/it

> Infra roles are **scenario-first** (troubleshoot > definitions). Security roles weight judgment.

---

## DevOps Engineer
Family infrastructure · Depts cse/aids/ece/cyber · Hires service/product/general · Seniority fresher→
Automates build, deployment, and infrastructure.

### TECH STACK
- **Core (5):** **CI/CD** (Jenkins, GitHub Actions, GitLab CI, ArgoCD; pipeline stages: build→test→scan→deploy) · **containers (Docker)** (images, layers, Dockerfile, registry, networking, volumes) · **orchestration (Kubernetes)** (pods, deployments, services, ReplicaSets, liveness/readiness probes, HPA, ConfigMaps/Secrets, StatefulSets, sidecars, namespaces) · **IaC (Terraform** — state, locking, modules; **Ansible**) · **Linux** (commands, permissions, processes, networking, shell scripting)
- **Core (4):** **cloud (AWS/Azure/GCP** — compute, storage, VPC, IAM, load balancing) · **monitoring/observability** (Prometheus, Grafana, ELK, Datadog; metrics/logs/traces) · **Git** (branching, merge/rebase, cherry-pick) · scripting (Bash/Python/YAML)
- **Tools (3):** Docker · Kubernetes · Terraform · Jenkins/GitHub Actions · Prometheus/Grafana
- **Emerging (2):** GitOps (ArgoCD/Flux) · platform engineering · DevSecOps (shift-left, SAST/DAST) · service mesh · chaos engineering

### ROUND STRUCTURE
1. Technical (tools + scenarios) — 45 min · 2. Linux/scripting — 30 min · 3. CI/CD + IaC design — 45 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **CI/CD:** `[E]` what is CI/CD; stages of a pipeline. `[M]` design a pipeline (build→test→scan→deploy); blue-green vs canary vs rolling; rollback strategy; secrets in pipelines; artifact versioning. `[H]` optimize a slow pipeline (caching, parallel, async); GitOps flow; pipeline security (SAST/DAST, protected variables).
- **Docker:** `[E]` container vs VM; what is an image. `[M]` Dockerfile best practices; multi-stage builds; reduce image size; container networking; volumes; ENTRYPOINT vs CMD. `[H]` debug a container that keeps restarting; layer caching; distroless.
- **Kubernetes (scenario-heavy):** `[E]` what is a pod/deployment/service. `[M]` **"a pod is stuck in CrashLoopBackOff — steps?"** (describe/logs/probes/config); liveness vs readiness probes; ConfigMap vs Secret; HPA; Deployment vs StatefulSet; rolling update + rollback. `[H]` "pods can't reach a service — debug"; resource limits/requests + OOMKilled; PV/PVC for stateful apps; node failure handling; sidecar use case.
- **Terraform/IaC:** `[E]` what is IaC; why. `[M]` Terraform state + remote backend + locking; plan vs apply; modules; idempotency; Terraform vs Ansible. `[H]` state corruption recovery; drift; managing multi-env.
- **Linux/scripting:** `[E]` common commands (grep/awk/sed/ps/chmod); file permissions. `[M]` write a script to <find/rotate logs, monitor a process>; cron; sudo; SSH/bastion. `[H]` debug high CPU/memory; systemd service; pipe/redirect chains.
- **Cloud:** `[M]` compute vs container vs serverless; VPC/subnets/security groups; IAM roles; load balancing; autoscaling. `[H]` cost optimization; multi-AZ HA; disaster recovery.
- **Monitoring:** `[E]` metrics vs logs vs traces. `[M]` Prometheus + Grafana setup; what to alert on; the four golden signals. `[H]` reduce alert fatigue; distributed tracing.

### COMMON FOLLOW-UPS
Walk me through debugging this failure step by step; how do you roll back safely; how do you secure this; how do you monitor it; what breaks at scale.

### STRONG vs WEAK
**Strong:** systematic troubleshooting (describe→logs→config), production experience over tool trivia, security + cost awareness. **Weak:** definition-recall only, no debugging method, no failure/security thinking.

### RED FLAGS
Can't debug a CrashLoopBackOff methodically; treats Kubernetes as magic; no rollback/secrets awareness.

---

## Cloud Engineer
Family infrastructure · Depts cse/aids/ece/cyber · Hires service/product/general · Seniority fresher→
Builds and manages cloud infrastructure.

### TECH STACK
- **Core (5):** **cloud services** (compute — EC2/VM/GCE; storage — S3/Blob/GCS + tiers; databases — RDS/managed) · **virtual networking** (VPC, subnets, route tables, gateways, security groups/NACLs) · **IAM** (users/roles/policies, least privilege, federation) · **compute options** (VM vs container vs serverless/Lambda) · **IaC** (Terraform/CloudFormation)
- **Core (3):** load balancing & autoscaling · cloud security · monitoring/logging (CloudWatch)
- **Tools (3):** an AWS/Azure/GCP stack · Terraform · CLI/SDK · Docker
- **Emerging (2):** serverless/event-driven · Kubernetes (EKS/AKS/GKE) · FinOps/cost optimization · multi-cloud

### ROUND STRUCTURE
1. Cloud technical — 45 min · 2. Networking + IAM + security — 30 min · 3. Architecture/cost — 45 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Services:** `[E]` IaaS vs PaaS vs SaaS; compute/storage/database service names. `[M]` when EC2 vs Lambda vs container; S3 storage classes; managed vs self-hosted DB. `[H]` design a scalable architecture on cloud; serverless vs container trade-offs.
- **Networking:** `[E]` what is a VPC/subnet. `[M]` public vs private subnet; security group vs NACL; NAT/Internet gateway; route tables; VPC peering. `[H]` hybrid connectivity (VPN/Direct Connect); multi-region networking.
- **IAM/Security:** `[E]` what is IAM; user vs role. `[M]` least-privilege policy; role assumption; encryption at rest/in transit; key management. `[H]` cross-account access; securing a public-facing app.
- **Scaling/HA:** `[M]` autoscaling; load balancer types; multi-AZ. `[H]` DR (RPO/RTO); global failover.
- **Cost:** `[M]` reduce cloud cost (right-sizing, reserved/spot, storage tiers). `[H]` cost architecture review.

### COMMON FOLLOW-UPS
How do you secure/scale/cost-optimize this; what fails in an AZ outage; least-privilege here.

### STRONG vs WEAK
**Strong:** service selection with trade-offs, security + cost baked in, HA/DR thinking. **Weak:** service name-dropping, no security/cost/failure reasoning.

### RED FLAGS
Over-permissive IAM; no cost/failure awareness; picks services without justification.

---

## Site Reliability Engineer (SRE)
Family infrastructure · Depts cse/aids/ece · Hires product/general · Seniority junior→
Keeps systems reliable and scalable; software eng + ops.

### TECH STACK
- **Core (5):** **reliability concepts** (SLI/SLO/SLA, **error budgets**, blameless postmortems, toil reduction) · **monitoring/observability** (metrics/logs/traces, four golden signals, alerting) · **incident management** (detect→triage→mitigate→resolve→postmortem) · Linux + scripting/coding (Python/Go + DSA) · distributed systems basics (consistency, replication, failure modes)
- **Core (3):** containers & orchestration · CI/CD · capacity planning
- **Tools (3):** Prometheus/Grafana · Kubernetes · PagerDuty · cloud
- **Emerging (2):** **chaos engineering** · SLO-driven development · platform engineering · AIOps

### ROUND STRUCTURE
1. Coding (DSA + scripting) — 45 min · 2. Systems/troubleshooting + reliability — 45 min · 3. Reliability/system design — 45 min · 4. Behavioral (incident) — 30 min

### ASKABLE QUESTIONS (by topic)
- **Reliability:** `[E]` SLI vs SLO vs SLA; what is an error budget. `[M]` how do you set SLOs; error-budget policy (slow releases when burned); toil + how to reduce it; blameless postmortem. `[H]` reliability-vs-velocity trade-off; design SLOs for a service.
- **Incident/troubleshooting:** `[E]` steps when a service is down. `[M]` "latency spiked — how do you investigate" (metrics→logs→traces→recent changes); four golden signals; runbooks. `[H]` a real incident debug (cascading failure, retry storm, thundering herd); mitigation vs root-cause.
- **Monitoring:** `[M]` what to monitor/alert on; reduce alert fatigue; SLO-based alerting. `[H]` distributed tracing; observability for microservices.
- **Coding:** `[M]` DSA + a script to parse logs/automate a task. `[H]` implement a rate limiter / retry with backoff.
- **Reliability design:** `[M]` make a service highly available; graceful degradation. `[H]` design for failure (circuit breakers, bulkheads, backpressure); chaos experiment.

### COMMON FOLLOW-UPS
How do you detect this; mitigate vs fix; how do you prevent recurrence; what's the blast radius; how do you avoid alert fatigue.

### STRONG vs WEAK
**Strong:** structured incident thinking, SLO/error-budget fluency, codes + reasons about failure. **Weak:** ops-only, no reliability framework, weak coding.

### RED FLAGS
Blames individuals (not blameless); no SLO/error-budget concept; no systematic incident method.

---

## QA / Test Engineer
Family quality_security · Depts cse/ece/it · Hires service/product/general · Seniority fresher→
Designs tests and ensures software quality (manual + automation).

### TECH STACK
- **Core (5):** **test design** (equivalence partitioning, boundary value, decision table, state transition, error guessing) · **SDLC & STLC** · **defect lifecycle** (states, severity vs priority, bug report) · **automation** (Selenium/Cypress/Playwright, POM, TestNG/pytest) · **API testing** (Postman, status codes, schema)
- **Core (3):** testing types (functional/non-functional, regression/smoke/sanity, black/white/grey-box) · SQL (data validation) · a scripting language
- **Tools (3):** Selenium/Cypress/Playwright · Postman · JIRA · TestNG/JUnit · Git
- **Emerging (2):** CI-integrated testing · performance testing (JMeter) · AI-assisted testing · API/contract testing

### ROUND STRUCTURE
1. Testing concepts + test design — 45 min · 2. Automation/coding — 45 min · 3. API/SQL + scenario — 30 min · 4. HR — 20 min

### ASKABLE QUESTIONS (by topic)
- **Concepts:** `[E]` verification vs validation; severity vs priority; smoke/sanity/regression; SDLC vs STLC; what makes a good bug report; black vs white box. `[M]` when to automate; test plan vs test strategy; positive vs negative testing; retesting vs regression. `[H]` risk-based testing; entry/exit criteria; test coverage strategy.
- **Test design:** `[M]` **design test cases for <a login form / ATM / lift / e-commerce checkout / a pen>** — cover positive, negative, boundary, edge; equivalence partitioning + BVA on a numeric field. `[H]` test a payment flow; test an API without a UI; design for a complex feature.
- **Automation:** `[E]` what is Selenium; locators. `[M]` POM; explicit vs implicit waits; handle dynamic elements/alerts/frames/dropdowns; data-driven testing. `[H]` build a framework (POM+data+reporting+CI); reduce flakiness; parallel/cross-browser.
- **API/SQL:** `[M]` validate an endpoint (status/schema/body/auth); SQL to verify data integrity. `[H]` chained API tests; negative API cases.

### COMMON FOLLOW-UPS
What edge cases; how do you reduce flaky tests; how do you decide coverage; how do you test this without a UI; what would you automate first.

### STRONG vs WEAK
**Strong:** systematic case design (edges + negatives), maintainable automation, CI + flakiness awareness. **Weak:** happy-path only, hardcoded waits, no structure.

### RED FLAGS
Only positive cases; `sleep()` everywhere; can't derive cases from requirements.

---

## Cybersecurity Analyst / SOC Analyst
Family quality_security · Depts cyber/cse/ece · Hires service/product/general · Seniority fresher→
Monitors and defends systems against threats.

### TECH STACK
- **Core (5):** **security fundamentals** (CIA triad, AAA, defense-in-depth, least privilege) · **networking security** (firewalls, IDS/IPS, VPN, ports/protocols, TCP/IP, DNS) · **threats & attacks** (malware types, phishing, DoS/DDoS, MITM, ransomware, **OWASP Top 10**) · **SIEM & monitoring** (log analysis, alert triage, correlation) · **incident response** (identify→contain→eradicate→recover→lessons)
- **Core (3):** cryptography basics (symmetric/asymmetric, hashing, TLS, PKI) · OS/Linux security · vulnerability assessment
- **Tools (3):** SIEM (Splunk/QRadar) · Wireshark · Nmap · a scanner (Nessus)
- **Emerging (2):** cloud security · threat intelligence · EDR/XDR · zero trust · SOAR

### ROUND STRUCTURE
1. Security fundamentals + networking — 45 min · 2. Threats/SIEM/IR scenario — 45 min · 3. Crypto/tools + behavioral — 30 min

### ASKABLE QUESTIONS (by topic)
- **Fundamentals:** `[E]` CIA triad; authentication vs authorization; what is a firewall. `[M]` symmetric vs asymmetric encryption; hashing vs encryption; TLS/SSL handshake; VPN; defense in depth; least privilege. `[H]` PKI; zero trust; risk = threat × vulnerability × impact.
- **Networking security:** `[E]` common ports (80/443/22/53); TCP vs UDP. `[M]` IDS vs IPS; firewall types; how a port scan works; DNS attacks; network segmentation. `[H]` detect lateral movement; analyze a Wireshark capture.
- **Threats/OWASP:** `[E]` malware types; phishing. `[M]` **OWASP Top 10** (SQLi, XSS, CSRF, broken auth); DoS vs DDoS; MITM; ransomware. `[H]` how you'd detect/mitigate a given attack; kill chain / MITRE ATT&CK.
- **SIEM/IR (scenario):** `[E]` what is a SIEM; what is an IOC. `[M]` "an alert fires for multiple failed logins then a success — what do you do" (triage steps); log analysis; incident-response phases. `[H]` investigate a suspected breach; containment vs eradication trade-offs; false-positive tuning.
- **Crypto:** `[M]` symmetric vs asymmetric use cases; digital signatures; salting passwords. `[H]` key exchange (Diffie-Hellman); certificate validation.

### COMMON FOLLOW-UPS
What would you check first; how do you contain vs eradicate; is this a false positive; how do you prevent recurrence; what's the impact.

### STRONG vs WEAK
**Strong:** structured triage, real threat knowledge, calm judgment under an incident, communicates risk. **Weak:** buzzwords, no IR method, panics or over/under-reacts.

### RED FLAGS
No IR process; can't explain OWASP basics; no triage method.

---

## Security Engineer / Penetration Tester
Family quality_security · Depts cyber/cse · Hires product/general · Seniority fresher→
Builds secure systems / ethically attacks systems to find vulnerabilities.

### TECH STACK & QUESTIONS
- **Security Engineer** — core: **secure coding + application security (OWASP)**, network security, cryptography, IAM, cloud security, threat modeling, secure SDLC, DevSecOps (SAST/DAST).
  - `[M]` prevent SQLi/XSS/CSRF in code; secure an API; threat-model a feature (STRIDE); secrets management; TLS config; secure a cloud deployment. `[H]` design authentication/authorization for a system; secure SDLC pipeline; supply-chain security.
- **Penetration Tester** — core: **web app security (OWASP)**, networking, Linux, exploitation basics, recon, tools (Burp Suite, Nmap, Metasploit), reporting.
  - `[E]` phases of a pen test (recon→scan→exploit→post-exploit→report); active vs passive recon. `[M]` how to test for SQLi/XSS; Nmap scan types; Burp Suite usage; privilege escalation basics. `[H]` exploit chain reasoning; pivoting; write a finding with severity + remediation.
- **Coding:** `[M]` scripting (Python) for automation; parse/validate input; a simple exploit/PoC concept (educational).

### COMMON FOLLOW-UPS / STRONG vs WEAK / RED FLAGS
Follow-ups: how would you exploit/defend this; severity + remediation; how do you report it responsibly. Strong = methodical, defense + offense understanding, clear remediation. Weak = tool-only, no methodology or remediation. Red flag: no ethics/scope awareness; can't reason about remediation; tool-button knowledge only.

---
*Final file: `06_business_product_design.md` (PM, Product Analyst, Business Analyst, Consultant, Operations Analyst, UX Designer).*
