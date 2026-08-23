# 11 — ELECTRICAL (SPECIALIZED) ROLES — Question-Template Library
Family: electrical_eee · Depts: eee/ece

---

### Power Electronics Engineer — electrical_eee · eee/ece · core/product · fresher→
Designs power conversion circuits.
**STACK** — Core (5): **power semiconductor devices** (diode, thyristor/SCR, MOSFET, IGBT — switching) · **converters** (rectifiers, inverters, choppers/DC-DC — buck/boost/buck-boost) · **PWM & control** (sinusoidal PWM, closed-loop) · **magnetics** (inductors, transformers, EMI) · circuit theory + control. Tools (3): MATLAB/Simulink · PSIM · lab. Emerging (2): SiC/GaN · EV/renewable converters · digital control.
**ROUNDS** — technical → power-electronics depth → project+HR.
**ASKABLE** — *Devices:* `[E]` diode vs SCR vs MOSFET vs IGBT. `[M]` device selection (voltage/current/frequency); switching losses; gate drive; snubbers. `[H]` MOSFET vs IGBT trade-offs; SiC/GaN benefits. *Converters:* `[E]` rectifier types; what is a chopper. `[M]` buck/boost/buck-boost (derive Vout, duty cycle); controlled rectifier (firing angle); single vs three-phase inverter; CCM vs DCM. `[H]` design a DC-DC converter; multilevel inverters; power factor correction. *PWM/control:* `[M]` sinusoidal PWM; why PWM; closed-loop control. `[H]` current-mode control; harmonics/THD.
**STRONG/WEAK** — Strong: device + topology + control derivations. Weak: rote, can't derive duty cycle. **RED FLAGS** — no converter derivation; no device-selection sense.

---

### Protection & Switchgear Engineer / Substation Engineer — electrical_eee · eee · core · fresher→
Designs protection systems and substations.
**STACK & QUESTIONS** —
- **Protection & Switchgear:** core: relays (overcurrent, differential, distance), circuit breakers, fault analysis, coordination, CT/PT, grounding. `[E]` fuse vs relay vs CB; types of faults. `[M]` relay types + operation; overcurrent coordination; differential protection (why); CT/PT; CB types (SF6/vacuum). `[H]` distance protection zones; relay coordination for a feeder; earthing/grounding design.
- **Substation Engineer:** core: substation layout, equipment (transformers, busbars, isolators), SLD, protection, earthing, standards. `[E]` substation equipment list; read an SLD. `[M]` busbar schemes; transformer protection; substation earthing; bay layout. `[H]` GIS vs AIS; auto-reclosing; substation automation (IEC 61850).
**STRONG/WEAK / RED FLAGS** — Strong: protection logic + coordination + safety. Weak: no coordination/fault understanding. Red flag: no protection/earthing awareness.

---

### PLC / SCADA / Automation Engineer — electrical_eee · eee/ece/mech · core/product · fresher→
Designs industrial automation and control.
**STACK** — Core (5): **PLC programming** (ladder logic, function blocks, I/O, timers/counters) · **SCADA/HMI** (tags, alarms, trending) · **control systems** (PID, process control) · **industrial protocols** (Modbus, Profibus, Ethernet/IP) · sensors & actuators + instrumentation. Tools (3): Siemens TIA/Allen-Bradley · SCADA software. Emerging (2): Industry 4.0/IIoT · DCS · MES.
**ROUNDS** — technical → PLC/SCADA/control depth → scenario → HR.
**ASKABLE** — *PLC:* `[E]` what is a PLC; PLC vs relay logic. `[M]` write ladder logic for <a start/stop, interlock, timer/counter sequence>; scan cycle; I/O modules; latching. `[H]` structure a program for a process; troubleshoot a PLC fault. *SCADA:* `[E]` what is SCADA/HMI. `[M]` tags; alarms; trending; SCADA architecture; polling. `[H]` redundancy; SCADA security. *Control/protocols:* `[M]` PID in a loop; Modbus RTU vs TCP; sensor wiring (4-20mA); analog vs digital I/O. `[H]` cascade/ratio control; protocol selection.
**STRONG/WEAK** — Strong: ladder logic + control + protocols + troubleshooting. Weak: no ladder/scan understanding. **RED FLAGS** — can't write basic ladder logic; no I/O/protocol sense.

---

### Electrical Design Engineer — electrical_eee · eee · core/general · fresher→
Designs electrical systems for buildings/plants.
**STACK** — Core (5): **electrical design** (load calculation, cable sizing, panel/switchgear design) · **wiring & distribution** (single-line diagrams, LT/HT, DBs) · **protection** (breakers, earthing, lightning) · **standards** (IEC/IS, NEC) · AutoCAD Electrical. Tools (3): AutoCAD Electrical · DIALux (lighting) · ETAP. Emerging (2): energy efficiency · BIM MEP · solar design.
**ROUNDS** — technical → electrical design depth → project+HR.
**ASKABLE** — *Design:* `[E]` what is load calculation; read an SLD. `[M]` cable sizing (current/voltage drop/derating); load calculation for a building; DB/panel design; breaker selection; earthing design. `[H]` transformer/DG sizing; short-circuit calc; coordination; HT vs LT distribution. *Wiring:* `[M]` SLD preparation; conduit/tray sizing; lighting design (lux). `[H]` harmonics; power factor correction; standby power.
**STRONG/WEAK** — Strong: sizing + standards + safety. Weak: no derating/standards awareness. **RED FLAGS** — no cable-sizing/earthing understanding.

---

### Renewable Energy / EV Powertrain / Testing & Commissioning Engineer — electrical_eee · eee/ece · core/product · fresher→
Renewables / EV drivetrains / commissioning.
**STACK & QUESTIONS** —
- **Renewable Energy Engineer:** core: solar PV (modules, inverters, MPPT, sizing), wind basics, grid integration, storage. `[E]` how a solar PV system works. `[M]` PV sizing; MPPT (why); on-grid vs off-grid; inverter selection; net metering. `[H]` grid integration challenges; storage sizing; hybrid systems.
- **EV Powertrain Engineer:** core: electric motors (BLDC/PMSM/induction), batteries (chemistry, BMS, SOC/SOH), power electronics (inverters/converters), regen braking, charging. `[E]` EV vs ICE; motor types. `[M]` motor selection; battery basics (Li-ion, BMS, C-rate); regen braking; on-board charger. `[H]` motor control (FOC); battery thermal/BMS; range estimation.
- **Testing & Commissioning:** core: testing procedures, instruments, protection testing, commissioning checklists, safety, standards. `[E]` what is commissioning. `[M]` insulation resistance/HV test; relay testing; transformer tests; pre-commissioning checks. `[H]` fault diagnosis on site; commissioning a substation/panel.
**STRONG/WEAK / RED FLAGS** — Strong: domain fundamentals + practical/safety sense. Weak: rote. Red flag: no sizing/testing/safety method.

---
*Next: chemical/allied, finance-tech, business specialized, design specialized, sales/writing/support, infra/network specialized.*
