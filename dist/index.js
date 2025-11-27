"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const match_controller_1 = __importDefault(require("./routes/match.controller"));
const ranking_controller_1 = __importDefault(require("./routes/ranking.controller"));
const game_controller_1 = __importDefault(require("./routes/game.controller"));
const game_socket_1 = __importDefault(require("./sockets/game.socket"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 8080;
app.use(express_1.default.json());
app.use((0, cors_1.default)());
// 라우터 연결
app.use("/api/match", match_controller_1.default);
app.use("/api/ranking", ranking_controller_1.default);
app.use("/api/game", game_controller_1.default);
// 소켓 연결 초기화
(0, game_socket_1.default)(io);
// MongoDB 연결
mongoose_1.default.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error(err));
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
