import { Router } from 'express';
import * as gsheetsController from '../controller/gsheets.controller';
import { verifyApiKey } from '../middleware/auth.middleware';

const router = Router();

router.get('/oauth2callback', gsheetsController.handleOAuthCallback);

router.use(verifyApiKey);

router.get('/auth', gsheetsController.initiateAuth);
router.get('/auth/status', gsheetsController.checkAuthStatus);
router.post('/disconnect', gsheetsController.disconnectGoogleSheets);

router.post('/command', gsheetsController.processSheetsCommand);

export const gsheetsRoutes = router;