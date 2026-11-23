import {
  assignUser,
  createOrg,
  deleteOrg,
  getOrganizationDetails,
  listAllOrganizations,
  updateSettngs,
} from '@/controllers/organization.controller';
import { authenticate, requireSuperAdmin } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  assignUserOrgSchema,
  createOrgSchema,
  orgIdParamSchema,
  updateOrgSettingsSchema,
} from '@/validators/organization.validator';
import { Router } from 'express';

const router = Router();

router.use(authenticate, requireSuperAdmin);

router.get('/', listAllOrganizations);
router.post('/', validate(createOrgSchema), createOrg);
router.get('/:orgId', validate(orgIdParamSchema), getOrganizationDetails);
router.patch(
  '/:orgId/settings',
  validate(updateOrgSettingsSchema),
  updateSettngs,
);
router.delete('/:orgId', validate(orgIdParamSchema), deleteOrg);
router.post('/:orgId/users', validate(assignUserOrgSchema), assignUser);

export default router;
