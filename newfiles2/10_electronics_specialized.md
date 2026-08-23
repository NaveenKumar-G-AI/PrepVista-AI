# 10 — ELECTRONICS (SPECIALIZED) ROLES — Question-Template Library
Family: electronics_ece · Depts: ece/eee/cse

---

### RF Engineer — electronics_ece · ece · core/product · fresher→
Designs radio-frequency and microwave circuits/systems.
**STACK** — Core (5): **RF fundamentals** (impedance matching, S-parameters, Smith chart, VSWR, transmission lines) · **microwave** (waveguides, antennas, radiation patterns, gain) · **RF circuits** (amplifiers/LNA, mixers, oscillators, filters, PLL) · EM theory (Maxwell, propagation) · communication systems (modulation, link budget). Tools (3): ADS/HFSS · VNA · spectrum analyzer. Emerging (2): 5G/mmWave · RFIC · phased arrays.
**ROUNDS** — technical MCQ → RF depth → project+HR.
**ASKABLE** — *RF fundamentals:* `[E]` what is impedance matching; VSWR. `[M]` why 50 Ω; S-parameters (S11/S21); Smith chart use; transmission line effects; reflection coefficient. `[H]` matching network design; stub matching. *Microwave/antenna:* `[M]` antenna gain/directivity/radiation pattern; types of antennas; waveguide modes. `[H]` link budget; Friis equation; array beamforming. *RF circuits:* `[M]` LNA (why low noise); mixer (up/down conversion); PLL; RF filter. `[H]` noise figure; IP3/linearity; oscillator phase noise.
**STRONG/WEAK** — Strong: matching + S-params + antenna intuition. Weak: rote formulas. **RED FLAGS** — no Smith-chart/impedance understanding.

---

### DSP Engineer — electronics_ece · ece/cse · core/product · fresher→
Designs digital signal processing algorithms/systems.
**STACK** — Core (5): **signals & systems** (LTI, convolution, Fourier — DTFT/DFT/**FFT**, Laplace/Z-transform) · **sampling** (Nyquist, aliasing, quantization) · **digital filters** (FIR/IIR, design, frequency response) · math (linear algebra, complex numbers) · C/MATLAB. Tools (3): MATLAB/Python(scipy) · DSP processors (TI). Emerging (2): adaptive filtering · ML-DSP · real-time embedded DSP.
**ROUNDS** — technical MCQ → DSP depth → coding/algorithm → project+HR.
**ASKABLE** — *Signals:* `[E]` continuous vs discrete; what is convolution. `[M]` DFT vs FFT; why FFT (complexity); Z-transform ROC; LTI properties; sampling theorem + aliasing. `[H]` FFT derivation/intuition; spectral leakage/windowing. *Filters:* `[E]` LPF/HPF/BPF. `[M]` FIR vs IIR (trade-offs); linear phase; filter design (windowing). `[H]` pole-zero placement; stability (IIR); adaptive filters (LMS). *Coding:* `[M]` implement convolution/moving average; DFT.
**STRONG/WEAK** — Strong: transform + filter intuition + implementation. Weak: rote, no implementation. **RED FLAGS** — no sampling/aliasing understanding.

---

### Hardware Design Engineer / PCB Design Engineer — electronics_ece · ece/eee · core/product · fresher→
Designs electronic hardware and printed circuit boards.
**STACK** — Core (5): analog + digital electronics · **schematic design** (component selection, power supply, decoupling) · **PCB layout** (routing, layer stackup, impedance, grounding) · **signal & power integrity** (crosstalk, EMI/EMC, ground bounce) · datasheets/testing (DFM, DFT). Tools (3): Altium/OrCAD/KiCad · lab instruments · SPICE. Emerging (2): high-speed design · rigid-flex · thermal management.
**ROUNDS** — technical → hardware/PCB depth → project+HR.
**ASKABLE** — *Schematic:* `[E]` read a schematic; what is decoupling. `[M]` power supply design (LDO vs SMPS); decoupling caps (why/placement); pull-up/down; level shifting. `[H]` component selection trade-offs; protection circuits. *PCB layout:* `[E]` what is a via/trace; layer stackup. `[M]` routing best practices; ground planes; trace width (current); impedance control; crosstalk. `[H]` high-speed routing (length matching, differential pairs); EMI/EMC mitigation; return paths. *Integrity:* `[M]` signal vs power integrity; ground bounce; why controlled impedance. `[H]` reflections/termination; thermal considerations.
**STRONG/WEAK** — Strong: SI/PI + layout + component intuition. Weak: tool-only, no SI/PI awareness. **RED FLAGS** — no decoupling/ground-plane understanding; ignores EMI.

---

### FPGA Engineer — electronics_ece · ece/eee · core/product · fresher→
Implements digital designs on FPGAs.
**STACK** — Core (5): **Verilog/VHDL (RTL)** · **FPGA architecture** (LUTs, flip-flops, BRAM, DSP slices, clocking) · **timing** (STA, setup/hold, CDC) · digital design/FSM · synthesis + implementation (place & route). Tools (3): Vivado/Quartus · simulators · ILA/debug. Emerging (2): HLS · SoC/Zynq · high-speed interfaces.
**ROUNDS** — digital+Verilog → FPGA depth → project+HR.
**ASKABLE** — *Verilog/design:* `[M]` blocking vs non-blocking; write an FSM/counter; avoid latches; synthesizable code. `[H]` FIFO/arbiter; parameterized modules. *FPGA arch:* `[E]` what is a LUT; FPGA vs ASIC. `[M]` BRAM vs distributed RAM; clocking (DCM/PLL, clock enable); resource utilization. `[H]` DSP slice usage; timing closure on FPGA. *Timing/CDC:* `[M]` setup/hold; **clock domain crossing** (synchronizer, metastability); fix a timing violation. `[H]` async FIFO; multi-clock design.
**STRONG/WEAK** — Strong: RTL + timing/CDC + FPGA resources. Weak: sim-only, no timing/CDC. **RED FLAGS** — no CDC/metastability awareness; latches.

---

### Analog / Mixed-Signal Design Engineer — electronics_ece · ece/eee · core/product · fresher→
Designs analog and mixed-signal ICs/circuits.
**STACK** — Core (5): **analog circuits** (op-amps, current mirrors, differential pairs, biasing) · **MOSFET operation** (regions, small-signal, transconductance) · **data converters** (ADC/DAC architectures, resolution, sampling) · **feedback & stability** (poles/zeros, phase margin) · device physics. Tools (3): Cadence Virtuoso · SPICE · lab. Emerging (2): low-power analog · RF-analog · PLL/clocking.
**ROUNDS** — analog MCQ → analog depth → project+HR.
**ASKABLE** — *Circuits:* `[M]` op-amp internal stages; current mirror; differential pair operation; biasing. `[H]` two-stage op-amp design; gain/bandwidth trade-off; slew rate. *MOSFET:* `[E]` operating regions. `[M]` small-signal model; transconductance (gm); channel-length modulation. `[H]` short-channel effects; matching. *Converters:* `[M]` ADC types (flash/SAR/sigma-delta) trade-offs; resolution/SNR; sampling. `[H]` DAC architectures; INL/DNL. *Stability:* `[M]` poles/zeros; phase margin; compensation. `[H]` frequency compensation techniques.
**STRONG/WEAK** — Strong: transistor-level intuition + stability + converters. Weak: rote, no small-signal analysis. **RED FLAGS** — can't analyze a differential pair/op-amp; no stability understanding.

---

### Automotive Embedded Engineer — electronics_ece · ece/eee/cse · product/core · fresher→
Develops embedded software for vehicles.
**STACK** — Core (5): Embedded C + microcontrollers (see Embedded) · **automotive protocols** (CAN, LIN, FlexRay, Ethernet) · **AUTOSAR** basics · **diagnostics** (UDS, OBD, DTCs) · **functional safety (ISO 26262, ASIL)**. Tools (3): CANoe/CANalyzer · debuggers · MATLAB/Simulink. Emerging (2): ADAS · SDV/OTA · cybersecurity (ISO 21434).
**ROUNDS** — embedded C + digital → automotive depth → project+HR.
**ASKABLE** — *Embedded:* (see Embedded bank — `[E]/[M]` C, peripherals, RTOS, interrupts). *Protocols:* `[E]` what is CAN; CAN vs LIN. `[M]` CAN frame structure; arbitration (priority); bus-off; LIN master/slave. `[H]` CAN error handling; FlexRay; automotive Ethernet. *Diagnostics:* `[M]` UDS services; DTC; OBD-II. `[H]` ECU flashing/bootloader; secure diagnostics. *Safety:* `[E]` what is functional safety. `[M]` ASIL levels; fail-safe/fail-operational; watchdog. `[H]` safety mechanisms; ISO 26262 lifecycle.
**STRONG/WEAK** — Strong: embedded + protocols + safety mindset. Weak: no protocol/safety awareness. **RED FLAGS** — no CAN/functional-safety understanding.

---

### Hardware Test / Validation Engineer — electronics_ece · ece/eee · core/product · fresher→
Tests and validates electronic hardware.
**STACK** — Core (5): analog + digital electronics · **test methodology** (functional, characterization, corner testing) · **lab instruments** (oscilloscope, DMM, function generator, spectrum/logic analyzer) · debugging (fault isolation) · scripting (Python) for automation. Tools (3): bench instruments · Python/LabVIEW · DFT/boundary scan. Emerging (2): automated test equipment (ATE) · HIL testing.
**ROUNDS** — electronics + test → debug scenario → project+HR.
**ASKABLE** — *Test:* `[E]` how would you test <a board/circuit>. `[M]` functional vs characterization; measure a signal with a scope; corner/margin testing; build a test plan. `[H]` fault isolation on a dead board; automate a test (Python); ATE basics. *Instruments:* `[E]` scope vs DMM. `[M]` probe compensation; bandwidth; triggering; measure rise time/noise. `[H]` measure jitter/eye diagram; power measurement. *Debug:* `[M]` isolate a hardware fault systematically; DFT/boundary scan.
**STRONG/WEAK** — Strong: systematic debugging + instrument fluency. Weak: no method, instrument-shy. **RED FLAGS** — no fault-isolation method; misuses instruments.

---
*Next: electrical/mechanical/civil/chemical/finance/business/design/sales specialized.*
