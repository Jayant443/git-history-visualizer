import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { FileChange } from "../data/mockData";
import { cn } from "../lib/cn";

type Speed = 1 | 2 | 5;

const SPEEDS: Speed[] = [1, 2, 5];

// Interval per line per speed — 1x is a readable 300ms, 5x streams at 100ms.
const INTERVAL_MS: Record<Speed, number> = { 1: 300, 2: 150, 5: 100 };

interface CodePlaybackProps {
  file: FileChange;
}

export function CodePlayback({ file }: CodePlaybackProps) {
  const lines = file.patchLines;
  const total = lines.length;

  const [currentLine, setCurrentLine] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const editorRef = useRef<{ revealLineInCenter: (line: number) => void } | null>(null);

  // Remounted (via key) whenever a different file / commit is selected,
  // so initial state doubles as the reset path — no reset effect needed.
  const done = currentLine >= total;

  // Playback loop: append one line per tick; the interval cleans itself up
  // once `done` flips — no stop-effect needed.
  useEffect(() => {
    if (!isPlaying || done) return;
    const id = window.setInterval(() => {
      setCurrentLine((prev) => Math.min(prev + 1, total));
    }, INTERVAL_MS[speed]);
    return () => window.clearInterval(id);
  }, [isPlaying, done, speed, total]);

  // Smooth-scroll the editor as lines stream in.
  useEffect(() => {
    if (currentLine > 0) editorRef.current?.revealLineInCenter(currentLine);
  }, [currentLine]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  function handleReset() {
    setCurrentLine(0);
    setIsPlaying(true);
  }

  const displayedCode = lines.slice(0, currentLine).join("\n");
  const pct = total === 0 ? 100 : Math.round((currentLine / total) * 100);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Playback toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (done) handleReset();
            else setIsPlaying((p) => !p);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-green-400"
          aria-label={isPlaying ? "Pause playback" : "Play playback"}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {isPlaying ? "Pause" : done ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-green-500/50 hover:text-green-300"
          aria-label="Reset playback"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>

        <div
          className="flex items-center gap-1 rounded-md border border-slate-800 p-0.5"
          role="group"
          aria-label="Playback speed"
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={cn(
                "rounded px-2 py-1 font-mono text-[11px] transition",
                speed === s
                  ? "bg-green-500/15 text-green-300 ring-1 ring-green-500/40"
                  : "text-slate-500 hover:text-slate-300",
              )}
            >
              {s}x
            </button>
          ))}
        </div>

        <span className="ml-auto font-mono text-[11px] text-slate-400 tabular-nums">
          Line {Math.min(currentLine, total)} of {total}
          {done && <span className="ml-1.5 text-green-400">· done</span>}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full shrink-0 bg-slate-800">
        <div
          className="h-full bg-green-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Streaming editor */}
      <div className="min-h-0 flex-1 overflow-hidden bg-[#1e1e1e]">
        <Editor
          height="100%"
          path={file.path}
          language={file.language}
          theme="vs-dark"
          value={displayedCode}
          onMount={handleMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: "on",
            renderLineHighlight: "line",
            cursorStyle: "line",
          }}
        />
      </div>
    </div>
  );
}
