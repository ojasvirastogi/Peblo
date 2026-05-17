function firstSentences(text, max = 2) {
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]*/g);
  return (sentences || []).slice(0, max).join(" ").trim();
}

function localAiSummary(content) {
  const text = String(content || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const actionItems = lines
    .filter((line) => /^(todo|action|next|follow|prepare|review|send|create|fix|schedule)\b/i.test(line))
    .map((line) => line.replace(/^[-*]\s*/, "").replace(/^(todo|action|next):?\s*/i, ""))
    .slice(0, 5);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 4);
  const keywords = [...new Set(words)].slice(0, 4);
  return {
    summary: firstSentences(text, 2) || "No substantial content yet. Add more detail to generate a richer summary.",
    action_items: actionItems.length ? actionItems : ["Review and refine this note"],
    suggested_title: titleFromText(lines[0] || keywords.join(" ") || "Workspace Note")
  };
}

function titleFromText(text) {
  return String(text || "Workspace Note")
    .replace(/[#*_`]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function generateAiOutput({ content, title }, config) {
  if (!config.llmApiKey) return localAiSummary(content || title);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.llmModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return strict JSON with keys summary, action_items, suggested_title. Keep summary under 70 words and action_items concise."
        },
        {
          role: "user",
          content: `Title: ${title || "Untitled"}\n\nNote:\n${content || ""}`
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const err = new Error(`LLM request failed: ${response.status} ${body}`);
    err.status = 502;
    throw err;
  }

  const json = await response.json();
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
  return {
    summary: String(parsed.summary || "").trim() || localAiSummary(content).summary,
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items.map(String).slice(0, 8) : [],
    suggested_title: String(parsed.suggested_title || "").trim() || localAiSummary(content).suggested_title
  };
}

module.exports = { generateAiOutput, localAiSummary, titleFromText };
