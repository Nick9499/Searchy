import {
  assignUserToOrganization,
  createOrganization,
  deleteOrganization,
  getOrganizationById,
  listOrganizations,
  updateOrganizationSettings,
} from '@/services/organization.service';
import type {
  AssignUserOrgInput,
  CreateOrgInput,
  OrgIdParamInput,
  UpdateOrgSettingsInput,
} from '@/validators/organization.validator';
import type { Request, Response } from 'express';

export const listAllOrganizations = async (_req: Request, res: Response) => {
  const orgs = await listOrganizations();
  res.json({ organizations: orgs });
};

export const getOrganizationDetails = async (
  req: Request<OrgIdParamInput>,
  res: Response,
) => {
  const { orgId } = req.params;

  const org = await getOrganizationById(orgId);
  res.json({ organization: org });
};

export const createOrg = async (
  req: Request<Record<string, never>, unknown, CreateOrgInput>,
  res: Response,
) => {
  const org = await createOrganization(req.body);

  res.status(201).json({
    message: 'Organization created successfully',
    organizations: org,
  });
};

export const updateSettngs = async (
  req: Request<OrgIdParamInput, unknown, UpdateOrgSettingsInput>,
  res: Response,
) => {
  const { orgId } = req.params;
  const settings = await updateOrganizationSettings(orgId, req.body);
  res.json({ message: 'Organization settings updated', settings });
};

export const deleteOrg = async (
  req: Request<OrgIdParamInput>,
  res: Response,
) => {
  const { orgId } = req.params;

  const result = await deleteOrganization(orgId);
  res.json(result);
};

export const assignUser = async (
  req: Request<OrgIdParamInput, unknown, AssignUserOrgInput>,
  res: Response,
) => {
  const { orgId } = req.params;
  const { userId, role } = req.body;

  const user = await assignUserToOrganization(orgId, userId, role);
  res.json({ message: 'User assigned to organization successfully', user });
};
