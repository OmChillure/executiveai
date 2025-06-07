import { Router } from 'express';
import * as githubController from '../controller/github.controller';
import { verifyApiKey } from '../middleware/auth.middleware'; // Assuming this middleware exists

const router = Router();

// OAuth callback route (does not need API key verification as it's initiated by GitHub)
router.get('/oauth2callback', githubController.handleOAuthCallback);

// Apply API key verification to all subsequent routes
router.use(verifyApiKey); 

// Routes for managing GitHub connection and commands
router.get('/auth', githubController.initiateAuth);
router.get('/auth/status', githubController.checkAuthStatus);
router.post('/disconnect', githubController.disconnectGithub);
router.post('/command', githubController.processGithubCommand);
router.post('/confirm', githubController.confirmGithubAction);

export const githubRoutes = router;
