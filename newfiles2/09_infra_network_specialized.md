# 09 — INFRASTRUCTURE, NETWORK & SECURITY (SPECIALIZED) ROLES — Question-Template Library
Families: infrastructure, quality_security · Depts: cse/aids/ece/cyber/it

---

### Platform Engineer — infrastructure · cse/aids/ece · product/general · fresher→
Builds internal developer platforms and self-service infra.
**STACK** — Core (5): Kubernetes (deep) · IaC (Terraform) · CI/CD & GitOps (ArgoCD) · **developer experience** (self-service, golden paths, internal portals — Backstage) · cloud + Linux + scripting. Tools (3): Kubernetes · Terraform · ArgoCD/Backstage. Emerging (2): platform-as-a-product · policy-as-code (OPA) · service mesh.
**ROUNDS** — infra technical → platform design → scenario → behavioral.
**ASKABLE** — *Kubernetes/IaC:* (see DevOps K8s + Terraform banks — `[M]/[H]`). *Platform:* `[M]` design a self-service deploy platform; golden paths; abstract complexity for devs; multi-tenancy. `[H]` platform-as-a-product thinking; policy enforcement (OPA); developer onboarding at scale. *DevEx:* `[M]` reduce developer friction; internal portal (Backstage). `[H]` measure platform success (adoption, lead time).
**STRONG/WEAK** — Strong: infra depth + product mindset for developers. Weak: infra-only, no DevEx thinking. **RED FLAGS** — no self-service/abstraction mindset.

---

### Systems Administrator — infrastructure · cse/ece/it · service/general · fresher→
Configures and maintains servers and systems.
**STACK** — Core (5): **Linux/Windows administration** (users, permissions, services, processes) · **networking** (DNS, DHCP, TCP/IP, firewalls) · **scripting** (Bash/PowerShell) · virtualization (VMware/Hyper-V) · backup/monitoring + Active Directory. Tools (3): Linux/Windows Server · monitoring · AD. Emerging (2): automation (Ansible) · cloud migration.
**ROUNDS** — systems/OS → networking → scripting/scenario → behavioral.
**ASKABLE** — *OS admin:* `[E]` common Linux commands; file permissions (chmod/chown). `[M]` manage services (systemd); processes/troubleshoot high CPU/memory; cron; user management; AD basics. `[H]` debug a server issue; performance tuning; patch management. *Networking:* `[E]` DNS/DHCP; ports. `[M]` configure networking; firewall rules; SSH/troubleshoot connectivity; subnetting. `[H]` diagnose a network problem. *Scripting:* `[M]` write a script to automate <backup/monitoring/log rotation>. *Virtualization:* `[M]` VM management; snapshots.
**STRONG/WEAK** — Strong: OS + networking + scripting + methodical troubleshooting. Weak: GUI-only, no scripting/troubleshooting. **RED FLAGS** — no debugging method; no scripting.

---

### Database Administrator (DBA) — infrastructure · cse/aids · service/general · fresher→
Designs, tunes, and maintains databases.
**STACK** — Core (5): **SQL (advanced)** · **database internals** (indexing — B-tree/hash, query optimization/execution plans, storage) · **transactions** (ACID, isolation levels, locking, deadlocks) · **backup & recovery** (strategies, PITR) · **performance tuning** + replication/HA. Tools (3): a DBMS (Oracle/MySQL/Postgres/SQL Server) · monitoring · scripting. Emerging (2): cloud databases · NoSQL · automation.
**ROUNDS** — SQL/internals → tuning/scenario → backup/HA → behavioral.
**ASKABLE** — *SQL/internals:* `[E]` what is an index; primary vs unique key. `[M]` how indexes work (B-tree); when NOT to index; read an execution plan; optimize a slow query; joins performance. `[H]` composite/covering indexes; query rewriting; partitioning; statistics. *Transactions:* `[E]` ACID. `[M]` isolation levels + anomalies (dirty/phantom read); locking; deadlock (detect/prevent). `[H]` MVCC; lock escalation; concurrency tuning. *Backup/HA:* `[E]` types of backup. `[M]` backup strategy; point-in-time recovery; replication (sync/async). `[H]` HA/failover; DR; zero-downtime.
**STRONG/WEAK** — Strong: internals + tuning + recovery + concurrency depth. Weak: SQL-only, no internals/recovery. **RED FLAGS** — no index/execution-plan understanding; no backup/recovery plan.

---

### Network Engineer — infrastructure · cse/ece/cyber · service/core/general · fresher→
Designs and maintains computer networks.
**STACK** — Core (5): **networking fundamentals** (OSI, TCP/IP, subnetting, IP addressing) · **routing & switching** (static/dynamic routing — OSPF/BGP, VLANs, STP) · **protocols** (DNS, DHCP, HTTP, ARP, ICMP) · **network security** (firewalls, ACLs, VPN, NAT) · troubleshooting + tools (Wireshark). Tools (3): Cisco (CCNA) · Wireshark · packet tools. Emerging (2): SDN · network automation (Python/Ansible) · cloud networking.
**ROUNDS** — networking technical → routing/switching → troubleshooting scenario → behavioral.
**ASKABLE** — *Fundamentals:* `[E]` OSI layers; TCP vs UDP; what is an IP/MAC address. `[M]` **subnetting** (given a network, find subnets/hosts/ranges); public vs private IP; NAT; ARP; how DNS resolves; 3-way handshake. `[H]` supernetting/CIDR; TCP flow/congestion control. *Routing/switching:* `[E]` router vs switch. `[M]` static vs dynamic routing; OSPF basics; VLANs (why); STP (loop prevention); trunking. `[H]` BGP basics; routing decisions; redundancy. *Security:* `[M]` firewall/ACL; VPN types; port security. `[H]` segment a network securely. *Troubleshooting:* `[E]` steps when "can't reach a site" (ping/traceroute/DNS). `[M]` diagnose with Wireshark; layer-by-layer isolation. `[H]` intermittent network issue.
**STRONG/WEAK** — Strong: subnetting fluency + routing/switching + layered troubleshooting. Weak: shaky subnetting, no troubleshooting method. **RED FLAGS** — can't subnet; no OSI-based debugging.

---

### Release / Build Engineer / Observability Engineer — infrastructure · cse/aids/ece · product/general · fresher→
Build/release automation / observability systems.
**STACK & QUESTIONS** —
- **Release/Build Engineer:** core: CI/CD, build systems (Maven/Gradle/Bazel), versioning/artifacts, release management, Git branching, scripting. `[M]` design a build pipeline; artifact/versioning strategy; release/rollback; branching model (GitFlow/trunk); reduce build time. `[H]` monorepo builds; reproducible builds; release automation.
- **Observability Engineer:** core: metrics/logs/traces, Prometheus/Grafana/ELK/OpenTelemetry, alerting, dashboards, SLOs. `[E]` metrics vs logs vs traces. `[M]` set up monitoring; the four golden signals; what/how to alert; reduce alert fatigue; distributed tracing (OpenTelemetry). `[H]` observability for microservices; cardinality/cost; SLO-based alerting.
**STRONG/WEAK / RED FLAGS** — Strong: pipeline/observability depth + reliability mindset. Red flag: no versioning/alerting strategy.

---

### Application Security / Cloud Security / IAM Engineer — quality_security · cyber/cse · product/general · fresher→
Secures applications / cloud / identity.
**STACK & QUESTIONS** —
- **Application Security Engineer:** core: **OWASP Top 10**, secure coding, SAST/DAST, threat modeling (STRIDE), auth, crypto. `[M]` prevent SQLi/XSS/CSRF in code; secure an API; threat-model a feature; SAST vs DAST; secrets management. `[H]` secure SDLC; a security review; supply-chain security.
- **Cloud Security Engineer:** core: cloud security (IAM, network security, encryption), CSPM, shared-responsibility, compliance. `[M]` least-privilege IAM; secure a cloud deployment (public bucket, security groups); encryption at rest/transit; detect misconfigurations. `[H]` cloud threat model; multi-account security; zero trust.
- **IAM Engineer:** core: identity (SSO, SAML/OAuth/OIDC, MFA), authorization (RBAC/ABAC), directory services, least privilege, lifecycle. `[E]` authentication vs authorization; MFA. `[M]` SSO/SAML/OIDC flow; RBAC vs ABAC; provisioning/deprovisioning; least privilege. `[H]` federation; privileged access management; identity governance.
**STRONG/WEAK / RED FLAGS** — Strong: threat-modeling + secure-design + least-privilege depth. Red flag: no OWASP/IAM/least-privilege understanding.

---

### GRC / Incident-Response / Malware Analyst — quality_security · cyber/cse · service/product/general · fresher→
Governance-risk-compliance / IR / malware analysis.
**STACK & QUESTIONS** —
- **GRC Analyst:** core: security frameworks (ISO 27001, NIST, SOC2), risk assessment, compliance, audits, policies. `[E]` what is GRC; risk vs compliance. `[M]` risk assessment; a control framework (ISO 27001/NIST); audit process; policy; risk register. `[H]` map controls to a framework; a compliance program.
- **Incident-Response Analyst:** core: IR lifecycle (identify→contain→eradicate→recover→lessons), forensics basics, SIEM, log analysis, MITRE ATT&CK. `[M]` respond to a breach step by step; containment vs eradication; evidence preservation; IOCs; MITRE ATT&CK. `[H]` a complex incident (lateral movement); post-incident review.
- **Malware Analyst:** core: malware types, static/dynamic analysis, reverse engineering basics, sandboxing, OS internals. `[E]` malware types. `[M]` static vs dynamic analysis; sandboxing; identify malicious behavior; IOCs. `[H]` reverse-engineering approach; obfuscation/anti-analysis; write detection signatures.
**STRONG/WEAK / RED FLAGS** — Strong: structured method (framework/IR-lifecycle/analysis) + judgment. Red flag: no framework/lifecycle/analysis method.

---
*End of the specialized per-role question-template library. Together with files 01–08 and 10–18, this
covers the full roster across every department, each role with its own detailed tech stack + askable-
question bank. Long-tail/emerging roles inherit their family's template until promoted.*
