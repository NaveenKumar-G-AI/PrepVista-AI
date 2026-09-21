// Augments Express's Request type with the fields our auth middleware attaches.
import 'express';

declare global {
  namespace Express {
    interface Request {
      studentId?: string;
    }
  }
}
