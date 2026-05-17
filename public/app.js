const app = document.querySelector("#app");

const state = {
  user: null,
  authMode: "login",
  notes: [],
  selectedId: null,
  insights: null,
  filters: { search: "", tag: "", status: "active" },
  saveState: "Saved",
  savingTimer: null
};

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

const fmt = (date) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

const selectedNote = () => state.notes.find((note) => note.note_id === state.selectedId) || null;

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function render() {
  const shareMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (shareMatch) return renderShared(shareMatch[1]);
  if (!state.user) return renderAuth();
  renderWorkspace();
}

function renderAuth() {
  app.innerHTML = `
    <section class="auth-shell">
      <div class="auth-copy">
        <div class="brand">Peblo Notes</div>
        <div>
          <h1>AI notes for sharper learning work.</h1>
          <p>Create notes, tag ideas, generate summaries and action items, share selected pages publicly, and track your writing rhythm.</p>
        </div>
        <p>Built as a full-stack take-home challenge with protected sessions and a complete local demo path.</p>
      </div>
      <div class="auth-panel">
        <form class="auth-card" id="authForm">
          <div class="tabs">
            <button type="button" class="${state.authMode === "login" ? "active" : ""}" data-auth-mode="login">Login</button>
            <button type="button" class="${state.authMode === "signup" ? "active" : ""}" data-auth-mode="signup">Sign up</button>
          </div>
          ${state.authMode === "signup" ? `<div class="field"><label>Name</label><input name="name" required autocomplete="name" /></div>` : ""}
          <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" /></div>
          <div class="field"><label>Password</label><input name="password" type="password" required minlength="8" autocomplete="${state.authMode === "login" ? "current-password" : "new-password"}" /></div>
          <p class="error" id="authError"></p>
          <button class="primary" type="submit">${state.authMode === "login" ? "Login" : "Create workspace"}</button>
        </form>
      </div>
    </section>`;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      render();
    });
  });
  document.querySelector("#authForm").addEventListener("submit", submitAuth);
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  try {
    const data = await api(`/api/auth/${state.authMode}`, { method: "POST", body: JSON.stringify(payload) });
    state.user = data.user;
    await refreshAll();
  } catch (error) {
    document.querySelector("#authError").textContent = error.message;
  }
}

async function refreshAll() {
  const [{ notes }, { insights }] = await Promise.all([loadNotes(), api("/api/insights")]);
  state.notes = notes;
  state.insights = insights;
  state.selectedId ||= notes[0]?.note_id || null;
  render();
}

async function loadNotes() {
  const params = new URLSearchParams(state.filters);
  return api(`/api/notes?${params}`);
}

function renderWorkspace() {
  const note = selectedNote();
  app.innerHTML = `
    <section class="app-shell">
      ${renderSidebar(note)}
      ${note ? renderEditor(note) : `<div class="empty-state"><div><h2>No notes yet</h2><p>Create your first note to start the workspace.</p></div></div>`}
      ${renderDetails(note)}
    </section>`;

  bindWorkspaceEvents();
}

function renderSidebar(note) {
  const allTags = [...new Set(state.notes.flatMap((item) => item.tags))];
  return `
    <aside class="sidebar">
      <div class="top-row">
        <div><div class="brand">Peblo Notes</div><div class="user-chip">${escapeHtml(state.user.name)}</div></div>
        <button class="ghost" data-action="logout">Exit</button>
      </div>
      <div class="filters">
        <input data-filter="search" placeholder="Search notes" value="${escapeHtml(state.filters.search)}" />
        <div class="toolbar">
          <select data-filter="tag">
            <option value="">All tags</option>
            ${allTags.map((tag) => `<option ${state.filters.tag === tag ? "selected" : ""} value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}
          </select>
          <select data-filter="status">
            <option ${state.filters.status === "active" ? "selected" : ""} value="active">Active</option>
            <option ${state.filters.status === "archived" ? "selected" : ""} value="archived">Archived</option>
          </select>
        </div>
        <button class="primary" data-action="new-note">New note</button>
      </div>
      <div class="note-list">
        ${state.notes
          .map(
            (item) => `
          <button class="note-card ${note?.note_id === item.note_id ? "active" : ""}" data-note-id="${item.note_id}">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="meta">${escapeHtml(item.category)} · ${fmt(item.updated_at)}</span>
            <span class="tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</span>
          </button>`
          )
          .join("")}
      </div>
    </aside>`;
}

function renderEditor(note) {
  return `
    <section class="editor">
      <input class="title-input" data-edit="title" value="${escapeHtml(note.title)}" />
      <div class="note-actions">
        <input data-edit="tags" value="${escapeHtml(note.tags.join(", "))}" placeholder="tags, comma separated" />
        <input data-edit="category" value="${escapeHtml(note.category)}" placeholder="Category" />
        <button class="ghost" data-action="archive">${note.archived ? "Restore" : "Archive"}</button>
      </div>
      <textarea class="content-input" data-edit="content" placeholder="Start typing your note...">${escapeHtml(note.content)}</textarea>
      <div class="save-state">${state.saveState}</div>
    </section>`;
}

function renderDetails(note) {
  const insights = state.insights || {};
  const ai = note?.ai;
  const maxEdits = Math.max(1, ...(insights.weekly_activity || []).map((day) => day.edits));
  return `
    <aside class="details">
      <section class="panel-section">
        <h2>Insights</h2>
        <div class="stat-grid">
          <div class="stat"><b>${insights.total_notes || 0}</b><span>Total notes</span></div>
          <div class="stat"><b>${insights.ai_usage?.total_generations || 0}</b><span>AI runs</span></div>
        </div>
      </section>
      <section class="panel-section">
        <h3>Most-used tags</h3>
        <div class="tags">${(insights.most_used_tags || []).map((item) => `<span class="tag">${escapeHtml(item.tag)} · ${item.count}</span>`).join("") || `<span class="meta">No tags yet</span>`}</div>
      </section>
      <section class="panel-section">
        <h3>Weekly activity</h3>
        <div class="bars">${(insights.weekly_activity || [])
          .map((day) => `<div class="bar"><span>${day.date.slice(5)}</span><span style="--value:${(day.edits / maxEdits) * 100}%"></span><b>${day.edits}</b></div>`)
          .join("")}</div>
      </section>
      ${
        note
          ? `<section class="panel-section">
              <div class="top-row"><h3>AI assistant</h3><button class="primary" data-action="ai">Generate</button></div>
              <div class="ai-box">
                ${ai ? `<b>${escapeHtml(ai.suggested_title)}</b><p>${escapeHtml(ai.summary)}</p><ul>${ai.action_items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p class="meta">Generated ${fmt(ai.generatedAt)}</p>` : `<p class="meta">Generate a summary, action items, and a title suggestion for this note.</p>`}
              </div>
            </section>
            <section class="panel-section">
              <div class="top-row"><h3>Public share</h3><button class="ghost" data-action="share">${note.share_id ? "Refresh" : "Create"}</button></div>
              <div class="share-box">
                ${note.share_id ? `<input readonly value="${location.origin}/shared/${note.share_id}" /><button class="danger" data-action="unshare">Disable link</button>` : `<p class="meta">Create a read-only public page for this note.</p>`}
              </div>
            </section>`
          : ""
      }
    </aside>`;
}

function bindWorkspaceEvents() {
  document.querySelector("[data-action='logout']")?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    state.notes = [];
    state.selectedId = null;
    render();
  });

  document.querySelector("[data-action='new-note']")?.addEventListener("click", async () => {
    const { note } = await api("/api/notes", { method: "POST", body: JSON.stringify({ title: "Untitled note", tags: ["ideas"] }) });
    state.selectedId = note.note_id;
    await refreshAll();
  });

  document.querySelectorAll("[data-note-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.noteId;
      render();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((control) => {
    control.addEventListener("input", debounce(async () => {
      state.filters[control.dataset.filter] = control.value;
      const { notes } = await loadNotes();
      state.notes = notes;
      state.selectedId = notes[0]?.note_id || null;
      render();
    }, 180));
  });

  document.querySelectorAll("[data-edit]").forEach((control) => {
    control.addEventListener("input", () => scheduleSave());
  });

  document.querySelector("[data-action='archive']")?.addEventListener("click", async () => {
    const note = selectedNote();
    await api(`/api/notes/${note.note_id}`, { method: "PATCH", body: JSON.stringify({ archived: !note.archived }) });
    state.selectedId = null;
    await refreshAll();
  });

  document.querySelector("[data-action='ai']")?.addEventListener("click", async () => {
    state.saveState = "Generating AI output...";
    render();
    await api(`/api/notes/${state.selectedId}/generate-summary`, { method: "POST" });
    state.saveState = "Saved";
    await refreshAll();
  });

  document.querySelector("[data-action='share']")?.addEventListener("click", async () => {
    await api(`/api/notes/${state.selectedId}/share`, { method: "POST" });
    await refreshAll();
  });

  document.querySelector("[data-action='unshare']")?.addEventListener("click", async () => {
    await api(`/api/notes/${state.selectedId}/share`, { method: "DELETE" });
    await refreshAll();
  });
}

function scheduleSave() {
  state.saveState = "Saving...";
  document.querySelector(".save-state").textContent = state.saveState;
  clearTimeout(state.savingTimer);
  state.savingTimer = setTimeout(saveNote, 550);
}

async function saveNote() {
  const note = selectedNote();
  if (!note) return;
  const payload = {
    title: document.querySelector("[data-edit='title']").value,
    content: document.querySelector("[data-edit='content']").value,
    tags: document.querySelector("[data-edit='tags']").value,
    category: document.querySelector("[data-edit='category']").value
  };
  try {
    const data = await api(`/api/notes/${note.note_id}`, { method: "PATCH", body: JSON.stringify(payload) });
    state.notes = state.notes.map((item) => (item.note_id === data.note.note_id ? data.note : item));
    state.saveState = `Saved ${fmt(data.note.updated_at)}`;
  } catch (error) {
    state.saveState = error.message;
  }
  document.querySelector(".save-state").textContent = state.saveState;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function renderShared(id) {
  try {
    const { note } = await api(`/api/shared?id=${encodeURIComponent(id)}`);
    app.innerHTML = `
      <section class="shared-page">
        <div class="shared-note">
          <div class="brand">Peblo Notes</div>
          <h1>${escapeHtml(note.title)}</h1>
          <p class="meta">${escapeHtml(note.category)} · Updated ${fmt(note.updated_at)} · Shared by ${escapeHtml(note.owner?.name || "a Peblo user")}</p>
          <div class="tags">${note.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
          <article>${escapeHtml(note.content)}</article>
          ${note.ai ? `<div class="ai-box"><b>AI summary</b><p>${escapeHtml(note.ai.summary)}</p></div>` : ""}
        </div>
      </section>`;
  } catch {
    app.innerHTML = `<div class="empty-state"><div><h1>Shared note not found</h1><p>This link may have been disabled.</p></div></div>`;
  }
}

(async function init() {
  const { user } = await api("/api/me");
  state.user = user;
  if (user) await refreshAll();
  else render();
})();
