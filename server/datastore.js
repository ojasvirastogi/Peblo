const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

class DataStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      users: [],
      notes: [],
      aiRuns: []
    };
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }
    this.data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    this.data.users ||= [];
    this.data.notes ||= [];
    this.data.aiRuns ||= [];
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  createUser({ name, email, passwordHash }) {
    if (this.findUserByEmail(email)) {
      const err = new Error("Email is already registered");
      err.status = 409;
      throw err;
    }
    const user = {
      id: uid("USR"),
      name,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: now()
    };
    this.data.users.push(user);
    this.save();
    return this.publicUser(user);
  }

  findUserByEmail(email) {
    return this.data.users.find((user) => user.email === String(email).toLowerCase());
  }

  findUserById(id) {
    return this.data.users.find((user) => user.id === id);
  }

  publicUser(user) {
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email };
  }

  listNotes(userId, { search = "", tag = "", status = "active" } = {}) {
    const query = search.trim().toLowerCase();
    return this.data.notes
      .filter((note) => note.userId === userId)
      .filter((note) => (status === "archived" ? note.archived : !note.archived))
      .filter((note) => !tag || note.tags.includes(tag))
      .filter((note) => {
        if (!query) return true;
        return [note.title, note.content, note.category, note.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((note) => this.publicNote(note));
  }

  createNote(userId, input = {}) {
    const timestamp = now();
    const note = {
      id: uid("NOTE"),
      userId,
      title: input.title?.trim() || "Untitled note",
      content: input.content || "",
      tags: cleanTags(input.tags),
      category: input.category?.trim() || "General",
      archived: false,
      shareId: null,
      ai: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.data.notes.push(note);
    this.save();
    return this.publicNote(note);
  }

  getOwnedNote(userId, noteId) {
    return this.data.notes.find((note) => note.userId === userId && note.id === noteId);
  }

  updateNote(userId, noteId, input = {}) {
    const note = this.getOwnedNote(userId, noteId);
    if (!note) return null;
    if (typeof input.title === "string") note.title = input.title.trim() || "Untitled note";
    if (typeof input.content === "string") note.content = input.content;
    if (Array.isArray(input.tags) || typeof input.tags === "string") note.tags = cleanTags(input.tags);
    if (typeof input.category === "string") note.category = input.category.trim() || "General";
    if (typeof input.archived === "boolean") note.archived = input.archived;
    note.updatedAt = now();
    this.save();
    return this.publicNote(note);
  }

  setAiResult(userId, noteId, result) {
    const note = this.getOwnedNote(userId, noteId);
    if (!note) return null;
    note.ai = { ...result, generatedAt: now() };
    if (result.suggested_title && (!note.title || note.title === "Untitled note")) {
      note.title = result.suggested_title;
    }
    note.updatedAt = now();
    this.data.aiRuns.push({ id: uid("AIRUN"), userId, noteId, createdAt: now() });
    this.save();
    return this.publicNote(note);
  }

  shareNote(userId, noteId) {
    const note = this.getOwnedNote(userId, noteId);
    if (!note) return null;
    note.shareId ||= uid("SHARE").toLowerCase();
    note.updatedAt = now();
    this.save();
    return this.publicNote(note);
  }

  unshareNote(userId, noteId) {
    const note = this.getOwnedNote(userId, noteId);
    if (!note) return null;
    note.shareId = null;
    note.updatedAt = now();
    this.save();
    return this.publicNote(note);
  }

  getSharedNote(shareId) {
    const note = this.data.notes.find((item) => item.shareId === shareId && !item.archived);
    return note ? this.publicNote(note, { includeOwner: true }) : null;
  }

  insights(userId) {
    const notes = this.data.notes.filter((note) => note.userId === userId);
    const activeNotes = notes.filter((note) => !note.archived);
    const tagCounts = {};
    for (const note of activeNotes) {
      for (const tag of note.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 6;
    const weekly = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sevenDaysAgo + index * 1000 * 60 * 60 * 24);
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        edits: notes.filter((note) => note.updatedAt.slice(0, 10) === key).length
      };
    });
    return {
      total_notes: activeNotes.length,
      archived_notes: notes.length - activeNotes.length,
      recently_edited: activeNotes
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5)
        .map((note) => this.publicNote(note)),
      most_used_tags: Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([tag, count]) => ({ tag, count })),
      ai_usage: {
        total_generations: this.data.aiRuns.filter((run) => run.userId === userId).length,
        this_week: this.data.aiRuns.filter((run) => run.userId === userId && Date.parse(run.createdAt) >= sevenDaysAgo).length
      },
      weekly_activity: weekly
    };
  }

  publicNote(note, options = {}) {
    const payload = {
      note_id: note.id,
      title: note.title,
      content: note.content,
      tags: note.tags,
      category: note.category,
      archived: note.archived,
      share_id: note.shareId,
      ai: note.ai,
      created_at: note.createdAt,
      updated_at: note.updatedAt
    };
    if (options.includeOwner) {
      payload.owner = this.publicUser(this.findUserById(note.userId));
    }
    return payload;
  }
}

function cleanTags(tags) {
  const raw = Array.isArray(tags) ? tags : String(tags || "").split(",");
  return [...new Set(raw.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
}

module.exports = { DataStore, cleanTags, uid };
