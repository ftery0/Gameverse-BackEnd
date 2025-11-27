"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const UserRanking_1 = __importDefault(require("../models/UserRanking"));
const router = express_1.default.Router();
// Get Leaderboard (Top 100)
router.get('/leaderboard/:gameType', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameType } = req.params;
        const leaderboard = yield UserRanking_1.default.find({ gameType })
            .sort({ points: -1 }) // Sort by points descending
            .limit(100)
            .select('userName tier tierLevel points wins losses');
        res.json(leaderboard);
    }
    catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}));
// Get User Ranking
router.get('/user/:userId/:gameType', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, gameType } = req.params;
        const ranking = yield UserRanking_1.default.findOne({ userId, gameType });
        if (!ranking) {
            return res.status(404).json({ message: 'Ranking not found' });
        }
        res.json(ranking);
    }
    catch (error) {
        console.error('Error fetching user ranking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}));
exports.default = router;
