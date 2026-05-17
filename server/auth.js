const crypto = require("node:crypto");

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function createToken(userId, secret) {
  const payload = {
    sub: userId,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

function verifyToken(token, secret) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature || sign(body, secret) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.sub || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))])
  );
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `peblo_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TOKEN_TTL_MS / 1000}${secure}`;
}

function clearSessionCookie() {
  return "peblo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

module.exports = {
  clearSessionCookie,
  createToken,
  hashPassword,
  parseCookies,
  sessionCookie,
  verifyPassword,
  verifyToken
};
