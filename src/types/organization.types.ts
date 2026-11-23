export interface OrgSettingsData {
  id: string;
  orgId: string;
  googleDriveEnabled: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  settings: OrgSettingsData | null;
  memberCount: number;
}

export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}
