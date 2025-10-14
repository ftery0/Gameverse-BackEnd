import { Server, Socket } from "socket.io";

interface Player {
  socketId: string;
  userId: string;
  userName: string;
  gameName: string;
  color?: "white" | "black";
}

let waitingPlayers: Player[] = [];

export default function initGameSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("Socket connected:", socket.id);

    // 매칭 요청
    socket.on("joinQueue", (data: { userId: string; userName: string; gameName: string }) => {
      const player: Player = { socketId: socket.id, ...data };

      waitingPlayers.push(player);

      const candidates = waitingPlayers.filter(p => p.gameName === data.gameName);
      if (candidates.length >= 2) {
        const [p1, p2] = candidates;

        waitingPlayers = waitingPlayers.filter(p => p.socketId !== p1.socketId && p.socketId !== p2.socketId);

        const roomId = `${p1.socketId}-${p2.socketId}-${Date.now()}`;
        p1.color = "white";
        p2.color = "black";

        socket.join(roomId);
        io.sockets.sockets.get(p2.socketId)?.join(roomId);

        io.to(p1.socketId).emit("matchFound", { roomId, opponent: p2.userName, color: "white" });
        io.to(p2.socketId).emit("matchFound", { roomId, opponent: p1.userName, color: "black" });
      }
    });

    // 수 두기
    socket.on("gameMove", (data: { roomId: string; move: any }) => {
      socket.to(data.roomId).emit("gameUpdate", data.move);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
      waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    });
  });
}
