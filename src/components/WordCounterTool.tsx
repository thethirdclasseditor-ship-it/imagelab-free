import React, { useState, useMemo, useRef } from 'react';
import {
  Copy, Check, Download, Trash2, Undo2, Clock, Mic, Type,
  AlignLeft, Hash, FileText, Lock, Upload, Wand2, BarChart3,
} from 'lucide-react';

interface TextStats {
  words: number;
  charsWithSpaces: number;
  charsNoSpaces: number;
  sentences: number;
  paragraphs: number;
  readingSec: number;
  speakingSec: number;
  topKeywords: { word: string; count: number; pct: number }[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one',
  'our', 'out', 'has', 'have', 'had', 'were', 'been', 'being', 'this', 'that', 'with',
  'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about', 'which', 'when',
  'make', 'like', 'time', 'just', 'know', 'take', 'into', 'year', 'your', 'some', 'could',
  'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'also', 'after', 'use', 'two', 'how', 'way', 'even', 'new', 'want', 'because', 'any',
  'these', 'give', 'most', 'very', 'is', 'in', 'it', 'of', 'to', 'on', 'at', 'by', 'as',
  'or', 'an', 'be', 'if', 'so', 'we', 'he', 'she', 'do', 'my', 'up', 'no', 'me',
  'এবং', 'করে', 'করা', 'করি', 'করেন', 'হয়', 'হয়ে', 'হচ্ছে', 'হবে', 'হলো', 'ছিল', 'ছিলেন',
  'এই', 'সেই', 'ওই', 'তার', 'তাদের', 'আমার', 'আমাদের', 'তোমার', 'আপনার', 'যে', 'যা',
  'যার', 'যাদের', 'থেকে', 'জন্য', 'সাথে', 'সঙ্গে', 'পর', 'পরে', 'আগে', 'মধ্যে', 'ওপর',
  'নিচে', 'কিন্তু', 'তবে', 'অথবা', 'বা', 'না', 'নয়', 'নেই', 'আছে', 'একটি', 'একটা', 'কোনো',
  'কিছু', 'সব', 'অনেক', 'খুব', 'আর', 'ও', 'এ', 'কে', 'কি', 'কী', 'কেন', 'কীভাবে', 'যখন',
]);

const SOCIAL_LIMITS = [
  { label: 'SEO Title', max: 60 },
  { label: 'Meta Desc', max: 160 },
  { label: 'X / Post', max: 280 },
  { label: 'YouTube Title', max: 100 },
];

function extractWordTokens(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const SegmenterCtor = (Intl as unknown as {
        Segmenter: new (
          locale?: string,
          opts?: { granularity: 'word' }
        ) => { segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }> };
      }).Segmenter;
      const segmenter = new SegmenterCtor(undefined, { granularity: 'word' });
      const tokens: string[] = [];
      for (const part of segmenter.segment(trimmed)) {
        if (part.isWordLike) tokens.push(part.segment);
      }
      return tokens;
    } catch {
      // Fallback below
    }
  }
  return trimmed
    .replace(/[.!?,;:"'()[\]{}।॥/\\|<>+=*~`@#$%^&]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function analyzeText(text: string, ignoreStopWords: boolean): TextStats {
  const charsWithSpaces = Array.from(text).length;
  const charsNoSpaces = Array.from(text.replace(/\s/g, '')).length;
  const tokens = extractWordTokens(text);
  const words = tokens.length;

  const trimmed = text.trim();
  const sentences = trimmed
    ? trimmed.split(/[.!?।॥]+(?:\s+|$)/).map((s) => s.trim()).filter(Boolean).length
    : 0;
  const paragraphs = trimmed
    ? trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length
    : 0;

  const readingSec = words > 0 ? Math.max(1, Math.round((words / 200) * 60)) : 0;
  const speakingSec = words > 0 ? Math.max(1, Math.round((words / 130) * 60)) : 0;

  const freq = new Map<string, number>();
  for (const raw of tokens) {
    const clean = raw.toLowerCase();
    if (clean.length < 2 || /^\d+$/.test(clean)) continue;
    if (ignoreStopWords && STOP_WORDS.has(clean)) continue;
    freq.set(clean, (freq.get(clean) ?? 0) + 1);
  }

  const topKeywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({
      word,
      count,
      pct: words > 0 ? Math.max(1, Math.round((count / words) * 100)) : 0,
    }));

  return { words, charsWithSpaces, charsNoSpaces, sentences, paragraphs, readingSec, speakingSec, topKeywords };
}

function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return '0s';
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function toTitleCase(input: string): string {
  return input.replace(/\S+/g, (word) => word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase());
}

function toSentenceCase(input: string): string {
  return input.toLocaleLowerCase().replace(/(^\s*|[.!?।॥]\s+)(\S)/g, (_, p: string, ch: string) => p + ch.toLocaleUpperCase());
}

export default function WordCounterTool() {
  const [text, setText] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [ignoreStopWords, setIgnoreStopWords] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [dropError, setDropError] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stats = useMemo(() => analyzeText(text, ignoreStopWords), [text, ignoreStopWords]);

  const applyTransform = (fn: (prev: string) => string) => {
    if (!text) return;
    const next = fn(text);
    if (next === text) return;
    setHistory((prev) => [...prev.slice(-14), text]);
    setText(next);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prevVal = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setText(prevVal);
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked fallback
    }
  };

  const handleDownloadTxt = () => {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imagelabkit-text.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleLoadTextFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setDropError('');
    const f = files[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    try {
      const content = await f.text();
      if (text) setHistory((prev) => [...prev.slice(-14), text]);
      setText(content);
    } catch {
      setDropError('Could not read file. Drop a plain text (.txt, .md, .csv, .json, .log) file.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.log,text/plain"
        className="hidden"
        onChange={(e) => void handleLoadTextFile(e.target.files)}
      />

      {/* Top Live Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="studio-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Words</span>
            <Type className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tabular-nums">{stats.words.toLocaleString()}</p>
        </div>

        <div className="studio-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Characters</span>
            <Hash className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tabular-nums">{stats.charsWithSpaces.toLocaleString()}</p>
        </div>

        <div className="studio-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">No Spaces</span>
            <FileText className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tabular-nums">{stats.charsNoSpaces.toLocaleString()}</p>
        </div>

        <div className="studio-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Sentences</span>
            <AlignLeft className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tabular-nums">{stats.sentences.toLocaleString()}</p>
        </div>

        <div className="studio-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Paragraphs</span>
            <AlignLeft className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tabular-nums">{stats.paragraphs.toLocaleString()}</p>
        </div>

        <div className="studio-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Read / Speak</span>
            <Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="text-lg sm:text-xl font-extrabold text-zinc-950 tabular-nums mt-1">
            {formatDuration(stats.readingSec)}{' '}
            <span className="text-xs font-semibold text-zinc-400">/ {formatDuration(stats.speakingSec)}</span>
          </p>
        </div>
      </div>

      {/* Main Editor Card */}
      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Quick Case & Cleanup Toolbar */}
        <div className="px-4 sm:px-6 py-3 bg-zinc-50/80 border-b border-zinc-200/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
              <Wand2 className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
              Transform
            </span>
            <button type="button" disabled={!text} onClick={() => applyTransform((s) => s.toLocaleUpperCase())} className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer">UPPERCASE</button>
            <button type="button" disabled={!text} onClick={() => applyTransform((s) => s.toLocaleLowerCase())} className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer">lowercase</button>
            <button type="button" disabled={!text} onClick={() => applyTransform(toTitleCase)} className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer">Title Case</button>
            <button type="button" disabled={!text} onClick={() => applyTransform(toSentenceCase)} className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer">Sentence case</button>
            <button
              type="button"
              disabled={!text}
              onClick={() => applyTransform((s) => s.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim())}
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer"
            >
              Fix Spaces
            </button>
            <button
              type="button"
              disabled={!text}
              onClick={() => applyTransform((s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n'))}
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer"
            >
              Remove Empty Lines
            </button>
            <button
              type="button"
              disabled={!text}
              onClick={() =>
                applyTransform((s) => {
                  const seen = new Set<string>();
                  return s.split(/\r?\n/).filter((line) => {
                    const key = line.trim();
                    if (!key) return true;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  }).join('\n');
                })
              }
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer"
            >
              Deduplicate Lines
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {history.length > 0 && (
              <button type="button" onClick={handleUndo} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer">
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Undo</span>
              </button>
            )}
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
              <span>Open .TXT</span>
            </button>
          </div>
        </div>

        {/* Textarea Workspace (Drag & Drop enabled) */}
        <div
          className="relative p-4 sm:p-6 bg-white"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDraggingFile(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
            if (e.dataTransfer.files?.length) {
              void handleLoadTextFile(e.dataTransfer.files);
            }
          }}
        >
          <textarea
            aria-label="Text to count words and characters"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={11}
            placeholder="Type, paste, or drag & drop a .TXT / .MD / .CSV file here to count English or বাংলা words, characters, sentences, reading time, and top keywords..."
            className={`w-full bg-zinc-50/70 dark:bg-zinc-950/60 border rounded-2xl p-4 sm:p-5 text-sm sm:text-[15px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y transition ${
              isDraggingFile ? 'border-2 border-dashed border-blue-500 bg-blue-50/40 dark:bg-blue-950/20' : 'border-zinc-200/90'
            }`}
          />

          {isDraggingFile && (
            <div className="pointer-events-none absolute inset-4 sm:inset-6 rounded-2xl border-2 border-dashed border-blue-500 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                <Upload className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Drop text file to load</p>
              <p className="text-xs text-zinc-500">.TXT, .MD, .CSV, .JSON, or .LOG</p>
            </div>
          )}

          {dropError && (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{dropError}</p>
          )}
        </div>

        {/* Social & SEO Character Limits Bar */}
        <div className="px-5 sm:px-6 py-3.5 bg-zinc-50/60 border-t border-zinc-200/80 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SOCIAL_LIMITS.map((lim) => {
            const pct = Math.min(100, Math.round((stats.charsWithSpaces / lim.max) * 100));
            const over = stats.charsWithSpaces > lim.max;
            return (
              <div key={lim.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] tabular-nums">
                  <span className="font-semibold text-zinc-600">{lim.label}</span>
                  <span className={`font-bold ${over ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`}>
                    {stats.charsWithSpaces}/{lim.max}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${over ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-blue-600'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Actions Bar */}
        <div className="px-5 sm:px-6 py-4 bg-zinc-50/90 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Mic className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
            <span className="tabular-nums">Reading ~200 wpm · Speaking ~130 wpm</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!text}
              onClick={() => { setHistory([]); setText(''); setDropError(''); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 disabled:opacity-40 text-xs font-semibold text-zinc-600 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>

            <button
              type="button"
              disabled={!text}
              onClick={handleDownloadTxt}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download .TXT</span>
            </button>

            <button
              type="button"
              disabled={!text}
              onClick={() => void handleCopy()}
              className="btn-studio-accent inline-flex items-center gap-1.5 px-5 py-2 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
            >
              {copied ? (
                <><Check className="w-4 h-4" aria-hidden="true" /><span>Copied!</span></>
              ) : (
                <><Copy className="w-4 h-4" aria-hidden="true" /><span>Copy Text</span></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Top Keyword Density Card */}
      {stats.topKeywords.length > 0 && (
        <div className="studio-card rounded-3xl p-5 sm:p-6 space-y-3 animate-scale-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Top Keywords &amp; Density</h2>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer">
              <input type="checkbox" checked={ignoreStopWords} onChange={(e) => setIgnoreStopWords(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
              <span>Filter common stop words</span>
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {stats.topKeywords.map((kw) => (
              <div key={kw.word} className="rounded-xl bg-zinc-50 border border-zinc-200/80 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 truncate">{kw.word}</span>
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 tabular-nums shrink-0">{kw.count}× ({kw.pct}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>100% Private · Runs locally in your browser · Nothing is saved or sent</span>
      </p>
    </div>
  );
}
