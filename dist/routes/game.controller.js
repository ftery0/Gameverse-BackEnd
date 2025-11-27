"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = initGameSocket;
let waitingPlayers = [];
let rooms = [];
function initGameSocket(io) {
    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);
        // 매칭 요청
        socket.on("joinQueue", (data) => {
            var _a;
            const player = Object.assign({ socketId: socket.id }, data);
            waitingPlayers.push(player);
            const candidates = waitingPlayers.filter(p => p.gameName === data.gameName);
            if (candidates.length >= 2) {
                const [p1, p2] = candidates;
                waitingPlayers = waitingPlayers.filter(p => p.socketId !== p1.socketId && p.socketId !== p2.socketId);
                const roomId = `${p1.socketId}-${p2.socketId}-${Date.now()}`;
                p1.color = "white";
                p2.color = "black";
                const newRoom = {
                    roomId,
                    players: [p1, p2],
                    moves: [],
                    capturedPieces: [],
                };
                rooms.push(newRoom);
                socket.join(roomId);
                (_a = io.sockets.sockets.get(p2.socketId)) === null || _a === void 0 ? void 0 : _a.join(roomId);
                io.to(p1.socketId).emit("matchFound", {
                    roomId,
                    opponent: p2.userName,
                    color: "white",
                });
                io.to(p2.socketId).emit("matchFound", {
                    roomId,
                    opponent: p1.userName,
                    color: "black",
                });
            }
        });
        // 수 두기
        socket.on("gameMove", (data) => {
            const room = rooms.find(r => r.roomId === data.roomId);
            if (!room)
                return;
            room.moves.push(data.move);
            socket.to(data.roomId).emit("gameUpdate", data.move);
        });
        // 말 잡기 이벤트
        socket.on("pieceCaptured", (data) => {
            const room = rooms.find(r => r.roomId === data.roomId);
            if (!room)
                return;
            // 기록 저장
            room.capturedPieces.push({ userId: data.userId, piece: data.piece });
            // 해당 방 전체에 알림
            io.to(data.roomId).emit("pieceCapturedUpdate", {
                userId: data.userId,
                piece: data.piece,
            });
        });
        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
            waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
        });
    });
}
