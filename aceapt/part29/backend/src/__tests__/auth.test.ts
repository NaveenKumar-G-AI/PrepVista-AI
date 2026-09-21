import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth, requireSelfOrElevated, signHmacJwt, AuthedRequest } from '../api/middleware/auth';
import { Response } from 'express';

function mockRes() {
  const res: Partial<Response> & { _status?: number; _body?: unknown } = {};
  res.status = ((code: number) => {
    res._status = code;
    return res as Response;
  }) as Response['status'];
  res.json = ((body: unknown) => {
    res._body = body;
    return res as Response;
  }) as Response['json'];
  return res as Response & { _status?: number; _body?: unknown };
}

function mockReq(headers: Record<string, string> = {}, params: Record<string, string> = {}): AuthedRequest {
  return { headers, params } as unknown as AuthedRequest;
}

test('requireAuth fails CLOSED (503) when ALIGN_SERVICE_JWT_SECRET is unset, not open', () => {
  const original = process.env.ALIGN_SERVICE_JWT_SECRET;
  delete process.env.ALIGN_SERVICE_JWT_SECRET;
  try {
    const req = mockReq({ authorization: 'Bearer whatever-looks-plausible' });
    const res = mockRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false, 'next() must not be called when auth is unconfigured');
    assert.equal(res._status, 503);
  } finally {
    if (original !== undefined) process.env.ALIGN_SERVICE_JWT_SECRET = original;
  }
});

test('requireAuth accepts a validly signed token and attaches studentId/actorRole', () => {
  process.env.ALIGN_SERVICE_JWT_SECRET = 'test-secret';
  const token = signHmacJwt({ sub: 'student-42', role: 'student' }, 'test-secret');
  const req = mockReq({ authorization: `Bearer ${token}` });
  const res = mockRes();
  let nextCalled = false;
  requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.studentId, 'student-42');
  assert.equal(req.actorRole, 'student');
});

test('requireAuth rejects a token signed with the wrong secret', () => {
  process.env.ALIGN_SERVICE_JWT_SECRET = 'real-secret';
  const token = signHmacJwt({ sub: 'student-42', role: 'student' }, 'wrong-secret');
  const req = mockReq({ authorization: `Bearer ${token}` });
  const res = mockRes();
  let nextCalled = false;
  requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 401);
});

test('requireAuth rejects an expired token', () => {
  process.env.ALIGN_SERVICE_JWT_SECRET = 'test-secret';
  const token = signHmacJwt({ sub: 'student-42', role: 'student', exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret');
  const req = mockReq({ authorization: `Bearer ${token}` });
  const res = mockRes();
  let nextCalled = false;
  requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 401);
});

test('requireSelfOrElevated blocks a student from reading a different studentId', () => {
  const req = mockReq({}, { studentId: 'someone-else' });
  req.actorRole = 'student';
  req.studentId = 'student-42';
  const res = mockRes();
  let nextCalled = false;
  requireSelfOrElevated(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 403);
});

test('requireSelfOrElevated allows a tpo actor to read any studentId', () => {
  const req = mockReq({}, { studentId: 'someone-else' });
  req.actorRole = 'tpo';
  req.studentId = 'tpo-staff-1';
  const res = mockRes();
  let nextCalled = false;
  requireSelfOrElevated(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
