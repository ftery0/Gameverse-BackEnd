import mongoose from "mongoose";

export interface IRanking extends mongoose.Document {
  gameName: string;
  userName: string;
  score: number;
  date: Date;
}

const RankingSchema = new mongoose.Schema<IRanking>({
  gameName: { type: String, required: true },
  userName: { type: String, required: true },
  score: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});

export default mongoose.model<IRanking>("Ranking", RankingSchema);
