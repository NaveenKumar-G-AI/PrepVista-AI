import path from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { findCycles } from '../src/domain/cycles.js';

const DB_PATH = path.join(process.cwd(), 'data', 'codeforge.db');

function count(db: ReturnType<typeof openDatabase>, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

function main(): void {
  const db = openDatabase({ file: DB_PATH });

  const lines: string[] = [];
  const push = (line: string) => lines.push(line);

  push('CodeForge Role Context — Domain Validation Report');
  push(`Generated: ${new Date().toISOString()}`);
  push('');
  push('Content counts');
  push(`  Career domains: ${count(db, 'select count(*) as n from career_domain')}`);
  push(`  Role families: ${count(db, 'select count(*) as n from role_family')}`);
  push(`  Roles (total): ${count(db, 'select count(*) as n from role')}`);
  push(`  Roles (ACTIVE): ${count(db, "select count(*) as n from role where status = 'ACTIVE'")}`);
  push(`  Roles (DEPRECATED): ${count(db, "select count(*) as n from role where status = 'DEPRECATED'")}`);
  push(`  Role versions: ${count(db, 'select count(*) as n from role_version')}`);
  push(`  Competencies: ${count(db, 'select count(*) as n from competency')}`);
  push(`  Skills: ${count(db, 'select count(*) as n from skill')}`);
  push(`  Technologies: ${count(db, 'select count(*) as n from technology')}`);
  push(`  Role-competency mappings: ${count(db, 'select count(*) as n from role_competency')}`);
  push(`  Role-skill mappings: ${count(db, 'select count(*) as n from role_skill')}`);
  push(`  Role-technology mappings: ${count(db, 'select count(*) as n from role_technology')}`);
  push(`  Skill prerequisites: ${count(db, 'select count(*) as n from skill_prerequisite')}`);
  push(`  Institutions: ${count(db, 'select count(*) as n from institution')}`);
  push(`  Role variants: ${count(db, 'select count(*) as n from role_variant')}`);
  push('');
  push('Integrity checks');

  let failures = 0;
  const check = (label: string, n: number) => {
    push(`  ${label}: ${n}`);
    if (n !== 0) failures += 1;
  };

  check(
    'Broken role_family -> career_domain references',
    count(db, 'select count(*) as n from role_family f left join career_domain d on d.id = f.career_domain_id where d.id is null'),
  );
  check(
    'Broken role -> role_family references',
    count(db, 'select count(*) as n from role r left join role_family f on f.id = r.role_family_id where f.id is null'),
  );
  check(
    'Broken role_version -> role references',
    count(db, 'select count(*) as n from role_version rv left join role r on r.id = rv.role_id where r.id is null'),
  );
  check(
    'Broken competency parent references',
    count(db, 'select count(*) as n from competency c left join competency p on p.id = c.parent_competency_id where c.parent_competency_id is not null and p.id is null'),
  );
  check(
    'Broken skill competency/parent references',
    count(
      db,
      `select count(*) as n from skill s
       left join competency c on c.id = s.competency_id
       left join skill p on p.id = s.parent_skill_id
       where (s.competency_id is not null and c.id is null)
          or (s.parent_skill_id is not null and p.id is null)`,
    ),
  );
  check(
    'Broken role_competency references',
    count(
      db,
      `select count(*) as n from role_competency rc
       left join role_version rv on rv.id = rc.role_version_id
       left join competency c on c.id = rc.competency_id
       where rv.id is null or c.id is null`,
    ),
  );
  check(
    'Broken role_skill references',
    count(
      db,
      `select count(*) as n from role_skill rs
       left join role_version rv on rv.id = rs.role_version_id
       left join skill s on s.id = rs.skill_id
       where rv.id is null or s.id is null`,
    ),
  );
  check(
    'Broken role_technology references',
    count(
      db,
      `select count(*) as n from role_technology rt
       left join role_version rv on rv.id = rt.role_version_id
       left join technology t on t.id = rt.technology_id
       where rv.id is null or t.id is null`,
    ),
  );
  check(
    'Duplicate slugs (role/competency/skill/technology combined)',
    count(
      db,
      `select count(*) as n from (
         select slug from role group by slug having count(*) > 1
         union all select slug from competency group by slug having count(*) > 1
         union all select slug from skill group by slug having count(*) > 1
         union all select slug from technology group by slug having count(*) > 1
       )`,
    ),
  );
  check(
    'Duplicate role_competency mappings (role_version_id, competency_id)',
    count(db, 'select count(*) as n from (select 1 from role_competency group by role_version_id, competency_id having count(*) > 1)'),
  );
  check(
    'Duplicate role_skill mappings (role_version_id, skill_id)',
    count(db, 'select count(*) as n from (select 1 from role_skill group by role_version_id, skill_id having count(*) > 1)'),
  );
  check(
    'Duplicate role_technology mappings (role_version_id, technology_id)',
    count(db, 'select count(*) as n from (select 1 from role_technology group by role_version_id, technology_id having count(*) > 1)'),
  );
  check(
    'Role versions with zero mapped competencies',
    count(
      db,
      `select count(*) as n from role_version rv
       left join role_competency rc on rc.role_version_id = rv.id
       where rc.id is null`,
    ),
  );

  const prereqEdges = db.prepare('select skill_id, prerequisite_skill_id from skill_prerequisite').all() as Array<{
    skill_id: string;
    prerequisite_skill_id: string;
  }>;
  const cycles = findCycles(prereqEdges.map((e) => ({ skillId: e.skill_id, prerequisiteSkillId: e.prerequisite_skill_id })));
  check('Circular skill prerequisites', cycles.hasCycle ? cycles.nodesInCycles.length : 0);

  const invalidRequirements = count(
    db,
    `select count(*) as n from role_competency
     where importance not in ('CORE','IMPORTANT','SUPPORTING','OPTIONAL')
        or expected_proficiency not in ('FOUNDATION','DEVELOPING','COMPETENT','STRONG','ADVANCED')`,
  );
  check('Invalid requirement enum values', invalidRequirements);

  push('');
  push(`Result: ${failures === 0 ? 'PASS' : `FAIL (${failures} check(s) non-zero)`}`);

  const report = lines.join('\n');
  console.log(report);
  db.close();
  if (failures > 0) process.exit(1);
}

main();
