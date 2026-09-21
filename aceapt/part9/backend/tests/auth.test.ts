import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate, issueDevToken } from '../src/middleware/auth';
import { Request, Response } from 'express';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('authenticate middleware', () => {
  it('rejects requests with no Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed/invalid token', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } } as Request;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid dev token and attaches studentId to the request', () => {
    const token = issueDevToken('student-99');
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.studentId).toBe('student-99');
  });

  it('rejects a token missing the studentId claim', () => {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    const token = jwt.sign({ notStudentId: 'x' }, secret);
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
