import type { Validator } from "../contracts/validator.js";
import type { ValidatorCategory } from "../contracts/types.js";

/**
 * spec §17/§18: validators are registered, not hard-coded into one massive
 * service, and the engine must always be able to answer "which validators
 * exist, in what category, at what version, with what dependencies."
 */
export class ValidatorRegistry {
  private readonly validators = new Map<string, Validator>();

  register(validator: Validator): void {
    if (this.validators.has(validator.name)) {
      throw new Error(`Validator "${validator.name}" is already registered — registry keys must be unique.`);
    }
    for (const dep of validator.dependsOn) {
      if (dep === validator.name) {
        throw new Error(`Validator "${validator.name}" cannot depend on itself.`);
      }
    }
    this.validators.set(validator.name, validator);
  }

  get(name: string): Validator | undefined {
    return this.validators.get(name);
  }

  has(name: string): boolean {
    return this.validators.has(name);
  }

  all(): Validator[] {
    return [...this.validators.values()];
  }

  byCategory(category: ValidatorCategory): Validator[] {
    return this.all().filter((v) => v.category === category);
  }

  names(): string[] {
    return [...this.validators.keys()];
  }

  /** Fails loudly at boot time if any validator declares a dependency that was never
   *  registered — better than discovering it mid-pipeline as a silent SKIP. */
  assertDependenciesResolvable(): void {
    for (const v of this.all()) {
      for (const dep of v.dependsOn) {
        if (!this.validators.has(dep)) {
          throw new Error(`Validator "${v.name}" depends on unregistered validator "${dep}".`);
        }
      }
    }
  }
}
