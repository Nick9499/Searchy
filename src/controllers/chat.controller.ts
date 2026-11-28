import { logger } from '@/config/logger';
import { UnauthorizedError } from '@/errors/app.error';
import { streamChatResponse } from '@/services/chat.service';
import type { AuthRequest, ChatStreamEvent } from '@/types';
import type { ChatRequestInput } from '@/validators/chat.validator';
import type { Response } from 'express';

export const chatWithAi = async (
  req: AuthRequest<Record<string, never>, unknown, ChatRequestInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const { messages, enableWebSearch } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abortController = new AbortController();

  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  const sendEvent = (event: ChatStreamEvent) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await streamChatResponse(
      req.userId,
      messages,
      enableWebSearch,
      sendEvent,
      abortController.signal,
    );
  } catch (err) {
    if (!abortController.signal.aborted) {
      logger.error({ err }, 'AI chat stream failed');
      sendEvent({
        type: 'error',
        message: err instanceof Error ? err.message : 'AI chat failed',
      });
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
};
