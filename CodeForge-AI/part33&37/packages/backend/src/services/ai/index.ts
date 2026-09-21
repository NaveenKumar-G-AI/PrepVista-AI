/**
 * AI Service - Central orchestration for all AI operations.
 * Handles provider abstraction, structured output validation, retries, fallbacks, cost tracking.
 */
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { AIProvider, AIRequest, AIResponse, AIJobInput, AIJobResult, PROMPT_VERSIONS, CostEstimate } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { explainableScoreSchema, weaknessSchema, recommendationSchema } from '@prepvista/shared';

type AIJobType = 'QUESTION_GENERATION' | 'ANSWER_EVALUATION' | 'SCORING' | 'WEAKNESS_ANALYSIS' | 'RECOMMENDATION_GENERATION' | 'READINESS_CALCULATION';

interface ParsedResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class AIService {
  private providers: Map<string, AIProvider> = new Map();
  private defaultProvider: string;
  private maxRetries = 2;
  private retryDelayMs = 1000;

  constructor() {
    this.defaultProvider = process.env.AI_PROVIDER || 'anthropic';
    this.initializeProviders();
  }

  private initializeProviders() {
    const anthropicKey = process.env.AI_API_KEY;
    if (anthropicKey) {
      this.providers.set('anthropic', new AnthropicProvider(anthropicKey));
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      this.providers.set('openai', new OpenAIProvider(openaiKey));
    }

    if (this.providers.size === 0) {
      logger.warn('No AI providers configured - AI features will not work');
    }
  }

  getProvider(name?: string): AIProvider {
    const providerName = name || this.defaultProvider;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`AI provider '${providerName}' not configured`);
    }
    return provider;
  }

  async generate<T>(
    jobType: AIJobType,
    input: Record<string, unknown>,
    schema: any,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      provider?: string;
    } = {}
  ): Promise<AIJobResult<T>> {
    const promptVersion = PROMPT_VERSIONS[jobType];
    const provider = this.getProvider(options.provider);
    const model = options.model || provider.defaultModel;

    const systemPrompt = this.getSystemPrompt(jobType);
    const userPrompt = this.buildUserPrompt(jobType, input);

    const request: AIRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens || 4096,
      responseFormat: 'json',
    };

    // Estimate cost before calling
    const costEstimate = provider.estimateCost(request);
    logger.debug({ jobType, model, estimatedCost: costEstimate.estimatedCostUsd }, 'AI job started');

    // Execute with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await provider.generate(request);

        // Parse and validate
        const parsed = this.parseAndValidate<T>(response.content, schema);
        if (!parsed.success) {
          throw new Error(parsed.error || 'Validation failed');
        }

        // Record successful job
        await this.recordJob({
          type: jobType,
          promptVersion,
          input,
          model,
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
          costUsd: this.calculateCost(provider, model, response.usage),
          status: 'COMPLETED',
          output: parsed.data,
        });

        return {
          success: true,
          data: parsed.data,
          usage: {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
            costUsd: this.calculateCost(provider, model, response.usage),
          },
          model,
          promptVersion,
        };
      } catch (error) {
        lastError = error as Error;
        logger.warn({ jobType, attempt: attempt + 1, error: error.message }, 'AI job attempt failed');

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All retries failed - record failure
    await this.recordJob({
      type: jobType,
      promptVersion,
      input,
      model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      status: 'FAILED',
      error: lastError?.message,
    });

    return {
      success: false,
      error: lastError?.message || 'AI generation failed after retries',
      model,
      promptVersion,
    };
  }

  private parseAndValidate<T>(content: string, schema: any): ParsedResult<T> {
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      const result = schema.safeParse(parsed);

      if (!result.success) {
        return { success: false, error: `Validation failed: ${result.error.message}` };
      }

      return { success: true, data: result.data };
    } catch (error) {
      return { success: false, error: `Parse failed: ${error.message}` };
    }
  }

  private calculateCost(provider: AIProvider, model: string, usage: { promptTokens: number; completionTokens: number }): number {
    // Use provider's estimateCost if available, otherwise rough calculation
    if ('estimateCost' in provider && typeof (provider as any).estimateCost === 'function') {
      const estimate = (provider as any).estimateCost({ messages: [], model, maxTokens: usage.completionTokens });
      return estimate.estimatedCostUsd;
    }
    return 0;
  }

  private async recordJob(data: {
    type: AIJobType;
    promptVersion: string;
    input: Record<string, unknown>;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    status: 'COMPLETED' | 'FAILED' | 'RETRYING';
    output?: unknown;
    error?: string;
  }) {
    try {
      const inputHash = this.hashInput(data.input);
      await prisma.aIProcessingJob.create({
        data: {
          type: data.type,
          model: data.model,
          promptVersion: data.promptVersion,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          costUsd: data.costUsd,
          status: data.status,
          inputHash,
          output: data.output as any,
          error: data.error,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to record AI job');
    }
  }

  private hashInput(input: Record<string, unknown>): string {
    const str = JSON.stringify(input);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ---- System Prompts ---- */

  private getSystemPrompt(jobType: AIJobType): string {
    const base = `You are PrepVista's AI assessment engine. You are precise, objective, and evidence-based.
Always return valid JSON matching the provided schema exactly. No extra text, no markdown unless requested.`;

    const prompts: Record<AIJobType, string> = {
      QUESTION_GENERATION: `${base}
Generate interview questions that test specific skills. Questions should be realistic, relevant to the target role, and have clear evaluation criteria. Return structured JSON.`,
      ANSWER_EVALUATION: `${base}
Evaluate student answers against expected responses and rubrics. Score 0-100 with specific feedback. Be fair but rigorous. Identify demonstrated skills and gaps.`,
      SCORING: `${base}
Compute explainable scores across 6 dimensions: TECHNICAL, PROBLEM_SOLVING, COMMUNICATION, BEHAVIORAL, CONFIDENCE, ROLE_RELEVANCE.
Each dimension must have evidence citations from the interview. Overall score is weighted average.
Return structured JSON with all dimensions, evidence, and confidence level.`,
      WEAKNESS_ANALYSIS: `${base}
Analyze assessment history to identify skill weaknesses. Each weakness must have: skill reference, severity (CRITICAL/MODERATE/MILD), confidence (HIGH/MEDIUM/LOW/INSUFFICIENT), evidence quotes, and trend.
Only report weaknesses with MEDIUM+ confidence and at least 2 evidence points.`,
      RECOMMENDATION_GENERATION: `${base}
Generate personalized, actionable recommendations. Each must have: type, title, description, reason (why this helps), priority (1-10), target skill.
Types: FOCUSED_INTERVIEW, SKILL_PRACTICE, REATTEMPT_WEAK_CATEGORY, COMMUNICATION_DRILL, HIGHER_DIFFICULTY, REASSESS_READINESS.`,
      READINESS_CALCULATION: `${base}
Calculate overall readiness (0-100) from dimension scores and weakness analysis.
Determine trend direction: IMPROVING/STABLE/DECLINING/INSUFFICIENT_DATA based on historical snapshots.
Return structured readiness snapshot with top weaknesses and recommended actions.`,
    };

    return prompts[jobType];
  }

  private buildUserPrompt(jobType: AIJobType, input: Record<string, unknown>): string {
    return `Input data:\n${JSON.stringify(input, null, 2)}\n\nReturn only the JSON response matching the schema.`;
  }

  /* ---- Convenience Methods for Specific Jobs ---- */

  async generateQuestions(input: {
    type: string;
    difficulty: string;
    targetRole?: string;
    count: number;
    studentId: string;
  }) {
    const schema = z.object({
      questions: z.array(z.object({
        text: z.string(),
        category: z.string(),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']),
        expectedSkills: z.array(z.string()),
        expectedAnswer: z.string().optional(),
        rubric: z.object({
          criteria: z.array(z.string()),
          weight: z.array(z.number()),
        }).optional(),
      })).min(1),
    });

    const result = await this.generate('QUESTION_GENERATION', input, schema);
    return result.success ? result.data!.questions : [];
  }

  async evaluateAnswer(input: {
    question: string;
    category: string;
    difficulty: string;
    expectedSkills: string[];
    expectedAnswer?: string;
    rubric?: any;
    studentAnswer: string;
    timeSpentSeconds?: number;
  }) {
    const schema = z.object({
      score: z.number().min(0).max(100),
      feedback: z.string(),
      demonstratedSkills: z.array(z.string()),
      missingSkills: z.array(z.string()),
      communicationQuality: z.number().min(0).max(100).optional(),
    });

    const result = await this.generate('ANSWER_EVALUATION', input, schema);
    return result.success ? result.data : { score: 0, feedback: 'Evaluation failed', demonstratedSkills: [], missingSkills: [] };
  }

  async computeScore(input: {
    assessmentId: string;
    type: string;
    questions: Array<{
      category: string;
      difficulty: string;
      score: number;
      answer: string;
      feedback: string;
      expectedSkills: string[];
    }>;
    targetRole?: string;
  }) {
    const result = await this.generate('SCORING', input, explainableScoreSchema);
    return result.success ? result.data : null;
  }

  async analyzeWeaknesses(input: {
    studentId: string;
    evidence: Array<{
      skillId: string;
      skillName: string;
      category: string;
      signal: string;
      score: number;
      confidence: string;
    }>;
    assessmentHistory: Array<{
      type: string;
      overallScore: number;
      dimensionScores: any;
      date: string;
    }>;
  }) {
    const schema = z.object({
      weaknesses: z.array(weaknessSchema),
    });

    const result = await this.generate('WEAKNESS_ANALYSIS', input, schema);
    return result.success ? result.data!.weaknesses : [];
  }

  async generateRecommendations(input: {
    studentId: string;
    readiness: number;
    weaknesses: any[];
    skillGraph: any[];
    completedRecommendations: string[];
  }) {
    const schema = z.object({
      recommendations: z.array(recommendationSchema),
    });

    const result = await this.generate('RECOMMENDATION_GENERATION', input, schema);
    return result.success ? result.data!.recommendations : [];
  }

  async calculateReadiness(input: {
    studentId: string;
    dimensionScores: any[];
    weaknesses: any[];
    history: any[];
  }) {
    const schema = z.object({
      overallReadiness: z.number().min(0).max(100),
      trendDirection: z.enum(['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA']),
      topWeaknesses: z.array(weaknessSchema),
      recommendedActions: z.array(recommendationSchema),
    });

    const result = await this.generate('READINESS_CALCULATION', input, schema);
    return result.success ? result.data : null;
  }

  /* ---- Cost Tracking ---- */

  async getUsageStats(collegeId?: string, days: number = 30) {
    const where: any = {
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    };

    if (collegeId) {
      where.assessment = { student: { collegeId } };
    }

    const jobs = await prisma.aIProcessingJob.findMany({ where });

    const totalCost = jobs.reduce((sum, j) => sum + j.costUsd, 0);
    const totalTokens = jobs.reduce((sum, j) => sum + j.inputTokens + j.outputTokens, 0);
    const byType = jobs.reduce((acc, j) => {
      acc[j.type] = (acc[j.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { totalCost, totalTokens, totalJobs: jobs.length, byType };
  }
}

// Export singleton
export const aiService = new AIService();