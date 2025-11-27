import express from 'express';
import UserRanking from '../models/UserRanking';

const router = express.Router();

// Get Leaderboard (Top 100)
router.get('/leaderboard/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const leaderboard = await UserRanking.find({ gameType })
      .sort({ points: -1 }) // Sort by points descending
      .limit(100)
      .select('userName tier tierLevel points wins losses');

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get User Ranking
router.get('/user/:userId/:gameType', async (req, res) => {
  try {
    const { userId, gameType } = req.params;
    const ranking = await UserRanking.findOne({ userId, gameType });

    if (!ranking) {
      return res.status(404).json({ message: 'Ranking not found' });
    }

    res.json(ranking);
  } catch (error) {
    console.error('Error fetching user ranking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
