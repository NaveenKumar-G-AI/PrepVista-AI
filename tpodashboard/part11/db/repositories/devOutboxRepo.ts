import { db, genId } from '../../src/lib/db';

export function insertDevOutboxMessage(to: string, subject: string, body: string): void {
  db.prepare('INSERT INTO dev_outbox_messages (id, to_address, subject, body) VALUES (?, ?, ?, ?)')
    .run(genId(), to, subject, body);
}

export function listDevOutboxMessages(limit = 50) {
  const rows = db.prepare('SELECT * FROM dev_outbox_messages ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({ id: r.id, to: r.to_address, subject: r.subject, body: r.body, createdAt: r.created_at }));
}
