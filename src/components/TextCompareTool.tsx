import React, { useState, useRef, useEffect, useMemo } from 'react';

type CompareMode = 'lines' | 'words' | 'chars';
type ViewLayout = 'split' | 'unified';
type DiffType = 'equal' | 'add' | 'remove';

interface DiffOp {
  type: DiffType;
  value: string;
}

interface SplitRow {
  leftNum: number | null;
  rightNum: number | null;
  leftText: string | null;
  rightText: string | null;
  kind: 'equal' | 'add' | 'remove' | 'modify';
  leftInline?: DiffOp[];
  rightInline?: DiffOp[];
}

const SAMPLE_ORIGINAL = `ImageLabKit is a fast online image and PDF studio.
It works directly in your browser without uploading files.
Supported tools include Merge PDF, Compress PDF, and Word Counter.
বাংলা ও ইংরেজি দুই ভাষাতেই লেখার পার্থক্য সহজে বের করা যায়।
This line will be removed in the updated draft.`;

const SAMPLE_MODIFIED = `ImageLabKit is a fast, free online image, PDF & graphics studio.
It works 100% locally in your browser without uploading files.
Supported tools include Merge PDF, Compress PDF, Word Counter, and Text Compare.
বাংলা এবং ইংরেজি উভয় ভাষাতেই লেখার পার্থক্য নিখুঁতভাবে বের করা যায়।
Added a brand new line at the bottom for comparison.`;

function normalizeForCompare(str: string, ignoreCase: boolean, ignoreWhitespace: boolean): string {
  let out = str;
  if (ignoreWhitespace) {
    out = out.trim().replace(/[ \t]+/g, ' ');
  }
  if (ignoreCase) {
    out = out.toLowerCase();
  }
  return out;
}

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[\p{L}\p{M}\p{N}_]+|\r?\n|[ \t]+|[^\p{L}\p{M}\p{N}_\s]/gu);
  return matches ?? Array.from(text);
}

function tokenizeChars(text: string): string[] {
  if (!text) return [];
  try {
    const IntlAny = Intl as unknown as {
      Segmenter?: new (
        locales?: string,
        options?: { granularity: 'grapheme' }
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    };
    if (IntlAny.Segmenter) {
      const seg = new IntlAny.Segmenter('en', { granularity: 'grapheme' });
      return Array.from(seg.segment(text), (s) => s.segment);
    }
  } catch {
    // Fallback below
  }
  return Array.from(text);
}

function computeDiff(
  aTokens: string[],
  bTokens: string[],
  ignoreCase: boolean,
  ignoreWhitespace: boolean
): DiffOp[] {
  const aNorm = aTokens.map((t) => normalizeForCompare(t, ignoreCase, ignoreWhitespace));
  const bNorm = bTokens.map((t) => normalizeForCompare(t, ignoreCase, ignoreWhitespace));

  // Fast trim of common prefix & suffix
  let start = 0;
  const minLen = Math.min(aTokens.length, bTokens.length);
  while (start < minLen && aNorm[start] === bNorm[start]) {
    start++;
  }

  let aEnd = aTokens.length - 1;
  let bEnd = bTokens.length - 1;
  while (aEnd >= start && bEnd >= start && aNorm[aEnd] === bNorm[bEnd]) {
    aEnd--;
    bEnd--;
  }

  const prefix: DiffOp[] = [];
  for (let i = 0; i < start; i++) {
    prefix.push({ type: 'equal', value: bTokens[i] });
  }

  const suffix: DiffOp[] = [];
  for (let i = bEnd + 1; i < bTokens.length; i++) {
    suffix.push({ type: 'equal', value: bTokens[i] });
  }

  const aMid = aTokens.slice(start, aEnd + 1);
  const bMid = bTokens.slice(start, bEnd + 1);
  const aMidNorm = aNorm.slice(start, aEnd + 1);
  const bMidNorm = bNorm.slice(start, bEnd + 1);

  const m = aMid.length;
  const n = bMid.length;
  const middle: DiffOp[] = [];

  if (m === 0) {
    for (let j = 0; j < n; j++) middle.push({ type: 'add', value: bMid[j] });
    return [...prefix, ...middle, ...suffix];
  }
  if (n === 0) {
    for (let i = 0; i < m; i++) middle.push({ type: 'remove', value: aMid[i] });
    return [...prefix, ...middle, ...suffix];
  }

  // Exact LCS for normal sizes; greedy window fallback for huge inputs to keep UI instant
  const MAX_CELLS = 2_400_000;
  if (m * n <= MAX_CELLS) {
    const stride = n + 1;
    const dp = new Uint32Array((m + 1) * stride);

    for (let i = m - 1; i >= 0; i--) {
      const rowOffset = i * stride;
      const nextRowOffset = (i + 1) * stride;
      const aVal = aMidNorm[i];
      for (let j = n - 1; j >= 0; j--) {
        if (aVal === bMidNorm[j]) {
          dp[rowOffset + j] = dp[nextRowOffset + j + 1] + 1;
        } else {
          const down = dp[nextRowOffset + j];
          const right = dp[rowOffset + j + 1];
          dp[rowOffset + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (aMidNorm[i] === bMidNorm[j]) {
        middle.push({ type: 'equal', value: bMid[j] });
        i++;
        j++;
      } else if (dp[(i + 1) * stride + j] >= dp[i * stride + j + 1]) {
        middle.push({ type: 'remove', value: aMid[i] });
        i++;
      } else {
        middle.push({ type: 'add', value: bMid[j] });
        j++;
      }
    }
    while (i < m) {
      middle.push({ type: 'remove', value: aMid[i++] });
    }
    while (j < n) {
      middle.push({ type: 'add', value: bMid[j++] });
    }
  } else {
    let i = 0;
    let j = 0;
    const windowSize = 40;
    while (i < m && j < n) {
      if (aMidNorm[i] === bMidNorm[j]) {
        middle.push({ type: 'equal', value: bMid[j] });
        i++;
        j++;
        continue;
      }
      let foundA = -1;
      let foundB = -1;
      for (let k = 1; k <= windowSize; k++) {
        if (foundB === -1 && j + k < n && aMidNorm[i] === bMidNorm[j + k]) foundB = j + k;
        if (foundA === -1 && i + k < m && aMidNorm[i + k] === bMidNorm[j]) foundA = i + k;
        if (foundA !== -1 || foundB !== -1) break;
      }
      if (foundB !== -1 && (foundA === -1 || foundB - j <= foundA - i)) {
        while (j < foundB) middle.push({ type: 'add', value: bMid[j++] });
      } else if (foundA !== -1) {
        while (i < foundA) middle.push({ type: 'remove', value: aMid[i++] });
      } else {
        middle.push({ type: 'remove', value: aMid[i++] });
        middle.push({ type: 'add', value: bMid[j++] });
      }
    }
    while (i < m) middle.push({ type: 'remove', value: aMid[i++] });
    while (j < n) middle.push({ type: 'add', value: bMid[j++] });
  }

  return [...prefix, ...middle, ...suffix];
}

function buildSplitRows(
  lineOps: DiffOp[],
  ignoreCase: boolean,
  ignoreWhitespace: boolean
): SplitRow[] {
  const rows: SplitRow[] = [];
  let leftLine = 1;
  let rightLine = 1;
  let i = 0;

  while (i < lineOps.length) {
    const op = lineOps[i];
    if (op.type === 'equal') {
      rows.push({
        leftNum: leftLine++,
        rightNum: rightLine++,
        leftText: op.value,
        rightText: op.value,
        kind: 'equal',
      });
      i++;
      continue;
    }

    // Group adjacent remove + add blocks to pair modified lines side-by-side
    const removed: string[] = [];
    const added: string[] = [];
    while (i < lineOps.length && lineOps[i].type !== 'equal') {
      if (lineOps[i].type === 'remove') removed.push(lineOps[i].value);
      else added.push(lineOps[i].value);
      i++;
    }

    const maxCount = Math.max(removed.length, added.length);
    for (let k = 0; k < maxCount; k++) {
      const l = k < removed.length ? removed[k] : null;
      const r = k < added.length ? added[k] : null;

      if (l !== null && r !== null) {
        const inlineOps = computeDiff(
          tokenizeWords(l),
          tokenizeWords(r),
          ignoreCase,
          ignoreWhitespace
        );
        rows.push({
          leftNum: leftLine++,
          rightNum: rightLine++,
          leftText: l,
          rightText: r,
          kind: 'modify',
          leftInline: inlineOps.filter((x) => x.type !== 'add'),
          rightInline: inlineOps.filter((x) => x.type !== 'remove'),
        });
      } else if (l !== null) {
        rows.push({
          leftNum: leftLine++,
          rightNum: null,
          leftText: l,
          rightText: null,
          kind: 'remove',
        });
      } else if (r !== null) {
        rows.push({
          leftNum: null,
          rightNum: rightLine++,
          leftText: null,
          rightText: r,
          kind: 'add',
        });
      }
    }
  }

  return rows;
}

export default function TextCompareTool() {
  const [originalText, setOriginalText] = useState<string>('');
  const [modifiedText, setModifiedText] = useState<string>('');

  const [mode, setMode] = useState<CompareMode>('lines');
  const [layout, setLayout] = useState<ViewLayout>('split');
  const [ignoreCase, setIgnoreCase] = useState<boolean>(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(false);
  const [changesOnly, setChangesOnly] = useState<boolean>(false);

  const [copiedState, setCopiedState] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');

  const leftFileRef = useRef<HTMLInputElement>(null);
  const rightFileRef = useRef<HTMLInputElement>(null);

  const hasContent = originalText.length > 0 || modifiedText.length > 0;

  // Compute active diff
  const diffResult = useMemo(() => {
    if (!hasContent) {
      return {
        ops: [] as DiffOp[],
        rows: [] as SplitRow[],
        added: 0,
        removed: 0,
        unchanged: 0,
        similarity: 100,
      };
    }

    const normA = originalText.replace(/\r\n/g, '\n');
    const normB = modifiedText.replace(/\r\n/g, '\n');

    if (mode === 'lines') {
      const aLines = normA === '' ? [] : normA.split('\n');
      const bLines = normB === '' ? [] : normB.split('\n');
      const ops = computeDiff(aLines, bLines, ignoreCase, ignoreWhitespace);
      const rows = buildSplitRows(ops, ignoreCase, ignoreWhitespace);

      let added = 0;
      let removed = 0;
      let unchanged = 0;
      for (const op of ops) {
        if (op.type === 'add') added++;
        else if (op.type === 'remove') removed++;
        else unchanged++;
      }

      const denom = Math.max(1, unchanged * 2 + added + removed);
      const similarity = Math.round(((unchanged * 2) / denom) * 100);

      return { ops, rows, added, removed, unchanged, similarity };
    }

    const aTokens = mode === 'words' ? tokenizeWords(normA) : tokenizeChars(normA);
    const bTokens = mode === 'words' ? tokenizeWords(normB) : tokenizeChars(normB);
    const ops = computeDiff(aTokens, bTokens, ignoreCase, ignoreWhitespace);

    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const op of ops) {
      if (mode === 'words' && /^\s+$/.test(op.value)) continue;
      if (op.type === 'add') added++;
      else if (op.type === 'remove') removed++;
      else unchanged++;
    }

    const denom = Math.max(1, unchanged * 2 + added + removed);
    const similarity = Math.round(((unchanged * 2) / denom) * 100);

    return { ops, rows: [] as SplitRow[], added, removed, unchanged, similarity };
  }, [originalText, modifiedText, mode, ignoreCase, ignoreWhitespace, hasContent]);

  // Unified text report for Copy / Download
  const diffReport = useMemo(() => {
    if (!hasContent) return '';
    if (mode === 'lines') {
      return diffResult.ops
        .map((op) => {
          const prefix = op.type === 'add' ? '+ ' : op.type === 'remove' ? '- ' : '  ';
          return `${prefix}${op.value}`;
        })
        .join('\n');
    }
    return diffResult.ops
      .map((op) => {
        if (op.type === 'add') return `{+${op.value}+}`;
        if (op.type === 'remove') return `[-${op.value}-]`;
        return op.value;
      })
      .join('');
  }, [diffResult.ops, mode, hasContent]);

  useEffect(() => {
    if (!diffReport) {
      setDownloadUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return '';
      });
      return;
    }

    const next = URL.createObjectURL(
      new Blob([diffReport], { type: 'text/plain;charset=utf-8' })
    );
    setDownloadUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return next;
    });
    return () => URL.revokeObjectURL(next);
  }, [diffReport]);

  const handleFileUpload = (file: File, side: 'left' | 'right') => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (side === 'left') setOriginalText(content);
      else setModifiedText(content);
    };
    reader.readAsText(file);
  };

  const handleSwap = () => {
    setOriginalText(modifiedText);
    setModifiedText(originalText);
  };

  const handleSample = () => {
    setOriginalText(SAMPLE_ORIGINAL);
    setModifiedText(SAMPLE_MODIFIED);
  };

  const handleClear = () => {
    setOriginalText('');
    setModifiedText('');
  };

  const handleCopyDiff = async () => {
    if (!diffReport) return;
    try {
      await navigator.clipboard.writeText(diffReport);
      setCopiedState('diff');
      window.setTimeout(() => setCopiedState(''), 1800);
    } catch {
      // ignore
    }
  };

  const visibleSplitRows = useMemo(() => {
    if (!changesOnly) return diffResult.rows;
    return diffResult.rows.filter((r) => r.kind !== 'equal');
  }, [diffResult.rows, changesOnly]);

  const visibleUnifiedLineOps = useMemo(() => {
    if (mode !== 'lines') return [];
    let lNum = 1;
    let rNum = 1;
    const mapped = diffResult.ops.map((op) => {
      if (op.type === 'equal') {
        return { op, leftNum: lNum++, rightNum: rNum++ };
      }
      if (op.type === 'remove') {
        return { op, leftNum: lNum++, rightNum: null };
      }
      return { op, leftNum: null, rightNum: rNum++ };
    });
    return changesOnly ? mapped.filter((m) => m.op.type !== 'equal') : mapped;
  }, [diffResult.ops, mode, changesOnly]);

  const isIdentical =
    hasContent && diffResult.added === 0 && diffResult.removed === 0;

  const unitLabel =
    mode === 'lines' ? 'lines' : mode === 'words' ? 'words' : 'chars';

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="studio-card rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3">
        {/* Granularity & View */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-semibold">
            {(
              [
                { id: 'lines', label: 'Lines' },
                { id: 'words', label: 'Words' },
                { id: 'chars', label: 'Characters' },
              ] as { id: CompareMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 cursor-pointer transition ${
                  mode === m.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'lines' && (
            <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLayout('split')}
                className={`px-3 py-1.5 cursor-pointer transition ${
                  layout === 'split'
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => setLayout('unified')}
                className={`px-3 py-1.5 cursor-pointer transition ${
                  layout === 'unified'
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                Unified
              </button>
            </div>
          )}
        </div>

        {/* Options & Quick Actions */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={ignoreCase}
              onChange={(e) => setIgnoreCase(e.target.checked)}
              className="accent-blue-600 rounded"
            />
            <span>Ignore case</span>
          </label>

          <label className="inline-flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => setIgnoreWhitespace(e.target.checked)}
              className="accent-blue-600 rounded"
            />
            <span>Ignore spaces</span>
          </label>

          {mode === 'lines' && (
            <label className="inline-flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={changesOnly}
                onChange={(e) => setChangesOnly(e.target.checked)}
                className="accent-blue-600 rounded"
              />
              <span>Changes only</span>
            </label>
          )}

          <div className="flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={handleSample}
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer transition"
            >
              Sample
            </button>
            <button
              type="button"
              onClick={handleSwap}
              disabled={!hasContent}
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-40 cursor-pointer transition"
            >
              Swap
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!hasContent}
              className="px-2.5 py-1.5 rounded-xl text-zinc-500 hover:text-red-600 font-semibold disabled:opacity-40 cursor-pointer transition"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Dual Text Input Area */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Original Text */}
        <div className="studio-card rounded-3xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <label
                htmlFor="diff-original"
                className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
              >
                Original Text
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 font-mono">
                {originalText ? originalText.split(/\r?\n/).length : 0} lines
              </span>
              <input
                ref={leftFileRef}
                type="file"
                accept=".txt,.md,.csv,.json,.xml,.html,.css,.js,.ts,.tsx,.py,.java,.log"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handleFileUpload(f, 'left');
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => leftFileRef.current?.click()}
                className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer"
              >
                Upload File
              </button>
            </div>
          </div>

          <textarea
            id="diff-original"
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            rows={10}
            placeholder="Paste original text, code, or বাংলা paragraph here…"
            spellCheck={false}
            className="w-full rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 p-3.5 text-xs sm:text-[13.5px] leading-relaxed text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y"
          />
        </div>

        {/* Modified Text */}
        <div className="studio-card rounded-3xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <label
                htmlFor="diff-modified"
                className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
              >
                Modified Text
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 font-mono">
                {modifiedText ? modifiedText.split(/\r?\n/).length : 0} lines
              </span>
              <input
                ref={rightFileRef}
                type="file"
                accept=".txt,.md,.csv,.json,.xml,.html,.css,.js,.ts,.tsx,.py,.java,.log"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handleFileUpload(f, 'right');
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => rightFileRef.current?.click()}
                className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer"
              >
                Upload File
              </button>
            </div>
          </div>

          <textarea
            id="diff-modified"
            value={modifiedText}
            onChange={(e) => setModifiedText(e.target.value)}
            rows={10}
            placeholder="Paste updated or changed text here to compare…"
            spellCheck={false}
            className="w-full rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 p-3.5 text-xs sm:text-[13.5px] leading-relaxed text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y"
          />
        </div>
      </div>

      {/* Live Comparison Output */}
      {hasContent && (
        <div className="studio-card rounded-3xl overflow-hidden">
          {/* Summary Header */}
          <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/70 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-xl bg-rose-500/12 text-rose-700 dark:text-rose-300 font-bold">
                − {diffResult.removed} removed
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-bold">
                + {diffResult.added} added
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold">
                {diffResult.unchanged} unchanged {unitLabel}
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 font-bold">
                {diffResult.similarity}% match
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyDiff}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 text-xs font-semibold text-zinc-800 dark:text-zinc-100 cursor-pointer transition"
              >
                {copiedState === 'diff' ? 'Copied!' : 'Copy Diff'}
              </button>

              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download="imagelabkit-diff.txt"
                  className="btn-studio-primary px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span>Export .TXT</span>
                </a>
              )}
            </div>
          </div>

          {/* Identical Banner */}
          {isIdentical ? (
            <div className="p-8 text-center space-y-1.5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mb-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Both texts are identical!
              </p>
              <p className="text-xs text-zinc-500">
                No differences found with your current comparison settings.
              </p>
            </div>
          ) : mode === 'lines' && layout === 'split' ? (
            /* Split Side-by-Side Line View */
            <div className="overflow-x-auto">
              <div className="min-w-[640px] divide-y divide-zinc-200/70 dark:divide-zinc-800/80 font-mono text-xs sm:text-[13px]">
                {visibleSplitRows.map((row, idx) => {
                  const leftBg =
                    row.kind === 'remove' || row.kind === 'modify'
                      ? 'bg-rose-500/10 dark:bg-rose-500/15'
                      : row.leftText === null
                      ? 'bg-zinc-50/80 dark:bg-zinc-900/40'
                      : '';

                  const rightBg =
                    row.kind === 'add' || row.kind === 'modify'
                      ? 'bg-emerald-500/10 dark:bg-emerald-500/15'
                      : row.rightText === null
                      ? 'bg-zinc-50/80 dark:bg-zinc-900/40'
                      : '';

                  return (
                    <div key={idx} className="grid grid-cols-2 divide-x divide-zinc-200/80 dark:divide-zinc-800">
                      {/* Left Cell */}
                      <div className={`flex items-stretch ${leftBg}`}>
                        <span className="w-10 shrink-0 select-none text-right pr-2.5 py-1.5 text-[11px] text-zinc-400 border-r border-zinc-200/60 dark:border-zinc-800/80">
                          {row.leftNum ?? ''}
                        </span>
                        <div className="flex-1 px-3 py-1.5 whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100">
                          {row.leftInline ? (
                            row.leftInline.map((tok, tIdx) =>
                              tok.type === 'remove' ? (
                                <mark
                                  key={tIdx}
                                  className="rounded px-0.5 bg-rose-500/30 dark:bg-rose-500/40 text-rose-950 dark:text-rose-100"
                                >
                                  {tok.value}
                                </mark>
                              ) : (
                                <span key={tIdx}>{tok.value}</span>
                              )
                            )
                          ) : (
                            row.leftText ?? ''
                          )}
                        </div>
                      </div>

                      {/* Right Cell */}
                      <div className={`flex items-stretch ${rightBg}`}>
                        <span className="w-10 shrink-0 select-none text-right pr-2.5 py-1.5 text-[11px] text-zinc-400 border-r border-zinc-200/60 dark:border-zinc-800/80">
                          {row.rightNum ?? ''}
                        </span>
                        <div className="flex-1 px-3 py-1.5 whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100">
                          {row.rightInline ? (
                            row.rightInline.map((tok, tIdx) =>
                              tok.type === 'add' ? (
                                <mark
                                  key={tIdx}
                                  className="rounded px-0.5 bg-emerald-500/30 dark:bg-emerald-500/40 text-emerald-950 dark:text-emerald-100"
                                >
                                  {tok.value}
                                </mark>
                              ) : (
                                <span key={tIdx}>{tok.value}</span>
                              )
                            )
                          ) : (
                            row.rightText ?? ''
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : mode === 'lines' && layout === 'unified' ? (
            /* Unified Line View */
            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/70 font-mono text-xs sm:text-[13px] overflow-x-auto">
              {visibleUnifiedLineOps.map((item, idx) => {
                const bg =
                  item.op.type === 'add'
                    ? 'bg-emerald-500/12 dark:bg-emerald-500/15'
                    : item.op.type === 'remove'
                    ? 'bg-rose-500/12 dark:bg-rose-500/15'
                    : '';
                const sign =
                  item.op.type === 'add' ? '+' : item.op.type === 'remove' ? '−' : ' ';
                const signColor =
                  item.op.type === 'add'
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : item.op.type === 'remove'
                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                    : 'text-zinc-400';

                return (
                  <div key={idx} className={`flex items-stretch ${bg}`}>
                    <span className="w-9 shrink-0 select-none text-right pr-2 py-1.5 text-[11px] text-zinc-400">
                      {item.leftNum ?? ''}
                    </span>
                    <span className="w-9 shrink-0 select-none text-right pr-2 py-1.5 text-[11px] text-zinc-400 border-r border-zinc-200/60 dark:border-zinc-800">
                      {item.rightNum ?? ''}
                    </span>
                    <span className={`w-6 shrink-0 select-none text-center py-1.5 ${signColor}`}>
                      {sign}
                    </span>
                    <div className="flex-1 pr-3 py-1.5 whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100">
                      {item.op.value || ' '}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Inline Word / Character Diff View */
            <div className="p-5 whitespace-pre-wrap break-words text-xs sm:text-[14px] leading-relaxed text-zinc-900 dark:text-zinc-100 font-sans">
              {diffResult.ops.map((op, idx) => {
                if (op.type === 'add') {
                  return (
                    <ins
                      key={idx}
                      className="no-underline rounded px-0.5 bg-emerald-500/25 dark:bg-emerald-500/35 text-emerald-950 dark:text-emerald-100"
                    >
                      {op.value}
                    </ins>
                  );
                }
                if (op.type === 'remove') {
                  return (
                    <del
                      key={idx}
                      className="rounded px-0.5 bg-rose-500/25 dark:bg-rose-500/35 text-rose-950 dark:text-rose-100 line-through decoration-rose-600/70"
                    >
                      {op.value}
                    </del>
                  );
                }
                return <span key={idx}>{op.value}</span>;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
