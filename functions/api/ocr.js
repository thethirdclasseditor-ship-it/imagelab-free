const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BASE64_LENGTH = 8_000_000; // ~6MB binary safety cap
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
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
  // Strip accidental markdown code fences if the model wraps output
  if (/^```[\w-]*\n?/.test(text) && /```$/.test(text)) {
    text = text.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return text;
}

export async function onRequestPost(context) {
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

  const rawBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim() : 'image/jpeg';
  const language = typeof body?.language === 'string' ? body.language.trim() : 'auto';

  const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '');
  if (!cleanBase64) {
    return jsonResponse({ error: 'No image data received.' }, 400);
  }
  if (cleanBase64.length > MAX_BASE64_LENGTH) {
    return jsonResponse({ error: 'Image is too large for OCR. Please try a smaller photo.' }, 413);
  }
  if (!ALLOWED_MIMES.has(mimeType)) {
    return jsonResponse({ error: 'Unsupported image format for OCR.' }, 400);
  }

  const prompt = buildPrompt(language);
  let lastErrorMsg = 'Could not extract text right now. Please try again.';
  let lastStatus = 502;

  for (const model of MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const rawText = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
        const text = cleanModelOutput(rawText);
        return jsonResponse({ text, model }, 200);
      }

      const apiMsg = data?.error?.message || '';
      if (upstream.status === 429) {
        lastStatus = 429;
        lastErrorMsg = 'Free AI quota is busy right now. Please wait 10–15 seconds and click Re-run.';
        continue;
      }
      if (upstream.status === 400 || upstream.status === 403) {
        return jsonResponse(
          { error: apiMsg || 'Gemini API rejected the key or request. Verify GEMINI_API_KEY.' },
          upstream.status
        );
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
