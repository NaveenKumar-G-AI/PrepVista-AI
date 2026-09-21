import fs from 'node:fs';
import path from 'node:path';
import { db } from './client';

const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

db.exec(schema);

// eslint-disable-next-line no-console
console.log(`[migrate] schema applied to ${db.name}`);
