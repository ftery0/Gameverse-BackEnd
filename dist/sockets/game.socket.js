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
exports.default = initGameSocket;
const UserRanking_1 = __importDefault(require("../models/UserRanking"));
let waitingPlayers = [];
const activeRooms = new Map();
const BOARD_SIZE = 15;
function initGameSocket(io) {
    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);
        // Join Queue
        socket.on("joinQueue", (data) => __awaiter(this, void 0, void 0, function* () {
            // Check if already in queue
            if (waitingPlayers.find(p => p.socketId === socket.id))
                return;
            const player = Object.assign({ socketId: socket.id }, data);
            waitingPlayers.push(player);
            console.log(`Player ${data.userName} joined queue for ${data.gameName}. Queue size: ${waitingPlayers.length}`);
            // Try to match
            const candidates = waitingPlayers.filter(p => p.gameName === data.gameName);
            if (candidates.length >= 2) {
                const p1 = candidates[0];
                const p2 = candidates[1];
                // Remove from queue
                waitingPlayers = waitingPlayers.filter(p => p.socketId !== p1.socketId && p.socketId !== p2.socketId);
                const roomId = `${p1.socketId}-${p2.socketId}-${Date.now()}`;
                // Randomize colors
                const isP1Black = Math.random() < 0.5;
                p1.color = isP1Black ? "black" : "white";
                p2.color = isP1Black ? "white" : "black";
                const blackPlayer = isP1Black ? p1 : p2;
                const whitePlayer = isP1Black ? p2 : p1;
                // Initialize Room
                const room = {
                    roomId,
                    players: [blackPlayer, whitePlayer],
                    board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)),
                    turn: "black", // Black always starts
                    status: "playing",
                    startTime: Date.now(),
                    moveCount: 0
                };
                activeRooms.set(roomId, room);
                // Join socket room
                const s1 = io.sockets.sockets.get(p1.socketId);
                const s2 = io.sockets.sockets.get(p2.socketId);
                s1 === null || s1 === void 0 ? void 0 : s1.join(roomId);
                s2 === null || s2 === void 0 ? void 0 : s2.join(roomId);
                // Notify players
                io.to(p1.socketId).emit("matchFound", {
                    roomId,
                    opponent: p2.userName,
                    color: p1.color,
                    turn: "black"
                });
                io.to(p2.socketId).emit("matchFound", {
                    roomId,
                    opponent: p1.userName,
                    color: p2.color,
                    turn: "black"
                });
                console.log(`Match started: ${roomId} (${p1.userName} vs ${p2.userName})`);
            }
        }));
        // Handle Move
        socket.on("gameMove", (data) => __awaiter(this, void 0, void 0, function* () {
            const room = activeRooms.get(data.roomId);
            if (!room || room.status !== "playing")
                return;
            const player = room.players.find(p => p.socketId === socket.id);
            if (!player)
                return;
            // Validate turn
            if (player.color !== room.turn) {
                socket.emit("error", { message: "Not your turn" });
                return;
            }
            // Validate move
            const { x, y } = data;
            if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE || room.board[y][x] !== 0) {
                socket.emit("error", { message: "Invalid move" });
                return;
            }
            // Apply move
            const stone = player.color === "black" ? 1 : 2;
            room.board[y][x] = stone;
            room.moveCount++;
            // Broadcast move
            io.to(room.roomId).emit("gameUpdate", {
                x,
                y,
                color: player.color,
                nextTurn: player.color === "black" ? "white" : "black"
            });
            // Check Win
            if (checkWin(room.board, x, y, stone)) {
                room.status = "finished";
                const winner = player;
                const loser = room.players.find(p => p.socketId !== socket.id);
                const playTime = Math.floor((Date.now() - room.startTime) / 1000);
                // Update Rankings
                yield updateRanking(winner, loser, room.moveCount, playTime);
                io.to(room.roomId).emit("gameEnd", {
                    winner: winner.color,
                    reason: "connect5"
                });
                activeRooms.delete(room.roomId);
            }
            else {
                // Switch turn
                room.turn = player.color === "black" ? "white" : "black";
            }
        }));
        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
            // Remove from queue
            waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
            // Handle active game disconnection
            for (const [roomId, room] of activeRooms.entries()) {
                const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
                if (playerIndex !== -1) {
                    const winner = room.players[playerIndex === 0 ? 1 : 0];
                    io.to(roomId).emit("gameEnd", {
                        winner: winner.color,
                        reason: "disconnect"
                    });
                    activeRooms.delete(roomId);
                    break;
                }
            }
        });
    });
}
function checkWin(board, x, y, stone) {
    const directions = [
        [1, 0], // Horizontal
        [0, 1], // Vertical
        [1, 1], // Diagonal \
        [1, -1] // Diagonal /
    ];
    for (const [dx, dy] of directions) {
        let count = 1;
        // Check forward
        let nx = x + dx;
        let ny = y + dy;
        while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === stone) {
            count++;
            nx += dx;
            ny += dy;
        }
        // Check backward
        nx = x - dx;
        ny = y - dy;
        while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === stone) {
            count++;
            nx -= dx;
            ny -= dy;
        }
        if (count >= 5)
            return true;
    }
    return false;
}
function updateRanking(winner, loser, moves, time) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const gameName = winner.gameName; // 'omok'
            // Helper to get or create ranking
            const getRanking = (userId, userName) => __awaiter(this, void 0, void 0, function* () {
                let ranking = yield UserRanking_1.default.findOne({ userId, gameType: gameName });
                if (!ranking) {
                    ranking = new UserRanking_1.default({
                        userId,
                        userName,
                        gameType: gameName,
                        tier: 'Unranked',
                        points: 1000, // Starting ELO-like points
                    });
                }
                return ranking;
            });
            const winnerRank = yield getRanking(winner.userId, winner.userName);
            const loserRank = yield getRanking(loser.userId, loser.userName);
            // Update stats
            winnerRank.wins++;
            winnerRank.history.push({
                result: 'win',
                opponentName: loser.userName,
                moves,
                playTimeSeconds: time,
                date: new Date()
            });
            loserRank.losses++;
            loserRank.history.push({
                result: 'loss',
                opponentName: winner.userName,
                moves,
                playTimeSeconds: time,
                date: new Date()
            });
            // Calculate Points (Simple ELO-like + Bonus)
            // Base gain/loss
            const kFactor = 32;
            const expectedScoreWinner = 1 / (1 + Math.pow(10, (loserRank.points - winnerRank.points) / 400));
            const pointChange = Math.round(kFactor * (1 - expectedScoreWinner));
            // Bonus for fast win (less moves or less time) - simplified
            const bonus = Math.max(0, 10 - Math.floor(moves / 10));
            winnerRank.points += (pointChange + bonus);
            loserRank.points -= Math.max(0, pointChange - 5); // Lose slightly less to be forgiving
            // Placement Logic
            const PLACEMENT_MATCHES = 5;
            const updateTier = (rank) => {
                const totalGames = rank.wins + rank.losses + rank.draws;
                if (totalGames < PLACEMENT_MATCHES) {
                    rank.tier = 'Unranked';
                    rank.placementMatchesPlayed = totalGames;
                    return;
                }
                // If just finished placement
                if (totalGames === PLACEMENT_MATCHES) {
                    // Calculate initial tier based on win rate
                    const winRate = rank.wins / totalGames;
                    if (winRate >= 0.8) {
                        rank.tier = 'Gold';
                        rank.tierLevel = 5;
                    }
                    else if (winRate >= 0.6) {
                        rank.tier = 'Silver';
                        rank.tierLevel = 3;
                    }
                    else if (winRate >= 0.4) {
                        rank.tier = 'Bronze';
                        rank.tierLevel = 3;
                    }
                    else {
                        rank.tier = 'Iron';
                        rank.tierLevel = 3;
                    }
                    // Adjust points to match tier baseline roughly
                    // Iron: 0-1000, Bronze: 1000-1500, Silver: 1500-2000, Gold: 2000-2500...
                    return;
                }
                // Regular Tier Promotion/Demotion based on Points
                // Simple thresholds
                if (rank.points < 1000) {
                    rank.tier = 'Iron';
                    rank.tierLevel = 5 - Math.floor(rank.points / 200);
                }
                else if (rank.points < 1500) {
                    rank.tier = 'Bronze';
                    rank.tierLevel = 5 - Math.floor((rank.points - 1000) / 100);
                }
                else if (rank.points < 2000) {
                    rank.tier = 'Silver';
                    rank.tierLevel = 5 - Math.floor((rank.points - 1500) / 100);
                }
                else if (rank.points < 2500) {
                    rank.tier = 'Gold';
                    rank.tierLevel = 5 - Math.floor((rank.points - 2000) / 100);
                }
                else if (rank.points < 3000) {
                    rank.tier = 'Diamond';
                    rank.tierLevel = 5 - Math.floor((rank.points - 2500) / 100);
                }
                else {
                    rank.tier = 'Champion';
                    rank.tierLevel = 1;
                }
                // Clamp tier level
                rank.tierLevel = Math.max(1, Math.min(5, rank.tierLevel));
            };
            updateTier(winnerRank);
            updateTier(loserRank);
            yield winnerRank.save();
            yield loserRank.save();
        }
        catch (error) {
            console.error("Error updating ranking:", error);
        }
    });
}
