"""Server-owned, versioned JavaScript check suites. Never imported by the browser.

These authored examples exercise covered behavior, not authorship, independence,
complexity or role readiness. Changing a suite requires a new suite version.
"""
from copy import deepcopy
from app.services.coding_contracts import digest


def _case(index, args, expected):
    return {'id': f'case-{index}', 'args': args, 'expected': expected}


SUITES = {
    ('debug-duplicate-feature-vectors', 1, 'javascript'): {
        'suite_id': 'dedupe-vectors-server-v1', 'entry': 'dedupe_vectors',
        'tests': [_case(i, [args], expected) for i, (args, expected) in enumerate([
            ([], []), ([[]], [[]]), ([[], []], [[]]),
            ([[3, 9], [3, 9]], [[3, 9]]),
            ([[1, 2], [2, 1], [1, 2]], [[1, 2], [2, 1]]),
            ([[-4, 0], [0, -4], [-4, 0], [8]], [[-4, 0], [0, -4], [8]]),
            ([[1], [1, 0], [1], [1, 0, 0]], [[1], [1, 0], [1, 0, 0]]),
            ([[i, i + 1] for i in range(40)] * 2, [[i, i + 1] for i in range(40)]),
        ])],
    },
    ('search-insert-position', 1, 'javascript'): {
        'suite_id': 'search-insert-server-v1', 'entry': 'search_insert_position',
        'tests': [_case(i, args, expected) for i, (args, expected) in enumerate([
            (([], 4), 0), (([2], 1), 0), (([2], 2), 0), (([2], 3), 1),
            (([1, 3, 3, 3, 9], 3), 1), (([-8, -3, 0, 4], -5), 1),
            (([-8, -3, 0, 4], 7), 4), (([1, 4, 8, 20], 5), 2),
            ((list(range(0, 200, 2)), 101), 51),
        ])],
    },
}


def suite_for(content):
    suite = SUITES.get((content.get('challenge_id'), content.get('challenge_version'), content.get('language')))
    if suite is None:
        return None
    # JSON normalization avoids tuple/list differences in the wire fingerprint.
    import json
    result = json.loads(json.dumps(deepcopy(suite)))
    result['suite_sha256'] = digest(result)
    return result
