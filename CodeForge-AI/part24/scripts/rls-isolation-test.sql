-- Real RLS proof: runs as a non-superuser 'authenticated' role (superusers
-- bypass RLS entirely, so testing as postgres would prove nothing).

drop role if exists authenticated;
create role authenticated nologin;
grant usage on schema public to authenticated;
grant select, insert on all tables in schema public to authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function auth.jwt() to authenticated;

-- Seed two students and one review each.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'student-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'student-b@example.com')
on conflict (id) do nothing;

insert into code_reviews (id, student_id, base_revision_id, target_revision_id, change_classification, analysis_version, rules_version)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  gen_random_uuid(), gen_random_uuid(), 'BUG_FIX', '1.0.0', '1.0.0'
)
on conflict (id) do nothing;

insert into review_findings (id, review_id, category, severity, priority, confidence, title, description, why_it_matters, fingerprint)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'CORRECTNESS', 'BLOCKER', 'MUST_FIX', 'HIGH',
  'student A''s private finding', 'desc', 'matters', 'fp-student-a'
)
on conflict (id) do nothing;

\echo '--- as student A (owner): should see 1 review ---'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);
select count(*) as visible_reviews from code_reviews;
select count(*) as visible_findings from review_findings;
reset role;

\echo '--- as student B (not the owner): should see 0 reviews and 0 findings ---'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', false);
select count(*) as visible_reviews from code_reviews;
select count(*) as visible_findings from review_findings;

\echo '--- student B directly targeting student A''s review id by primary key: still 0 rows, not an error, not leaked ---'
select * from code_reviews where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
reset role;

\echo '--- as student B: attempt to INSERT a reviewer-authored message (should be rejected by policy) ---'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', false);
insert into review_messages (finding_id, author, content) values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'reviewer', 'fake reviewer message');
reset role;
