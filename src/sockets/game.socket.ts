import { Server, Socket } from "socket.io";
import UserRanking, { IUserRanking } from "../models/UserRanking";
import GameResult from "../models/GameResult";
import { verifyToken } from "../utils/jwt.util"; // Import verifyToken

interface Player {
  socketId: string;
  userId: string;
  userName: string;
  gameName: string;
  color?: "black" | "white";
}

interface GameRoom {
  roomId: string;
  players: [Player, Player | null]; // [Black, White] - 일반 게임 친구 초대 시 두 번째 플레이어는 null일 수 있음
  board: number[][]; // 0: empty, 1: black, 2: white
  turn: "black" | "white";
  status: "playing" | "finished";
  startTime: number;
  moveCount: number;
  isRanked: boolean;
  roomCode?: string; // 친구 초대용 방 코드
}

let rankedWaitingPlayers: Player[] = [];
let normalWaitingPlayers: Player[] = [];
const activeRooms: Map<string, GameRoom> = new Map();
const roomCodes: Map<string, string> = new Map(); // roomCode -> roomId 매핑

const BOARD_SIZE = 15;

export default function initGameSocket(io: Server) {
  // Middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }
    try {
      if (!token) {
           console.log("Socket Auth: No token provided");
           return next(new Error("Authentication error"));
      }
      const decoded = verifyToken(token);
      console.log("Socket Auth Success:", decoded.name);
      next();
    } catch (err) {
      console.error("Socket Auth Failed:", (err as Error).message);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket: Socket) => {
    console.log("Socket connected:", socket.id);

    // Join Queue (랭킹/일반 게임 분리)
    socket.on("joinQueue", async (data: { userId: string; userName: string; gameName: string; isRanked?: boolean }) => {
      const isRanked = data.isRanked ?? true; // 기본값은 랭킹 게임
      const waitingQueue = isRanked ? rankedWaitingPlayers : normalWaitingPlayers;

      // Check if already in queue
      if (waitingQueue.find(p => p.socketId === socket.id)) return;

      const player: Player = { socketId: socket.id, ...data };
      waitingQueue.push(player);
      console.log(`Player ${data.userName} joined ${isRanked ? 'ranked' : 'normal'} queue for ${data.gameName}. Queue size: ${waitingQueue.length}`);

      // Emit success event
      socket.emit("joinQueueSuccess", {
        isRanked,
        gameName: data.gameName
      });

      // Broadcast waiting count updates
      if (isRanked) {
        const waitingCount = rankedWaitingPlayers.filter(p => p.gameName === data.gameName).length;
        // Emit to everyone in the ranked queue for this game? Or just broadcast generally?
        // For simplicity, let's emit to the connecting user and update others if needed.
        // Actually, let's better target it or just emit to the socket for now.
        // Better: Broadcast to all sockets who are in the waiting list (we don't track them in a room yet, but we have the list)

        // Let's just emit to the user for now to confirm "Waiting for opponent... (N waiting)"
        io.emit("waitingRankedCount", {
          gameName: data.gameName,
          count: waitingCount
        });
      }

      // Try to match
      const candidates = waitingQueue.filter(p => p.gameName === data.gameName);
      if (candidates.length >= 2) {
        const p1 = candidates[0];
        const p2 = candidates[1];

        // Remove from queue
        if (isRanked) {
          rankedWaitingPlayers = rankedWaitingPlayers.filter(p => p.socketId !== p1.socketId && p.socketId !== p2.socketId);
        } else {
          normalWaitingPlayers = normalWaitingPlayers.filter(p => p.socketId !== p1.socketId && p.socketId !== p2.socketId);
        }

        const roomId = `${p1.socketId}-${p2.socketId}-${Date.now()}`;

        // Randomize colors
        const isP1Black = Math.random() < 0.5;
        p1.color = isP1Black ? "black" : "white";
        p2.color = isP1Black ? "white" : "black";

        const blackPlayer = isP1Black ? p1 : p2;
        const whitePlayer = isP1Black ? p2 : p1;

        // Initialize Room
        const room: GameRoom = {
          roomId,
          players: [blackPlayer, whitePlayer],
          board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)),
          turn: "black", // Black always starts
          status: "playing",
          startTime: Date.now(),
          moveCount: 0,
          isRanked
        };

        activeRooms.set(roomId, room);

        // Join socket room
        const s1 = io.sockets.sockets.get(p1.socketId);
        const s2 = io.sockets.sockets.get(p2.socketId);
        s1?.join(roomId);
        s2?.join(roomId);

        // Notify players
        io.to(p1.socketId).emit("matchFound", {
          roomId,
          opponent: p2.userName,
          color: p1.color,
          turn: "black",
          gameName: data.gameName
        });
        io.to(p2.socketId).emit("matchFound", {
          roomId,
          opponent: p1.userName,
          color: p2.color,
          turn: "black",
          gameName: data.gameName
        });

        console.log(`Match started: ${roomId} (${p1.userName} vs ${p2.userName}) - ${isRanked ? 'Ranked' : 'Normal'}`);
      }

      // 일반 게임 대기 중인 플레이어 목록 업데이트
      if (!isRanked) {
        io.emit("waitingPlayersUpdate", normalWaitingPlayers.map(p => p.userName));
      }
    });

    // Leave Queue
    socket.on("leaveQueue", () => {
      // Remove from queues
      const wasInRanked = rankedWaitingPlayers.find(p => p.socketId === socket.id);
      rankedWaitingPlayers = rankedWaitingPlayers.filter(p => p.socketId !== socket.id);
      normalWaitingPlayers = normalWaitingPlayers.filter(p => p.socketId !== socket.id);

      if (wasInRanked) {
        const waitingCount = rankedWaitingPlayers.filter(p => p.gameName === wasInRanked.gameName).length;
        io.emit("waitingRankedCount", {
          gameName: wasInRanked.gameName,
          count: waitingCount
        });
      }
      console.log(`Player ${socket.id} left queue`);
    });

    // Create Room (친구 초대용)
    socket.on("createRoom", async (data: { userId: string; userName: string; gameName: string }) => {
      const roomId = `room-${socket.id}-${Date.now()}`;
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6자리 코드

      // 방 생성 (플레이어 1명만 있는 상태)
      const player: Player = {
        socketId: socket.id,
        userId: data.userId,
        userName: data.userName,
        gameName: data.gameName,
        color: "black" // 첫 번째 플레이어는 검은색
      };

      const room: GameRoom = {
        roomId,
        players: [player, null as any], // 두 번째 플레이어는 아직 없음
        board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)),
        turn: "black",
        status: "playing",
        startTime: Date.now(),
        moveCount: 0,
        isRanked: false,
        roomCode
      };

      activeRooms.set(roomId, room);
      roomCodes.set(roomCode, roomId);
      socket.join(roomId);

      socket.emit("roomCreated", { roomId, roomCode });
      console.log(`Room created: ${roomId} with code ${roomCode} by ${data.userName}`);
    });

    // Join Room (친구 초대용)
    socket.on("joinRoom", async (data: { roomCode: string; userId: string; userName: string }) => {
      const roomId = roomCodes.get(data.roomCode);
      if (!roomId) {
        socket.emit("error", { message: "Invalid room code" });
        return;
      }

      const room = activeRooms.get(roomId);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      if (room.players[1]) {
        socket.emit("error", { message: "Room is full" });
        return;
      }

      const player: Player = {
        socketId: socket.id,
        userId: data.userId,
        userName: data.userName,
        gameName: room.players[0].gameName,
        color: "white" // 두 번째 플레이어는 흰색
      };

      room.players[1] = player;
      socket.join(roomId);

      // 두 플레이어 모두에게 매칭 완료 알림
      io.to(roomId).emit("matchFound", {
        roomId,
        opponent: room.players[0].socketId === socket.id ? room.players[1].userName : room.players[0].userName,
        color: room.players[0].socketId === socket.id ? room.players[0].color : room.players[1].color,
        turn: "black",
        gameName: room.players[0].gameName
      });

      console.log(`Player ${data.userName} joined room ${roomId}`);
    });

    // Handle Move
    socket.on("gameMove", async (data: { roomId: string; x: number; y: number }) => {
      const room = activeRooms.get(data.roomId);
      if (!room || room.status !== "playing") return;

      const player = room.players.find(p => p && p.socketId === socket.id);
      if (!player) return;

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
        const loser = room.players.find(p => p && p.socketId !== socket.id)!;

        const playTime = Math.floor((Date.now() - room.startTime) / 1000);

        // 랭킹 게임이면 랭킹 업데이트, 일반 게임이면 승패만 저장
        if (room.isRanked) {
          await updateRanking(winner, loser, room.moveCount, playTime);
        } else {
          await saveGameResult(winner, loser, room.moveCount, playTime, room.players[0].gameName, room.startTime);
        }

        io.to(room.roomId).emit("gameEnd", {
          winner: winner.color,
          reason: "connect5"
        });

        // 방 코드 정리
        if (room.roomCode) {
          roomCodes.delete(room.roomCode);
        }
        activeRooms.delete(room.roomId);
      } else {
        // Switch turn
        room.turn = player.color === "black" ? "white" : "black";
      }
    });

    socket.on("disconnect", async () => {
      console.log("Socket disconnected:", socket.id);

      // Remove from queues
      const wasInRanked = rankedWaitingPlayers.find(p => p.socketId === socket.id);
      rankedWaitingPlayers = rankedWaitingPlayers.filter(p => p.socketId !== socket.id);
      normalWaitingPlayers = normalWaitingPlayers.filter(p => p.socketId !== socket.id);

      if (wasInRanked) {
        const waitingCount = rankedWaitingPlayers.filter(p => p.gameName === wasInRanked.gameName).length;
        io.emit("waitingRankedCount", {
          gameName: wasInRanked.gameName,
          count: waitingCount
        });
      }

      // Handle active game disconnection
      for (const [roomId, room] of activeRooms.entries()) {
        const playerIndex = room.players.findIndex(p => p && p.socketId === socket.id);
        if (playerIndex !== -1) {
          const disconnectedPlayer = room.players[playerIndex];
          const remainingPlayer = room.players[playerIndex === 0 ? 1 : 0];

          // 게임이 시작된 상태에서만 처리
          if (remainingPlayer && room.status === "playing") {
            const playTime = Math.floor((Date.now() - room.startTime) / 1000);

            // 랭킹 게임이면 랭킹 업데이트, 일반 게임이면 승패만 저장
            if (room.isRanked && disconnectedPlayer && remainingPlayer) {
              await updateRanking(remainingPlayer, disconnectedPlayer, room.moveCount, playTime);
            } else if (disconnectedPlayer && remainingPlayer) {
              await saveGameResult(remainingPlayer, disconnectedPlayer, room.moveCount, playTime, room.players[0].gameName, room.startTime);
            }

            io.to(roomId).emit("gameEnd", {
              winner: remainingPlayer.color,
              reason: "disconnect"
            });
          }

          // 방 코드 정리
          if (room.roomCode) {
            roomCodes.delete(room.roomCode);
          }
          activeRooms.delete(roomId);
          break;
        }
      }
    });
  });
}

function checkWin(board: number[][], x: number, y: number, stone: number): boolean {
  const directions = [
    [1, 0],  // Horizontal
    [0, 1],  // Vertical
    [1, 1],  // Diagonal \
    [1, -1]  // Diagonal /
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

    if (count >= 5) return true;
  }

  return false;
}

async function saveGameResult(winner: Player, loser: Player, moves: number, time: number, gameName: string, startTime: number) {
  try {
    const gameResult = new GameResult({
      gameName,
      players: [
        { userId: winner.userId, userName: winner.userName },
        { userId: loser.userId, userName: loser.userName }
      ],
      winner: winner.userName,
      loser: loser.userName,
      draw: false,
      moves,
      playTimeSeconds: time,
      startTime: new Date(startTime),
      endTime: new Date()
    });

    await gameResult.save();
    console.log(`Game result saved: ${winner.userName} vs ${loser.userName} (${gameName})`);
  } catch (error) {
    console.error("Error saving game result:", error);
  }
}

async function updateRanking(winner: Player, loser: Player, moves: number, time: number) {
  try {
    const gameName = winner.gameName; // 'omok'

    // Helper to get or create ranking
    const getRanking = async (userId: string, userName: string) => {
      let ranking = await UserRanking.findOne({ userId, gameType: gameName });
      if (!ranking) {
        ranking = new UserRanking({
          userId,
          userName,
          gameType: gameName,
          tier: 'Unranked',
          points: 1000, // Starting ELO-like points
        });
      }
      return ranking;
    };

    const winnerRank = await getRanking(winner.userId, winner.userName);
    const loserRank = await getRanking(loser.userId, loser.userName);

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

    const updateTier = (rank: IUserRanking) => {
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
        if (winRate >= 0.8) { rank.tier = 'Gold'; rank.tierLevel = 5; }
        else if (winRate >= 0.6) { rank.tier = 'Silver'; rank.tierLevel = 3; }
        else if (winRate >= 0.4) { rank.tier = 'Bronze'; rank.tierLevel = 3; }
        else { rank.tier = 'Iron'; rank.tierLevel = 3; }

        // Adjust points to match tier baseline roughly
        // Iron: 0-1000, Bronze: 1000-1500, Silver: 1500-2000, Gold: 2000-2500...
        return;
      }

      // Regular Tier Promotion/Demotion based on Points
      // Simple thresholds
      if (rank.points < 1000) { rank.tier = 'Iron'; rank.tierLevel = 5 - Math.floor(rank.points / 200); }
      else if (rank.points < 1500) { rank.tier = 'Bronze'; rank.tierLevel = 5 - Math.floor((rank.points - 1000) / 100); }
      else if (rank.points < 2000) { rank.tier = 'Silver'; rank.tierLevel = 5 - Math.floor((rank.points - 1500) / 100); }
      else if (rank.points < 2500) { rank.tier = 'Gold'; rank.tierLevel = 5 - Math.floor((rank.points - 2000) / 100); }
      else if (rank.points < 3000) { rank.tier = 'Diamond'; rank.tierLevel = 5 - Math.floor((rank.points - 2500) / 100); }
      else { rank.tier = 'Champion'; rank.tierLevel = 1; }

      // Clamp tier level
      rank.tierLevel = Math.max(1, Math.min(5, rank.tierLevel));
    };

    updateTier(winnerRank);
    updateTier(loserRank);

    await winnerRank.save();
    await loserRank.save();

  } catch (error) {
    console.error("Error updating ranking:", error);
  }
}
