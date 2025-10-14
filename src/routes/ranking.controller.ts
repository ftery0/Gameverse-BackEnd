import { Router, Request, Response } from "express";
import Ranking from "../models/Ranking";

const router = Router();

// 랭킹 저장
router.post("/", async (req: Request, res: Response) => {
  try {
    const { gameName, userName, score } = req.body;
    const newRanking = new Ranking({ gameName, userName, score });
    const saved = await newRanking.save();
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// 랭킹 조회
router.get("/", async (req: Request, res: Response) => {
  const { gameName } = req.query;
  const query = gameName ? { gameName } : {};
  const rankings = await Ranking.find(query).sort({ score: -1, date: 1 });
  res.json(rankings);
});

// 랭킹 삭제
router.delete("/:id", async (req: Request, res: Response) => {
  const deleted = await Ranking.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
