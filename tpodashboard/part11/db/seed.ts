import 'dotenv/config';
import { runMigrations } from '../src/lib/db';
import { bootstrapInstitution } from '../services/bootstrap/bootstrapInstitution';
import { createDepartment, setDepartmentActive } from '../db/repositories/departmentRepo';
import { createUser } from '../db/repositories/userRepo';
import { hashPassword } from '../src/lib/crypto';

const DEMO_PASSWORD = 'DemoPass!2026';

async function main() {
  runMigrations();

  console.log('Seeding demo institution...');

  const { institution, roleByName } = await bootstrapInstitution({
    institutionName: 'Meridian College of Engineering',
    superAdminEmail: 'super.admin@meridian.demo',
    superAdminName: 'Asha Rao',
    superAdminPassword: DEMO_PASSWORD,
  });

  const cse = createDepartment({ institutionId: institution.id, name: 'Computer Science & Engineering', code: 'CSE' });
  const ece = createDepartment({ institutionId: institution.id, name: 'Electronics & Communication', code: 'ECE' });
  createDepartment({ institutionId: institution.id, name: 'Mechanical Engineering', code: 'MECH' });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const demoUsers: { email: string; name: string; role: string; departmentId: string | null }[] = [
    { email: 'tpo.head@meridian.demo', name: 'Vikram Nair', role: 'TPO_HEAD', departmentId: null },
    { email: 'placement.officer@meridian.demo', name: 'Priya Menon', role: 'PLACEMENT_OFFICER', departmentId: null },
    { email: 'coordinator.cse@meridian.demo', name: 'Ramesh Iyer', role: 'DEPARTMENT_COORDINATOR', departmentId: cse.id },
    { email: 'faculty.cse@meridian.demo', name: 'Divya Krishnan', role: 'FACULTY', departmentId: cse.id },
    { email: 'management@meridian.demo', name: 'Dr. Suresh Babu', role: 'MANAGEMENT', departmentId: null },
    { email: 'student.demo@meridian.demo', name: 'Ananya Sharma', role: 'STUDENT', departmentId: cse.id },
    // Kept ACTIVE and assigned to ECE on purpose, then ECE is archived below —
    // a real, discoverable Data Quality issue rather than a fabricated count.
    { email: 'coordinator.ece@meridian.demo', name: 'Kavya Pillai', role: 'DEPARTMENT_COORDINATOR', departmentId: ece.id },
  ];

  for (const u of demoUsers) {
    createUser({
      institutionId: institution.id, email: u.email, name: u.name,
      roleId: roleByName[u.role], departmentId: u.departmentId, passwordHash, status: 'ACTIVE',
    });
  }

  setDepartmentActive(ece.id, false);

  console.log('Done.\n');
  console.log(`Institution: ${institution.name} (${institution.id})`);
  console.log(`All demo accounts share the password: ${DEMO_PASSWORD}`);
  console.log('Accounts:');
  console.log('  super.admin@meridian.demo        SUPER_ADMIN');
  for (const u of demoUsers) console.log(`  ${u.email.padEnd(32)}  ${u.role}`);
  console.log('\n⚠️  Demo credentials only. Rotate or remove before any real deployment.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
