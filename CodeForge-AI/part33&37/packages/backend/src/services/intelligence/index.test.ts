/**
 * Intelligence Engine Tests
 * Tests for signal extraction, skill analysis, weakness detection, and readiness calculation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntelligenceEngine } from './index';
import { prisma } from '../../lib/prisma';
import { aiService } from '../ai';

// Mock dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    assessment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    skillEvidence: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    skill: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    progressSnapshot: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    aIProcessingJob: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../ai', () => ({
  aiService: {
    computeScore: vi.fn(),
    generateRecommendations: vi.fn(),
    calculateReadiness: vi.fn(),
    analyzeWeaknesses: vi.fn(),
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('IntelligenceEngine', () => {
  let engine: IntelligenceEngine;

  beforeEach(() => {
    engine = new IntelligenceEngine();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('computeProficiency', () => {
    it('should return null proficiency for no evidence', () => {
      const result = engine['computeProficiency']([]);
      expect(result.proficiency).toBeNull();
      expect(result.confidence).toBe('INSUFFICIENT');
      expect(result.evidenceCount).toBe(0);
    });

    it('should return INSUFFICIENT for less than minimum evidence', () => {
      const evidence = [
        { score: 0.5, confidence: 'HIGH', weight: 1 },
        { score: -0.3, confidence: 'MEDIUM', weight: 1 },
      ];
      const result = engine['computeProficiency'](evidence);
      expect(result.proficiency).toBeNull();
      expect(result.confidence).toBe('INSUFFICIENT');
      expect(result.evidenceCount).toBe(2);
    });

    it('should compute weighted proficiency for sufficient evidence', () => {
      const evidence = [
        { score: 0.8, confidence: 'HIGH', weight: 1 },
        { score: 0.6, confidence: 'MEDIUM', weight: 1 },
        { score: 0.7, confidence: 'HIGH', weight: 1 },
        { score: 0.5, confidence: 'LOW', weight: 1 },
      ];
      const result = engine['computeProficiency'](evidence);
      expect(result.proficiency).not.toBeNull();
      expect(result.proficiency).toBeGreaterThan(0);
      expect(result.proficiency).toBeLessThanOrEqual(100);
      expect(result.evidenceCount).toBe(4);
    });

    it('should weigh HIGH confidence evidence more heavily', () => {
      const evidenceHigh = [
        { score: 0.9, confidence: 'HIGH', weight: 1 },
        { score: 0.9, confidence: 'HIGH', weight: 1 },
        { score: 0.9, confidence: 'HIGH', weight: 1 },
      ];
      const evidenceLow = [
        { score: 0.9, confidence: 'LOW', weight: 1 },
        { score: 0.9, confidence: 'LOW', weight: 1 },
        { score: 0.9, confidence: 'LOW', weight: 1 },
      ];

      const resultHigh = engine['computeProficiency'](evidenceHigh);
      const resultLow = engine['computeProficiency'](evidenceLow);

      expect(resultHigh.confidence).toBe('HIGH');
      expect(resultLow.confidence).toBe('LOW');
    });
  });

  describe('calculateTrend', () => {
    it('should return UNKNOWN for insufficient evidence', () => {
      const evidence = [
        { score: 0.5, createdAt: new Date('2024-01-01') },
        { score: 0.6, createdAt: new Date('2024-01-02') },
        { score: 0.5, createdAt: new Date('2024-01-03') },
      ];
      const result = engine['calculateTrend'](evidence);
      expect(result).toBe('UNKNOWN');
    });

    it('should detect IMPROVING trend', () => {
      const evidence = [
        { score: -0.5, createdAt: new Date('2024-01-01') },
        { score: -0.4, createdAt: new Date('2024-01-02') },
        { score: -0.2, createdAt: new Date('2024-01-03') },
        { score: 0.1, createdAt: new Date('2024-01-04') },
        { score: 0.3, createdAt: new Date('2024-01-05') },
        { score: 0.5, createdAt: new Date('2024-01-06') },
      ];
      const result = engine['calculateTrend'](evidence);
      expect(result).toBe('IMPROVING');
    });

    it('should detect DECLINING trend', () => {
      const evidence = [
        { score: 0.5, createdAt: new Date('2024-01-01') },
        { score: 0.3, createdAt: new Date('2024-01-02') },
        { score: 0.1, createdAt: new Date('2024-01-03') },
        { score: -0.2, createdAt: new Date('2024-01-04') },
        { score: -0.4, createdAt: new Date('2024-01-05') },
        { score: -0.5, createdAt: new Date('2024-01-06') },
      ];
      const result = engine['calculateTrend'](evidence);
      expect(result).toBe('DECLINING');
    });

    it('should detect STABLE trend', () => {
      const evidence = [
        { score: 0.1, createdAt: new Date('2024-01-01') },
        { score: 0.05, createdAt: new Date('2024-01-02') },
        { score: 0.15, createdAt: new Date('2024-01-03') },
        { score: 0.1, createdAt: new Date('2024-01-04') },
        { score: 0.05, createdAt: new Date('2024-01-05') },
        { score: 0.1, createdAt: new Date('2024-01-06') },
      ];
      const result = engine['calculateTrend'](evidence);
      expect(result).toBe('STABLE');
    });
  });

  describe('getDifficultyWeight', () => {
    it('should return correct weights for each difficulty', () => {
      expect(engine['getDifficultyWeight']('EASY')).toBe(0.5);
      expect(engine['getDifficultyWeight']('MEDIUM')).toBe(1.0);
      expect(engine['getDifficultyWeight']('HARD')).toBe(1.5);
      expect(engine['getDifficultyWeight']('EXPERT')).toBe(2.0);
      expect(engine['getDifficultyWeight']('UNKNOWN')).toBe(1.0);
    });
  });

  describe('confidenceWeight', () => {
    it('should return correct weights', () => {
      expect(engine['confidenceWeight']('HIGH')).toBe(1.5);
      expect(engine['confidenceWeight']('MEDIUM')).toBe(1.0);
      expect(engine['confidenceWeight']('LOW')).toBe(0.5);
      expect(engine['confidenceWeight']('INSUFFICIENT')).toBe(0.1);
    });
  });

  describe('buildSkillHierarchy', () => {
    it('should build correct tree structure', () => {
      const nodes = [
        { id: '1', name: 'JavaScript', parentId: null, category: 'Languages', proficiency: 80, confidence: 'HIGH', evidenceCount: 5 },
        { id: '2', name: 'TypeScript', parentId: '1', category: 'Languages', proficiency: 70, confidence: 'MEDIUM', evidenceCount: 3 },
        { id: '3', name: 'React', parentId: '1', category: 'Languages', proficiency: 75, confidence: 'HIGH', evidenceCount: 4 },
        { id: '4', name: 'Python', parentId: null, category: 'Languages', proficiency: 60, confidence: 'MEDIUM', evidenceCount: 3 },
      ];

      const roots = engine['buildSkillHierarchy'](nodes as any);

      expect(roots).toHaveLength(2);
      expect(roots[0].id).toBe('1');
      expect(roots[1].id).toBe('4');
      expect(roots[0].children).toHaveLength(2);
      expect(roots[0].children.map((c: any) => c.id).sort()).toEqual(['2', '3']);
    });
  });

  describe('fallbackScore', () => {
    it('should compute average score from questions', () => {
      const questions = [
        { score: 80, category: 'Technical' },
        { score: 70, category: 'Communication' },
        { score: 90, category: 'Problem Solving' },
      ];

      const result = engine['fallbackScore'](questions);
      expect(result.overall).toBe(80); // (80+70+90)/3 = 80
      expect(result.dimensions).toHaveLength(6);
      expect(result.confidence).toBe('LOW');
    });

    it('should handle empty questions array', () => {
      const result = engine['fallbackScore']([]);
      expect(result.overall).toBe(0);
    });
  });
});