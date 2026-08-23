import request from 'supertest';
import { createApp } from '../../src/app';

export const app = createApp();

export async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}
