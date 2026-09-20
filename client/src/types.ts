/** Shared view-model types (previously lived alongside mock data). */

export interface MockAuthor {
  name: string;
  handle: string;
  color: string;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  language: string;
  original: string;
  modified: string;
  /** Full evolved file content — streamed line-by-line in playback mode. */
  rawContent: string;
  /** Individual lines of `rawContent` — the playback unit. */
  patchLines: string[];
}

export interface MockCommit {
  id: string;
  short: string;
  message: string;
  author: MockAuthor;
  date: string;
  branch: string;
  branches?: string[];
  parents: string[];
  isMerge?: boolean;
  files: FileChange[];
}

export interface HeatmapDay {
  date: string;
  count: number;
  authors: string[];
}

export const BRANCH_COLORS: Record<string, string> = {
  main: "#22c55e",
  master: "#22c55e",
};
