import { Router } from 'express';
import * as gdriveController from '../controller/gdrive.controller';
import { verifyApiKey } from '../middleware/auth.middleware';

const router = Router();

router.get('/oauth2callback', gdriveController.handleOAuthCallback);

router.use(verifyApiKey);

router.get('/auth', gdriveController.initiateAuth);
router.get('/auth/status', gdriveController.checkAuthStatus);
router.post('/disconnect', gdriveController.disconnectGoogleDrive);
router.post('/command', gdriveController.processDriveCommand);
router.post('/confirm', gdriveController.confirmDriveAction);

export const gdriveRoutes = router;