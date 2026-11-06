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
      const clean = String(barcode || "").replace(/\D/g, "");
      if (clean.length < 8) return res.status(400).json({ error: "bad_barcode" });
      const product = await lookupBarcode(clean);
      // Complete database record: quick and cheap. Otherwise Claude searches UK shop sites.
      const r = await askClaude(checkPrompt({ mode, profile, product, barcode: clean }), [], { search: !product?.complete });
      if (!product && (r.readable === false || !r.product)) return res.status(200).json({ notFound: true, barcode: clean });
      r.product = r.product || product?.name || null;
      r.image = product?.image || null;
      r.barcode = clean;
      if (product?.complete) r.source = "database";
      return res.status(200).json(r);
    }
    if (mode === "image") {
      if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: "no_images" });
      return res.status(200).json(await askClaude(checkPrompt({ mode, profile }), images, { search: true }));
    }
    if (mode === "text") {
      if (!text) return res.status(400).json({ error: "no_text" });
      return res.status(200).json(await askClaude(checkPrompt({ mode, profile, text }), [], { search: true }));
    }
    res.status(400).json({ error: "bad_mode" });
  } catch (e) {
    sendError(res, e);
  }
}
