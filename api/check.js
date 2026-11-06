// POST /api/check  — check one product by barcode, photos, or typed text.
import { checkPassword, cleanProfile, lookupBarcode, checkPrompt, askClaude, sendError } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!checkPassword(req, res)) return;
  if (req.body?.mode === "ping") return res.status(200).json({ ok: true });
  const { mode, barcode, images, text } = req.body || {};
  const profile = cleanProfile(req.body?.profile);

  try {
    if (mode === "barcode") {
      const product = await lookupBarcode(barcode);
      if (!product) return res.status(200).json({ notFound: true, barcode });
      const r = await askClaude(checkPrompt({ mode, profile, product }));
      r.product = r.product || product.name;
      r.image = product.image;
      r.source = "database";
      return res.status(200).json(r);
    }
    if (mode === "image") {
      if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: "no_images" });
      return res.status(200).json(await askClaude(checkPrompt({ mode, profile }), images));
    }
    if (mode === "text") {
      if (!text) return res.status(400).json({ error: "no_text" });
      return res.status(200).json(await askClaude(checkPrompt({ mode, profile, text })));
    }
    res.status(400).json({ error: "bad_mode" });
  } catch (e) {
    sendError(res, e);
  }
}
