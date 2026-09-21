"""Durable, leased interview evaluation using the existing PrepVista service."""
import asyncio
from uuid import uuid4
import structlog

from app.config import get_settings
from app.database.connection import DatabaseConnection

logger = structlog.get_logger('prepvista.evaluation_jobs')
# Background response callbacks can arrive in bursts. Wait for local capacity
# before claiming a durable lease, not inside its execution deadline.
_JOB_SLOTS = asyncio.Semaphore(6)


async def process_one(session_id=None, turn_number=None):
    async with _JOB_SLOTS:
        return await _process_one(session_id, turn_number)


async def _process_one(session_id=None, turn_number=None):
    lease = uuid4()
    async with DatabaseConnection() as conn:
        await conn.execute("UPDATE interview_evaluation_jobs SET state='FAILED',error_code='EVALUATION_RETRY_EXHAUSTED',updated_at=NOW() WHERE state='RUNNING' AND retry_after<=NOW() AND attempts>=3")
        job = await conn.fetchrow('''UPDATE interview_evaluation_jobs j SET
            state='RUNNING',attempts=j.attempts+1,lease_id=$1,
            retry_after=NOW()+INTERVAL '2 minutes',updated_at=NOW()
            FROM (SELECT session_id,turn_number FROM interview_evaluation_jobs
                WHERE state IN ('PENDING','RUNNING') AND retry_after<=NOW()
                AND ($2::uuid IS NULL OR session_id=$2)
                AND ($3::int IS NULL OR turn_number=$3)
                ORDER BY retry_after,session_id,turn_number FOR UPDATE SKIP LOCKED LIMIT 1) q
            WHERE j.session_id=q.session_id AND j.turn_number=q.turn_number RETURNING j.*''',
            lease, session_id, turn_number)
        if not job:
            return False
        answer = await conn.fetchrow('SELECT content FROM conversation_messages WHERE id=$1 AND session_id=$2',
                                     job['source_message_id'], job['session_id'])
        question = await conn.fetchval("SELECT content FROM conversation_messages WHERE session_id=$1 AND turn_number=$2 AND role='assistant' ORDER BY id LIMIT 1",
                                       job['session_id'], job['turn_number'])
    code = 'EVALUATION_SOURCE_MISSING'
    try:
        if answer and question:
            from app.routers.interviews_answer import _evaluate_and_store
            async with asyncio.timeout(75):
                code = await _evaluate_and_store(str(job['session_id']), job['turn_number'], question,
                                                answer['content'], job['answer_duration_seconds'])
    except asyncio.CancelledError:
        raise  # Lease expiry recovers process shutdown; never acknowledge incomplete work.
    except TimeoutError:
        code = 'EVALUATION_TIMEOUT'
    except Exception:
        code = 'EVALUATION_PROVIDER_FAILED'
    async with DatabaseConnection() as conn, conn.transaction():
        available = await conn.fetchval('SELECT EXISTS(SELECT 1 FROM question_evaluations WHERE session_id=$1 AND turn_number=$2)',
                                        job['session_id'], job['turn_number'])
        await conn.execute('''UPDATE interview_evaluation_jobs SET state=$4,error_code=$5,
            retry_after=NOW()+INTERVAL '60 seconds',updated_at=NOW()
            WHERE session_id=$1 AND turn_number=$2 AND lease_id=$3''',
            job['session_id'], job['turn_number'], lease,
            'AVAILABLE' if available else 'FAILED' if job['attempts'] >= 3 else 'PENDING',
            None if available else code or 'EVALUATION_PERSIST_FAILED')
        if available:
            await refresh_finished_report(conn, job['session_id'])
    logger.info('evaluation_job_settled', session_id=str(job['session_id']), turn=job['turn_number'], available=available)
    return True


async def refresh_finished_report(conn, session_id):
    from app.services.report_truth import build_report_truth
    import json
    session = await conn.fetchrow("SELECT * FROM interview_sessions WHERE id=$1 AND state='FINISHED' FOR NO KEY UPDATE", session_id)
    if not session:
        return
    rows = await conn.fetch('SELECT * FROM question_evaluations WHERE session_id=$1 ORDER BY turn_number', session_id)
    messages = await conn.fetch('SELECT role,content,turn_number FROM conversation_messages WHERE session_id=$1', session_id)
    truth = build_report_truth(dict(session), [dict(row) for row in rows], messages)
    aggregate = truth['aggregate']
    await conn.execute('''UPDATE interview_sessions SET final_score=$2,rubric_scores=$3::jsonb,
        strengths=$4,weaknesses=$5,runtime_state=(COALESCE(runtime_state,'{}'::jsonb)-'finish_result_v2') || $6::jsonb
        WHERE id=$1''', session_id, aggregate['final_score'], json.dumps(aggregate['category_scores']),
        aggregate['strengths'], aggregate['weaknesses'], json.dumps({'final_summary': truth['summary'],
            'report_version': 2, 'evidence_report_v2': truth['evidence_report']}))

    from app.services.analytics import sync_session_skill_scores
    await sync_session_skill_scores(conn, str(session_id), str(session['user_id']), truth['evaluations'])


async def dispatch(session_id, turn_number, **metadata):
    # Answer text/question identity are loaded from committed rows, not trusted
    # from a replayed HTTP payload. Timing remains explicitly client-reported.
    async with DatabaseConnection() as conn:
        await conn.execute('''UPDATE interview_evaluation_jobs SET answer_duration_seconds=$3
            WHERE session_id=$1 AND turn_number=$2 AND answer_duration_seconds IS NULL''',
            session_id, turn_number, metadata.get('answer_duration_seconds'))
    return await process_one(session_id, turn_number)


async def run():
    while get_settings().INTERVIEW_EVALUATION_WORKER_ENABLED:
        try:
            await process_one()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning('evaluation_worker_failed', error_code='EVALUATION_WORKER_UNAVAILABLE', error_type=type(exc).__name__)
        await asyncio.sleep(2)
