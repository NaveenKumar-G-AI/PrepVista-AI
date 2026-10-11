"""Offline failure-injection coverage for the post-repair provider contracts."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import llm, transcript_repair, stt_service, interviewer_question_engine, session_prefetch
from app.middleware import rate_limiter
from app.model_config import GROQ_FAST_MODEL, GROQ_QUALITY_MODEL


@pytest.fixture
def providers(monkeypatch):
    settings=SimpleNamespace(GROQ_MODEL=GROQ_QUALITY_MODEL,GROQ_FALLBACK_MODEL=GROQ_FAST_MODEL,
                             OPENAI_API_KEY='offline-test',DEFAULT_LLM_TIMEOUT=1)
    monkeypatch.setattr(llm,'get_settings',lambda:settings)
    monkeypatch.setattr(llm.asyncio,'sleep',AsyncMock())
    return settings


@pytest.mark.parametrize('failure,attempts',[
    (TimeoutError(),2),
    (httpx.HTTPStatusError('rate limit',request=httpx.Request('POST','https://offline.test'),response=httpx.Response(429)),2),
    (httpx.HTTPStatusError('server failure',request=httpx.Request('POST','https://offline.test'),response=httpx.Response(503)),2),
    (RuntimeError('model_not_found'),1),
    (RuntimeError('model_decommissioned'),1),
])
def test_primary_failure_uses_distinct_fallback_once(monkeypatch,providers,failure,attempts):
    calls=[]
    async def groq(*args,**kwargs):
        calls.append(args[3])
        if args[3]==GROQ_FAST_MODEL:return 'fallback evidence'
        raise failure
    fallback=AsyncMock()
    monkeypatch.setattr(llm,'call_groq',groq);monkeypatch.setattr(llm,'call_openai',fallback)
    assert asyncio.run(llm.call_llm([],model=GROQ_QUALITY_MODEL))=='fallback evidence'
    assert calls==[GROQ_QUALITY_MODEL]*attempts+[GROQ_FAST_MODEL]
    fallback.assert_not_awaited()


def test_primary_success_does_not_call_fallback(monkeypatch,providers):
    primary=AsyncMock(return_value='primary response');fallback=AsyncMock()
    monkeypatch.setattr(llm,'call_groq',primary);monkeypatch.setattr(llm,'call_openai',fallback)
    assert asyncio.run(llm.call_llm([]))=='primary response'
    assert primary.await_count==1;fallback.assert_not_awaited()


def test_cross_provider_fallback_uses_its_own_model(monkeypatch,providers):
    monkeypatch.setattr(llm,'call_groq',AsyncMock(side_effect=RuntimeError('model_decommissioned')))
    fallback=AsyncMock(return_value='OpenAI result');monkeypatch.setattr(llm,'call_openai',fallback)
    assert asyncio.run(llm.call_llm([],model=GROQ_QUALITY_MODEL))=='OpenAI result'
    assert fallback.await_args.args[3] is None


def test_all_provider_outage_is_explicit(monkeypatch,providers):
    primary=AsyncMock(side_effect=TimeoutError());fallback=AsyncMock(side_effect=TimeoutError())
    monkeypatch.setattr(llm,'call_groq',primary);monkeypatch.setattr(llm,'call_openai',fallback)
    with pytest.raises(RuntimeError,match='All LLM providers failed'):
        asyncio.run(llm.call_llm([],model=GROQ_FAST_MODEL))
    assert primary.await_count==2 and fallback.await_count==1


def test_transcript_repair_outage_keeps_exact_original(monkeypatch):
    raw='  I implemented a Python backend with caching and measured the API latency.  '
    monkeypatch.setattr(transcript_repair,'_REPAIR_CACHE',{})
    monkeypatch.setattr(transcript_repair,'call_llm',AsyncMock(side_effect=TimeoutError()))
    result=asyncio.run(transcript_repair.repair_transcript(raw,{'skills':['Python']},'free',session_id='s',turn_id=1))
    assert result==raw


def test_transcript_repair_retry_does_not_reuse_changed_text(monkeypatch):
    first='I implemented a Python backend with caching and measured API latency.'
    second='I tested the PostgreSQL queries and measured the dashboard loading time.'
    monkeypatch.setattr(transcript_repair,'_REPAIR_CACHE',{})
    provider=AsyncMock(side_effect=[first,second]);monkeypatch.setattr(transcript_repair,'call_llm',provider)
    async def run():
        assert await transcript_repair.repair_transcript(first,'Python PostgreSQL','free',session_id='s',turn_id=1)==first
        assert await transcript_repair.repair_transcript(second,'Python PostgreSQL','free',session_id='s',turn_id=1)==second
    asyncio.run(run());assert provider.await_count==2


@pytest.mark.parametrize('audio,expected',[(b'\x00\x00\x00\x18ftypM4A ',('m4a','audio/mp4')),
    (b'OggSdata',('ogg','audio/ogg')),(b'RIFFxxxxWAVE',('wav','audio/wav')),(b'\x1aE\xdf\xa3',('webm','audio/webm'))])
def test_browser_audio_containers_keep_correct_provider_type(audio,expected):
    assert stt_service.audio_format(audio)==expected


def test_stt_timeout_cancels_late_primary_and_uses_fallback(monkeypatch):
    cancelled=[]
    async def slow(*args):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.append(True)
    monkeypatch.setattr(stt_service,'_GROQ_TIMEOUT',0.01)
    monkeypatch.setattr(stt_service,'_transcribe_groq',slow)
    monkeypatch.setattr(stt_service,'_transcribe_deepgram',AsyncMock(return_value=('retained answer',.9)))
    result=asyncio.run(stt_service.transcribe_audio(b'audio',audio_id='immutable-audio-id'))
    assert cancelled==[True] and result['raw_transcript']=='retained answer'
    assert result['audio_id']=='immutable-audio-id' and result['provider']=='deepgram'


def test_redis_dns_failure_keeps_bounded_atomic_memory_limits(monkeypatch):
    settings=SimpleNamespace(UPSTASH_REDIS_URL='https://offline.invalid',UPSTASH_REDIS_TOKEN='offline')
    monkeypatch.setattr(rate_limiter,'get_settings',lambda:settings)
    monkeypatch.setattr(rate_limiter,'_memory_store',{})
    monkeypatch.setattr(rate_limiter,'_memory_lock',asyncio.Lock())
    from collections import defaultdict
    monkeypatch.setattr(rate_limiter,'_memory_store',defaultdict(list))
    monkeypatch.setattr(rate_limiter,'_get_redis_client',lambda:SimpleNamespace(post=AsyncMock(side_effect=httpx.ConnectError('DNS unavailable'))))
    async def run():
        results=await asyncio.gather(*[rate_limiter._redis_rate_check('same-session',5,60) for _ in range(20)])
        assert sum(allowed for allowed,_ in results)==5
        assert len(rate_limiter._memory_store['same-session'])==5
    asyncio.run(run())


def test_redis_qmem_failure_reads_authoritative_database(monkeypatch):
    expected={'recent_questions':['Persisted question'],'recent_question_signatures':{'sig'}}
    monkeypatch.setattr(interviewer_question_engine,'_qmem_redis_config',lambda:('https://offline.invalid','offline'))
    cache=AsyncMock(side_effect=httpx.ConnectError('DNS unavailable'))
    database=AsyncMock(return_value=expected)
    monkeypatch.setattr(interviewer_question_engine,'_qmem_redis_pipeline',cache)
    monkeypatch.setattr(interviewer_question_engine,'_load_recent_session_question_memory',database)
    result=asyncio.run(interviewer_question_engine.load_recent_session_question_memory_cached(object(),'user','free'))
    assert result==expected and cache.await_count==2 and database.await_count==1


def test_redis_dedup_failure_is_visible_and_keeps_local_memory(monkeypatch):
    dedup=session_prefetch._RedisQuestionDeduplicator()
    monkeypatch.setattr(dedup,'_config',lambda:('https://offline.invalid','offline'))
    monkeypatch.setattr(dedup,'_pipeline',AsyncMock(side_effect=httpx.ConnectError('DNS unavailable')))
    async def run():
        assert not await dedup.is_duplicate('question')
        await dedup.record('question','session')
        assert await dedup.is_duplicate('question')
    asyncio.run(run());assert dedup._warned is True
