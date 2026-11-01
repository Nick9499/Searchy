import type { Readable } from 'node:stream';

export interface RemoteFIleItem {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  isFolder: boolean;
  parentId?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date | null;
}

export interface UploadStreamParams {
  stream: Readable;
  key: string;
  mimeType: string;
}
