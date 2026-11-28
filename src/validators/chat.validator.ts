import z from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message content cannot be empty'),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1, 'At least one message is required'),
  enableWebSearch: z.boolean().default(true),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
