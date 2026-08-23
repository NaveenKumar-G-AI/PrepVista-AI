# 07 — SOFTWARE (SPECIALIZED) ROLES — Question-Template Library
Family: software_engineering · Depts: cse/aids/aiml/ece/it

---

### Game Developer — software_engineering · cse/ece · product/general · fresher→
Builds games and interactive experiences.
**STACK** — Core (5): **game engine** (Unity/C# or Unreal/C++) · **math for games** (vectors, matrices, quaternions, linear algebra, trigonometry) · **game loop & physics** (update/render, collision, rigidbodies, delta time) · C++/C# + OOP + DSA · graphics basics (rendering pipeline, shaders, sprites/meshes). Tools (3): Unity/Unreal · Git · profiler. Emerging (2): multiplayer/networking · AI for games (pathfinding/behavior trees) · AR/VR.
**ROUNDS** — coding/DSA → game-dev technical (engine+math+physics) → design/build task → project+HR.
**ASKABLE** — *Math:* `[E]` vector operations (dot/cross); what is a quaternion. `[M]` dot vs cross product uses; normalize a vector; move an object toward a target; frame-rate independence (delta time). `[H]` rotation without gimbal lock; collision detection (AABB/sphere); interpolation (lerp/slerp). *Engine/loop:* `[E]` what is the game loop. `[M]` update vs fixed-update; component pattern; object pooling; why delta time. `[H]` optimize a laggy scene; memory/GC in games. *Physics:* `[M]` collision handling; rigidbody vs kinematic; raycasting. `[H]` continuous collision; physics stability. *Pathfinding:* `[M]` A* / BFS on a grid; behavior trees/state machines.
**STRONG/WEAK** — Strong: math + engine + performance intuition. Weak: engine-button knowledge, weak math/perf. **RED FLAGS** — frame-rate-dependent movement; no math foundation.

---

### AR/VR / XR Developer — software_engineering · cse/ece · product · fresher→
Builds augmented/virtual reality experiences.
**STACK** — Core (5): Unity/Unreal + C#/C++ · **3D math** (transforms, spatial reasoning) · **XR SDKs** (ARCore/ARKit/OpenXR) · **tracking & interaction** (SLAM basics, hand/gaze, controllers) · rendering/performance (comfort, latency, FPS budget). Tools (3): Unity XR · headset SDKs · profiler. Emerging (2): spatial computing · WebXR · digital twins.
**ROUNDS** — coding → XR technical (3D+SDK+interaction) → build task → project+HR.
**ASKABLE** — *3D/tracking:* `[M]` world vs local space; transforms; what is SLAM; anchors/planes. `[H]` occlusion; drift correction; coordinate systems. *Interaction:* `[M]` raycast interaction; gaze/hand input; teleport locomotion. `[H]` reduce motion sickness (latency/FPS/comfort). *Performance:* `[M]` FPS budget for VR (why 72/90 Hz); draw-call reduction. `[H]` optimize for standalone headsets.
**STRONG/WEAK** — Strong: spatial reasoning + comfort/perf awareness. Weak: no latency/comfort thinking. **RED FLAGS** — ignores motion sickness / FPS budget.

---

### Blockchain / Web3 Developer — software_engineering · cse/ece · product/general · fresher→
Builds decentralized apps and smart contracts.
**STACK** — Core (5): **blockchain fundamentals** (blocks, hashing, consensus — PoW/PoS, Merkle trees, immutability) · **smart contracts (Solidity)** · **Ethereum/EVM** (gas, transactions, accounts) · **dApp stack** (web3.js/ethers.js, wallets, ABI) · cryptography (hashing, signatures, keys). Tools (3): Solidity/Hardhat · ethers.js · testnets. Emerging (2): L2/rollups · DeFi/NFT patterns · security (audits).
**ROUNDS** — coding/DSA → blockchain technical → smart-contract task → project+HR.
**ASKABLE** — *Fundamentals:* `[E]` what is a blockchain; hashing; block structure. `[M]` PoW vs PoS; Merkle tree purpose; public vs private key; how a transaction works; immutability. `[H]` consensus trade-offs; 51% attack; finality; scalability trilemma. *Smart contracts:* `[E]` what is a smart contract; what is gas. `[M]` Solidity basics (state, functions, modifiers, events); gas optimization; mapping vs array. `[H]` reentrancy attack + fix; common vulnerabilities (overflow, access control); upgradeability patterns. *dApp:* `[M]` connect a wallet; call a contract; read vs write (gas).
**STRONG/WEAK** — Strong: fundamentals + contract security awareness. Weak: buzzwords, no security/gas thinking. **RED FLAGS** — unaware of reentrancy/common exploits; no gas awareness.

---

### API Developer / Integration Engineer — software_engineering · cse/ece · service/product/general · fresher→
Designs and builds APIs and integrations. (Backend-adjacent; API-centric.)
**STACK** — Core (5): **REST + API design** (resources, verbs, versioning, pagination, idempotency, HATEOAS) · **auth** (OAuth2, JWT, API keys) · **data formats** (JSON, XML, schemas) · databases/SQL · **integration** (webhooks, third-party APIs, rate limits, retries). Tools (3): Postman/Swagger(OpenAPI) · a framework · Git. Emerging (2): GraphQL · gRPC · event-driven/webhooks · API gateways.
**ROUNDS** — coding → API design → integration scenario → project+HR.
**ASKABLE** — *API design:* `[E]` REST verbs; status codes. `[M]` design an API for <resource>; versioning; pagination; idempotency; error format; OpenAPI/Swagger. `[H]` design a multi-tenant / partner API; rate limiting; API gateway. *Auth:* `[M]` OAuth2 flow; JWT; API keys; scopes. `[H]` token refresh/rotation; securing webhooks. *Integration:* `[M]` consume a third-party API (retries, backoff, timeouts, rate limits); webhooks vs polling; idempotent handling. `[H]` handle a flaky/slow downstream; reconciliation. *Formats:* `[M]` JSON schema validation; REST vs GraphQL vs gRPC.
**STRONG/WEAK** — Strong: clean API design + robust integration (retries/idempotency). Weak: no versioning/idempotency/failure handling. **RED FLAGS** — no retry/idempotency; ignores rate limits/failures.

---

### Graphics / Rendering Engineer — software_engineering · cse/ece · product · fresher→
Builds rendering systems and graphics pipelines.
**STACK** — Core (5): C++ + strong math (linear algebra, vectors/matrices) · **graphics pipeline** (vertex→fragment, rasterization, transforms, projection) · **shaders** (GLSL/HLSL) · **APIs** (OpenGL/Vulkan/DirectX) · lighting/texturing (Phong/PBR, sampling). Tools (3): OpenGL/Vulkan · a debugger (RenderDoc). Emerging (2): ray tracing · compute shaders · GPU optimization.
**ROUNDS** — coding/DSA + math → graphics technical → project+HR.
**ASKABLE** — *Pipeline:* `[E]` stages of the rendering pipeline; vertex vs fragment shader. `[M]` model/view/projection matrices; rasterization; depth buffer; culling. `[H]` deferred vs forward rendering; anti-aliasing. *Math:* `[M]` transform a point; normal transformation; barycentric coords. `[H]` quaternion rotation; frustum. *Shaders/lighting:* `[M]` Phong lighting; texture sampling/mipmaps; UV mapping. `[H]` PBR; shadow mapping; performance (draw calls, batching).
**STRONG/WEAK** — Strong: math + pipeline depth + GPU perf. Weak: API-only, weak math. **RED FLAGS** — no matrix/pipeline understanding.

---

### Systems / Low-Level Programmer — software_engineering · cse/ece · product/core · fresher→
Builds OS-level, systems, or performance-critical software.
**STACK** — Core (5): **C/C++** (pointers, memory management, undefined behavior, RAII) · **operating systems** (processes/threads, scheduling, memory/virtual memory, syscalls, IPC) · **concurrency** (locks, atomics, lock-free, memory model) · DSA + complexity · **computer architecture** (caches, memory hierarchy, pipelining). Tools (3): gdb/valgrind · Linux · profilers. Emerging (2): Rust · kernel/driver dev · performance engineering.
**ROUNDS** — coding (C/C++ + DSA) → OS/systems depth → concurrency/perf → project+HR.
**ASKABLE** — *C/C++/memory:* `[E]` stack vs heap; pointer vs reference. `[M]` memory leaks + tools (valgrind); RAII/smart pointers; dangling pointer; struct alignment. `[H]` undefined behavior; custom allocator; move semantics; virtual dispatch cost. *OS:* `[E]` process vs thread. `[M]` context switch; virtual memory/paging; syscalls; IPC (pipes/shared memory); scheduling. `[H]` page replacement; copy-on-write; memory-mapped files. *Concurrency:* `[M]` race condition + fix; mutex vs atomic; deadlock. `[H]` lock-free queue; memory ordering/barriers; false sharing. *Architecture:* `[M]` cache locality; why cache-friendly code. `[H]` branch prediction; SIMD.
**STRONG/WEAK** — Strong: memory + OS + concurrency depth, perf-aware. Weak: high-level mindset, no memory/perf awareness. **RED FLAGS** — memory-unsafe code; no concurrency/cache awareness.

---
*Next: electronics/mechanical/civil/electrical/chemical/finance/business/design/sales specialized.*
