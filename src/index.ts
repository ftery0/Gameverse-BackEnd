import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import matchRouter from './routes/match.controller';
import rankingRouter from './routes/ranking.controller';
import gameRouter from './routes/game.controller';
import initGameSocket from './sockets/game.socket';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(cors());

// 라우터 연결
app.use("/api/match", matchRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/game", gameRouter);

// 소켓 연결 초기화
initGameSocket(io);

// MongoDB 연결
mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log("MongoDB connected"))
  .catch((err: Error) => console.error(err));

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
