const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

let cachedWorkingModel = null;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function isAllowedOrigin(request) {
  const originHeader = request.headers.get('Origin');
  if (!originHeader) return true;
  try {
    const reqHost = new URL(request.url).host;
    const originHost = new URL(originHeader).host;
    if (originHost === reqHost) return true;
    if (originHost.startsWith('localhost:') || originHost.startsWith('127.0.0.1:')) return true;
    return false;
  } catch {
    return false;
  }
}

function buildPrompt(language) {
  const baseRules =
    'You are a high-precision OCR engine. Extract ALL visible text from this image accurately, including angled signs, logos with text, dark backgrounds, receipts, tables, and dense paragraphs. Preserve natural line breaks and reading order. Output ONLY the extracted text itself—no explanations, no markdown code blocks, no intro or outro. If there is genuinely no readable text in the image, return an empty string.';

  if (language === 'ben') {
    return `${baseRules} Focus especially on accurate Bengali (বাংলা) script, matra, and juktakhor (যুক্তবর্ণ), while keeping any numbers or English words intact.`;
  }
  if (language === 'eng') {
    return `${baseRules} Focus on accurate English text, punctuation, and numbers.`;
  }
  if (language === 'handwriting') {
    return `${baseRules} This image may contain handwritten notes (Bengali or English). Transcribe the handwriting faithfully line by line.`;
  }
  return `${baseRules} Auto-detect all languages present (including Bengali/বাংলা, English, or mixed text) and transcribe them in their original script.`;
}

function cleanModelOutput(rawText) {
  let text = (rawText || '').trim();
  if (/^```[\w-]*\n?/.test(text) && /```$/.test(text)) {
    text = text.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return text;
}

/** Auto-discovers the newest live Gemini Flash models available on this API key */
async function discoverFlashModels(apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.models) ? data.models : [];

    const candidates = list
      .filter((m) => {
        const name = String(m?.name || '').toLowerCase();
        const methods = Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        if (!methods.includes('generateContent')) return false;
        if (!name.includes('gemini') || !name.includes('flash')) return false;
        if (/tts|audio|live|image|embed|aqa|robotics|computer-use|1\.0|1\.5|2\.0/.test(name)) {
          return false;
        }
        return true;
      })
      .map((m) => String(m.name).replace(/^models\//, ''));

    const scoreModel = (name) => {
      let score = 0;
      const ver = /gemini-(\d+(?:\.\d+)?)/.exec(name);
      if (ver) score += parseFloat(ver[1]) * 100;
      if (name === 'gemini-flash-latest') score += 290;
      if (!name.includes('lite')) score += 20;
      if (!name.includes('preview') && !name.includes('exp')) score += 15;
      if (name.includes('thinking')) score -= 30;
      return score;
    };

    candidates.sort((a, b) => scoreModel(b) - scoreModel(a));
    return [...new Set(candidates)].slice(0, 6);
  } catch {
    return [];
  }
}

export async function onRequestPost(context) {
  // Instant remote kill-switch via Cloudflare Pages Settings -> Variables and secrets (OCR_DISABLED=true)
  if (String(context.env?.OCR_DISABLED || '').toLowerCase() === 'true') {
    return jsonResponse(
      { error: 'Image to Text (OCR) is temporarily paused for maintenance. Please check back shortly.' },
      503
    );
  }

  // Prevent external websites from hotlinking/leeching your OCR endpoint
  if (!isAllowedOrigin(context.request)) {
    return jsonResponse({ error: 'Cross-origin OCR requests are not allowed.' }, 403);
  }

  const apiKey = context.env?.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          'Server OCR key is not configured yet. Add GEMINI_API_KEY in Cloudflare Pages Settings → Variables and Secrets, then retry deployment.',
      },
      500
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const maxMb = Math.max(1, Math.min(12, Number(context.env?.OCR_MAX_MB) || 6));
  const maxBase64Length = Math.round(maxMb * 1_350_000);

  const rawBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim() : 'image/jpeg';
  const language = typeof body?.language === 'string' ? body.language.trim() : 'auto';

  const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '');
  if (!cleanBase64) {
    return jsonResponse({ error: 'No image data received.' }, 400);
  }
  if (cleanBase64.length > maxBase64Length) {
    return jsonResponse(
      { error: `Image is too large for OCR (max ${maxMb}MB). Please try a smaller photo.` },
      413
    );
  }
  if (!ALLOWED_MIMES.has(mimeType)) {
    return jsonResponse({ error: 'Unsupported image format for OCR.' }, 400);
  }

  const discovered = cachedWorkingModel ? [] : await discoverFlashModels(apiKey);
  const modelsToTry = [
    ...new Set([
      ...(cachedWorkingModel ? [cachedWorkingModel] : []),
      ...discovered,
      ...FALLBACK_MODELS,
    ]),
  ];

  const prompt = buildPrompt(language);
  let lastErrorMsg = 'Could not extract text right now. Please try again.';
  let lastStatus = 502;

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      });

      const data = await upstream.json().catch(() => ({}));

      if (upstream.ok) {
        cachedWorkingModel = model;
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const rawText = parts
          .filter((p) => !p?.thought && typeof p?.text === 'string')
          .map((p) => p.text)
          .join('');
        const text = cleanModelOutput(rawText);
        return jsonResponse({ text }, 200);
      }

      if (cachedWorkingModel === model) {
        cachedWorkingModel = null;
      }

      const apiMsg = data?.error?.message || '';
      if (upstream.status === 401 || upstream.status === 403 || /api key/i.test(apiMsg)) {
        return jsonResponse(
          { error: 'OCR service authentication failed. Please contact the site administrator.' },
          503
        );
      }

      if (upstream.status === 429) {
        lastStatus = 429;
        lastErrorMsg = 'OCR service is busy right now. Please wait 10–15 seconds and click Re-run OCR.';
        continue;
      }

      lastStatus = upstream.status;
      lastErrorMsg = apiMsg || lastErrorMsg;
    } catch (err) {
      lastStatus = 502;
      lastErrorMsg = err instanceof Error ? err.message : lastErrorMsg;
    }
  }

  return jsonResponse({ error: lastErrorMsg }, lastStatus);
}
