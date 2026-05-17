const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const { clearSessionCookie, createToken, hashPassword, parseCookies, sessionCookie, verifyPassword, verifyToken } = require("./auth");
const { config } = require("./config");
const { DataStore } = require("./datastore");
const { generateAiOutput } = require("./ai");

const store = new DataStore(config.dataFile);
const publicDir = path.join(process.cwd(), "public");

function send(res, status, payload, headers = {}) {
  const body = payload === null ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function getCurrentUser(req) {
  const token = parseCookies(req.headers.cookie).peblo_session;
  const payload = verifyToken(token, config.jwtSecret);
  return payload ? store.publicUser(store.findUserById(payload.sub)) : null;
}

function requireUser(req, res) {
  const user = getCurrentUser(req);
  if (!user) send(res, 401, { error: "Authentication required" });
  return user;
}

function serveStatic(req, res) {
  const url = new URL(req.url, config.appOrigin);
  let filePath = url.pathname === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, url.pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(publicDir, "index.html");
  }
  const ext = path.extname(filePath);
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(res);
}

async function router(req, res) {
  const url = new URL(req.url, config.appOrigin);
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "POST" && url.pathname === "/api/auth/signup") {
        const body = await readBody(req);
        if (!body.name || !body.email || !body.password || body.password.length < 8) {
          return send(res, 400, { error: "Name, email, and an 8+ character password are required" });
        }
        const user = store.createUser({
          name: body.name.trim(),
          email: body.email.trim(),
          passwordHash: hashPassword(body.password)
        });
        const token = createToken(user.id, config.jwtSecret);
        return send(res, 201, { user }, { "Set-Cookie": sessionCookie(token) });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readBody(req);
        const userRecord = store.findUserByEmail(body.email);
        if (!userRecord || !verifyPassword(body.password, userRecord.passwordHash)) {
          return send(res, 401, { error: "Invalid email or password" });
        }
        const user = store.publicUser(userRecord);
        const token = createToken(user.id, config.jwtSecret);
        return send(res, 200, { user }, { "Set-Cookie": sessionCookie(token) });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        return send(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
      }

      if (req.method === "GET" && url.pathname === "/api/me") {
        return send(res, 200, { user: getCurrentUser(req) });
      }

      if (req.method === "GET" && url.pathname === "/api/shared" && url.searchParams.get("id")) {
        const note = store.getSharedNote(url.searchParams.get("id"));
        return note ? send(res, 200, { note }) : send(res, 404, { error: "Shared note not found" });
      }

      const user = requireUser(req, res);
      if (!user) return;

      if (req.method === "GET" && url.pathname === "/api/notes") {
        const notes = store.listNotes(user.id, {
          search: url.searchParams.get("search") || "",
          tag: url.searchParams.get("tag") || "",
          status: url.searchParams.get("status") || "active"
        });
        return send(res, 200, { notes });
      }

      if (req.method === "POST" && url.pathname === "/api/notes") {
        const note = store.createNote(user.id, await readBody(req));
        return send(res, 201, { note });
      }

      if (parts[0] === "api" && parts[1] === "notes" && parts[2]) {
        const noteId = parts[2];

        if (req.method === "GET" && parts.length === 3) {
          const note = store.getOwnedNote(user.id, noteId);
          return note ? send(res, 200, { note: store.publicNote(note) }) : send(res, 404, { error: "Note not found" });
        }

        if (req.method === "PATCH" && parts.length === 3) {
          const note = store.updateNote(user.id, noteId, await readBody(req));
          return note ? send(res, 200, { note }) : send(res, 404, { error: "Note not found" });
        }

        if (req.method === "POST" && parts[3] === "generate-summary") {
          const original = store.getOwnedNote(user.id, noteId);
          if (!original) return send(res, 404, { error: "Note not found" });
          const ai = await generateAiOutput(original, config);
          return send(res, 200, { note: store.setAiResult(user.id, noteId, ai), ai });
        }

        if (req.method === "POST" && parts[3] === "share") {
          const note = store.shareNote(user.id, noteId);
          return note ? send(res, 200, { note, url: `/shared/${note.share_id}` }) : send(res, 404, { error: "Note not found" });
        }

        if (req.method === "DELETE" && parts[3] === "share") {
          const note = store.unshareNote(user.id, noteId);
          return note ? send(res, 200, { note }) : send(res, 404, { error: "Note not found" });
        }
      }

      if (req.method === "GET" && url.pathname === "/api/insights") {
        return send(res, 200, { insights: store.insights(user.id) });
      }

      return send(res, 404, { error: "Route not found" });
    }

    serveStatic(req, res);
  } catch (error) {
    const status = error.status || 500;
    send(res, status, { error: status === 500 ? "Something went wrong" : error.message });
    if (status === 500) console.error(error);
  }
}

if (require.main === module) {
  http.createServer(router).listen(config.port, () => {
    console.log(`Peblo AI Notes Workspace running at http://localhost:${config.port}`);
  });
}

module.exports = { router, store };
