import { compareClaimToEvidence } from '../claimVsProof';

describe('compareClaimToEvidence', () => {
  it('returns NO_CLAIM when nothing was self-reported', () => {
    const result = compareClaimToEvidence(null, 'DEVELOPING');
    expect(result.status).toBe('NO_CLAIM');
  });

  it('flags an overclaim without calling the student dishonest', () => {
    // Claims "Strong" (rank 2) but evidence is only "Limited" (rank 0) -> gap of 2.
    const result = compareClaimToEvidence('STRONG', 'LIMITED');
    expect(result.status).toBe('OVERCLAIM');
    expect(result.message).toMatch(/insufficient/i);
    expect(result.message.toLowerCase()).not.toMatch(/dishonest|lying|false/);
  });

  it('flags an underclaim when evidence is well ahead of the stated level', () => {
    // Claims "Basic" (rank 0) but evidence is "Strong" (rank 2) -> gap of 2.
    const result = compareClaimToEvidence('BASIC', 'STRONG');
    expect(result.status).toBe('UNDERCLAIM');
    expect(result.message).toMatch(/stronger/i);
  });

  it('treats a one-level gap as aligned rather than flagging it', () => {
    const result = compareClaimToEvidence('INTERMEDIATE', 'STRONG');
    expect(result.status).toBe('ALIGNED');
  });
});
