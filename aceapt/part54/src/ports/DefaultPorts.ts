import type { SkillGraphPort, AssetStorePort } from "../contracts/types.js";

/**
 * PORT (see /TRUTH_TABLE.md): the real Feature 45 Skill Graph was not reachable
 * this session. This in-memory stand-in resolves whatever skills a caller seeds
 * it with and reports unresolvable otherwise — real behavior for a fake data
 * set, not a validator that always says "fine."
 */
export class InMemorySkillGraphPort implements SkillGraphPort {
  private readonly skills = new Map<string, { id: string; name: string; operationSignature: string[] }>();

  seed(skill: { id: string; name: string; operationSignature: string[] }): this {
    this.skills.set(skill.id, skill);
    return this;
  }

  async resolveSkill(skillId: string) {
    return this.skills.get(skillId) ?? null;
  }
}

/** PORT: real asset storage (S3/Cloud Storage/etc.) was not reachable this session. */
export class InMemoryAssetStorePort implements AssetStorePort {
  private readonly assets = new Set<string>();

  seed(ref: string, version: string): this {
    this.assets.add(`${ref}@${version}`);
    return this;
  }

  async exists(assetRef: string, version: string): Promise<boolean> {
    return this.assets.has(`${assetRef}@${version}`);
  }
}
