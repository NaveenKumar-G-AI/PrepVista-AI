# PrepVista Feature #01 — COMPANY ROSTER (breadth = revenue)

> **How to read this.** Breadth is the product's compounding asset (Dossier Part 8). Every company is
> assigned an **archetype** so it inherits a working simulation *template* immediately, then gets
> hand-verified over time. Three tiers:
> - **Tier A — Full-fidelity:** hand-verified blueprint, `format_confidence ≥ 0.85`, exotic rounds modeled.
> - **Tier B — Template-mapped:** archetype default + package/platform known, `confidence ~0.5–0.75`,
>   "verify before your drive" banner. Promote to Tier A as demand/verification allows.
> - **Tier C — Generic archetype:** any of the 600+ names in `companies.json` not yet detailed runs the
>   nearest archetype template with a "generic format" badge + a "Request full modeling" button.
>
> Archetypes: `mass_service` · `product` · `premium_product` · `analytics` · `core` · `unique`.
> Templates for each are in `00_MASTER_DOSSIER.md` Part 8 and `data/company_archetypes.json`.

---

## TIER A — FULL-FIDELITY (build these blueprints first)

### Mass-service (IT services — high campus volume)
| Company | Platform | Signature | Tracks |
|---|---|---|---|
| TCS | TCS iON | MR round; locked-forward; tab-switch=terminate | Ninja/Digital/Prime |
| Infosys | HackerRank-style | 3-problem gauntlet; pseudocode (SE) | SE/SP/DSE |
| Wipro | Superset | Voice assessment; essay mistake-threshold | Elite/Turbo/Velocity |
| Cognizant | Superset | Gamified reasoning; SQL+Web-UI coding | GenC/Pro/Next |
| Accenture | CoCubes | MS-Office; Networking/Security/Cloud; coding=elim | ASE/Advanced |
| Capgemini | Superset | 24-game pool (draw 4); Python banned | Analyst/Sr Analyst |
| HCLTech | verify | standard service shape (verify current cycle) | base/digital |
| Tech Mahindra | Superset/AMCAT | aptitude + coding + comms | base/digital |
| LTIMindtree | Superset | aptitude + coding + technical | base/digital |
| Mphasis | Mettl-style | aptitude + coding + technical | base/digital |

### Unique
| Zoho | proctored | build-an-application advanced round; very selective | merit (single) |

### Premium-product (FAANG-tier / high-package product)
| Company | Platform | Signature | Tracks |
|---|---|---|---|
| Amazon | HackerRank-style | 16 LPs + Bar Raiser veto; work-sim | SDE-1/2 |
| Microsoft | Codility-style | backtracking-heavy; LLD; project demo; AA gate | SDE |
| Google | GHA/Meet | Googleyness + Hiring Committee; code-comprehension | L3+ |
| Adobe | HackerRank-style | Aptitude + 2–3 DSA + CS core + design | MTS |
| Oracle | HackerRank-style | Aptitude + coding + DBMS-heavy + technical | associate SDE |
| SAP Labs | Codility-style | coding + CS core + project + values | associate developer |
| Salesforce | HackerRank-style | coding + system/config + values | associate |
| Cisco | HackerRank-style | coding + networking + technical | associate |
| Qualcomm | HackerRank-style | coding + core electronics/embedded + technical | associate |
| NVIDIA | Codility-style | strong DSA + core (CS/ECE) + system | associate |

### Analytics / consulting / finance-tech
| Company | Platform | Signature | Tracks |
|---|---|---|---|
| Deloitte | AMCAT/custom | aptitude + case + technical + HR (game-based assess) | Analyst |
| Goldman Sachs | HackerRank | HackerRank OA (DSA + prob/stats) + technical + HR | Analyst |
| JP Morgan | HackerRank | Code-for-Good style OA + technical + HR | Analyst |
| Morgan Stanley | HackerRank | DSA OA + technical + HR | Analyst |
| ZS Associates | custom | aptitude + case + Guesstimate + technical | Decision Analytics Assoc. |
| Fractal Analytics | custom | aptitude + case + SQL/stats + technical | Analyst |

### Core engineering (mech / eee / ece / civil)
| Company | Platform | Signature | Tracks |
|---|---|---|---|
| L&T | custom | aptitude + domain technical + HR | GET |
| Tata Motors | custom | aptitude + domain + technical + HR | GET/DET |
| Bosch | custom | aptitude + domain + technical + HR | associate/GET |
| Siemens | custom | aptitude + domain + technical + values | GET |
| ABB | custom | aptitude + domain + technical + HR | GET |

*(Tier A target: the ~40 above, expanded over cycles. Start with the 11 named in the feature card.)*

---

## TIER B — TEMPLATE-MAPPED (archetype default + light verification)

> These inherit the archetype template immediately (usable day one) and are verified over time.

### mass_service (IT services & mid-caps)
Hexaware · Coforge · Birlasoft · Zensar · Cybage · Virtusa · DXC Technology · Sopra Steria · NTT Data ·
Atos · Persistent Systems · Nagarro · Happiest Minds · Sonata Software · Mastek · Newgen · KPIT ·
Tata Elxsi · L&T Technology Services · Cyient · eInfochips · GlobalLogic · Infosys BPM · Wipro Enterprises ·
Genpact · WNS · Firstsource · Concentrix · Teleperformance (BPO/tech-support skins).

### product (product & internet companies)
Flipkart · Myntra · Swiggy · Zomato · Paytm · PhonePe · Razorpay · CRED · Freshworks · Postman ·
BrowserStack · Sprinklr · InMobi · Chargebee · Zoho (Tier A) · Druva · Nutanix · Arista Networks ·
Juniper Networks · Palo Alto Networks · Fortinet · VMware · Dell Technologies · HP · HPE · Western Digital ·
Micron · Texas Instruments · Analog Devices · MediaTek · Marvell · AMD · Samsung R&D · LG Soft ·
Uber · PayPal · Walmart Global Tech · Target · Lowe's India · Wayfair · Expedia · Booking.com ·
ServiceNow · Atlassian · MongoDB · GitHub · Twilio · Intuit · Autodesk · Synopsys · Cadence · Siemens EDA.

### premium_product (extend)
Apple · Meta · Netflix · Stripe · Databricks · Snowflake · Rubrik · DE Shaw · Tower Research · WorldQuant ·
Graviton · Optiver · Jane Street (quant-flavored premium; add prob/stats-heavy OA to the template).

### analytics / consulting / finance
PwC · EY · KPMG · Accenture Strategy · Bain · BCG · McKinsey · Mu Sigma · Tiger Analytics · LatentView ·
Tredence · Fractal (Tier A) · Barclays · Wells Fargo · American Express · Citi · HSBC · Deutsche Bank ·
UBS · Nomura · BlackRock · Fidelity · S&P Global · Moody's · Nielsen · Kantar.

### core (mech / eee / ece / civil / chemical)
Mahindra · Ashok Leyland · TVS Motor · Hero MotoCorp · Bajaj Auto · Maruti Suzuki · Hyundai · Toyota
Kirloskar · Cummins · Caterpillar · John Deere · Thermax · Kirloskar · BHEL · NTPC · Power Grid ·
Schneider Electric · Honeywell · Emerson · Rockwell · GE · Wipro PARI · Godrej · Reliance Industries ·
Adani · Vedanta · JSW · Tata Steel · JSPL · Hindalco · UltraTech · ACC · Ambuja · Shapoorji Pallonji ·
Larsen & Toubro Construction · Afcons · Asian Paints · Berger · Pidilite · ITC · HUL · Nestlé · P&G ·
Dabur · Britannia · Sun Pharma · Dr Reddy's · Cipla · Aurobindo · Biocon · ISRO · DRDO · BARC (PSU skins).

*(Tier B is intentionally large and easy to extend — every name here is usable on day one via its
archetype template, then promoted to Tier A as it's verified or as campus demand requests it.)*

---

## TIER C — GENERIC ARCHETYPE (no dead-ends)

Any company in `companies.json` (600+ names across the 5 `CompanyType` groups) that is not yet in Tier
A/B automatically runs the **closest archetype template** so the student always gets a *relevant*
simulation. It is shown with a **"generic format — verify with your placement cell"** badge and a
**"Request full modeling"** button. Each request is a demand signal that prioritizes Tier A/B promotion.

**Mapping `CompanyType` → archetype default:**
- `SERVICE` → `mass_service`
- `PRODUCT` → `product` (or `premium_product` if package band is top-tier)
- `ANALYTICS` → `analytics`
- `CORE` → `core`
- `GENERAL` → nearest by role/package; default `mass_service`

---

## ARCHETYPE → SIMULATION TEMPLATE (what a company inherits until hand-verified)

| Archetype | Default rounds (ordered) | Platform skin | Package band | Exotic rounds |
|---|---|---|---|---|
| mass_service | OA (aptitude + technical/pseudocode MCQ + 1–2 coding) → Technical Interview → HR | Superset/CoCubes/HackerRank-style | ₹3.5–7.5 (tracks) | none by default |
| product | OA (2 DSA + optional debugging) → 2–3 technical/DSA interviews → HR | HackerRank-style | ₹8–20 | optional LLD |
| premium_product | OA/phone screen → DSA loop + system design → behavioral | HackerRank/Meet | ₹20–50+ | bar_raiser / committee |
| analytics | aptitude + stats → case/guesstimate → SQL/ML technical → HR | custom | ₹6–14 | case-heavy |
| core | aptitude + domain MCQ → domain technical → HR | custom | ₹3.5–8 | none by default |
| unique | bespoke (e.g., Zoho build-an-app) | proctored | varies | always Tier A |

---

## REVENUE NOTE
- A campus's visiting companies are overwhelmingly Tier A/B → those students get full-fidelity value.
- Tier C guarantees zero "company not found" moments → no lost sessions, and a steady demand signal.
- Each promotion (C→B→A) is a unit of moat *and* a unit of addressable demand. The roster is the asset
  that compounds; every verified company both raises fidelity and widens the market.

*Companion files: `00_MASTER_DOSSIER.md` (full knowledge base) · `01_CLAUDE_CODE_MASTER_PROMPT.md` (build prompt).*
