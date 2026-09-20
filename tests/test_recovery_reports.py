import asyncio
from io import BytesIO

import pytest
from pypdf import PdfReader

from app.services.evaluator_scoring import compute_final_score
from app.services.report_generator import generate_pdf_report


def evaluations(count, score=8):
    return [{'turn_number': i + 1, 'rubric_category': 'technical_depth',
             'question_text': 'How did you validate your implementation?',
             'raw_answer': 'I wrote a regression test and checked the saved output.',
             'normalized_answer': 'I wrote a regression test and checked the saved output.',
             'classification': 'strong', 'score': score, 'communication_score': score,
             'answer_status': 'answered'} for i in range(count)]


def test_no_evaluations_is_not_a_zero_score():
    assert compute_final_score([], plan='pro', expected_questions=10)['final_score'] is None


def test_partial_evaluation_keeps_quality_separate_from_coverage():
    partial = compute_final_score(evaluations(7), plan='pro', expected_questions=10)
    full = compute_final_score(evaluations(10), plan='pro', expected_questions=10)
    assert partial['final_score'] == full['final_score'] == 80
    assert partial['completion_rate'] == 70


def test_genuine_evaluated_zero_remains_zero():
    assert compute_final_score(evaluations(10, 0), plan='pro', expected_questions=10)['final_score'] == 0


@pytest.mark.parametrize('count', [0, 7, 10])
def test_completed_interview_pdf_distinguishes_answers_from_evaluations(count):
    session = {'id': 'test', 'plan': 'pro', 'state': 'FINISHED', 'final_score': 0,
        'total_turns': 10, 'question_plan': [{'turn': i + 1} for i in range(10)],
        'duration_actual_seconds': 607, 'resume_summary': {'candidate_name': 'NAVEENKUMAR G'},
        'runtime_state': {'orchestrator_v2': {'blueprint': {'target_primary_questions': 10},
            'followups_used': 0, 'evidence': [{} for _ in range(10)]}},
        'created_at': '2026-09-19T10:00:00+00:00', 'finished_at': '2026-09-19T10:10:07+00:00'}
    pdf = asyncio.run(generate_pdf_report(session, evaluations(count), 'student@example.invalid'))
    text = '\n'.join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)
    assert 'NAVEENKUMAR G' in text
    assert '10' in text
    assert 'Evaluation coverage' in text
    if count == 0:
        assert 'Evaluation unavailable' in text
        assert '0/100' not in text and 'DEVELOPING' not in text
        assert 'Low readiness' not in text
    else:
        assert '80/100' in text


@pytest.mark.parametrize('name', ['NAVEENKUMAR G', 'G N', "O?Connor", '????? ??????'])
def test_candidate_identity_is_not_rewritten(name):
    from app.routers.interviews_helpers import _normalize_candidate_name as route_name
    from app.services.interviewer_helpers import _normalize_candidate_name as engine_name
    from app.services.prompts_helpers import _normalize_candidate_name as prompt_name
    assert route_name(name) == engine_name(name) == prompt_name(name) == name


def test_report_counts_bracketed_code_answers_but_excludes_control_tokens():
    from app.services.report_truth import build_report_truth
    messages = [{'role': 'user', 'turn_number': 1, 'content': '[1, 2, 3] is the output.'},
                {'role': 'user', 'turn_number': 2, 'content': '[NO_ANSWER]'}]
    truth = build_report_truth({'plan':'pro'}, evaluations(1), messages)
    assert truth['summary']['answered_questions'] == 1
    assert truth['summary']['evaluation_coverage'] == 100


def test_reported_duplicate_introduction_and_fragment_are_rejected():
    from app.services.interview_catalog import valid_question_wording
    from app.services.interviewer_question_engine import _live_question_is_rejected
    prior = ['Tell me about yourself.']
    for text in ["It's a failing user request across the front end, API and database.",
                 'Tell me about yourself. How would you choose a baseline and evaluation metric for an ML problem?']:
        assert not valid_question_wording(text, prior)
        assert _live_question_is_rejected(text, is_greeting=False, asked_question_signatures=set(),
            asked_questions=prior, combined_avoid_families=set(), plan='pro', allow_duplicate_retry=False)
    assert valid_question_wording('A user request is failing across the frontend, API and database. How would you investigate it?', prior)


def test_extracted_identity_requires_exact_resume_spelling():
    from app.services.resume_parser import enrich_resume_summary, _default_resume_summary
    resume = 'NAVEENKUMAR G\nSkills: Python and React'
    assert enrich_resume_summary({'candidate_name':'naveenkumar g'},resume)['candidate_name'] == 'NAVEENKUMAR G'
    assert enrich_resume_summary({'candidate_name':'Navin Kumar'},resume)['candidate_name'] is None
    assert _default_resume_summary('Curriculum Vitae\nSkills: Python')['candidate_name'] is None


def test_actual_timeout_control_tokens_are_not_recorded_answers():
    from app.services.report_truth import is_recorded_answer
    from app.services.interviewer_constants import NO_ANSWER_TOKEN, SYSTEM_TIME_UP_TOKEN, START_TOKENS
    for token in {NO_ANSWER_TOKEN, SYSTEM_TIME_UP_TOKEN, *START_TOKENS}:
        assert not is_recorded_answer({'role':'user', 'content':token, 'turn_number':1})
