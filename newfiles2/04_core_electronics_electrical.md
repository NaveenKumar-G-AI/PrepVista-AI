# 04 — CORE: ELECTRONICS (ECE) & ELECTRICAL (EEE) ROLES — Question-Template Library
Families: electronics_ece, electrical_eee · Depts: ece/eee/cse

> These families are domain-fundamentals heavy (rubric technical_depth ~0.45). Most competitors ignore
> them entirely — a major differentiator for ECE/EEE students.

---

## Embedded Systems Engineer
Family electronics_ece · Depts ece/eee/cse · Hires product/core/general · Seniority fresher→
Develops software for embedded/IoT devices; C + microcontrollers + RTOS.

### TECH STACK
- **Core (5):** **Embedded C** (pointers, `volatile`, `const`, bit manipulation, structs/unions, function pointers, memory sections, `static`) · **microcontrollers** (architecture, registers, memory map, ARM Cortex-M/AVR/PIC, GPIO) · **peripherals & protocols** (**UART, SPI, I2C**, ADC/DAC, PWM, timers) · **RTOS** (tasks, scheduling, semaphores, mutex, queues, priority inversion, context switch) · **interrupts** (ISR, latency, nesting, vectors)
- **Core (4):** digital electronics (logic gates, flip-flops, K-maps) · microcontroller vs microprocessor · memory (Flash/RAM/EEPROM, stack/heap) · debugging (JTAG, oscilloscope, logic analyzer)
- **Tools (3):** Embedded C toolchain · Keil/IAR/GCC · Git · datasheets · sensors/actuators
- **Emerging (2):** IoT (MQTT, BLE, connectivity) · automotive (CAN, UDS, AUTOSAR, functional safety ISO 26262) · low-power design · TinyML

### ROUND STRUCTURE
1. Aptitude/technical MCQ — 30 min · 2. Digital + C fundamentals — 30 min · 3. Embedded technical (peripherals/RTOS/interrupts) — 45 min · 4. Project deep-dive — 20 min · 5. HR — 20 min

### ASKABLE QUESTIONS (by topic)
- **Embedded C:** `[E]` what is `volatile` and when to use; pointer vs reference; what is `const`. `[M]` set/clear/toggle a specific bit (bit manipulation); difference between `#define` and `const`; what a segmentation fault/stack overflow is; struct padding/alignment; function pointers use case; `static` keyword. `[H]` write a firmware routine to read a sensor over I2C; memory leak in embedded; interpret a pointer-heavy snippet; endianness handling.
- **Microcontroller/peripherals:** `[E]` microcontroller vs microprocessor; what is GPIO. `[M]` UART vs SPI vs I2C (differences, when each, wires, speed, master/slave); how ADC works (resolution, sampling); PWM for motor/LED; configure a timer. `[H]` debounce a switch (HW+SW); design comms between two MCUs; handle a peripheral race.
- **RTOS:** `[E]` what is an RTOS; task vs thread. `[M]` semaphore vs mutex; priority inversion (+ inheritance fix); scheduling (preemptive/round-robin); inter-task communication (queues). `[H]` design task priorities for a real-time system; deadlock avoidance; stack sizing per task.
- **Interrupts:** `[E]` what is an ISR; polling vs interrupt. `[M]` interrupt latency; what you should/shouldn't do in an ISR; nested interrupts; `volatile` for ISR-shared variables. `[H]` design an interrupt-driven data acquisition; minimize latency.
- **Digital:** `[E]` logic gates; universal gates; flip-flops (SR/D/JK/T). `[M]` K-map minimization; MUX/counters; setup/hold time. `[H]` metastability; clock domain crossing.
- **Automotive/IoT (if relevant):** `[M]` CAN basics; MQTT vs HTTP for IoT; BLE. `[H]` UDS diagnostics; functional safety concepts.

### COMMON FOLLOW-UPS
Why `volatile` here; what happens if the ISR is slow; how do you debug this on hardware; how do you make it low-power; what if two tasks access the same resource.

### STRONG vs WEAK
**Strong:** deep C + hardware intuition, knows peripherals cold, reasons about timing/concurrency/memory constraints. **Weak:** treats embedded like desktop C; no `volatile`/ISR awareness; can't read a datasheet.

### RED FLAGS
Blocking/heavy work in an ISR; no `volatile` for shared vars; ignores memory/timing constraints.

---

## VLSI Design Engineer (RTL / Design)
Family electronics_ece · Depts ece/eee · Hires product/core · Seniority fresher→
Designs digital logic and RTL for chips.

### TECH STACK
- **Core (5):** **digital design** (combinational/sequential, FSM, K-maps, timing) · **Verilog/SystemVerilog (or VHDL)** (RTL coding, blocking vs non-blocking, always blocks, synthesizable constructs) · **CMOS** (MOSFET operation, logic families, transmission gates) · **static timing** (setup/hold, slack, clock skew, critical path) · **FSM design** (Moore vs Mealy, state encoding)
- **Core (3):** number systems & Boolean algebra · low-power basics (clock gating) · synthesis basics
- **Tools (3):** Verilog simulators (ModelSim/VCS) · synthesis (Design Compiler) · waveform/debug
- **Emerging (2):** SystemVerilog assertions · low-power (UPF) · advanced-node effects

### ROUND STRUCTURE
1. Digital MCQ/aptitude — 30 min · 2. Verilog + digital design — 45 min · 3. Timing/CMOS depth — 30 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Digital design:** `[E]` gates; flip-flop types; latch vs flip-flop. `[M]` design a counter/FSM (sequence detector); Moore vs Mealy; K-map minimization; MUX-based logic; SR/D/JK conversions. `[H]` design a specific FSM (e.g., "1011" detector) in Verilog; clock-domain-crossing; metastability + synchronizer.
- **Verilog:** `[E]` module structure; wire vs reg. `[M]` **blocking vs non-blocking** (and when each); always@(posedge clk) vs combinational; write RTL for a mux/counter/FSM; synthesizable vs non-synthesizable. `[H]` write a FIFO / arbiter / parameterized shifter; avoid latches; race in blocking assignments.
- **Timing (STA):** `[E]` setup vs hold time; what is slack. `[M]` critical path; clock skew (useful vs harmful); how to fix a setup violation (pipeline/optimize) vs hold violation (add delay/buffers); max frequency. `[H]` multi-cycle/false paths; timing across clock domains.
- **CMOS:** `[E]` MOSFET operation; NMOS/PMOS. `[M]` CMOS inverter; pull-up/pull-down networks; design a NAND/NOR in CMOS; stack effect. `[H]` power (dynamic/static/leakage); sizing; transmission-gate logic.

### COMMON FOLLOW-UPS
Why non-blocking here; how do you fix this timing violation; will this synthesize; what's the max clock; how do you avoid a latch.

### STRONG vs WEAK
**Strong:** clean synthesizable RTL, deep timing intuition, knows blocking/non-blocking cold. **Weak:** simulation-only mindset, creates latches, no timing understanding.

### RED FLAGS
Blocking assignments in sequential logic; unintended latches; can't reason about setup/hold.

---

## VLSI Verification Engineer
Family electronics_ece · Depts ece/eee · Hires product/core · Seniority fresher→
Verifies that RTL designs work correctly; SystemVerilog + UVM.

### TECH STACK
- **Core (5):** **SystemVerilog** (classes, OOP, randomization, constraints, interfaces, mailboxes, fork-join) · **UVM** (agent/driver/monitor/sequencer/scoreboard, phases, factory, config db) · verification concepts (directed vs constrained-random, functional coverage, code coverage, assertions **SVA**) · digital design (to understand the DUT) · testbench architecture
- **Core (3):** debugging waveforms · regression · scripting (Perl/Python/TCL)
- **Tools (3):** VCS/Questa · UVM · coverage tools · Git
- **Emerging (2):** formal verification · portable stimulus · low-power verification

### ROUND STRUCTURE
1. Digital + SV MCQ — 30 min · 2. SystemVerilog/UVM depth — 45 min · 3. Verification methodology — 30 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **SystemVerilog:** `[E]` data types; logic vs reg vs wire. `[M]` classes & OOP; randomization + constraints; `rand` vs `randc`; interfaces & clocking blocks; fork-join variants; mailbox/semaphore. `[H]` write constrained-random for a scenario; virtual interfaces; deep vs shallow copy of objects.
- **UVM:** `[E]` why UVM; UVM component list. `[M]` role of driver/monitor/sequencer/scoreboard/agent; UVM phases; factory + overrides; config_db; sequence vs sequencer. `[H]` build a testbench for a given DUT; end-of-test/objection mechanism; layered sequences.
- **Coverage/assertions:** `[E]` code vs functional coverage. `[M]` write a covergroup; SVA immediate vs concurrent assertion; cross coverage. `[H]` coverage closure strategy; assertion for a protocol.
- **Methodology:** `[M]` directed vs constrained-random; how do you know verification is complete; regression flow. `[H]` debug a failing test; verification plan for a block.

### COMMON FOLLOW-UPS
How do you achieve coverage closure; how do you debug this failure; why constrained-random over directed; how do you reuse this environment.

### STRONG vs WEAK
**Strong:** solid SV-OOP + UVM structure + coverage-driven mindset. **Weak:** directed-only, no coverage/assertion thinking, weak OOP.

### RED FLAGS
No coverage/closure concept; can't structure a UVM testbench; weak randomization understanding.

---

## VLSI Physical-Design Engineer
Family electronics_ece · Depts ece/eee · Hires product/core · Seniority fresher→
Turns netlists into chip layouts (PnR); backend flow.

### TECH STACK
- **Core (5):** **physical design flow** (floorplan → placement → CTS → routing → sign-off) · **STA** (setup/hold, slack, clock skew, timing closure) · **clock tree synthesis** · **power/IR-drop, electromigration** · **DRC/LVS** (sign-off checks)
- **Core (3):** CMOS/standard cells · low-power (clock gating, multi-Vt, power gating, DVFS, UPF) · congestion/routing
- **Tools (3):** Innovus/ICC2 · PrimeTime · StarRC · Git/TCL
- **Emerging (2):** advanced-node effects · multi-corner multi-mode · machine-learning-assisted PnR

### ROUND STRUCTURE
1. Digital + PD MCQ — 30 min · 2. PD flow + STA depth — 45 min · 3. Power/low-power — 30 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **PD flow:** `[E]` steps of the physical design flow. `[M]` floorplanning goals; placement (congestion vs timing); CTS objectives (skew/latency); routing (global vs detailed); what is sign-off. `[H]` handle congestion; timing-vs-power-vs-area trade-off; ECO flow.
- **STA:** `[E]` setup vs hold. `[M]` slack; clock skew; fix setup vs hold violations; critical path; false/multi-cycle paths. `[H]` timing closure across corners; OCV/derating; useful skew.
- **Power/IR-drop:** `[E]` dynamic vs static vs leakage power. `[M]` reduce IR drop (power grid, decap, metal width); electromigration mitigation (wider traces, redundant vias). `[H]` low-power techniques (clock/power gating, multi-Vt, DVFS); UPF/power intent.
- **Sign-off:** `[M]` DRC vs LVS; antenna effect; what causes a DRC violation. `[H]` sign-off closure.

### COMMON FOLLOW-UPS
How do you fix this timing/IR/congestion issue; power vs timing trade-off; how do you close timing across corners.

### STRONG vs WEAK
**Strong:** understands the full backend flow + timing/power trade-offs. **Weak:** tool-button knowledge only, no flow/trade-off intuition.

### RED FLAGS
No STA understanding; can't reason about IR-drop/EM; treats the flow as black-box tool runs.

---

## Electronics Engineer
Family electronics_ece · Depts ece/eee · Hires core/product/general · Seniority fresher→
Designs electronic circuits and systems (analog + digital + embedded breadth).

### TECH STACK
- **Core (5):** **analog electronics** (diodes, BJT/MOSFET, amplifiers, op-amps, feedback, filters, rectifiers) · **digital electronics** (gates, flip-flops, counters, K-maps) · **circuit theory** (Ohm/Kirchhoff, network theorems, transient/AC analysis) · **signals & systems** (Fourier, Laplace, sampling, convolution) · **communication systems** (AM/FM, modulation, digital comm basics)
- **Core (3):** microcontrollers/embedded basics · electronic devices/semiconductors · measurements & instrumentation
- **Tools (3):** circuit simulation (SPICE/Multisim) · PCB tools (Altium/Eagle) · lab instruments · soldering
- **Emerging (2):** IoT · power electronics · signal integrity

### ROUND STRUCTURE
1. Aptitude/technical — 30 min · 2. Analog + digital + circuits — 45 min · 3. Domain depth (signals/comm/embedded) — 30 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Analog:** `[E]` diode/transistor operation; what is an op-amp. `[M]` op-amp configs (inverting/non-inverting/summing/integrator); BJT vs MOSFET; biasing; feedback (negative/positive); filters (LPF/HPF, cutoff). `[H]` design an amplifier for a spec; op-amp non-idealities; oscillator conditions (Barkhausen).
- **Circuit theory:** `[E]` Ohm's/Kirchhoff's laws; series vs parallel. `[M]` Thevenin/Norton; superposition; RC transient; impedance; resonance. `[H]` solve a multi-loop circuit; frequency response.
- **Digital:** (see Embedded/VLSI digital bank — `[E]/[M]`).
- **Signals & systems:** `[E]` what is a signal; continuous vs discrete. `[M]` Fourier/Laplace intuition; sampling theorem (Nyquist); convolution; LTI systems. `[H]` filter design; z-transform.
- **Communication:** `[E]` analog vs digital comm; what is modulation. `[M]` AM vs FM; why modulate; bandwidth; sampling/quantization; ASK/FSK/PSK. `[H]` SNR; multiplexing; a comm-system block diagram.

### COMMON FOLLOW-UPS
Derive/justify the value; what happens if you change R/C; why this modulation; how would you measure this.

### STRONG vs WEAK
**Strong:** strong analog + circuit intuition, connects theory to real circuits. **Weak:** rote formulas, can't analyze a circuit or justify a design.

### RED FLAGS
Can't apply KVL/KCL; no op-amp understanding; treats everything as memorized formulas.

---

## Electrical Engineer
Family electrical_eee · Depts eee/ece · Hires core/general · Seniority fresher→
Designs and maintains electrical systems (machines + power + control breadth).

### TECH STACK
- **Core (5):** **circuit theory** (AC/DC, network theorems, three-phase, power factor) · **electrical machines** (DC machines, transformers, induction & synchronous motors, characteristics) · **power systems** (generation/transmission/distribution, per-unit, load flow, fault analysis, protection) · **control systems** (transfer functions, block diagrams, stability, PID) · **power electronics** (diodes/thyristors, rectifiers, inverters, choppers)
- **Core (3):** measurements & instrumentation · electrical safety & standards · electromagnetic fields basics
- **Tools (3):** MATLAB/Simulink · AutoCAD Electrical · ETAP (power) · lab instruments
- **Emerging (2):** renewable energy/grid integration · EV/battery · SCADA/smart grid

### ROUND STRUCTURE
1. Aptitude/technical — 30 min · 2. Machines + power + circuits — 45 min · 3. Control/power electronics — 30 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Machines:** `[E]` transformer working; motor vs generator. `[M]` DC motor types & characteristics; induction motor slip/torque-speed; transformer losses/efficiency/regulation; why starters. `[H]` synchronous machine operation; equivalent circuits; speed control methods.
- **Power systems:** `[E]` generation-transmission-distribution; why high voltage for transmission. `[M]` per-unit system; power factor + correction; types of faults; protection (relays, CB, fuse); load flow purpose. `[H]` symmetrical components; fault current calculation; stability; economic dispatch.
- **Circuits:** `[E]` Ohm's/Kirchhoff's laws; RMS vs average. `[M]` three-phase (star/delta); power triangle; Thevenin/Norton; resonance. `[H]` unbalanced three-phase; transient analysis.
- **Control:** `[E]` open vs closed loop. `[M]` transfer function; poles/zeros; stability (Routh); PID actions; block-diagram reduction. `[H]` root locus/Bode; state-space; compensator design.
- **Power electronics:** `[E]` diode/thyristor; rectifier types. `[M]` controlled rectifier; inverter; chopper; SMPS basics. `[H]` firing angle effects; PWM; converter design.

### COMMON FOLLOW-UPS
Derive/justify; what happens under fault/overload; how do you improve power factor/efficiency; how do you make it stable.

### STRONG vs WEAK
**Strong:** strong machines + power fundamentals, real-world safety/protection awareness. **Weak:** rote formulas, no protection/safety sense, can't analyze machines.

### RED FLAGS
No safety/protection awareness; can't reason about three-phase or machine characteristics.

---

## Power Systems Engineer / Control Systems Engineer / Instrumentation Engineer (EEE specializations)
Family electrical_eee · Depts eee/ece · Hires core/product · Seniority fresher→
Specializations of Electrical Engineer — use the Electrical stack, emphasizing the specialty.

### FOCUS DELTAS + EXTRA QUESTIONS
- **Power Systems Engineer:** emphasize power systems + protection + grid. `[M]` load flow methods (Gauss-Seidel/Newton-Raphson); relay coordination; SLD reading; renewable integration. `[H]` transient/voltage stability; SCADA; contingency analysis.
- **Control Systems Engineer:** emphasize control + automation. `[E]` open vs closed loop; feedback. `[M]` PID tuning (Ziegler-Nichols); PLC ladder logic; SCADA; stability (Routh/Bode). `[H]` state-space design; observer/controller; industrial automation architecture.
- **Instrumentation Engineer:** emphasize sensors + process control. `[E]` sensor vs transducer; what is 4–20 mA. `[M]` sensor types (RTD/thermocouple/strain gauge); calibration; control valves; P&ID reading; PLC/DCS. `[H]` signal conditioning; loop tuning; hazardous-area/safety instrumentation.

### STRONG vs WEAK / RED FLAGS
As Electrical Engineer, weighted to the specialty; red flag = shallow on the specialty's core (protection / control theory / instrumentation loops).

---
*Next file: `05_mechanical_civil.md` (Mechanical Design/Production/Quality/Maintenance; Civil/Structural/Site/Project).*
