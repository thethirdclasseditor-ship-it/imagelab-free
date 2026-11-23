const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FALLBACK_FAST = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];
const FALLBACK_HANDWRITING = [
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
];

// Cached in memory across warm requests for instant response
const cachedModel = { fast: null, handwriting: null };
const modelsWithoutThinkingConfig = new Set();

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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Auto-discovers live Gemini 3.x Flash models on this API key, prioritizing fast flash-lite */
async function discoverFlashModels(apiKey, preferLite) {
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
      3500
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
        if (/tts|audio|live|image|embed|aqa|robotics|computer-use|1\.0|1\.5|2\.0|2\.5/.test(name)) {
          return false;
        }
        return true;
      })
      .map((m) => String(m.name).replace(/^models\//, ''));

    const scoreModel = (name) => {
      let score = 0;
      const ver = /gemini-(\d+(?:\.\d+)?)/.exec(name);
      if (ver) score += parseFloat(ver[1]) * 100;
      if (name === 'gemini-flash-lite-latest') score += preferLite ? 390 : 320;
      if (name === 'gemini-flash-latest') score += preferLite ? 330 : 390;
      if (name.includes('lite')) score += preferLite ? 50 : -15;
      if (!name.includes('preview') && !name.includes('exp')) score += 15;
      if (name.includes('thinking')) score -= 60;
      return score;
    };

    candidates.sort((a, b) => scoreModel(b) - scoreModel(a));
    return [...new Set(candidates)].slice(0, 4);
  } catch {
    return [];
  }
}

async function requestOcrModel({ apiKey, model, prompt, mimeType, cleanBase64, useThinkingConfig, timeoutMs }) {
  const generationConfig = {
    temperature: 0,
    maxOutputTokens: 2048,
  };

  if (useThinkingConfig) {
    if (model.includes('3.') || model.includes('latest')) {
      generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
    } else if (model.includes('2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  return fetchWithTimeout(
    endpoint,
    {
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
        generationConfig,
      }),
    },
    timeoutMs
  );
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

  const bucket = language === 'handwriting' ? 'handwriting' : 'fast';
  const preferLite = bucket === 'fast';
  const fallbacks = preferLite ? FALLBACK_FAST : FALLBACK_HANDWRITING;

  const discovered = cachedModel[bucket] ? [] : await discoverFlashModels(apiKey, preferLite);
  const modelsToTry = [
    ...new Set([
      ...(cachedModel[bucket] ? [cachedModel[bucket]] : []),
      ...discovered,
      ...fallbacks,
    ]),
  ].slice(0, 4);

  const prompt = buildPrompt(language);
  let lastErrorMsg = 'Could not extract text right now. Please try again.';
  let lastStatus = 502;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const timeoutMs = i === 0 ? 12000 : 15000;
    const tryThinking = !modelsWithoutThinkingConfig.has(model);

    try {
      let upstream = await requestOcrModel({
        apiKey,
        model,
        prompt,
        mimeType,
        cleanBase64,
        useThinkingConfig: tryThinking,
        timeoutMs,
      });

      // If this model rejects thinkingConfig with 400, remember it and retry cleanly right away
      if (upstream.status === 400 && tryThinking) {
        const errBody = await upstream.clone().json().catch(() => ({}));
        const msg = String(errBody?.error?.message || '');
        if (/thinking/i.test(msg)) {
          modelsWithoutThinkingConfig.add(model);
          upstream = await requestOcrModel({
            apiKey,
            model,
            prompt,
            mimeType,
            cleanBase64,
            useThinkingConfig: false,
            timeoutMs,
          });
        }
      }

      const data = await upstream.json().catch(() => ({}));

      if (upstream.ok) {
        cachedModel[bucket] = model;
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const rawText = parts
          .filter((p) => !p?.thought && typeof p?.text === 'string')
          .map((p) => p.text)
          .join('');
        return jsonResponse({ text: cleanModelOutput(rawText), model }, 200);
      }

      if (cachedModel[bucket] === model) {
        cachedModel[bucket] = null;
      }

      const apiMsg = data?.error?.message || '';
      if (upstream.status === 401 || upstream.status === 403 || /api key/i.test(apiMsg)) {
        return jsonResponse(
          { error: 'OCR service authentication failed. Please check GEMINI_API_KEY.' },
          503
        );
      }

      if (upstream.status === 429) {
        lastStatus = 429;
        lastErrorMsg = 'Free AI quota is momentarily busy. Wait 10 seconds and click Re-run OCR.';
        continue;
      }

      lastStatus = upstream.status;
      lastErrorMsg = apiMsg || lastErrorMsg;
    } catch (err) {
      if (cachedModel[bucket] === model) {
        cachedModel[bucket] = null;
      }
      if (err && err.name === 'AbortError') {
        lastStatus = 504;
        lastErrorMsg = 'OCR server took too long to respond. Please click Re-run OCR.';
        continue;
      }
      lastStatus = 502;
      lastErrorMsg = err instanceof Error ? err.message : lastErrorMsg;
    }
  }

  return jsonResponse({ error: lastErrorMsg }, lastStatus);
}
