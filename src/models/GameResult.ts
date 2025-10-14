import mongoose, { Schema, Document } from "mongoose";

interface Player {
  userId: mongoose.Types.ObjectId;
  userName: string;
}

interface CapturedPiece {
  userId: mongoose.Types.ObjectId;
  piece: string;
}

export interface IGameResult extends Document {
  gameName: string;
  players: Player[];
  winner?: string;
  loser?: string;
  draw?: boolean;
  capturedPieces: CapturedPiece[];
  endTime: Date;
}

const gameResultSchema = new Schema<IGameResult>({
  gameName: { type: String, required: true },
  players: [
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      userName: { type: String, required: true },
    },
  ],
  winner: { type: String },
  loser: { type: String },
  draw: { type: Boolean, default: false },
  capturedPieces: [
    {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      piece: { type: String },
    },
  ],
  endTime: { type: Date, default: Date.now },
});

export default mongoose.model<IGameResult>("GameResult", gameResultSchema);
