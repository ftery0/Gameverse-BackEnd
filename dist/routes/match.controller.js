"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwt_util_1 = require("../utils/jwt.util");
const router = (0, express_1.Router)();
// 매칭 API (JWT에서 유저 정보 추출)
router.post("/join", (req, res) => {
    var _a;
    try {
        const token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(" ")[1];
        if (!token)
            return res.status(401).json({ message: "No token provided" });
        const user = (0, jwt_util_1.verifyToken)(token);
        const { gameName } = req.body;
        // DB 로직 or 매칭 로직 (여기서는 단순 응답 예시)
        res.json({ status: "waiting", user, gameName });
    }
    catch (err) {
        res.status(401).json({ message: err.message });
    }
});
exports.default = router;
