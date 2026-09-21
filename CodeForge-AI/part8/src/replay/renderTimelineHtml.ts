import { TimelineEntry } from './replayTimeline';
import { escapeHtml } from '../shared/htmlUtils';

export function renderTimelineHtml(entries: TimelineEntry[]): string {
  const rows = entries.map(e => `
    <li class="cf-timeline-entry">
      <span class="cf-timeline-offset">${escapeHtml(e.offsetLabel)}</span>
      <span class="cf-timeline-label">${escapeHtml(e.label)}</span>
    </li>`).join('');

  return `<section class="cf-report-section">
  <h2>Interview replay</h2>
  <ol class="cf-timeline-list">${rows}</ol>
</section>`;
}
