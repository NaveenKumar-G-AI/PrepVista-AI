# 01 — SOFTWARE ENGINEERING ROLES — Question-Template Library
Family: software_engineering · Depts: cse/aids/aiml/ece/it/cyber

---

## Software Engineer / SDE
Family software_engineering · Depts cse/aids/aiml/ece/cyber · Hires service/product/general · Seniority fresher→
The generalist software role: DSA + CS fundamentals + one language, scaling to system design.

### TECH STACK
- **Core (5):** Data structures (arrays, strings, linked lists, stacks/queues, hashmaps, trees, BST, heaps, tries, graphs) · Algorithms (sorting, searching, recursion, backtracking, greedy, divide-and-conquer, **dynamic programming**, graph traversal BFS/DFS, Dijkstra, union-find) · Time/space complexity (Big-O, amortized) · a primary language (Java/C++/Python)
- **Core (4):** OOP (encapsulation, inheritance, polymorphism, abstraction, SOLID) · DBMS & SQL (joins, normalization, transactions/ACID, indexing) · Operating systems (process/thread, scheduling, deadlock, memory, paging) · Computer networks (OSI/TCP-IP, HTTP, DNS, TCP vs UDP)
- **Tools (3):** Git · testing basics (unit tests) · a build tool · debugging
- **Emerging (2):** System design basics (for ≥junior) · AI literacy (LLM basics, when-to-use-AI, using AI coding tools well)

### ROUND STRUCTURE
1. Coding / DSA — 1–2 problems — 45–60 min
2. Technical (CS fundamentals + language) — 30–45 min
3. System design (≥junior) — 45 min
4. Project deep-dive (resume) — 20 min
5. HR / behavioral — 20 min

### ASKABLE QUESTIONS (by topic)
- **Arrays/Strings:** `[E]` reverse an array/string; find max/min; check palindrome. `[M]` two-sum / two-pointer; sliding-window max-subarray (Kadane); merge intervals; anagram groups. `[H]` trapping rain water; longest substring without repeats; median of two sorted arrays.
- **Hashing:** `[E]` count frequencies; first non-repeating char. `[M]` subarray sum equals K; longest consecutive sequence. `[H]` LRU cache design (map + DLL).
- **Linked lists:** `[E]` reverse a list; detect middle. `[M]` detect/remove cycle (Floyd); merge two sorted lists; remove Nth from end. `[H]` reverse in k-groups; clone a list with random pointers.
- **Stacks/Queues:** `[E]` valid parentheses. `[M]` min-stack; next greater element; implement queue via stacks. `[H]` largest rectangle in histogram; sliding-window maximum (deque).
- **Trees:** `[E]` traversals (in/pre/post); height. `[M]` level-order (BFS); LCA; diameter; validate BST; balanced check. `[H]` serialize/deserialize; max path sum; construct from inorder+preorder.
- **Graphs:** `[M]` BFS/DFS; connected components; cycle detection; topological sort; number of islands. `[H]` Dijkstra/Bellman-Ford; MST (Kruskal/Prim); word ladder; course schedule.
- **DP:** `[M]` Fibonacci/climbing stairs (memo→tab); coin change; longest common subsequence; 0/1 knapsack; house robber. `[H]` edit distance; longest increasing subsequence (n log n); matrix chain; palindrome partitioning; regex/wildcard matching.
- **OOP/Design:** `[E]` four pillars with examples; overloading vs overriding; abstract class vs interface. `[M]` SOLID principles; a design pattern you've used (singleton/factory/observer/strategy). `[H]` design a parking lot / elevator / library (LLD with classes + relationships).
- **DBMS/SQL:** `[E]` normalization forms; primary vs foreign key; DELETE vs TRUNCATE vs DROP. `[M]` write a join/GROUP BY/HAVING query; what is an index and its trade-off; ACID; 2nd-highest salary. `[H]` window functions; query optimization; deadlock in DB; isolation levels.
- **OS:** `[E]` process vs thread; what is a deadlock. `[M]` scheduling algorithms; mutex vs semaphore; paging vs segmentation; context switch. `[H]` producer-consumer with synchronization; virtual memory / page-replacement.
- **Networks:** `[E]` what happens when you type a URL; TCP vs UDP; HTTP vs HTTPS. `[M]` OSI layers; DNS resolution; 3-way handshake; status codes.
- **System design (≥jr):** `[M]` design a URL shortener; design a rate limiter; design a key-value store. `[H]` design Twitter feed; design a chat app; design a notification system (discuss scaling, caching, DB choice, consistency).
- **Language depth:** `[M]` (Java) JVM/GC, collections, HashMap internals, `==` vs `.equals`, checked vs unchecked exceptions; (Python) GIL, mutable/immutable, decorators, generators, list vs tuple; (C++) pointers/references, RAII, virtual functions/vtable, smart pointers.

### COMMON FOLLOW-UPS
Optimize time/space; handle edge cases (empty, nulls, duplicates, overflow); dry-run on an example; "what if the input doesn't fit in memory?"; scale the design to 10× traffic.

### STRONG vs WEAK
**Strong:** clarifies constraints, states approach + complexity before coding, handles edges, tests mentally, discusses trade-offs. **Weak:** codes immediately, no complexity analysis, ignores edges, can't explain the "why".

### RED FLAGS
Memorized solution without understanding; can't modify the approach when constraints change; no testing instinct.

---

## Backend Developer
Family software_engineering · Depts cse/aids/aiml/ece · Hires service/product/general · Seniority fresher→
Builds server-side logic, APIs, and the data layer.

### TECH STACK
- **Core (5):** DSA (as SDE, lighter on hard-DP) · a backend language (Java/Python/Node/Go) · **REST API design** (verbs, status codes, versioning, idempotency, pagination, HATEOAS) · **Databases & SQL** (schema design, indexing, transactions/ACID, joins, query optimization, connection pooling) · **System design** (scaling, load balancing, caching, message queues, consistency, CAP)
- **Core (3):** OS & concurrency (threads, locks, deadlock, async) · Auth (sessions, JWT, OAuth2, RBAC) · Caching (Redis, cache invalidation, TTL, write-through/back)
- **Tools (3):** Git · a backend framework (Spring/Django/Express) · Docker basics · message queues (Kafka/RabbitMQ) · testing
- **Emerging (2):** Microservices (service discovery, API gateway, circuit breaker) · GraphQL · AI literacy (LLM API integration, RAG basics)

### ROUND STRUCTURE
1. Coding / DSA — 45 min
2. Backend technical (APIs + DB + OS) — 45 min
3. System/LLD design — 45 min (≥jr)
4. Project deep-dive — 20 min · 5. HR — 20 min

### ASKABLE QUESTIONS (by topic)
- **REST/API:** `[E]` GET vs POST vs PUT vs PATCH; idempotency; common status codes (200/201/400/401/403/404/409/429/500). `[M]` design a REST API for <resource>; versioning strategies; pagination (offset vs cursor); rate limiting; how to handle partial failures. `[H]` design a REST API for a multi-tenant SaaS — tenant isolation at the data layer (separate DB vs shared-with-tenant_id vs hybrid); idempotency keys for payments.
- **Databases:** `[E]` SQL vs NoSQL; when to use each; what is an index. `[M]` design a schema for <app>; normalization vs denormalization; transaction isolation levels; N+1 problem; how indexing works (B-tree) and its cost. `[H]` sharding vs replication; optimize a slow query (EXPLAIN); eventual vs strong consistency; handling hot partitions.
- **Caching:** `[E]` why cache; what to cache. `[M]` cache invalidation strategies; write-through vs write-back; TTL; cache stampede. `[H]` distributed caching; consistency between cache and DB; Redis data structures for a use case.
- **Auth/Security:** `[E]` authentication vs authorization; what is JWT. `[M]` session vs token auth; OAuth2 flow; storing passwords (hashing/salting/bcrypt); CORS. `[H]` refresh-token rotation; preventing SQL injection/XSS/CSRF; secrets management.
- **Concurrency:** `[M]` race condition example + fix; optimistic vs pessimistic locking; thread pool; async/await or futures. `[H]` design a rate limiter (token bucket/leaky bucket); handle concurrent updates to inventory.
- **System/Microservices:** `[M]` monolith vs microservices trade-offs; API gateway; service-to-service communication (sync vs async); message queue use case. `[H]` circuit breaker; saga/2PC for distributed transactions; idempotent consumers; designing for failure.
- **Design:** `[M]` design a URL shortener / rate limiter / notification service. `[H]` design a payment system / order-management / feed with scaling, DB choice, caching, queues, and consistency reasoning.

### COMMON FOLLOW-UPS
Where's the bottleneck at scale; what breaks first; how to make it idempotent; how to handle a downstream outage; how do you monitor this.

### STRONG vs WEAK
**Strong:** leads with data modeling and isolation; reasons about consistency, failure, and scale; treats the system as connected. **Weak:** starts with routes/endpoints; can't reason about indexing or consistency; ignores failure modes.

### RED FLAGS
"Just use a database" with no schema reasoning; no awareness of transactions or race conditions; treats caching as a magic speed-up.

---

## Frontend Developer
Family software_engineering · Depts cse/aids/ece · Hires service/product/general · Seniority fresher→
Builds user interfaces and client-side experiences.

### TECH STACK
- **Core (5):** **JavaScript fundamentals** (event loop, closures, hoisting, `this`, prototypes/prototype chain, promises/async-await, ES6+, `var/let/const`, currying, debounce/throttle) · **React** (components, JSX, props/state, hooks — useState/useEffect/useMemo/useCallback/useRef/useContext/useReducer, virtual DOM, reconciliation/Fiber, keys, lifecycle, controlled vs uncontrolled, Context vs prop-drilling, **React 19**: Actions/useActionState/useOptimistic/use hook/Server Components/Compiler) · **TypeScript** (types/interfaces, generics, unions, strict mode — **now a baseline filter**) · **HTML/CSS** (semantic HTML, box model, flexbox, grid, positioning, specificity, responsive/media queries, CSS-in-JS)
- **Core (4):** **Performance** (Core Web Vitals — LCP/CLS/INP, bundle size/code-splitting, lazy loading, memoization, image formats AVIF/WebP, critical rendering path) · **Testing** (React Testing Library, Jest, **Playwright** e2e — *testing questions eliminate more candidates than CSS*) · State management (Context, Redux/Redux-Toolkit, Zustand, React Query/TanStack) · Browser (DOM, events/delegation, storage — localStorage/sessionStorage/cookies, rendering, CORS)
- **Tools (3):** Git · build tools (Vite/Webpack, tree-shaking) · a framework (Next.js — SSR/SSG/ISR/App Router) · dev tools/profiler
- **Emerging (2):** SSR/RSC & Next.js App Router · accessibility (a11y, ARIA) · AI literacy

### ROUND STRUCTURE
1. Coding (JS/DOM or a UI machine-coding task, e.g., build a component) — 45–60 min
2. Technical (React/TS/perf/testing) — 45 min
3. Full-stack system design (frontend + API + data) — 45 min (≥jr)
4. Project deep-dive — 20 min · 5. HR — 20 min

### ASKABLE QUESTIONS (by topic)
- **JS fundamentals:** `[E]` `==` vs `===`; `var/let/const`; what is hoisting. `[M]` explain closures with a use case; **"predict the output order"** of a snippet with setTimeout/promises (event loop + microtasks); `this` in different contexts; implement debounce/throttle; deep vs shallow copy. `[H]` prototypal inheritance (`Object.create`, `__proto__`, prototype chain); implement Promise.all / a polyfill; currying; memoize a function.
- **React:** `[E]` what is JSX/virtual DOM; props vs state; controlled vs uncontrolled. `[M]` how does reconciliation/diffing work; why keys; useEffect dependency pitfalls + cleanup; useMemo vs useCallback; Context vs Redux; lifting state. `[H]` React Fiber & time-slicing; Server Components vs client; useOptimistic / the `use` hook; render performance debugging (Profiler); building a custom hook.
- **TypeScript:** `[E]` type vs interface; basic types. `[M]` generics; union/intersection; utility types (Partial/Pick/Omit); typing props. `[H]` conditional/mapped types; strict-mode implications in a monorepo.
- **CSS/HTML:** `[E]` box model; block vs inline; specificity. `[M]` flexbox vs grid (when each); center a div; responsive design; position values; CSS-in-JS pros/cons. `[H]` critical CSS; layout thrashing/reflow; a11y semantics.
- **Performance:** `[M]` how to reduce bundle size (you see moment.js at 280KB using 2 functions — fix it: date-fns/Intl); lazy loading images/components (React.lazy + Suspense); Core Web Vitals + how to improve LCP. `[H]` code splitting strategy; CI bundle budgets; virtualization for long lists; memoization trade-offs.
- **Testing:** `[M]` write a test for a component that fetches on mount and renders a list (RTL, mock fetch, waitFor); unit vs integration vs e2e. `[H]` Playwright e2e for a flow; testing philosophy; what to test vs not.
- **Full-stack design:** `[M]` design a paginated, searchable data table with an API. `[H]` design real-time collaborative editing (concurrency → CRDT/OT, WebSockets, optimistic UI); design a content platform with instant loads (CDN, SSR/ISR, image optimization, read replicas).

### COMMON FOLLOW-UPS
Why did you pick that hook/state tool; how would this perform with 10k rows; how do you test it; accessibility implications; what happens on slow networks.

### STRONG vs WEAK
**Strong:** understands *why* React works (not just uses it), reaches for TypeScript and testing unprompted, thinks about performance and a11y. **Weak:** "uses React, doesn't understand it"; no testing practice; ignores performance/bundle; can't explain the event loop.

### RED FLAGS
Can't predict async output order; no TypeScript; never written a test; inline functions everywhere with no perf awareness.

---

## Full-Stack Developer
Family software_engineering · Depts cse/aids/ece · Hires service/product/general · Seniority fresher→
Works across frontend, backend, and databases end-to-end.

### TECH STACK
- **Core (5):** Frontend (JS + a framework — see Frontend) · Backend (a language + REST APIs — see Backend) · Databases & SQL (schema, indexing, transactions) · **Full-stack system design** (frontend + API + data model + auth + deploy as one connected system) · DSA
- **Core (3):** Auth end-to-end (JWT/session, protected routes) · Caching · the request lifecycle (browser → DNS → server → DB → render)
- **Tools (3):** Git · a stack (MERN/MEAN/Django+React/Spring+React) · Docker · CI/CD basics · deployment (Netlify/Vercel/AWS)
- **Emerging (2):** TypeScript across the stack · microservices/serverless · AI literacy

### ROUND STRUCTURE
1. Coding / DSA — 45 min · 2. Frontend technical — 30 min · 3. Backend technical — 30 min · 4. Full-stack design — 45 min · 5. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Request lifecycle:** `[E]` what happens end-to-end when a user submits a form. `[M]` where would you add caching/validation/auth across the stack. `[H]` optimize end-to-end latency (CDN, SSR, DB, caching).
- **Frontend:** (see Frontend bank — `[E]/[M]` React + JS core).
- **Backend/DB:** (see Backend bank — REST, schema, transactions, `[M]/[H]`).
- **Full-stack design:** `[M]` design a blogging platform / to-do app with auth (frontend + API + DB + deploy). `[H]` design real-time chat or collaborative editing across every layer (WS, concurrency, data model, auth, scaling); multi-tenant SaaS end-to-end.
- **Integration:** `[M]` how does the frontend talk to the backend (fetch/axios, error handling, loading states); CORS; env config; how do you handle auth tokens on the client. `[H]` optimistic updates + rollback; websockets vs polling vs SSE.

### COMMON FOLLOW-UPS
Which layer is the bottleneck; how do you deploy this; how do you secure the API; how do you handle a failed request on the client.

### STRONG vs WEAK
**Strong:** reasons across layers as one system; leads full-stack design with the hard part (concurrency/data). **Weak:** strong on one layer, treats the other as "just X"; can't connect frontend and backend concerns.

### RED FLAGS
Backend-weighted candidate who treats frontend as "just React" (or vice versa); no deployment/CI awareness.

---

## Mobile App Developer
Family software_engineering · Depts cse/aids/ece · Hires service/product/general · Seniority fresher→
Builds Android/iOS or cross-platform apps.

### TECH STACK
- **Core (5):** Platform — **Android** (Kotlin/Java, Activity/Fragment lifecycle, Jetpack — ViewModel/LiveData/Room/Navigation/Compose, Intents, RecyclerView) OR **iOS** (Swift, UIKit/SwiftUI, view-controller lifecycle, Auto Layout) OR **cross-platform** (Flutter — widgets/state/Dart, or React Native) · OOP · DSA · **app lifecycle & state** · local storage (SQLite/Room/CoreData)
- **Core (3):** REST API integration (Retrofit/URLSession/Dio, JSON) · async (coroutines/async-await/Futures) · UI (responsive layouts, lists, navigation)
- **Tools (3):** Git · Gradle/Xcode · push notifications (FCM/APNs) · testing (JUnit/Espresso/XCTest)
- **Emerging (2):** Jetpack Compose / SwiftUI declarative UI · offline-first/sync · performance (memory, jank) · AI literacy

### ROUND STRUCTURE
1. Coding / DSA — 45 min · 2. Mobile technical (platform + lifecycle + UI) — 45 min · 3. App design / machine coding — 30 min (≥jr) · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Lifecycle:** `[E]` Activity/Fragment (or ViewController) lifecycle; onCreate vs onResume. `[M]` handling configuration changes/rotation; saving state; memory leaks from context/listeners. `[H]` process death & restoration; background execution limits.
- **UI:** `[E]` layouts (ConstraintLayout / Auto Layout); RecyclerView/UITableView. `[M]` efficient lists (view holder/reuse, diffing); Compose/SwiftUI state; navigation. `[H]` complex custom views; performance (overdraw, jank, 60fps).
- **Data/Networking:** `[E]` how to call a REST API; parse JSON. `[M]` Room/CoreData; caching; async with coroutines/async-await; error/loading states. `[H]` offline-first sync; conflict resolution; pagination.
- **Architecture:** `[M]` MVVM / MVC / MVP; dependency injection (Hilt/Dagger); repository pattern. `[H]` modularization; testability; state management at scale.
- **Design:** `[M]` design a news/chat/e-commerce app (screens, data, offline). `[H]` design an image-heavy feed (caching, memory, lazy loading).

### COMMON FOLLOW-UPS
How do you avoid memory leaks; how do you handle no network; how do you keep the list smooth; how do you test this.

### STRONG vs WEAK
**Strong:** knows the lifecycle cold, avoids leaks, thinks about offline + performance. **Weak:** UI-only, no lifecycle/memory awareness, no offline handling.

### RED FLAGS
Leaks context; blocks the main thread; no state restoration awareness.

---

## Software Development Engineer in Test (SDET) / Automation Test Engineer
Family quality_security/software_engineering · Depts cse/ece/it · Hires service/product/general · Seniority fresher→
Builds test automation frameworks and ensures quality with code.

### TECH STACK
- **Core (5):** Manual testing + **test design** (equivalence partitioning, boundary value, decision tables, state transition) · **SDLC & STLC** · defect lifecycle · **automation** (Selenium WebDriver, or Cypress/Playwright; Page Object Model; TestNG/JUnit/pytest) · a programming language (Java/Python/JS) + DSA-lite
- **Core (3):** **API testing** (Postman, REST-assured; status codes, schema, auth) · SQL (data validation) · CI integration (Jenkins/GitHub Actions running tests)
- **Tools (3):** Git · a test framework · reporting (Allure/ExtentReports) · BDD (Cucumber/Gherkin) · Docker for test envs
- **Emerging (2):** Playwright/Cypress modern e2e · performance testing (JMeter) · AI-assisted testing · contract testing
- **Core testing concepts:** black-box vs white-box, functional vs non-functional, regression/smoke/sanity, positive/negative, severity vs priority.

### ROUND STRUCTURE
1. Coding (DSA-lite + automation) — 45 min · 2. Testing concepts + scenario design — 45 min · 3. Framework/design — 30 min (≥jr) · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Testing concepts:** `[E]` verification vs validation; severity vs priority; smoke vs sanity vs regression; SDLC vs STLC; a good bug report. `[M]` design test cases for <a login page / an ATM / a lift / an e-commerce cart>; positive + negative + edge; boundary value + equivalence partitioning; when to automate vs not. `[H]` test strategy for a release; risk-based testing; flaky-test root causes and fixes.
- **Automation:** `[E]` what is Selenium; locators (id/xpath/css). `[M]` Page Object Model; explicit vs implicit waits; handling dynamic elements/iframes/alerts; data-driven testing. `[H]` design a scalable automation framework (POM + data + reporting + CI + parallel); cross-browser via Grid/cloud; reduce flakiness.
- **API testing:** `[E]` GET/POST; status codes; what to validate in a response. `[M]` write a test for an endpoint (status, schema, body, auth); chaining requests; negative cases. `[H]` contract testing; API test in CI; auth flows.
- **Coding:** `[E]` reverse a string; count word frequency. `[M]` find duplicates; string manipulation; simple DSA. `[H]` parse/validate data; small framework utility.
- **SQL:** `[M]` validate data with a query; joins to check integrity.

### COMMON FOLLOW-UPS
How would you reduce flaky tests; how do you decide coverage; how do you test without a UI; how do you run this in CI.

### STRONG vs WEAK
**Strong:** systematic test design (edges + negatives), builds maintainable frameworks (POM), thinks about CI + flakiness. **Weak:** only happy-path cases; hardcoded waits; no framework structure.

### RED FLAGS
`Thread.sleep` everywhere; no negative testing; can't design test cases from requirements.

---

## Solutions Architect (associate)
Family software_engineering/infrastructure · Depts cse/aids/ece · Hires product/service/general · Seniority junior→
Designs technical solutions across systems and cloud.

### TECH STACK
- **Core (5):** System design (scaling, availability, reliability, consistency, CAP) · cloud fundamentals (compute/storage/network/IAM on AWS/Azure/GCP) · databases (SQL vs NoSQL selection) · networking · security fundamentals
- **Core (3):** APIs & integration · caching & CDN · message queues/event-driven
- **Tools (3):** cloud services (EC2/S3/RDS/Lambda/VPC) · IaC basics · architecture diagramming
- **Emerging (2):** microservices/serverless · well-architected trade-offs (cost/performance/security) · AI/ML integration

### ROUND STRUCTURE
1. System/architecture design — 60 min · 2. Cloud + trade-offs — 45 min · 3. Behavioral/stakeholder — 30 min

### ASKABLE QUESTIONS (by topic)
- **Architecture:** `[M]` design a scalable web app (LB, app tier, DB, cache, CDN); pick SQL vs NoSQL and justify. `[H]` design a highly-available multi-region system; event-driven pipeline; migration from monolith to microservices.
- **Cloud:** `[M]` compute options and when (VM vs container vs serverless); storage tiers; VPC/subnets/security groups; IAM least-privilege. `[H]` cost optimization; disaster recovery (RPO/RTO); autoscaling strategy.
- **Trade-offs:** `[M]` consistency vs availability for <use case>; cost vs performance. `[H]` well-architected review of a design; failure-mode analysis.

### COMMON FOLLOW-UPS
What fails first; how do you make it HA; how do you control cost; how do you secure it; how do you explain this to a non-technical stakeholder.

### STRONG vs WEAK
**Strong:** structured, justifies every choice with trade-offs, thinks cost + failure + security. **Weak:** name-drops services without reasoning; ignores cost/failure.

### RED FLAGS
"Just use Kubernetes/serverless" reflexively; no trade-off reasoning; no failure planning.

---
*Next file: `02_data_and_ai.md` (Data Scientist, Data Analyst, Data Engineer, ML Engineer, AI/GenAI Engineer, BI/Product Analyst).*
