"""
PrepVista — Company-Specific Interview Simulation (Feature #01)
==============================================================
A *blueprint interpreter*. Every company's real selection process is encoded as
data (a ``company_blueprint`` JSON); a generic engine walks the rounds in order,
applies that company's real rules (sectional timing, question-locking, tab-switch
policy, negative-marking, elimination gates, platform feel), and produces a
readiness verdict that mirrors how the company actually decides (TCS
Ninja/Digital/Prime, Infosys SE/SP/DSE, Wipro Elite/Turbo, Amazon Hire/No-Hire,
Google hiring-committee verdict …), plus the concrete gap to the next track.

Adding a new company must require only a new blueprint JSON — **zero code
changes**. That is the whole point of this package: breadth scales as *data*.

ISOLATION / SAFETY
------------------
This package is intentionally self-contained. It has **no import dependency on
the rest of the app** and nothing in the app imports it yet, so it cannot affect
any existing interview mode ("career mode only" — other modes act as normal).
Wiring into the live app is a later, deliberate milestone.

MILESTONES (see 00_MASTER_DOSSIER.md Part 11)
  M1  models + loader/validator + Tier-A blueprint data  ← this commit
  M2  session orchestrator + timer/negative-marking/attempt-state services
  M3  reused interview simulators behind company skins
  M4  net-new simulators (coding judge, games, voice, essay, LP, work-sim,
      system-design, bar-raiser, hiring-committee)
  M5  parametric item generators + outcome resolver
  M6  company report extension + frontend
  M7  roster expansion (Tier-B/C, zero-code company addition)

Public surface (M1):
    from app.services.company_sim import (
        CompanyBlueprint, load_blueprint, load_all_blueprints,
        load_platform_skins, load_archetypes, validate_repository,
    )
"""

from __future__ import annotations

from app.services.company_sim.models import (
    ARCHETYPES,
    HIRING_SCALES,
    ITEM_TYPES,
    NAVIGATION_MODES,
    NET_NEW_ROUND_TYPES,
    REUSED_ROUND_TYPES,
    ROUND_TYPES,
    TAB_SWITCH_POLICIES,
    CompanyBlueprint,
    Eligibility,
    GateRule,
    NegativeMarking,
    OutcomeModel,
    Package,
    Platform,
    Round,
    Section,
)
from app.services.company_sim.loader import (
    available_blueprints,
    load_all_blueprints,
    load_archetypes,
    load_blueprint,
    load_platform_skins,
    repository_report,
    validate_repository,
)
from app.services.company_sim.simulators import (
    CandidateModel,
    FallbackSimulator,
    RoundResult,
    RoundSimulator,
    SimContext,
    register_simulator,
    resolve_simulator,
)
from app.services.company_sim.company_session import (
    CompanySessionRecord,
    GateOutcome,
    RoundOutcome,
    resolve_gate,
    run_session,
)
from app.services.company_sim.skins import CompanySkin
from app.services.company_sim.reused_simulators import (
    MODULE_FAMILY,
    InterviewBackend,
    ReusedInterviewSimulator,
    register_reused_simulators,
    set_interview_backend,
)
from app.services.company_sim.net_new_simulators import register_net_new_simulators
from app.services.company_sim.outcome_resolver import (
    OutcomeResolution,
    Requirement,
    TrackEvaluation,
    resolve_outcome,
    track_order_high_to_low,
)
from app.services.company_sim.item_generators import (
    APTITUDE_TEMPLATES,
    PSEUDOCODE_TEMPLATES,
    CosineDedupIndex,
    GeneratedItem,
    ItemGenerator,
    generate_aptitude,
    generate_pseudocode,
    set_embedder,
)
from app.services.company_sim.company_report import (
    CompanyReport,
    ReportSection,
    build_company_report,
    company_coaching,
)
from app.services.company_sim.archetype_factory import materialize_blueprint
from app.services.company_sim.roster import (
    RosterEntry,
    RosterResolution,
    list_roster,
    request_modeling,
    resolve_company,
    roster_counts,
    search,
)

__all__ = [
    # vocab
    "ARCHETYPES",
    "HIRING_SCALES",
    "ITEM_TYPES",
    "NAVIGATION_MODES",
    "ROUND_TYPES",
    "REUSED_ROUND_TYPES",
    "NET_NEW_ROUND_TYPES",
    "TAB_SWITCH_POLICIES",
    # models
    "CompanyBlueprint",
    "Round",
    "Section",
    "Package",
    "Platform",
    "Eligibility",
    "GateRule",
    "NegativeMarking",
    "OutcomeModel",
    # loader
    "load_blueprint",
    "load_all_blueprints",
    "available_blueprints",
    "load_platform_skins",
    "load_archetypes",
    "validate_repository",
    "repository_report",
    # M2 — engine
    "CandidateModel",
    "SimContext",
    "RoundResult",
    "RoundSimulator",
    "FallbackSimulator",
    "register_simulator",
    "resolve_simulator",
    "run_session",
    "resolve_gate",
    "CompanySessionRecord",
    "RoundOutcome",
    "GateOutcome",
    # M3 — company skins + reused interview simulators
    "CompanySkin",
    "MODULE_FAMILY",
    "InterviewBackend",
    "ReusedInterviewSimulator",
    "register_reused_simulators",
    "set_interview_backend",
    # M4 — net-new simulators
    "register_net_new_simulators",
    # M5 — outcome resolver
    "resolve_outcome",
    "track_order_high_to_low",
    "OutcomeResolution",
    "TrackEvaluation",
    "Requirement",
    # M5 — parametric item generators
    "ItemGenerator",
    "GeneratedItem",
    "CosineDedupIndex",
    "APTITUDE_TEMPLATES",
    "PSEUDOCODE_TEMPLATES",
    "generate_aptitude",
    "generate_pseudocode",
    "set_embedder",
    # M6 — company report
    "build_company_report",
    "company_coaching",
    "CompanyReport",
    "ReportSection",
    # M7 — roster expansion (zero-code company add)
    "materialize_blueprint",
    "resolve_company",
    "list_roster",
    "search",
    "roster_counts",
    "request_modeling",
    "RosterResolution",
    "RosterEntry",
]
