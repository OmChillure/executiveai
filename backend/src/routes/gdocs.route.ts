import { Router } from 'express';
import * as gdocsController from '../controller/gdocs.controller';
import { verifyApiKey } from '../middleware/auth.middleware';

const router = Router();

router.get('/oauth2callback', gdocsController.handleOAuthCallback);

router.use(verifyApiKey);

router.get('/auth', gdocsController.initiateAuth);
router.get('/auth/status', gdocsController.checkAuthStatus);
router.post('/disconnect', gdocsController.disconnectGoogleDocs);

router.post('/command', gdocsController.processDocsCommand);

export const gdocsRoutes = router;