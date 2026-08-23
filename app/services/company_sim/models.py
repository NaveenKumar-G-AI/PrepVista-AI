"""
PrepVista — Company Blueprint Data Model (Feature #01, M1)
=========================================================
Typed dataclasses + a lenient parser + a strict validator for the
``company_blueprint`` schema described in 00_MASTER_DOSSIER.md Part 1.

DESIGN RULES (why it looks like this)
-------------------------------------
* **Everything is data.** No format number is hardcoded in the engine — counts,
  timings, cutoffs, penalties, languages and gates all live in the blueprint
  JSON so adding/retuning a company never touches code.
* **Lenient parse, strict validate.** ``from_dict`` never raises: it fills
  defaults so a slightly-malformed blueprint still loads (graceful degradation,
  matching ``branch_banks.py``). ``validate`` then returns a list of human
  problems (empty == valid) so a CI gate / loader can decide what to reject.
* **Vocabularies are frozensets, not enums.** JSON round-trips trivially and the
  authoritative allowed-value lists live in one place. The round-type vocabulary
  is fixed (each maps to exactly one simulator); item-type / competency tags are
  extensible (unknown values are *warnings*, not errors).
* **Aligns to the existing engine.** ``competency`` values are validated against
  the 14 category keys + 9 canonical competencies the live scoring engine
  already knows (categories.json / competencies.json), so per-round results roll
  cleanly into the 7 pillars + PRI at report time.

Pure stdlib. No dependency on the rest of the app.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ═══════════════════════════════════════════════════════════════════════════════
# FIXED VOCABULARIES  (the authoritative allowed-value sets)
# ═══════════════════════════════════════════════════════════════════════════════

ARCHETYPES: frozenset[str] = frozenset(
    {"mass_service", "product", "premium_product", "analytics", "core", "unique"}
)

HIRING_SCALES: frozenset[str] = frozenset({"very_high", "high", "medium", "low"})

TAB_SWITCH_POLICIES: frozenset[str] = frozenset({"terminate", "warn", "flag", "none"})

NAVIGATION_MODES: frozenset[str] = frozenset(
    {"locked_forward", "free_within_section", "free_all"}
)

DIFFICULTY_PROFILES: frozenset[str] = frozenset({"easy", "medium", "hard", "mixed"})

TIER_RANKS: frozenset[str] = frozenset({"A", "B", "C"})

# The fixed round_type vocabulary. Each maps to exactly one simulator (Dossier
# Part 4 / §6). REUSED = a thin adapter over one of the 14 existing question
# modules; NET_NEW = a purpose-built simulator this feature ships.
REUSED_ROUND_TYPES: frozenset[str] = frozenset(
    {
        "aptitude_test",          # q_aptitude_reasoning (+ parametric generator)
        "technical_mcq",          # q_technical_domain banks (+ pseudocode gen)
        "technical_interview",    # q_technical_domain + q_resume_based
        "managerial_interview",   # q_situational_star + q_stress_curveball + q_case_study
        "hr_interview",           # the 5 HR-family modules
        "group_discussion",       # q_group_discussion
    }
)
NET_NEW_ROUND_TYPES: frozenset[str] = frozenset(
    {
        "coding_test",
        "advanced_coding",
        "game_based_aptitude",
        "voice_assessment",
        "written_communication",
        "behavioral_survey",
        "work_simulation",
        "system_design",
        "bar_raiser",
        "hiring_committee",       # modeled as an OUTCOME step, not a live round
    }
)
ROUND_TYPES: frozenset[str] = REUSED_ROUND_TYPES | NET_NEW_ROUND_TYPES

# Extensible item-type tags (warn, don't error, on unknown — new round types will
# introduce new item shapes).
ITEM_TYPES: frozenset[str] = frozenset(
    {
        "mcq",
        "pseudocode_mcq",
        "coding",
        "build_app",
        "sql",
        "web_ui",
        "essay",
        "email",
        "voice_read_aloud",
        "voice_describe_image",
        "voice_topic",
        "voice_repeat",
        "voice_dictation",
        "game",
        "survey_most_least",
        "scenario",
        "interview_qa",
        "gd",
        "packet_review",
    }
)

# gate_rule.type vocabulary the outcome/session layer knows how to resolve.
GATE_TYPES: frozenset[str] = frozenset(
    {
        "none",
        "overall",
        "sectional",
        "sectional_and_overall",
        "coding_count",
        "rubric",
        "veto",
        "committee",
    }
)

NEGATIVE_MARKING_MODELS: frozenset[str] = frozenset({"none", "fixed", "threshold"})

OUTCOME_STRATEGIES: frozenset[str] = frozenset(
    {
        "percentile_tracks",   # TCS-style: cognitive percentile + advanced → tracks
        "coding_gauntlet",     # Infosys-style: solved/sectional cutoffs → SE/SP/DSE
        "multi_signal_tracks", # Wipro-style: apt+coding+essay+voice → Elite/Turbo
        "coding_count",        # Cognizant/Capgemini: #solved (+cert) → track/tier
        "rubric_verdict",      # Amazon/Microsoft: per-round rubric + veto → Hire/No-Hire
        "committee",           # Google: packet → committee 6-point verdict
        "single_merit",        # Zoho: escalating gauntlet, single merit track
    }
)

# Known competency tags: the live engine's 14 categories + 9 canonical
# competencies + a few functional skill tags the exotic rounds introduce. Used
# for *warnings* only (data authors may extend). Kept in sync with
# categories.json / competencies.json.
KNOWN_COMPETENCIES: frozenset[str] = frozenset(
    {
        # 14 categories
        "hr_behavioral", "resume_based", "technical_domain", "aptitude_reasoning",
        "situational_star", "stress_curveball", "puzzles_brainteasers",
        "creative_estimation", "case_study", "culture_fit", "career_motivation",
        "salary_expectation", "group_discussion", "candidate_questions",
        # 9 canonical competencies
        "introduction", "technical_depth", "project_ownership", "communication",
        "problem_solving", "behavioral", "situational_judgment",
        "creative_thinking", "ai_tool_fluency",
        # functional skill tags introduced by exotic rounds
        "coding", "spoken_english", "written_english", "cognitive_games",
        "leadership_principles", "system_design", "work_judgment", "domain_core",
    }
)


# ═══════════════════════════════════════════════════════════════════════════════
# SMALL HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _as_str(v: Any, default: str = "") -> str:
    return v if isinstance(v, str) else default


def _as_bool(v: Any, default: bool = False) -> bool:
    return v if isinstance(v, bool) else default


def _as_int(v: Any, default: int = 0) -> int:
    return v if isinstance(v, bool) is False and isinstance(v, int) else default


def _as_num(v: Any, default: float = 0.0) -> float:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else default


def _as_list(v: Any) -> list:
    return list(v) if isinstance(v, list) else []


def _as_dict(v: Any) -> dict:
    return dict(v) if isinstance(v, dict) else {}


# ═══════════════════════════════════════════════════════════════════════════════
# COMPONENT DATACLASSES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Section:
    """One sub-section within a round (e.g. TCS Foundation → Verbal Ability)."""

    section_id: str
    label: str
    competency: str
    item_type: str
    count: int
    minutes: int
    topics: list[str] = field(default_factory=list)
    languages_allowed: list[str] = field(default_factory=list)
    languages_banned: list[str] = field(default_factory=list)
    config: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Section":
        return cls(
            section_id=_as_str(d.get("section_id")),
            label=_as_str(d.get("label")),
            competency=_as_str(d.get("competency")),
            item_type=_as_str(d.get("item_type")),
            count=_as_int(d.get("count")),
            minutes=_as_int(d.get("minutes")),
            topics=[_as_str(t) for t in _as_list(d.get("topics"))],
            languages_allowed=[_as_str(t) for t in _as_list(d.get("languages_allowed"))],
            languages_banned=[_as_str(t) for t in _as_list(d.get("languages_banned"))],
            config=_as_dict(d.get("config")),
        )

    def validate(self, where: str) -> tuple[list[str], list[str]]:
        errs: list[str] = []
        warns: list[str] = []
        if not self.section_id:
            errs.append(f"{where}: section missing section_id")
        if not self.label:
            warns.append(f"{where}/{self.section_id or '?'}: missing label")
        if self.count < 0:
            errs.append(f"{where}/{self.section_id}: count < 0")
        if self.minutes < 0:
            errs.append(f"{where}/{self.section_id}: minutes < 0")
        if self.item_type and self.item_type not in ITEM_TYPES:
            warns.append(f"{where}/{self.section_id}: unknown item_type '{self.item_type}'")
        if self.competency and self.competency not in KNOWN_COMPETENCIES:
            warns.append(f"{where}/{self.section_id}: unknown competency '{self.competency}'")
        return errs, warns


@dataclass
class NegativeMarking:
    """Per-round negative-marking rule. Supports none / fixed / threshold."""

    enabled: bool = False
    model: str = "none"          # none | fixed | threshold
    penalty: float = 0.0         # deducted per wrong (fixed model)
    threshold: int = 0           # free mistakes before penalty kicks in (threshold)
    note: str = ""

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "NegativeMarking":
        if not isinstance(d, dict):
            return cls()
        model = _as_str(d.get("model"))
        enabled_raw = d.get("enabled")
        enabled = _as_bool(enabled_raw)
        # Infer the model when only enabled/penalty/threshold are given.
        if not model:
            if not enabled:
                model = "none"
            elif "threshold" in d:
                model = "threshold"
            else:
                model = "fixed"
        # A blueprint that explicitly names a penalising model but omits `enabled`
        # clearly intends it on (Wipro essay: {"model":"threshold","threshold":5}).
        # Honour an explicit enabled=false; only infer when the key is absent.
        if enabled_raw is None and model in ("fixed", "threshold"):
            enabled = True
        return cls(
            enabled=enabled,
            model=model,
            penalty=_as_num(d.get("penalty")),
            threshold=_as_int(d.get("threshold")),
            note=_as_str(d.get("note")),
        )

    def validate(self, where: str) -> tuple[list[str], list[str]]:
        errs: list[str] = []
        warns: list[str] = []
        if self.model not in NEGATIVE_MARKING_MODELS:
            errs.append(f"{where}: bad negative_marking.model '{self.model}'")
        if self.model == "none" and self.enabled:
            warns.append(f"{where}: negative_marking model=none but enabled=true")
        if self.model == "fixed" and self.penalty <= 0:
            errs.append(f"{where}: fixed negative marking needs penalty > 0")
        if self.model == "threshold" and self.threshold <= 0:
            errs.append(f"{where}: threshold negative marking needs threshold > 0")
        return errs, warns


@dataclass
class GateRule:
    """An elimination / branching gate. Heterogeneous params, validated by type."""

    type: str
    params: dict[str, Any] = field(default_factory=dict)
    note: str = ""

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "GateRule | None":
        if not isinstance(d, dict) or not d:
            return None
        return cls(
            type=_as_str(d.get("type"), "none"),
            params=_as_dict(d.get("params")),
            note=_as_str(d.get("note")),
        )

    def validate(self, where: str, known_tracks: set[str], section_ids: set[str]) -> tuple[list[str], list[str]]:
        errs: list[str] = []
        warns: list[str] = []
        if self.type not in GATE_TYPES:
            errs.append(f"{where}: unknown gate_rule.type '{self.type}'")
        # Any track referenced in params must exist in the company's packages.
        for tk in _referenced_tracks(self.params):
            if tk not in known_tracks:
                errs.append(f"{where}: gate references unknown track '{tk}'")
        # Any section referenced must exist in this round.
        for sid in _as_list(self.params.get("sections_required")):
            if isinstance(sid, str) and sid not in section_ids:
                errs.append(f"{where}: gate references unknown section '{sid}'")
        return errs, warns


@dataclass
class Round:
    """One ordered stage of the process (maps to exactly one simulator)."""

    order: int
    round_id: str
    round_type: str
    label: str
    is_elimination: bool
    total_minutes: int
    sections: list[Section] = field(default_factory=list)
    gate_rule: GateRule | None = None
    negative_marking: NegativeMarking = field(default_factory=NegativeMarking)
    difficulty_profile: str = "medium"
    applies_to_tracks: list[str] = field(default_factory=list)  # empty == all tracks
    notes: str = ""
    config: dict[str, Any] = field(default_factory=dict)
    ai_assistance_allowed: bool | None = None  # None == inherit blueprint

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Round":
        aia = d.get("ai_assistance_allowed")
        return cls(
            order=_as_int(d.get("order")),
            round_id=_as_str(d.get("round_id")),
            round_type=_as_str(d.get("round_type")),
            label=_as_str(d.get("label")),
            is_elimination=_as_bool(d.get("is_elimination")),
            total_minutes=_as_int(d.get("total_minutes")),
            sections=[Section.from_dict(s) for s in _as_list(d.get("sections"))],
            gate_rule=GateRule.from_dict(d.get("gate_rule")),
            negative_marking=NegativeMarking.from_dict(d.get("negative_marking") or {}),
            difficulty_profile=_as_str(d.get("difficulty_profile"), "medium"),
            applies_to_tracks=[_as_str(t) for t in _as_list(d.get("applies_to_tracks"))],
            notes=_as_str(d.get("notes")),
            config=_as_dict(d.get("config")),
            ai_assistance_allowed=aia if isinstance(aia, bool) else None,
        )

    @property
    def section_ids(self) -> set[str]:
        return {s.section_id for s in self.sections if s.section_id}

    def validate(self, known_tracks: set[str]) -> tuple[list[str], list[str]]:
        where = f"round[{self.order}:{self.round_id or '?'}]"
        errs: list[str] = []
        warns: list[str] = []
        if not self.round_id:
            errs.append(f"{where}: missing round_id")
        if self.round_type not in ROUND_TYPES:
            errs.append(f"{where}: unknown round_type '{self.round_type}'")
        if not self.label:
            warns.append(f"{where}: missing label")
        if self.total_minutes <= 0 and self.round_type != "hiring_committee":
            errs.append(f"{where}: total_minutes must be > 0")
        if self.difficulty_profile not in DIFFICULTY_PROFILES:
            warns.append(f"{where}: unusual difficulty_profile '{self.difficulty_profile}'")
        for tk in self.applies_to_tracks:
            if tk not in known_tracks:
                errs.append(f"{where}: applies_to_tracks references unknown track '{tk}'")
        # A live round with sections should have its section minutes sum sanely.
        if self.sections:
            sec_minutes = sum(max(s.minutes, 0) for s in self.sections)
            if self.total_minutes and sec_minutes > self.total_minutes:
                warns.append(
                    f"{where}: section minutes ({sec_minutes}) exceed total_minutes "
                    f"({self.total_minutes})"
                )
        for s in self.sections:
            e, w = s.validate(where)
            errs += e
            warns += w
        e, w = self.negative_marking.validate(where)
        errs += e
        warns += w
        if self.gate_rule is not None:
            e, w = self.gate_rule.validate(where, known_tracks, self.section_ids)
            errs += e
            warns += w
        elif self.is_elimination:
            warns.append(f"{where}: is_elimination=true but no gate_rule to resolve it")
        return errs, warns


@dataclass
class Package:
    """A track/tier the company hires into (TCS Ninja/Digital/Prime, …)."""

    track: str
    label: str
    ctc_lpa: list[float] = field(default_factory=list)  # [min, max]
    gate: str = ""

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Package":
        return cls(
            track=_as_str(d.get("track")),
            label=_as_str(d.get("label")),
            ctc_lpa=[_as_num(x) for x in _as_list(d.get("ctc_lpa"))],
            gate=_as_str(d.get("gate")),
        )

    def validate(self) -> tuple[list[str], list[str]]:
        errs: list[str] = []
        warns: list[str] = []
        if not self.track:
            errs.append("package missing 'track'")
        if len(self.ctc_lpa) not in (0, 2):
            warns.append(f"package '{self.track}': ctc_lpa should be [min,max]")
        elif len(self.ctc_lpa) == 2 and self.ctc_lpa[0] > self.ctc_lpa[1]:
            warns.append(f"package '{self.track}': ctc_lpa min > max")
        return errs, warns


@dataclass
class Platform:
    """The assessment platform to emulate (look-and-feel + enforced rules)."""

    name: str
    emulation_profile: str
    proctored: bool = False
    tab_switch_policy: str = "none"
    navigation: str = "free_all"
    on_screen_calculator: bool = False
    rough_work: str = ""

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Platform":
        d = _as_dict(d)
        return cls(
            name=_as_str(d.get("name")),
            emulation_profile=_as_str(d.get("emulation_profile")),
            proctored=_as_bool(d.get("proctored")),
            tab_switch_policy=_as_str(d.get("tab_switch_policy"), "none"),
            navigation=_as_str(d.get("navigation"), "free_all"),
            on_screen_calculator=_as_bool(d.get("on_screen_calculator")),
            rough_work=_as_str(d.get("rough_work")),
        )

    def validate(self, known_skins: set[str]) -> tuple[list[str], list[str]]:
        errs: list[str] = []
        warns: list[str] = []
        if not self.emulation_profile:
            errs.append("platform missing emulation_profile")
        elif known_skins and self.emulation_profile not in known_skins:
            errs.append(
                f"platform emulation_profile '{self.emulation_profile}' not in platform_skins"
            )
        if self.tab_switch_policy not in TAB_SWITCH_POLICIES:
            errs.append(f"platform bad tab_switch_policy '{self.tab_switch_policy}'")
        if self.navigation not in NAVIGATION_MODES:
            errs.append(f"platform bad navigation '{self.navigation}'")
        return errs, warns


@dataclass
class Eligibility:
    """Pre-sim eligibility check inputs (realism + 'are you eligible')."""

    min_percentage_throughout: float | None = None
    max_active_backlogs: int | None = None
    max_academic_gap_years: int | None = None
    degrees: list[str] = field(default_factory=list)
    age_range: list[int] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Eligibility":
        d = _as_dict(d)
        known = {
            "min_percentage_throughout", "max_active_backlogs",
            "max_academic_gap_years", "degrees", "age_range",
        }
        num = d.get("min_percentage_throughout")
        mab = d.get("max_active_backlogs")
        mag = d.get("max_academic_gap_years")
        return cls(
            min_percentage_throughout=_as_num(num) if isinstance(num, (int, float)) else None,
            max_active_backlogs=_as_int(mab) if isinstance(mab, int) else None,
            max_academic_gap_years=_as_int(mag) if isinstance(mag, int) else None,
            degrees=[_as_str(x) for x in _as_list(d.get("degrees"))],
            age_range=[_as_int(x) for x in _as_list(d.get("age_range"))],
            extra={k: v for k, v in d.items() if k not in known},
        )


@dataclass
class OutcomeModel:
    """
    Per-blueprint track-prediction config (Dossier Part 6). The resolver (M5)
    converts per-section performance into the company's real branching + the gap
    to the next track. Structured but flexible so each company's real logic fits.
    """

    strategy: str
    attributes: list[str] = field(default_factory=list)
    tracks: list[dict[str, Any]] = field(default_factory=list)  # {track,label,requires{}}
    params: dict[str, Any] = field(default_factory=dict)
    gap_hints: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OutcomeModel":
        d = _as_dict(d)
        return cls(
            strategy=_as_str(d.get("strategy")),
            attributes=[_as_str(x) for x in _as_list(d.get("attributes"))],
            tracks=[_as_dict(x) for x in _as_list(d.get("tracks"))],
            params=_as_dict(d.get("params")),
            gap_hints=_as_dict(d.get("gap_hints")),
        )

    def validate(self, known_tracks: set[str]) -> tuple[list[str], list[str]]:
        errs: list[str] = []
        warns: list[str] = []
        if not self.strategy:
            errs.append("outcome_model missing strategy")
        elif self.strategy not in OUTCOME_STRATEGIES:
            warns.append(f"outcome_model unusual strategy '{self.strategy}'")
        for t in self.tracks:
            tk = _as_str(t.get("track"))
            if tk and known_tracks and tk not in known_tracks:
                errs.append(f"outcome_model references unknown track '{tk}'")
        return errs, warns


# ═══════════════════════════════════════════════════════════════════════════════
# TOP-LEVEL BLUEPRINT
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class CompanyBlueprint:
    """A single company's complete, versioned selection-process description."""

    company_id: str
    display_name: str
    archetype: str
    platform: Platform
    packages: list[Package]
    rounds: list[Round]
    outcome_model: OutcomeModel
    eligibility: Eligibility = field(default_factory=Eligibility)
    aliases: list[str] = field(default_factory=list)
    tier: str = ""
    tier_rank: str = "A"                 # A/B/C fidelity tier (roster)
    hiring_scale: str = "medium"
    logo_asset: str = ""
    brand_colors: dict[str, str] = field(default_factory=dict)
    re_eligibility_gap_months: int | None = None
    format_confidence: float = 0.0
    last_verified: str = ""
    recent_changes: list[str] = field(default_factory=list)
    culture_values: list[str] = field(default_factory=list)
    what_they_value: str = ""
    ai_assistance_allowed: bool = True
    notes: str = ""

    # ── parse ────────────────────────────────────────────────────────────────
    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "CompanyBlueprint":
        d = _as_dict(d)
        aia = d.get("ai_assistance_allowed")
        reg = d.get("re_eligibility_gap_months")
        return cls(
            company_id=_as_str(d.get("company_id")),
            display_name=_as_str(d.get("display_name")),
            archetype=_as_str(d.get("archetype")),
            platform=Platform.from_dict(d.get("platform")),
            packages=[Package.from_dict(p) for p in _as_list(d.get("packages"))],
            rounds=[Round.from_dict(r) for r in _as_list(d.get("rounds"))],
            outcome_model=OutcomeModel.from_dict(d.get("outcome_model")),
            eligibility=Eligibility.from_dict(d.get("eligibility")),
            aliases=[_as_str(a) for a in _as_list(d.get("aliases"))],
            tier=_as_str(d.get("tier")),
            tier_rank=_as_str(d.get("tier_rank"), "A"),
            hiring_scale=_as_str(d.get("hiring_scale"), "medium"),
            logo_asset=_as_str(d.get("logo_asset")),
            brand_colors={k: _as_str(v) for k, v in _as_dict(d.get("brand_colors")).items()},
            re_eligibility_gap_months=_as_int(reg) if isinstance(reg, int) else None,
            format_confidence=_as_num(d.get("format_confidence")),
            last_verified=_as_str(d.get("last_verified")),
            recent_changes=[_as_str(x) for x in _as_list(d.get("recent_changes"))],
            culture_values=[_as_str(x) for x in _as_list(d.get("culture_values"))],
            what_they_value=_as_str(d.get("what_they_value")),
            ai_assistance_allowed=aia if isinstance(aia, bool) else True,
            notes=_as_str(d.get("notes")),
        )

    # ── convenience ────────────────────────────────────────────────────────────
    @property
    def track_ids(self) -> set[str]:
        return {p.track for p in self.packages if p.track}

    def rounds_for_track(self, track: str) -> list[Round]:
        """Ordered rounds a given track actually sits (empty applies_to == all)."""
        out = [
            r for r in sorted(self.rounds, key=lambda r: r.order)
            if not r.applies_to_tracks or track in r.applies_to_tracks
        ]
        return out

    # ── validate ────────────────────────────────────────────────────────────────
    def validate(
        self,
        *,
        known_skins: set[str] | None = None,
        known_archetypes: set[str] | None = None,
    ) -> tuple[list[str], list[str]]:
        """Return (errors, warnings). Empty errors == valid enough to serve."""
        known_skins = known_skins or set()
        known_archetypes = known_archetypes or set()
        errs: list[str] = []
        warns: list[str] = []
        cid = self.company_id or "<no-id>"

        if not self.company_id:
            errs.append("blueprint missing company_id")
        if not self.display_name:
            errs.append(f"{cid}: missing display_name")
        if self.archetype not in ARCHETYPES:
            errs.append(f"{cid}: unknown archetype '{self.archetype}'")
        elif known_archetypes and self.archetype not in known_archetypes:
            errs.append(f"{cid}: archetype '{self.archetype}' not in company_archetypes.json")
        if self.hiring_scale not in HIRING_SCALES:
            warns.append(f"{cid}: unusual hiring_scale '{self.hiring_scale}'")
        if self.tier_rank not in TIER_RANKS:
            warns.append(f"{cid}: tier_rank should be A/B/C, got '{self.tier_rank}'")

        # every blueprint MUST carry a confidence + last-verified stamp
        if not (0.0 <= self.format_confidence <= 1.0):
            errs.append(f"{cid}: format_confidence must be within [0,1]")
        if not self.last_verified:
            errs.append(f"{cid}: missing last_verified stamp")

        # platform
        e, w = self.platform.validate(known_skins)
        errs += [f"{cid}: {m}" for m in e]
        warns += [f"{cid}: {m}" for m in w]

        # packages
        if not self.packages:
            errs.append(f"{cid}: at least one package/track required")
        seen_tracks: set[str] = set()
        for p in self.packages:
            e, w = p.validate()
            errs += [f"{cid}: {m}" for m in e]
            warns += [f"{cid}: {m}" for m in w]
            if p.track in seen_tracks:
                errs.append(f"{cid}: duplicate track '{p.track}'")
            seen_tracks.add(p.track)
        known_tracks = self.track_ids

        # rounds: ordered, unique order, valid
        if not self.rounds:
            errs.append(f"{cid}: at least one round required")
        seen_order: set[int] = set()
        seen_rid: set[str] = set()
        for r in self.rounds:
            if r.order in seen_order:
                errs.append(f"{cid}: duplicate round order {r.order}")
            seen_order.add(r.order)
            if r.round_id in seen_rid:
                errs.append(f"{cid}: duplicate round_id '{r.round_id}'")
            seen_rid.add(r.round_id)
            e, w = r.validate(known_tracks)
            errs += [f"{cid}: {m}" for m in e]
            warns += [f"{cid}: {m}" for m in w]

        # every track must have at least one round it actually sits
        for tk in known_tracks:
            if not self.rounds_for_track(tk):
                warns.append(f"{cid}: track '{tk}' sits no rounds")

        # outcome model
        e, w = self.outcome_model.validate(known_tracks)
        errs += [f"{cid}: {m}" for m in e]
        warns += [f"{cid}: {m}" for m in w]

        return errs, warns


# ═══════════════════════════════════════════════════════════════════════════════
# INTERNAL
# ═══════════════════════════════════════════════════════════════════════════════

def _referenced_tracks(obj: Any) -> set[str]:
    """
    Best-effort scan for track ids referenced anywhere inside a gate's params.
    Recognises the common shapes used in blueprints:
      {"min_percentile_by_track": {"ninja": ...}}
      {"by_track": {"digital": ...}}
      {"track": "prime"}
    """
    out: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("min_percentile_by_track", "by_track", "min_by_track", "thresholds_by_track"):
                if isinstance(v, dict):
                    out |= {str(t) for t in v.keys()}
            elif k == "track" and isinstance(v, str):
                out.add(v)
            else:
                out |= _referenced_tracks(v)
    elif isinstance(obj, list):
        for it in obj:
            out |= _referenced_tracks(it)
    return out
