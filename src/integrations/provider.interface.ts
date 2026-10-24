import type { Readable } from 'node:stream';

export interface RemoteFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  isFolder: boolean;
  parentId?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date | null;
}

export interface ICloudStorageProvider {
  readonly name: string;

  getAuthUrl(state: string): string;

  exchangeCode(code: string): Promise<AuthTokens>;

  listItems(
    tokens: AuthTokens,
    remoteFolderId?: string,
  ): Promise<RemoteFileItem[]>;

  getFileStream(
    tokens: AuthTokens,
    remoteFileId: string,
  ): Promise<{
    stream: Readable;
    name: string;
    mimeType: string;
    size?: number;
  }>;
}
