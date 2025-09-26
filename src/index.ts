import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken'; 

dotenv.config();

const app = express();
const server = http.createServer(app); 
const io = new SocketIOServer(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 8080;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'super-secret-key'; 

app.use(express.json());
app.use(cors());

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        console.log('Authentication error: No token provided');
        return next(new Error('Authentication error'));
    }

    try {
        const decoded = jwt.verify(token, NEXTAUTH_SECRET) as { id: string; name: string; email: string; }; 
        socket.data.user = decoded;
        console.log(`User authenticated: ${decoded.name} (${decoded.id})`);
        next();
    } catch (err) {
        console.error('Authentication error: Invalid token', err);
        next(new Error('Authentication error'));
    }
});

// MongoDB 연결
mongoose.connect(process.env.MONGO_URI as string)
.then(() => console.log('MongoDB connected'))
.catch((err: Error) => console.error(err));

interface IRanking extends mongoose.Document {
    gameName: string;
    userName: string;
    score: number;
    date: Date;
}

// Ranking Schema
const RankingSchema = new mongoose.Schema<IRanking>({
    gameName: {
        type: String,
        required: true,
    },
    userName: {
        type: String,
        required: true,
    },
    score: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
});

const Ranking = mongoose.model<IRanking>('Ranking', RankingSchema);

// GameResult Schema
interface IGameResult extends mongoose.Document {
    gameName: string;
    players: { userId: mongoose.Types.ObjectId; userName: string; }[];
    winner: { userId: mongoose.Types.ObjectId; userName: string; } | null;
    loser: { userId: mongoose.Types.ObjectId; userName: string; } | null;
    draw: boolean;
    endTime: Date;
}

const GameResultSchema = new mongoose.Schema<IGameResult>({
    gameName: {
        type: String,
        required: true,
    },
    players: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            userName: { type: String, required: true },
        }
    ],
    winner: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: { type: String },
    },
    loser: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: { type: String },
    },
    draw: {
        type: Boolean,
        default: false,
    },
    endTime: {
        type: Date,
        default: Date.now,
    },
});

const GameResult = mongoose.model<IGameResult>('GameResult', GameResultSchema);

app.post('/api/ranking', async (req: Request, res: Response) => {
    const { gameName, userName, score } = req.body;
    try {
        const newRanking = new Ranking({ gameName, userName, score });
        const savedRanking = await newRanking.save();
        res.status(201).json(savedRanking);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

// 모든 랭킹 데이터 조회 (또는 특정 게임 랭킹 조회)
app.get('/api/ranking', async (req: Request, res: Response) => {
    const { gameName } = req.query;
    try {
        let rankings: IRanking[];
        if (gameName) {
            rankings = await Ranking.find({ gameName }).sort({ score: -1, date: 1 });
        } else {
            rankings = await Ranking.find().sort({ score: -1, date: 1 });
        }
        res.status(200).json(rankings);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// 랭킹 데이터 삭제 (ID 기준)
app.delete('/api/ranking/:id', async (req: Request, res: Response) => {
    try {
        const deletedRanking = await Ranking.findByIdAndDelete(req.params.id);
        if (!deletedRanking) {
            return res.status(404).json({ message: 'Ranking not found' });
        }
        res.status(200).json({ message: 'Ranking deleted' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// 게임 결과 저장
app.post('/api/game/result', async (req: Request, res: Response) => {
    const { gameName, players, winner, loser, draw } = req.body;
    try {
        // userId를 User 모델의 ObjectId로 변환 (실제 User 모델이 있다고 가정)
        const playersWithObjectId = players.map((p: any) => ({ 
            userId: new mongoose.Types.ObjectId(p.userId), 
            userName: p.userName 
        }));

        const winnerWithObjectId = winner ? {
            userId: new mongoose.Types.ObjectId(winner.userId),
            userName: winner.userName,
        } : null;

        const loserWithObjectId = loser ? {
            userId: new mongoose.Types.ObjectId(loser.userId),
            userName: loser.userName,
        } : null;

        const newGameResult = new GameResult({
            gameName,
            players: playersWithObjectId,
            winner: winnerWithObjectId,
            loser: loserWithObjectId,
            draw,
            endTime: new Date(),
        });
        const savedGameResult = await newGameResult.save();
        res.status(201).json(savedGameResult);
    } catch (err: any) {
        console.error('Error saving game result:', err);
        res.status(400).json({ message: err.message });
    }
});


// 특정 유저의 게임 기록 조회 (유저 프로필에서 리스트로 뛰울 때 사용)
app.get('/api/game/results/:userId', async (req: Request, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.params.userId);
        const gameResults = await GameResult.find({ 'players.userId': userId })
                                            .sort({ endTime: -1 })
                                            .populate('players.userId', 'userName')
                                            .populate('winner.userId', 'userName')
                                            .populate('loser.userId', 'userName');
        res.status(200).json(gameResults);
    } catch (err: any) {
        console.error('Error fetching game results:', err);
        res.status(500).json({ message: err.message });
    }
});


// Socket.io 매칭 로직
interface Player {
    id: string;
    userName: string;
    userId: string; 
    socketId: string;
    gameName: string;
}

let waitingPlayers: Player[] = [];

io.on('connection', (socket) => {
    
    const currentUser = socket.data.user; // 인증된 사용자 정보 가져오기
    if (!currentUser) {
        console.error(`Socket ${socket.id} connected without authenticated user data.`);
        socket.disconnect(true);
        return;
    }
    console.log(`User ${currentUser.name} (${currentUser.id}) connected: ${socket.id}`);

    // 매칭 요청
    socket.on('joinQueue', (data: { userName: string, userId: string, gameName: string }) => {
        const { userName, userId, gameName } = data;
        const player: Player = { id: socket.id, userName, userId, socketId: socket.id, gameName };

        // 이미 큐에 있는 플레이어인지 확인 (중복 방지)
        if (waitingPlayers.some(p => p.id === socket.id)) {
            console.log(`${userName} (${socket.id}) is already in the queue.`);
            return;
        }

        waitingPlayers.push(player);
        console.log(`${userName} (${socket.id}) joined the queue for ${gameName}. Current queue: `, waitingPlayers.map(p => p.userName));
        
        io.emit('waitingPlayersUpdate', waitingPlayers.map(p => p.userName)); 

        // 같은 게임을 기다리는 플레이어가 2명 이상인지 확인
        const playersForGame = waitingPlayers.filter(p => p.gameName === gameName);
        if (playersForGame.length >= 2) {
            // 매칭 가능한 플레이어를 대기열에서 제거
            const player1Index = waitingPlayers.findIndex(p => p.id === playersForGame[0].id);
            const player2Index = waitingPlayers.findIndex(p => p.id === playersForGame[1].id);
            const player1 = waitingPlayers.splice(player1Index, 1)[0];
            const player2 = waitingPlayers.splice(player2Index > player1Index ? player2Index -1 : player2Index, 1)[0];

            if (player1 && player2) {
                const roomId = `${player1.id}-${player2.id}-${Date.now()}`;

                // 플레이어들을 방에 조인시킴
                io.sockets.sockets.get(player1.socketId)?.join(roomId);
                io.sockets.sockets.get(player2.socketId)?.join(roomId);

                // 매칭 완료 이벤트 전송 (gameName, opponentId 포함)
                io.to(player1.socketId).emit('matchFound', { roomId, opponent: player2.userName, gameName: player1.gameName, opponentId: player2.userId });
                io.to(player2.socketId).emit('matchFound', { roomId, opponent: player1.userName, gameName: player2.gameName, opponentId: player1.userId });
                console.log(`Match found! Room: ${roomId}, Game: ${gameName}, Players: ${player1.userName} (${player1.userId}), ${player2.userName} (${player2.userId})`);

                io.emit('waitingPlayersUpdate', waitingPlayers.map(p => p.userName));
            }
        }
    });

    // 게임 진행 중 메시지 전달 
    socket.on('gameMove', (data: { roomId: string, move: any }) => {
        const { roomId, move } = data;
        socket.to(roomId).emit('gameUpdate', move); // 같은 방의 다른 플레이어에게 게임 업데이트 전송
    });

    socket.on('disconnect', () => {
        // 인증된 사용자 정보와 함께 출력
        if (currentUser) {
            console.log(`User ${currentUser.name} (${currentUser.id}) disconnected: ${socket.id}`);
        } else {
            console.log(`User disconnected: ${socket.id} (unauthenticated)`);
        }
        
        // 대기열에서 플레이어 제거
        waitingPlayers = waitingPlayers.filter(player => player.socketId !== socket.id);
        io.emit('waitingPlayersUpdate', waitingPlayers.map(p => p.userName));
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
