import jwt from "jsonwebtoken";

const SECRET = process.env.NEXTAUTH_SECRET || "super-secret-key";
console.log("JWT Util initialized. Secret length:", SECRET.length, "Is default:", SECRET === "super-secret-key");

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, SECRET) as { id: string; name: string; email: string };
  } catch (err) {
    throw new Error("Invalid token");
  }
}

interface UserPayload {
    userId: string;
    userName: string;
  }
  function parseJwt(token: string): UserPayload | null {
    try {
      const decoded = jwt.verify(token, "YOUR_SECRET") as UserPayload;
      return decoded;
    } catch (err) {
      return null;
    }
  }