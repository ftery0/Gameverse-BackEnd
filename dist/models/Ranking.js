"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const RankingSchema = new mongoose_1.default.Schema({
    gameName: { type: String, required: true },
    userName: { type: String, required: true },
    score: { type: Number, required: true },
    date: { type: Date, default: Date.now },
});
exports.default = mongoose_1.default.model("Ranking", RankingSchema);
