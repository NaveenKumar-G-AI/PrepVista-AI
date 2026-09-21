import fs from 'fs';
import path from 'path';

// ----------------------------------------------------------------------------
// Zero-dependency, zero-config persistence for the prototype. Every repository
// in repositories.ts talks to this through the same small interface, so
// swapping in a real database later (once DATABASE_URL is filled in — see
// .env.example) means replacing this one file, not the services that use it.
// ----------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

type Collections = Record<string, unknown[]>;

class JsonStore {
  private data: Collections = {};

  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      } catch {
        this.data = {};
      }
    } else {
      this.flush();
    }
  }

  collection<T>(name: string): T[] {
    if (!this.data[name]) this.data[name] = [];
    return this.data[name] as T[];
  }

  setCollection<T>(name: string, items: T[]) {
    this.data[name] = items as unknown[];
    this.flush();
  }

  private flush() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
  }
}

export const jsonStore = new JsonStore();
