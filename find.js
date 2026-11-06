// POST /api/find  — suggest safe UK products for a type of food.
import { checkPassword, cleanProfile, findPrompt, askClaude, sendError } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!checkPassword(req, res)) return;
  const profile = cleanProfile(req.body?.profile);
  const what = req.body?.what;
  if (!what || !profile.allergens.length) return res.status(400).json({ error: "missing" });
  try {
    const list = await askClaude(findPrompt({ profile, what }));
    res.status(200).json({ items: Array.isArray(list) ? list.slice(0, 8) : [] });
  } catch (e) {
    sendError(res, e);
  }
}
