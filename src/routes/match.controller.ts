import { Router, Request, Response } from "express";
import { verifyToken } from "../utils/jwt.util";

const router = Router();

// 매칭 API (JWT에서 유저 정보 추출)
router.post("/join", (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    const user = verifyToken(token);
    const { gameName } = req.body;

    // DB 로직 or 매칭 로직 (여기서는 단순 응답 예시)
    res.json({ status: "waiting", user, gameName });
  } catch (err: any) {
    res.status(401).json({ message: err.message });
  }
});

export default router;
