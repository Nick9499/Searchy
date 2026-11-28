import { tool } from 'ai';
import z from 'zod';
import * as fileService from './file.service';
import * as folderService from './folder.service';
import * as trashService from './trash.service';
import * as userService from './user.service';
import { env } from '@/config/env';
import { TAVILY_SEARCH_URL } from '@/constants/chat.constant';
import type { TavilySearchResponse } from '@/types';

export const buildUserReadTools = (userId: string) => ({
  search_files: tool({
    description: "Search the user's files by filename or partial name match",
    inputSchema: z.object({
      query: z.string().min(1).describe('The filename search query'),
    }),
    execute: async ({ query }) => fileService.searchUserFiles(userId, query),
  }),
  list_root_files: tool({
    description:
      "List all active files in the user's root directory (not inside any folder)",
    inputSchema: z.object({}),
    execute: async () => fileService.getUserRootFiles(userId),
  }),
  list_folders: tool({
    description: "List all root folders in the user's workspace",
    inputSchema: z.object({}),
    execute: async () => folderService.getUserRootFolder(userId),
  }),
  get_folder_content: tool({
    description:
      'Get the metadata, subfolders, and files inside a specific folder by folder ID',
    inputSchema: z.object({
      folderId: z.uuid().describe('The UUID of the folder to inspect'),
    }),
    execute: async ({ folderId }) =>
      folderService.getFolderContents(userId, folderId),
  }),
  get_trash: tool({
    description:
      "List all soft-deleted files and folder currently in the user's trash",
    inputSchema: z.object({}),
    execute: async () => trashService.getUserTrash(userId),
  }),
  get_user_profile: tool({
    description:
      "Get the current authenticated user's profile details (namem email, role, orgId).",
    inputSchema: z.object({}),
    execute: async () => userService.getUserProfile(userId),
  }),
});

export const buildWebSearchTools = () => ({
  web_search: tool({
    description:
      'Search the public web for up-to-date information, news, documentation, or facts',
    inputSchema: z.object({
      query: z.string().min(1).describe('The search query for the web'),
    }),
    execute: async ({ query }) => {
      if (!env.TAVILY_API_KEY) {
        return { error: 'Web search is not configured' };
      }

      const response = await fetch(TAVILY_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: env.TAVILY_API_KEY,
          query,
          search_depth: 'basic',
          include_answer: true,
          max_result: 5,
        }),
      });

      if (!response.ok) {
        return { error: `Web search failed with status ${response.status}` };
      }

      const data = (await response.json()) as TavilySearchResponse;

      return {
        answer: data.answer,
        results: data.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        })),
      };
    },
  }),
});
