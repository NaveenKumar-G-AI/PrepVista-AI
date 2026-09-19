"""Failure and concurrency contracts for answer delivery (no provider/network)."""
import asyncio
import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

from app.services import interviewer_session as service
from app.services.stt_service import _audio_format
from app.routers.interviews_schemas import AnswerRequest

SESSION = "11111111-1111-4111-8111-111111111111"

class Connection:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.turn = 1
        self.receipts = {}
        self.in_transaction = False

    @asynccontextmanager
    async def transaction(self):
        async with self.lock:
            self.in_transaction = True
            original = (self.turn, self.receipts.copy())
            try:
                yield
            except BaseException:
                self.turn, self.receipts = original
                raise
            finally:
                self.in_transaction = False

    async def fetchrow(self, sql, *args):
        assert self.in_transaction
        if "FOR UPDATE" in sql:
            return {"user_id": "owner", "total_turns": self.turn}
        if "interview_answer_receipts" in sql:
            return self.receipts.get(args[1])
        raise AssertionError(sql)

    async def execute(self, sql, *args):
        assert self.in_transaction
        assert "INSERT INTO interview_answer_receipts" in sql
        self.receipts[args[1]] = {"fingerprint": args[2], "response": args[3]}


def install(monkeypatch, conn, process):
    @asynccontextmanager
    async def database():
        yield conn
    monkeypatch.setattr(service, "DatabaseConnection", database)
    monkeypatch.setattr(service, "_process_answer_in_transaction", process)


def test_concurrent_retries_only_advance_one_turn(monkeypatch):
    async def run():
        conn = Connection()
        async def process(*args):
            await asyncio.sleep(0.01)
            conn.turn += 1
            return {"action": "continue", "turn": conn.turn, "text": "Next question"}
        wrapped = AsyncMock(side_effect=process)
        install(monkeypatch, conn, wrapped)
        results = await asyncio.gather(*[
            service.process_answer(SESSION, "My answer", "token", "same-key", 1, user_id="owner")
            for _ in range(6)
        ])
        assert wrapped.await_count == 1
        assert conn.turn == 2
        assert all(result == results[0] for result in results)
        # An old retry remains replayable after another question was answered.
        await service.process_answer(SESSION, "Second answer", "token", "next-key", 2, user_id="owner")
        assert await service.process_answer(SESSION, "My answer", "token", "same-key", 1, user_id="owner") == results[0]
        assert conn.turn == 3
    asyncio.run(run())


def test_changed_payload_stale_turn_and_wrong_owner_are_rejected(monkeypatch):
    async def run():
        conn = Connection()
        process = AsyncMock(return_value={"action": "continue", "turn": 2})
        install(monkeypatch, conn, process)
        await service.process_answer(SESSION, "answer", "token", "key", 1, user_id="owner")
        changed = await service.process_answer(SESSION, "different", "token", "key", 1, user_id="owner")
        stale = await service.process_answer(SESSION, "answer", "token", "another", 0, user_id="owner")
        other = await service.process_answer(SESSION, "answer", "token", "key", 1, user_id="intruder")
        assert [changed["status"], stale["status"], other["status"]] == [409, 409, 404]
        assert process.await_count == 1
    asyncio.run(run())


def test_processing_failure_rolls_back_answer_and_receipt(monkeypatch):
    async def run():
        conn = Connection()
        async def process(*args):
            conn.turn += 1
            raise RuntimeError("provider failed")
        install(monkeypatch, conn, process)
        try:
            await service.process_answer(SESSION, "answer", "token", "key", 1)
        except RuntimeError:
            pass
        assert conn.turn == 1
        assert conn.receipts == {}
    asyncio.run(run())


def test_end_flag_keeps_actual_answer_in_processing_contract(monkeypatch):
    async def run():
        conn = Connection()
        process = AsyncMock(return_value={"action": "finish"})
        install(monkeypatch, conn, process)
        await service.process_answer(SESSION, "I used a hash map", "token", "key", 1, True, "owner")
        assert process.call_args.args[2] == "I used a hash map"
        assert process.call_args.args[4] is True
        assert json.loads(conn.receipts["key"]["response"])["action"] == "finish"
    asyncio.run(run())


def test_audio_container_detection_preserves_safari_and_firefox_formats():
    assert _audio_format(b"OggS123") == ("ogg", "audio/ogg")
    assert _audio_format(b"\x00\x00\x00\x20ftypisom") == ("mp4", "audio/mp4")
    assert _audio_format(b"RIFF123") == ("wav", "audio/wav")
    assert _audio_format(b"\x1a\x45\xdf\xa3") == ("webm", "audio/webm")


def test_nonfinite_duration_does_not_crash_validation():
    req = AnswerRequest(access_token="x" * 32, duration_actual=float("inf"))
    assert req.duration_actual is None
