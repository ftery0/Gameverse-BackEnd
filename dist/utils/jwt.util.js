"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SECRET = process.env.NEXTAUTH_SECRET || "super-secret-key";
function verifyToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, SECRET);
    }
    catch (err) {
        throw new Error("Invalid token");
    }
}
function parseJwt(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, "YOUR_SECRET");
        return decoded;
    }
    catch (err) {
        return null;
    }
}
