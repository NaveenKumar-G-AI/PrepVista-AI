import { PrismaClient, Role, DifficultyLevel, AssessmentType, EvidenceConfidence } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create a default college
  const college = await prisma.college.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Demo University',
      domain: 'demo.edu',
      settings: { allowSelfRegistration: true },
    },
  });
  console.log('✅ College created:', college.name);

  // Create Super Admin
  const superAdminPassword = await bcrypt.hash('admin123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@prepvista.com' },
    update: {},
    create: {
      email: 'admin@prepvista.com',
      passwordHash: superAdminPassword,
      name: 'Super Admin',
      role: Role.SUPER_ADMIN,
      collegeId: null,
    },
  });
  console.log('✅ Super Admin created:', superAdmin.email);

  // Create College Admin
  const collegeAdminPassword = await bcrypt.hash('college123', 12);
  const collegeAdmin = await prisma.user.upsert({
    where: { email: 'college@demo.edu' },
    update: {},
    create: {
      email: 'college@demo.edu',
      passwordHash: collegeAdminPassword,
      name: 'College Admin',
      role: Role.COLLEGE_ADMIN,
      collegeId: college.id,
    },
  });
  console.log('✅ College Admin created:', collegeAdmin.email);

  // Create TPO
  const tpoPassword = await bcrypt.hash('tpo123', 12);
  const tpo = await prisma.user.upsert({
    where: { email: 'tpo@demo.edu' },
    update: {},
    create: {
      email: 'tpo@demo.edu',
      passwordHash: tpoPassword,
      name: 'TPO Officer',
      role: Role.TPO,
      collegeId: college.id,
    },
  });
  await prisma.tpoProfile.upsert({
    where: { userId: tpo.id },
    update: {},
    create: {
      userId: tpo.id,
      collegeId: college.id,
      department: 'Computer Science',
      title: 'Training & Placement Officer',
    },
  });
  console.log('✅ TPO created:', tpo.email);

  // Create Student
  const studentPassword = await bcrypt.hash('student123', 12);
  const studentUser = await prisma.user.upsert({
    where: { email: 'student@demo.edu' },
    update: {},
    create: {
      email: 'student@demo.edu',
      passwordHash: studentPassword,
      name: 'Alex Student',
      role: Role.STUDENT,
      collegeId: college.id,
    },
  });
  const student = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      collegeId: college.id,
      studentId: 'CS2024001',
      targetRole: 'Software Engineer',
      targetCompanies: ['Google', 'Microsoft', 'Amazon'],
      skills: ['JavaScript', 'React', 'Node.js', 'Python', 'SQL'],
      experienceLevel: 'FRESHER',
      department: 'Computer Science',
      enrollmentYear: 2021,
      graduationYear: 2025,
    },
  });
  console.log('✅ Student created:', studentUser.email);

  // Seed Skills Hierarchy
  const skills = [
    // Programming Languages
    { name: 'JavaScript', category: 'Programming Languages', parent: null },
    { name: 'TypeScript', category: 'Programming Languages', parent: 'JavaScript' },
    { name: 'React', category: 'Programming Languages', parent: 'JavaScript' },
    { name: 'Node.js', category: 'Programming Languages', parent: 'JavaScript' },
    { name: 'Python', category: 'Programming Languages', parent: null },
    { name: 'Django', category: 'Programming Languages', parent: 'Python' },
    { name: 'FastAPI', category: 'Programming Languages', parent: 'Python' },
    { name: 'Java', category: 'Programming Languages', parent: null },
    { name: 'Spring Boot', category: 'Programming Languages', parent: 'Java' },
    { name: 'C++', category: 'Programming Languages', parent: null },
    { name: 'Go', category: 'Programming Languages', parent: null },
    { name: 'Rust', category: 'Programming Languages', parent: null },

    // Data Structures & Algorithms
    { name: 'Arrays & Strings', category: 'Data Structures & Algorithms', parent: null },
    { name: 'Linked Lists', category: 'Data Structures & Algorithms', parent: null },
    { name: 'Trees & Graphs', category: 'Data Structures & Algorithms', parent: null },
    { name: 'Dynamic Programming', category: 'Data Structures & Algorithms', parent: null },
    { name: 'Sorting & Searching', category: 'Data Structures & Algorithms', parent: null },
    { name: 'Time Complexity Analysis', category: 'Data Structures & Algorithms', parent: null },
    { name: 'Space Complexity Analysis', category: 'Data Structures & Algorithms', parent: null },

    // System Design
    { name: 'Scalability', category: 'System Design', parent: null },
    { name: 'Database Design', category: 'System Design', parent: null },
    { name: 'Caching Strategies', category: 'System Design', parent: null },
    { name: 'Load Balancing', category: 'System Design', parent: null },
    { name: 'Microservices', category: 'System Design', parent: null },
    { name: 'API Design', category: 'System Design', parent: null },

    // Communication
    { name: 'Technical Explanation', category: 'Communication', parent: null },
    { name: 'Problem Articulation', category: 'Communication', parent: null },
    { name: 'Active Listening', category: 'Communication', parent: null },
    { name: 'Structured Thinking', category: 'Communication', parent: null },
    { name: 'Clarity & Conciseness', category: 'Communication', parent: null },

    // Behavioral
    { name: 'Leadership', category: 'Behavioral', parent: null },
    { name: 'Teamwork', category: 'Behavioral', parent: null },
    { name: 'Conflict Resolution', category: 'Behavioral', parent: null },
    { name: 'Adaptability', category: 'Behavioral', parent: null },
    { name: 'Ownership', category: 'Behavioral', parent: null },
    { name: 'Growth Mindset', category: 'Behavioral', parent: null },

    // Problem Solving
    { name: 'Problem Decomposition', category: 'Problem Solving', parent: null },
    { name: 'Edge Case Thinking', category: 'Problem Solving', parent: null },
    { name: 'Optimization', category: 'Problem Solving', parent: null },
    { name: 'Debugging Approach', category: 'Problem Solving', parent: null },
  ];

  // First create parent skills
  const skillMap = new Map<string, string>();
  for (const skill of skills) {
    if (!skill.parent) {
      const created = await prisma.skill.upsert({
        where: { name_category: { name: skill.name, category: skill.category } },
        update: {},
        create: {
          name: skill.name,
          category: skill.category,
          description: `${skill.name} - ${skill.category}`,
        },
      });
      skillMap.set(skill.name, created.id);
    }
  }

  // Then create child skills
  for (const skill of skills) {
    if (skill.parent) {
      const parentId = skillMap.get(skill.parent);
      if (parentId) {
        await prisma.skill.upsert({
          where: { name_category: { name: skill.name, category: skill.category } },
          update: {},
          create: {
            name: skill.name,
            category: skill.category,
            parentId,
            description: `${skill.name} - ${skill.category}`,
          },
        });
      }
    }
  }
  console.log('✅ Skills hierarchy seeded');

  // Create Feature Flags
  const flags = [
    { key: 'intelligence_engine', name: 'Intelligence Engine', stage: 'GENERAL_AVAILABILITY', isEnabled: true, targetRoles: [Role.STUDENT, Role.TPO, Role.COLLEGE_ADMIN] },
    { key: 'adaptive_difficulty', name: 'Adaptive Difficulty', stage: 'BETA', isEnabled: true, targetRoles: [Role.STUDENT] },
    { key: 'tpo_analytics', name: 'TPO Analytics Dashboard', stage: 'COLLEGE_PILOT', isEnabled: true, targetRoles: [Role.TPO, Role.COLLEGE_ADMIN] },
    { key: 'skill_graph_visualization', name: 'Skill Graph Visualization', stage: 'BETA', isEnabled: true, targetRoles: [Role.STUDENT] },
  ];

  for (const flag of flags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: flag,
    });
  }
  console.log('✅ Feature flags seeded');

  console.log('🎉 Seeding complete!');
  console.log('\n📋 Test Accounts:');
  console.log('  Super Admin:  admin@prepvista.com    / admin123');
  console.log('  College Admin: college@demo.edu       / college123');
  console.log('  TPO:          tpo@demo.edu           / tpo123');
  console.log('  Student:      student@demo.edu       / student123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });