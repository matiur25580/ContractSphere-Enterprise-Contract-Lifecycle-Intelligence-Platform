import type { UserRole } from "../users/user.model.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; tenantId: string; role: UserRole };
    }
  }
}
export {};
