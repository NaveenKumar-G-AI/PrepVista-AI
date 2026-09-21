import { describe, expect, it } from 'vitest';
import { findCycles, wouldCreateCycle, type PrerequisiteEdge } from '../src/domain/cycles.js';
import { searchRoles, type SearchableRole } from '../src/domain/search.js';
import { compareRoles } from '../src/domain/compare.js';
import type { RoleDetail } from '../src/domain/types.js';

describe('circular dependency protection (Step 19 / 88)', () => {
  it('allows a linear chain of prerequisites', () => {
    const edges: PrerequisiteEdge[] = [];
    expect(wouldCreateCycle(edges, { skillId: 'A', prerequisiteSkillId: 'B' })).toBe(false);
    edges.push({ skillId: 'A', prerequisiteSkillId: 'B' });
    expect(wouldCreateCycle(edges, { skillId: 'B', prerequisiteSkillId: 'C' })).toBe(false);
    edges.push({ skillId: 'B', prerequisiteSkillId: 'C' });
  });

  it('rejects the classic A depends on B, B depends on C, C depends on A cycle', () => {
    const edges: PrerequisiteEdge[] = [
      { skillId: 'A', prerequisiteSkillId: 'B' }, // "A depends on B"
      { skillId: 'B', prerequisiteSkillId: 'C' }, // "B depends on C"
    ];
    // "C depends on A" would close the loop
    expect(wouldCreateCycle(edges, { skillId: 'C', prerequisiteSkillId: 'A' })).toBe(true);
  });

  it('rejects a direct self-reference', () => {
    expect(wouldCreateCycle([], { skillId: 'A', prerequisiteSkillId: 'A' })).toBe(true);
  });

  it('findCycles flags every node on a cyclic graph and none on a clean DAG', () => {
    const cyclic: PrerequisiteEdge[] = [
      { skillId: 'A', prerequisiteSkillId: 'B' },
      { skillId: 'B', prerequisiteSkillId: 'C' },
      { skillId: 'C', prerequisiteSkillId: 'A' },
    ];
    const cyclicReport = findCycles(cyclic);
    expect(cyclicReport.hasCycle).toBe(true);
    expect(new Set(cyclicReport.nodesInCycles)).toEqual(new Set(['A', 'B', 'C']));

    const dag: PrerequisiteEdge[] = [
      { skillId: 'A', prerequisiteSkillId: 'B' },
      { skillId: 'B', prerequisiteSkillId: 'C' },
      { skillId: 'D', prerequisiteSkillId: 'C' },
    ];
    expect(findCycles(dag).hasCycle).toBe(false);
  });
});

describe('deterministic role search (Step 27)', () => {
  const roles: SearchableRole[] = [
    {
      slug: 'backend-engineer',
      name: 'Backend Engineer',
      shortDescription: 'Builds APIs and manages backend data.',
      longDescription: 'Owns the server side of an application end to end.',
      familyName: 'Software Development',
      competencyNames: ['Databases', 'API Design & Integration'],
      technologyNames: ['Python', 'PostgreSQL'],
    },
    {
      slug: 'frontend-engineer',
      name: 'Frontend Engineer',
      shortDescription: 'Builds user interfaces.',
      longDescription: 'Consumes backend APIs and renders them in the browser.',
      familyName: 'Software Development',
      competencyNames: ['UI/UX Implementation'],
      technologyNames: ['React'],
    },
    {
      slug: 'data-scientist',
      name: 'Data Scientist',
      shortDescription: 'Finds patterns using Python and statistics.',
      longDescription: 'Explores data and builds models.',
      familyName: 'Data & Analytics',
      competencyNames: ['Statistics & Probability'],
      technologyNames: ['Python'],
    },
  ];

  it('ranks an exact name match first', () => {
    const results = searchRoles(roles, 'Backend Engineer');
    expect(results[0]?.slug).toBe('backend-engineer');
  });

  it('ranks a name match above a description-only match for the same query', () => {
    const results = searchRoles(roles, 'backend');
    expect(results.map((r) => r.slug)).toEqual(['backend-engineer', 'frontend-engineer']);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it('matches shared technologies across multiple roles', () => {
    const slugs = searchRoles(roles, 'python').map((r) => r.slug);
    expect(slugs).toContain('backend-engineer');
    expect(slugs).toContain('data-scientist');
    expect(slugs).not.toContain('frontend-engineer');
  });

  it('returns no results for an empty or whitespace query', () => {
    expect(searchRoles(roles, '   ')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(searchRoles(roles, 'BACKEND ENGINEER')[0]?.slug).toBe('backend-engineer');
  });
});

describe('role comparison (Step 30 / 31)', () => {
  function fixture(overrides: Partial<RoleDetail>): RoleDetail {
    return {
      id: 'id',
      slug: 'role',
      name: 'Role',
      shortDescription: '',
      longDescription: '',
      status: 'ACTIVE',
      version: 1,
      family: { slug: 'family', name: 'Family' },
      domain: { slug: 'domain', name: 'Domain' },
      competencies: [],
      skills: [],
      technologies: [],
      ...overrides,
    };
  }

  it('derives shared vs. unique competencies and technologies purely from mappings', () => {
    const roleA = fixture({
      slug: 'software-engineer',
      competencies: [
        { importance: 'CORE', expectedProficiency: 'COMPETENT', required: true, competency: { id: 'c1', slug: 'programming', name: 'Programming', description: '', parentCompetencyId: null, status: 'ACTIVE' } },
        { importance: 'IMPORTANT', expectedProficiency: 'DEVELOPING', required: true, competency: { id: 'c2', slug: 'api-design-integration', name: 'API Design & Integration', description: '', parentCompetencyId: null, status: 'ACTIVE' } },
      ],
      technologies: [{ usageType: 'COMMON', technology: { id: 't1', slug: 'python', name: 'Python', type: 'LANGUAGE', description: '', status: 'ACTIVE' } }],
    });
    const roleB = fixture({
      slug: 'ai-ml-engineer',
      competencies: [
        { importance: 'CORE', expectedProficiency: 'COMPETENT', required: true, competency: { id: 'c1', slug: 'programming', name: 'Programming', description: '', parentCompetencyId: null, status: 'ACTIVE' } },
        { importance: 'CORE', expectedProficiency: 'COMPETENT', required: true, competency: { id: 'c3', slug: 'statistics-probability', name: 'Statistics & Probability', description: '', parentCompetencyId: null, status: 'ACTIVE' } },
      ],
      technologies: [
        { usageType: 'COMMON', technology: { id: 't1', slug: 'python', name: 'Python', type: 'LANGUAGE', description: '', status: 'ACTIVE' } },
        { usageType: 'COMMON', technology: { id: 't2', slug: 'r-lang', name: 'R', type: 'LANGUAGE', description: '', status: 'ACTIVE' } },
      ],
    });

    const result = compareRoles(roleA, roleB);

    const programming = result.competencies.find((c) => c.slug === 'programming');
    expect(programming?.shared).toBe(true);
    expect(programming?.a?.importance).toBe('CORE');
    expect(programming?.b?.importance).toBe('CORE');

    const apis = result.competencies.find((c) => c.slug === 'api-design-integration');
    expect(apis?.shared).toBe(false);
    expect(apis?.a).not.toBeNull();
    expect(apis?.b).toBeNull();

    const stats = result.competencies.find((c) => c.slug === 'statistics-probability');
    expect(stats?.shared).toBe(false);
    expect(stats?.a).toBeNull();
    expect(stats?.b).not.toBeNull();

    const python = result.technologies.find((t) => t.slug === 'python');
    expect(python?.shared).toBe(true);
    const r = result.technologies.find((t) => t.slug === 'r-lang');
    expect(r?.shared).toBe(false);
  });
});
