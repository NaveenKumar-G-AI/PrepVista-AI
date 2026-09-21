import "dotenv/config";
import { migrate } from "../src/db/migrate";
import { seedFixtureData } from "../src/db/seed-data";

migrate();
seedFixtureData();
// eslint-disable-next-line no-console
console.log("Seeded fixture data: org_demo (Skyline Institute of Technology), org_other (Northgate Coding Academy).");
// eslint-disable-next-line no-console
console.log("Students: student_golden (Kavya Iyer), student_sparse (Rahul Verma), student_other (Emma Clarke).");
