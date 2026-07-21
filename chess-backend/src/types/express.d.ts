import { JwtPayload } from "../middleware/authMiddleware";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      userId?: string;
    }
  }
}
