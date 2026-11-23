const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const FAST_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
const HANDWRITING_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

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
  if (language === 'ben') {
    return 'Extract all visible Bengali (বাংলা) and any English/numbers from this image accurately, preserving line breaks. Output ONLY the extracted text with no markdown or explanations. Return empty string if no text.';
  }
  if (language === 'eng') {
    return 'Extract all visible English text and numbers from this image accurately, preserving line breaks. Output ONLY the extracted text with no markdown or explanations. Return empty string if no text.';
  }
  if (language === 'handwriting') {
    return 'Transcribe all handwritten text (Bengali or English) from this image accurately, preserving line breaks. Output ONLY the transcribed text with no markdown or explanations. Return empty string if no text.';
  }
  return 'Extract all visible text from this image accurately (including English, Bengali/বাংলা, angled signs, or dark backgrounds), preserving line breaks. Output ONLY the extracted text with no markdown or explanations. Return empty string if no text.';
}

function cleanModelOutput(rawText) {
  let text = (rawText || '').trim();
  if (/^```[\w-]*\n?/.test(text) && /```$/.test(text)) {
    text = text.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return text;
}

async function querySingleModel({
  apiKey,
  model,
  prompt,
  mimeType,
  cleanBase64,
  signal,
}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const makePayload = (disableThinking) => {
    const generationConfig = {
      temperature: 0,
      maxOutputTokens: 2048,
    };
    if (disableThinking && model.includes('2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    return JSON.stringify({
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
      generationConfig,
    });
  };

  let upstream = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: makePayload(true),
    signal,
  });

  if (upstream.status === 400 && model.includes('2.5')) {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: makePayload(false),
      signal,
    });
  }

  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    const err = new Error(data?.error?.message || `HTTP ${upstream.status}`);
    err.status = upstream.status;
    throw err;
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const rawText = parts
    .filter((p) => !p?.thought && typeof p?.text === 'string')
    .map((p) => p.text)
    .join('');

  return cleanModelOutput(rawText);
}

/**
 * Hedged Parallel Race:
 * Starts primary model immediately; if it takes >2.2s, launches backups in parallel.
 * First successful response wins immediately and cancels remaining requests.
 */
async function raceOcrModels({ models, apiKey, prompt, mimeType, cleanBase64 }) {
  const controllers = models.map(() => new AbortController());
  const hardTimer = setTimeout(() => {
    controllers.forEach((c) => c.abort());
  }, 15000);

  const staggerDelays = [0, 2200, 4500];

  const tasks = models.map((model, idx) => {
    return new Promise((resolve, reject) => {
      const delay = staggerDelays[idx] ?? idx * 2000;
      const startTimer = setTimeout(() => {
        querySingleModel({
          apiKey,
          model,
          prompt,
          mimeType,
          cleanBase64,
          signal: controllers[idx].signal,
        })
          .then((text) => {
            controllers.forEach((c, i) => {
              if (i !== idx) c.abort();
            });
            resolve({ text, model });
          })
          .catch((err) => {
            reject(err);
          });
      }, delay);

      controllers[idx].signal.addEventListener(
        'abort',
        () => {
          clearTimeout(startTimer);
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        },
        { once: true }
      );
    });
  });

  try {
    return await Promise.any(tasks);
  } finally {
    clearTimeout(hardTimer);
  }
}

export async function onRequestPost(context) {
  if (String(context.env?.OCR_DISABLED || '').toLowerCase() === 'true') {
    return jsonResponse(
      { error: 'Image to Text (OCR) is temporarily paused for maintenance. Please check back shortly.' },
      503
    );
  }

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

  const models = language === 'handwriting' ? HANDWRITING_MODELS : FAST_MODELS;
  const prompt = buildPrompt(language);

  try {
    const result = await raceOcrModels({
      models,
      apiKey,
      prompt,
      mimeType,
      cleanBase64,
    });
    return jsonResponse({ text: result.text, model: result.model }, 200);
  } catch (aggErr) {
    const errors = Array.isArray(aggErr?.errors) ? aggErr.errors : [aggErr];
    const authErr = errors.find(
      (e) => e?.status === 401 || e?.status === 403 || /api key/i.test(String(e?.message || ''))
    );
    if (authErr) {
      return jsonResponse(
        { error: 'OCR service authentication failed. Please check GEMINI_API_KEY.' },
        503
      );
    }

    const rateErr = errors.find((e) => e?.status === 429);
    if (rateErr) {
      return jsonResponse(
        { error: 'Free AI quota is momentarily busy. Wait 10 seconds and click Re-run OCR.' },
        429
      );
    }

    const detail = errors.find((e) => e?.name !== 'AbortError')?.message || 'Upstream timeout';
    return jsonResponse(
      { error: `OCR took too long (${detail}). Please click Re-run OCR.` },
      504
    );
  }
}
