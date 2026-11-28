export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatSource {
  title?: string;
  url: string;
}

export type ChatStreamEvent =
  | { type: 'heartbeat'; timestamp: number; status: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; toolName: string; args: unknown }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'text'; content: string }
  | { type: 'sources'; sources: ChatSource[] }
  | { type: 'done'; finishReason: string }
  | { type: 'error'; message: string };

export interface StreamContext {
  sendEvent: (event: ChatStreamEvent) => void;
  setStatus: (status: string) => void;
  collectedSources: ChatSource[];
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  answer?: string;
  results: TavilySearchResult[];
}
