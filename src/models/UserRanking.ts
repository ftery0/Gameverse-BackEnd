import mongoose, { Document, Schema } from 'mongoose';

export interface IGameHistory {
  result: 'win' | 'loss' | 'draw';
  opponentName: string;
  moves: number;
  playTimeSeconds: number;
  date: Date;
}

export interface IUserRanking extends Document {
  userId: string;
  userName: string;
  gameType: string; // 'omok', 'chess'
  tier: 'Iron' | 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Champion' | 'Unranked';
  tierLevel: number; // 1-5 (5 is lowest)
  points: number;
  placementMatchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  history: IGameHistory[];
}

const GameHistorySchema = new Schema<IGameHistory>({
  result: { type: String, enum: ['win', 'loss', 'draw'], required: true },
  opponentName: { type: String, required: true },
  moves: { type: Number, required: true },
  playTimeSeconds: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});

const UserRankingSchema = new Schema<IUserRanking>({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  gameType: { type: String, required: true },
  tier: { 
    type: String, 
    enum: ['Iron', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Champion', 'Unranked'], 
    default: 'Unranked' 
  },
  tierLevel: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  placementMatchesPlayed: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  history: [GameHistorySchema],
});

// Compound index for efficient leaderboard queries
UserRankingSchema.index({ gameType: 1, points: -1 });
UserRankingSchema.index({ userId: 1, gameType: 1 }, { unique: true });

export default mongoose.model<IUserRanking>('UserRanking', UserRankingSchema);
