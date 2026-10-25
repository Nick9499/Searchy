import { google } from 'googleapis';
import type {
  AuthTokens,
  ICloudStorageProvider,
  RemoteFileItem,
} from '../provider.interface';
import { env } from '@/config/env';
import type { Readable } from 'node:stream';

export class GoogleDriveProvider implements ICloudStorageProvider {
  readonly name = 'google';

  private getOAuth2Client() {
    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );
  }

  getAuthUrl(state?: string): string {
    const oauth2Client = this.getOAuth2Client();

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
      state,
    });
  }

  async exchangeCode(code: string): Promise<AuthTokens> {
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    return {
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    };
  }

  async listItems(
    tokens: AuthTokens,
    remoteFolderId?: string,
  ): Promise<RemoteFileItem[]> {
    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? undefined,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const parent = remoteFolderId || 'root';
    const query = `'${parent}' in parents and trashed = false`;

    const res = await drive.files.list({
      q: query,
      fields: 'files(id,name, mimeType, size, parents)',
      pageSize: 100,
    });

    const items = res.data.files || [];

    return items.map((f) => ({
      id: f.id || '',
      name: f.name || 'Untitled',
      mimeType: f.mimeType || 'application/octet-stream',
      size: f.size ? Number(f.size) : undefined,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      parentId: remoteFolderId || null,
    }));
  }

  async getFileStream(
    tokens: AuthTokens,
    remoteFileId: string,
  ): Promise<{
    stream: Readable;
    name: string;
    mimeType: string;
    size?: number;
  }> {
    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? undefined,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const meta = await drive.files.get({
      fields: 'id, name, mimeType, size',
      fileId: remoteFileId,
    });

    const name = meta.data.name || 'imported-file';
    const mimeType = meta.data.mimeType || 'application/octet-stream';
    const size = meta.data.size ? Number(meta.data.size) : undefined;

    const res = await drive.files.get(
      {
        fileId: remoteFileId,
        alt: 'media',
      },
      { responseType: 'stream' },
    );

    return {
      stream: res.data as Readable,
      name,
      mimeType,
      size,
    };
  }
}
