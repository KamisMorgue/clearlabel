// Shared helpers for the Clear Label server functions.
// Your secret API key is only ever used here, on the server — never sent to phones.

export const ALLERGENS = [
  { id: "lactose", label: "Lactose intolerance", hint: "Lactose-free dairy (e.g. Lactofree) is usually fine" },
  { id: "milk", label: "Milk allergy", hint: "All dairy, including lactose-free" },
  { id: "peanuts", label: "Peanuts", hint: "Including groundnut and arachis oil" },
  { id: "treenuts", label: "Tree nuts", hint: "Almond, hazelnut, walnut, cashew, pecan, Brazil, pistachio, macadamia" },
  { id: "gluten", label: "Gluten (coeliac)", hint: "Wheat, barley, rye, oats unless gluten-free" },
  { id: "egg", label: "Eggs", hint: "" },
  { id: "soya", label: "Soya", hint: "" },
  { id: "sesame", label: "Sesame", hint: "" },
  { id: "fish", label: "Fish", hint: "" },
  { id: "crustaceans", label: "Crustaceans", hint: "Prawns, crab, lobster" },
  { id: "molluscs", label: "Molluscs", hint: "Mussels, squid, oysters" },
  { id: "mustard", label: "Mustard", hint: "" },
  { id: "celery", label: "Celery", hint: "Including celeriac" },
  { id: "lupin", label: "Lupin", hint: "" },
  { id: "sulphites", label: "Sulphites", hint: "Often in wine, dried fruit" },
];
const byId = Object.fromEntries(ALLERGENS.map((a) => [a.id, a]));

// Which AI model to use. Change it in Vercel settings (CLAUDE_MODEL) if you like.
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

// ---------- the rules ----------
// APP_PASSWORD: only people who know it can use the app (so strangers can't spend your money).
export function checkPassword(req, res) {
  const want = process.env.APP_PASSWORD;
  if (!want) return true; // no password set
  const got = req.headers["x-app-password"] || "";
  if (got === want) return true;
  res.status(401).json({ error: "wrong_password" });
  return false;
}

export function cleanProfile(p) {
  const allergens = Array.isArray(p?.allergens) ? p.allergens.filter((a) => byId[a]) : [];
  return { allergens, strictMay: p?.strictMay !== false };
}

// ---------- Open Food Facts barcode lookup ----------
// The same product can be stored under slightly different numbers (UPC-A vs EAN-13), so try each.
function barcodeVariants(clean) {
  const v = new Set([clean]);
  if (clean.length < 13) v.add(clean.padStart(13, "0"));
  if (clean.length === 13 && clean.startsWith("0")) v.add(clean.slice(1));
  if (clean.length === 14 && clean.startsWith("0")) v.add(clean.slice(1));
  return [...v];
}

export async function lookupBarcode(code) {
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length < 8 || clean.length > 14) return null;
  const fields = [
    "product_name", "product_name_en", "generic_name", "brands", "quantity", "allergens_tags", "traces_tags",
    "ingredients_text_en", "ingredients_text", "image_front_small_url",
  ].join(",");
  for (const c of barcodeVariants(clean)) {
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${fields}`, {
        headers: { "User-Agent": "ClearLabel/1.1 (personal allergy checker)" },
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j.status !== 1 || !j.product) continue;
      const p = j.product;
      const name = [p.brands?.split(",")[0], p.product_name_en || p.product_name || p.generic_name, p.quantity].filter(Boolean).join(" ");
      const out = {
        barcode: clean,
        name,
        allergens: (p.allergens_tags || []).map((t) => t.replace(/^en:/, "")),
        traces: (p.traces_tags || []).map((t) => t.replace(/^en:/, "")),
        ingredients: (p.ingredients_text_en || p.ingredients_text || "").slice(0, 3000),
        image: p.image_front_small_url || null,
      };
      // "complete" = we know what it is AND have ingredients to go on
      out.complete = !!(out.name && out.ingredients);
      return out;
    } catch {}
  }
  return null;
}

// ---------- prompts ----------
function allergenBlock(profile) {
  const list = ALLERGENS.map((a) => `- ${a.id}: ${a.label}${a.hint ? " (" + a.hint + ")" : ""}`).join("\n");
  const mine = profile.allergens.map((id) => byId[id].label).join(", ") || "none";
  return { list, mine };
}

const SHOPS = "Tesco, Sainsbury's, Asda, Morrisons, Waitrose, Aldi, Lidl, Co-op, M&S, Ocado, Holland & Barrett";

export function checkPrompt({ mode, profile, text, product, barcode }) {
  const { list, mine } = allergenBlock(profile);
  const searchHelp = `You can use web search. Use it to find this product's real UK ingredients and allergy information, ideally the product page on a UK supermarket site (tesco.com, sainsburys.co.uk, groceries.asda.com, morrisons.com, waitrose.com, ocado.com) or the brand's own UK site. Copy allergen and 'may contain' details from those pages; do not guess. Keep searches to the few you need.`;
  let intro;
  if (mode === "barcode" && product) {
    intro = `The shopper scanned barcode ${product.barcode}. This is the product's record from the Open Food Facts database (filled in by volunteers):
Product: ${product.name || "(no name recorded)"}
Allergens listed: ${product.allergens.join(", ") || "none listed"}
"May contain" / traces listed: ${product.traces.join(", ") || "none listed"}
Ingredients: ${product.ingredients || "(not recorded)"}
${product.complete
  ? 'Use this record as the label (source "database").'
  : `This record is incomplete. ${searchHelp} Set source to "web" if you used web results.`}`;
  } else if (mode === "barcode") {
    intro = `The shopper scanned barcode ${barcode}. It is not in the Open Food Facts database.
${searchHelp} Start by searching for the barcode number itself to find which product it is (UK supermarket pages and product databases list barcodes / EAN codes).
If you can confidently identify the product, set source to "web". If you cannot identify it, set readable to false, product to null and every status to "unclear" – never guess which product a barcode is.`;
  } else if (mode === "image") {
    intro = `The image(s) are phone photos taken in a UK shop of ONE food or drink product. They may show the front, back, side or barcode, and may be angled, glary or partly blurry: do your best.
Step 1 – Identify the product (brand, name, flavour) from logos, design or text.
Step 2 – If an ingredients list or allergy box is readable, use it (source "label"). Allergens are in bold in UK ingredients lists. Look for 'may contain', 'may also contain', 'not suitable for ... allergy', 'made in a factory that handles', 'produced on a line that also handles', 'cannot guarantee ... free'.
If a barcode number is readable in the photo, note it in "barcode".
Step 3 – If ingredients are not readable but you identified the product: ${searchHelp} (source "web"). Only if search finds nothing, use your own knowledge of the product (source "memory"). Do not mark everything "unclear" just because the ingredients are not in the photo.
Only if you can neither identify the product nor read ingredients, set readable to false and statuses to "unclear".`;
  } else {
    intro = `The shopper typed this (a product name or an ingredients list):
"""${String(text).slice(0, 4000)}"""
If it is an ingredients list, read it as a label (source "label"). If it is a product name: ${searchHelp} (source "web"); only if search finds nothing, use your own knowledge (source "memory").`;
  }
  return `You are helping a UK shopper with food allergies and intolerances check a product.
${intro}

The shopper avoids: ${mine}.

For EVERY allergen id below, give a status:
- "contains": it is an ingredient (for lactose: any milk/dairy ingredient containing lactose such as milk, milk powder, whey, cream, butter, cheese, yoghurt, lactose; lactose-free/lactase-treated dairy is "clear" for lactose but "contains" for milk)
- "may_contain": only a precautionary / cross-contamination warning mentions it
- "clear": not mentioned anywhere
- "unclear": you genuinely cannot tell (use sparingly)
${list}

Also suggest up to 3 safer alternatives of the SAME kind of product sold in UK supermarkets (${SHOPS}) that, to your knowledge, do not contain and are not labelled "may contain" for what the shopper avoids. Only real UK products. Prefer free-from ranges and brands known for this.

Reply with ONLY this JSON, no other text:
{"product": "Brand + product + variety" or null, "readable": true/false, "source": "label"|"database"|"web"|"memory", "barcode": "digits if known, else empty",
 "findings": [{"allergen": id, "status": "contains"|"may_contain"|"clear"|"unclear", "evidence": "short words from the label/record, or empty", "explain": "one plain-English sentence for an older reader, only for contains/may_contain/unclear, else empty"}],
 "notes": "one or two plain sentences of anything else useful, or empty",
 "alternatives": [{"name": "Brand + product", "where": "shops", "why": "one short reason"}]}`;
}

export function findPrompt({ profile, what }) {
  const avoid = profile.allergens.map((id) => byId[id].label).join(", ");
  return `A UK shopper avoids: ${avoid}. ${profile.strictMay ? "They also avoid anything labelled 'may contain' or made in a factory handling these." : "Trace 'may contain' warnings are acceptable to them."}
They are looking for: ${String(what).slice(0, 300)}.
Suggest 6 real products currently sold in UK supermarkets (${SHOPS}) that, to your knowledge, suit them. Prefer free-from ranges and brands known for these allergies. Lactose-free dairy suits lactose intolerance but NOT milk allergy.
Reply with ONLY a JSON array, no other text: [{"name":"Brand + product","where":"shops","why":"one short plain reason","check":"one short thing to check on the pack, or empty"}]`;
}

// ---------- calling Claude ----------
// Web search lets Claude find a product's real allergy info on UK supermarket sites.
// Costs about 1p per search on top of the normal check. Turn off with WEB_SEARCH=off in Vercel.
const SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: Number(process.env.MAX_SEARCHES || 3),
  user_location: { type: "approximate", country: "GB", timezone: "Europe/London" },
};

export async function askClaude(prompt, images = [], { search = false } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error("ANTHROPIC_API_KEY is not set"), { code: "no_key" });
  const content = [];
  for (const img of images.slice(0, 3)) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(img || "");
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  content.push({ type: "text", text: prompt });
  const messages = [{ role: "user", content }];
  const useSearch = search && process.env.WEB_SEARCH !== "off";

  let blocks = [];
  for (let round = 0; round < 4; round++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 3000, messages,
        ...(useSearch ? { tools: [SEARCH_TOOL] } : {}),
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      // If web search is switched off for this account, quietly try again without it.
      if (useSearch && r.status === 400 && /web search/i.test(body)) return askClaude(prompt, images, { search: false });
      throw Object.assign(new Error(`Claude API ${r.status}: ${body.slice(0, 300)}`), { code: r.status === 429 ? "busy" : "api_error" });
    }
    const j = await r.json();
    blocks = blocks.concat(j.content || []);
    if (j.stop_reason !== "pause_turn") break;
    // A long search paused: send it back unchanged so Claude can carry on.
    messages.push({ role: "assistant", content: j.content });
  }
  // The answer is the text written after the last search result.
  let lastTool = -1;
  blocks.forEach((b, i) => { if (b.type === "web_search_tool_result" || b.type === "server_tool_use") lastTool = i; });
  const text = blocks.slice(lastTool + 1).filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJson(text || blocks.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

export function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const start = text.search(/[\[{]/), end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch {} }
  throw Object.assign(new Error("Could not read the answer"), { code: "bad_answer" });
}

export function sendError(res, e) {
  console.error(e);
  const code = e.code || "api_error";
  res.status(code === "no_key" ? 500 : 502).json({ error: code });
}
