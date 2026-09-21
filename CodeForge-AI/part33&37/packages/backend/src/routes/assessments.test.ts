/**
 * Assessment API Tests
 * Tests for assessment CRUD operations, answer submission, and scoring
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../index';
import { prisma } from '../lib/prisma';
import { generateTokens } from '../lib/auth';

// Mock Prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    assessment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    assessmentQuestion: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    skillEvidence: {
      create: vi.fn(),
    },
    progressSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    aIProcessingJob: {
      create: vi.fn(),
    },
  },
}));

// Mock AI service
vi.mock('../services/ai', () => ({
  aiService: {
    generateQuestions: vi.fn(),
    evaluateAnswer: vi.fn(),
    computeScore: vi.fn(),
    analyzeWeaknesses: vi.fn(),
    generateRecommendations: vi.fn(),
    calculateReadiness: vi.fn(),
  },
}));

// Mock Intelligence Engine
vi.mock('../services/intelligence', () => ({
  intelligenceEngine: {
    processAssessment: vi.fn(),
    getReadinessSnapshot: vi.fn(),
    getSkillGraph: vi.fn(),
    getWeaknesses: vi.fn(),
    generateRecommendationsForStudent: vi.fn(),
  },
}));

vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Assessment Routes', () => {
  let app: FastifyInstance;
  const studentUserId = 'student-123';
  const studentId = 'student-db-123';
  const collegeId = 'college-123';
  const authToken = generateTokens({
    userId: studentUserId,
    email: 'student@test.com',
    role: 'STUDENT',
    collegeId,
  }).accessToken;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();

    // Mock student lookup
    (prisma.student.findUnique as any).mockResolvedValue({
      id: studentId,
      userId: studentUserId,
      collegeId,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/assessments', () => {
    it('should create a new assessment with generated questions', async () => {
      const mockQuestions = [
        {
          text: 'Explain closures in JavaScript',
          category: 'JavaScript',
          difficulty: 'MEDIUM',
          expectedSkills: ['JavaScript', 'Closures'],
          expectedAnswer: 'A closure is...',
          rubric: { criteria: ['Definition', 'Example'], weight: [0.5, 0.5] },
        },
      ];

      (prisma.assessment.create as any).mockResolvedValue({
        id: 'assessment-123',
        studentId,
        type: 'TECHNICAL',
        difficulty: 'MEDIUM',
        targetRole: 'Software Engineer',
        questionCount: 5,
        timeLimitMinutes: 30,
        status: 'CREATED',
        questions: mockQuestions.map((q, i) => ({ ...q, id: `q-${i}`, order: i })),
        createdAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/assessments',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          type: 'TECHNICAL',
          difficulty: 'MEDIUM',
          targetRole: 'Software Engineer',
          questionCount: 5,
          timeLimitMinutes: 30,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.assessment).toBeDefined();
      expect(body.assessment.id).toBe('assessment-123');
      expect(body.assessment.questions).toHaveLength(1);
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assessments',
        payload: { type: 'TECHNICAL' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate assessment type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assessments',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { type: 'INVALID_TYPE' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/assessments/:id', () => {
    it('should return assessment for owner', async () => {
      const mockAssessment = {
        id: 'assessment-123',
        studentId,
        type: 'TECHNICAL',
        difficulty: 'MEDIUM',
        status: 'COMPLETED',
        questions: [
          { id: 'q-1', questionText: 'Test?', answer: 'Answer', score: 80, feedback: 'Good' },
        ],
        student: { userId: studentUserId, collegeId },
      };

      (prisma.assessment.findUnique as any).mockResolvedValue(mockAssessment);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assessments/assessment-123',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.assessment.id).toBe('assessment-123');
    });

    it('should hide expected answers for in-progress assessments', async () => {
      const mockAssessment = {
        id: 'assessment-123',
        studentId,
        type: 'TECHNICAL',
        difficulty: 'MEDIUM',
        status: 'IN_PROGRESS',
        questions: [
          { id: 'q-1', questionText: 'Test?', expectedAnswer: 'Secret', rubric: { criteria: [] }, answer: null },
        ],
        student: { userId: studentUserId, collegeId },
      };

      (prisma.assessment.findUnique as any).mockResolvedValue(mockAssessment);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assessments/assessment-123',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.assessment.questions[0]).not.toHaveProperty('expectedAnswer');
      expect(body.assessment.questions[0]).not.toHaveProperty('rubric');
    });

    it('should return 404 for non-existent assessment', async () => {
      (prisma.assessment.findUnique as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assessments/non-existent',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/assessments/:id/answer', () => {
    it('should submit answer and return score', async () => {
      const mockAssessment = {
        id: 'assessment-123',
        studentId,
        status: 'IN_PROGRESS',
        questions: [
          { id: 'q-1', questionText: 'Test?', expectedAnswer: 'Expected', expectedSkills: ['Test'], answer: null },
        ],
        student: { userId: studentUserId },
      };

      (prisma.assessment.findUnique as any).mockResolvedValue(mockAssessment);
      (prisma.assessmentQuestion.update as any).mockResolvedValue({});

      // Mock AI evaluation
      const { aiService } = await import('../services/ai');
      (aiService.evaluateAnswer as any).mockResolvedValue({
        score: 85,
        feedback: 'Well explained',
        demonstratedSkills: ['Test'],
        missingSkills: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/assessments/assessment-123/answer',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          questionId: 'q-1',
          answer: 'My answer',
          timeSpentSeconds: 60,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.score).toBe(85);
      expect(body.feedback).toBe('Well explained');
    });

    it('should reject answer for completed assessment', async () => {
      const mockAssessment = {
        id: 'assessment-123',
        studentId,
        status: 'COMPLETED',
        questions: [{ id: 'q-1', answer: 'Already answered' }],
        student: { userId: studentUserId },
      };

      (prisma.assessment.findUnique as any).mockResolvedValue(mockAssessment);

      const response = await app.inject({
        method: 'POST',
        url: '/api/assessments/assessment-123/answer',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { questionId: 'q-1', answer: 'New answer' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/assessments', () => {
    it('should list assessments with pagination', async () => {
      (prisma.assessment.findMany as any).mockResolvedValue([
        { id: 'a1', studentId, type: 'TECHNICAL', status: 'COMPLETED', overallScore: 80 },
        { id: 'a2', studentId, type: 'BEHAVIORAL', status: 'IN_PROGRESS' },
      ]);
      (prisma.assessment.count as any).mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assessments?page=1&limit=10',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.assessments).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });
});