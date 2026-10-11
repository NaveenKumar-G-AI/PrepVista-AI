export type AssistanceProvenance = 'independent' | 'hint_assisted' | 'answer_guided' | 'unknown';
export function provenanceLabel(value?: string | null): string {
  return ({ independent: 'Independent Attempt', hint_assisted: 'Hint Assisted', answer_guided: 'Answer Guided' } as Record<string, string>)[value || ''] || 'Unknown';
}
export type ViewedEvent = { id: string; instance: string; kind: 'hint' | 'answer_guidance' };

/** Called only after content is rendered. Submission awaits every visible view. */
export class AssistanceViews {
  private entries = new Map<string, { event: ViewedEvent; acknowledged: boolean; pending?: Promise<void> }>();
  private restored = new Map<string, AssistanceProvenance>();
  restore(instance: string, value?: string | null): void {
    const provenance = value === 'independent' || value === 'hint_assisted' || value === 'answer_guided' ? value : 'unknown';
    this.restored.set(instance, provenance);
  }
  constructor(private acknowledge: (event: ViewedEvent) => Promise<unknown>) {}
  show(event: ViewedEvent): Promise<void> {
    let entry = this.entries.get(event.id);
    if (!entry) {
      entry = { event, acknowledged: false };
      this.entries.set(event.id, entry);
    }
    if (entry.acknowledged) return Promise.resolve();
    if (!entry.pending) {
      const current = entry;
      current.pending = this.acknowledge(event).then(() => { current.acknowledged = true; })
        .finally(() => { current.pending = undefined; });
    }
    return entry.pending!;
  }
  async settle(instance?: string | null): Promise<void> {
    await Promise.all([...this.entries.values()].filter(entry => entry.event.instance === instance)
      .map(entry => this.show(entry.event)));
  }
  provenance(instance: string): AssistanceProvenance {
    const entries = [...this.entries.values()].filter(entry => entry.event.instance === instance);
    const restored = this.restored.get(instance);
    if (restored === 'answer_guided' || entries.some(entry => entry.acknowledged && entry.event.kind === 'answer_guidance')) return 'answer_guided';
    if (restored === 'unknown') return 'unknown';
    if (restored === 'hint_assisted' || entries.some(entry => entry.acknowledged && entry.event.kind === 'hint')) return 'hint_assisted';
    return entries.length ? 'unknown' : restored || 'independent';
  }
}
