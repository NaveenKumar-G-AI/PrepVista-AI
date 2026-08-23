# API Summary

Full, machine-accurate spec: `docs/openapi.json` (exported directly
from the running app — not hand-maintained) or `/docs` on a running
server for interactive Swagger UI.

All endpoints except `/health`, `/auth/login` require
`Authorization: Bearer <token>`. All tenant-scoped endpoints derive the
institution from the authenticated user — there is no `institution_id`
parameter anywhere for a client to pass.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | Rate-limited (10/5min per email by default) |
| POST | `/auth/logout` | Stateless — client discards the token |
| GET | `/auth/me` | Current user, never returns the password hash |

## Reference data
| Method | Path |
|---|---|
| GET | `/departments` |
| GET | `/programs` |
| GET | `/batches` |
| GET | `/seasons` |

## Students
| Method | Path | Notes |
|---|---|---|
| GET | `/students` | `page`, `page_size` (≤200), `search`, `department_id`, `batch_id`, `placement_status`, `status`, `sort_by`, `sort_dir` |
| POST | `/students` | 409 on duplicate `register_number` within the institution |
| GET | `/students/{id}` | 404 (not 403) if it belongs to another institution |
| PATCH | `/students/{id}` | Partial update — only sent fields change |

## Academic / Profile / Skills / Activity
| Method | Path |
|---|---|
| GET, PUT | `/students/{id}/academic` |
| GET, PATCH | `/students/{id}/profile` |
| GET | `/students/{id}/skills` |
| GET | `/students/{id}/activity` |

## Import
| Method | Path | Notes |
|---|---|---|
| POST | `/students/import/preview` | `multipart/form-data`, field name `file`. Returns suggested column mapping. |
| POST | `/students/import/validate` | Confirmed mapping + target batch/department/program. Returns per-row issues and duplicate candidates. |
| POST | `/students/import/commit` | Transactional. Returns imported/updated/ignored/attention counts. |

## Data quality / Dashboard
| Method | Path |
|---|---|
| GET | `/data-quality/students` |
| GET | `/dashboard/student-overview` |
| GET | `/dashboard/readiness-overview` |

## Companies (Part 2)
| Method | Path | Notes |
|---|---|---|
| GET | `/companies` | `search`, `pipeline_stage`, paginated |
| POST | `/companies` | 409 on duplicate name within the institution |
| GET | `/companies/{id}` | Includes contacts |
| PATCH | `/companies/{id}` | |
| POST | `/companies/{id}/contacts` | Add an HR contact |

## Drives (Part 2)
| Method | Path | Notes |
|---|---|---|
| POST | `/drives/eligibility-check` | **The eligibility engine.** No drive needs to exist — preview eligible/not-eligible counts (with CGPA/backlog/department breakdown) for any hypothetical criteria against real student records |
| GET | `/drives` | Includes `applicant_count` per drive |
| POST | `/drives` | |
| GET, PATCH | `/drives/{id}` | |
| GET | `/drives/{id}/eligible-students` | Real student IDs matching this drive's stored criteria |
| POST, GET | `/drives/{id}/rounds` | Interview round definitions |

## Applications & Interviews (Part 2)
| Method | Path | Notes |
|---|---|---|
| POST | `/applications` | 409 if already applied to this drive |
| PATCH | `/applications/{id}/stage` | Validated state machine — invalid jumps return 409 |
| GET | `/drives/{id}/applications` | |
| GET | `/drives/{id}/funnel` | Cumulative stage counts (Eligible/Applied/Shortlisted/Interviewing/Selected) |
| POST | `/interview-schedules` | |
| PATCH | `/interview-schedules/{id}` | Record status/result/feedback |
| GET | `/interview-schedules/today` | |

## Offers (Part 2)
| Method | Path | Notes |
|---|---|---|
| GET | `/offers` | Paginated, filterable by status |
| PATCH | `/offers/{id}` | Accept, decline, or confirm joining — **confirming joining is what flips the student's `placement_status` to `PLACED`** |
| GET | `/offers/expiring?within_hours=48` | |

## Error shape (every handled error, not just some)

```json
{
  "error_code": "NOT_FOUND",
  "message": "Student not found.",
  "details": {}
}
```

`error_code` values in use: `VALIDATION_ERROR` (422), `UNAUTHORIZED`
(401), `PERMISSION_DENIED` (403), `NOT_FOUND` (404), `CONFLICT` (409),
`RATE_LIMITED` (429), `SERVER_ERROR` (500).

## Example: login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tpo.head@demo-lit.edu","password":"DemoPass123!"}'
# -> {"access_token": "...", "token_type": "bearer"}
```

## Example: paginated student search

```bash
curl "http://localhost:8000/students?search=Sharma&page=1&page_size=25" \
  -H "Authorization: Bearer $TOKEN"
```
