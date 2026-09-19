"""Private, deterministic exports of an existing readiness snapshot.

This is a presentation format, not a new assessment or a public verification
receipt. Deliberate allowlists keep future internal fields out of downloads.
"""
from copy import deepcopy
from hashlib import sha256
from html import escape
import json
from uuid import UUID

REPORT_VERSION = 'readiness-report-v1'
NOTICE = ('Saved practice summary, not certification, hiring probability or proof of '
          'unaided performance. This file is a private copy you control. Account '
          'deletion or sharing withdrawal cannot recall copies you download or send. '
          'Processing health and evidence freshness describe the saved snapshot, '
          'not current service health. A checksum detects content changes; it does '
          'not authenticate the author or verify assessment results.')


def report_document(snapshot_id, saved):
    if saved.get('schema_version') != 1:
        raise ValueError('Unsupported readiness snapshot version')
    summary = {key: deepcopy(saved[key]) for key in (
        'schema_version', 'policy_version', 'role', 'role_label', 'role_policy_status',
        'overall_state', 'data_health', 'as_of', 'note') if key in saved}
    summary['rows'] = []
    for row in saved['rows']:
        item = {key: deepcopy(row[key]) for key in (
            'key', 'label', 'state', 'confidence', 'freshness', 'coverage', 'gap')}
        item['sources'] = [{key: deepcopy(source[key]) for key in (
            'id', 'module', 'authority', 'at', 'time_authority', 'suite_id', 'suite_sha256', 'qualification_id') if key in source}
            for source in row['sources']]
        summary['rows'].append(item)
    if 'evidence_window' in saved:
        summary['evidence_window'] = {key: saved['evidence_window'][key] for key in (
            'limit', 'included', 'older_evidence_excluded') if key in saved['evidence_window']}
    document = {'report_version': REPORT_VERSION, 'snapshot_id': str(UUID(str(snapshot_id))),
                'notice': NOTICE, 'summary': summary}
    # Canonical UTF-8 JSON of the document without content_sha256.
    canonical = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return {**document, 'content_sha256': sha256(canonical.encode('utf-8')).hexdigest()}


def render_html(document):
    def text(value):
        return escape(str(value), quote=True)

    summary = document['summary']
    sections = []
    for row in summary['rows']:
        sources = ''.join('<li>' + text(source['module']) + ' / ' + text(source['authority'])
            + ' / ' + text(source['at']) + ' / ' + text(source.get('time_authority', 'SERVER_RECEIPT_TIME'))
            + '<br>Source reference: ' + text(source['id'])
            + ('<br>Suite: ' + text(source['suite_id']) + ' / ' + text(source.get('suite_sha256', 'UNKNOWN'))
               + '<br>Runner qualification reference: ' + text(source.get('qualification_id', 'UNKNOWN')) if source.get('suite_id') else '')
            + '</li>' for source in row['sources'])
        sections.append('<section><h2>' + text(row['label']) + '</h2><p>' + text(row['state'])
            + ' · ' + text(row['freshness']) + '</p><p>Supporting activities: ' + text(row['coverage'])
            + ' · Confidence: ' + text(row['confidence']) + '</p><p>' + text(row['gap'])
            + '</p><ul>' + sources + '</ul></section>')
    window = summary.get('evidence_window', {})
    window_note = ('<p>Evidence window: ' + text(window.get('included', 'unknown'))
        + ' observations, limit ' + text(window.get('limit', 'unknown'))
        + '. Older evidence excluded: ' + text(window.get('older_evidence_excluded', 'unknown')) + '.</p>') if window else ''
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'
        '<title>PrepVista saved readiness report</title><style>'
        'body{font:16px/1.6 system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;color:#172033;overflow-wrap:anywhere}'
        'section{border-top:1px solid #9ca3af;padding:1rem 0;break-inside:avoid}h1,h2{line-height:1.2}'
        'footer{font-size:0.85rem}@media print{body{margin:0;max-width:none}}'
        '</style></head><body><main><h1>PrepVista saved readiness report</h1><p>'
        + text(summary['role_label']) + ' · ' + text(summary['overall_state']) + '</p><p>As of '
        + text(summary['as_of']) + ' · Saved processing health: ' + text(summary['data_health'])
        + '</p><p>' + text(summary['note']) + '</p><p>' + text(document['notice']) + '</p>'
        + window_note + ''.join(sections) + '</main><footer><p>Snapshot: ' + text(document['snapshot_id'])
        + '<br>Assessment policy: ' + text(summary['policy_version'])
        + '<br>Role policy status: ' + text(summary.get('role_policy_status', 'UNKNOWN'))
        + '<br>Report format: ' + text(document['report_version'])
        + '<br>Canonical document SHA-256: ' + text(document['content_sha256']) + '</p></footer></body></html>')


def export_snapshot(snapshot_id, saved, format):
    document = report_document(snapshot_id, saved)
    if format not in ('json', 'html'):
        raise ValueError('Unsupported report format')
    return {'filename': f'prepvista-readiness-{document["snapshot_id"]}.{format}',
            'media_type': 'application/json' if format == 'json' else 'text/html',
            'content': json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) if format == 'json' else render_html(document)}
