import { env } from '@/config/env';
import {
  CHAT_MODEL,
  HEARTBEAT_INTERVAL_MS,
  SYSTEM_PROMPT,
} from '@/constants/chat.constant';
import { BadRequestError } from '@/errors/app.error';
import type {
  ChatMessage,
  ChatSource,
  ChatStreamEvent,
  StreamContext,
  TavilySearchResponse,
} from '@/types';
import { buildUserReadTools, buildWebSearchTools } from './chatTools.service';
import { google } from '@ai-sdk/google';
import { stepCountIs, streamText, type TextStreamPart, type ToolSet } from 'ai';
import { logger } from '@/config/logger';

const isTavilyOutput = (output: unknown): output is TavilySearchResponse => {
  return (
    typeof output === 'object' &&
    output !== null &&
    'result' in output &&
    Array.isArray(output.result)
  );
};

const handleStreamPart = (
  part: TextStreamPart<ToolSet>,
  ctx: StreamContext,
) => {
  if (part.type === 'reasoning-delta' && typeof part.text === 'string') {
    ctx.sendEvent({ type: 'reasoning', content: part.text });
  }

  if (part.type === 'tool-call') {
    const status = `Running ${part.toolName}...`;
    ctx.setStatus(status);
    ctx.sendEvent({ type: 'heartbeat', timestamp: Date.now(), status });
    ctx.sendEvent({
      type: 'tool_call',
      toolName: part.toolName,
      args: part.input,
    });
    return;
  }

  if (part.type === 'tool-result') {
    ctx.setStatus('Synthesizing answer...');

    if (part.toolName === 'web_search' && isTavilyOutput(part.output)) {
      for (const item of part.output.results) {
        ctx.collectedSources.push({ title: item.title, url: item.url });
      }
    }

    ctx.sendEvent({
      type: 'tool_result',
      toolName: part.toolName,
      result: part.output,
    });
    return;
  }

  if (part.type === 'text-delta') {
    ctx.setStatus('Streaming response...');
    ctx.sendEvent({ type: 'text', content: part.text });
  }

  if (part.type === 'source' && part.sourceType === 'url') {
    ctx.collectedSources.push({
      title: part.title,
      url: part.url,
    });
  }

  if (part.type === 'finish') {
    if (ctx.collectedSources.length > 0) {
      ctx.sendEvent({ type: 'sources', sources: ctx.collectedSources });
    }

    ctx.sendEvent({ type: 'done', finishReason: part.finishReason });
  }

  if (part.type === 'error') {
    logger.error({ err: part.error }, 'Gemini stream error');
    ctx.sendEvent({
      type: 'error',
      message:
        part.error instanceof Error
          ? part.error.message
          : 'AI generation failed',
    });
  }
};

export const streamChatResponse = async (
  userId: string,
  messages: ChatMessage[],
  enableWebSearch: boolean,
  sendEvent: (event: ChatStreamEvent) => void,
  abortSignal?: AbortSignal,
) => {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new BadRequestError(
      'AI chat is not configured (missing GOOGLE_GENERATIVE_AI_API_KEY)',
    );
  }

  let currentStatus = 'Thinking...';
  const collectedSources: ChatSource[] = [];

  sendEvent({
    type: 'heartbeat',
    timestamp: Date.now(),
    status: currentStatus,
  });

  const heartbeatTimer = setInterval(() => {
    sendEvent({
      type: 'heartbeat',
      timestamp: Date.now(),
      status: currentStatus,
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const tools = {
      ...buildUserReadTools(userId),
      ...(enableWebSearch && env.TAVILY_API_KEY ? buildWebSearchTools() : {}),
    };

    const result = streamText({
      model: google(CHAT_MODEL),
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(5),
      maxRetries: 0,
      abortSignal,
      providerOptions: {
        google: {
          thinkingConfig: {
            includeThoughts: true,
          },
        },
      },
    });

    const ctx: StreamContext = {
      sendEvent,
      setStatus: (status) => {
        currentStatus = status;
      },
      collectedSources,
    };

    for await (const part of result.stream) {
      handleStreamPart(part, ctx);
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
};
