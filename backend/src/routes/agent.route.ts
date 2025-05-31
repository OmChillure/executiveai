import { Router } from 'express';
import * as agentController from '../controller/agent.controller';
import { verifyApiKey } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyApiKey);

router.get('/', agentController.getAgents);
router.get('/:id', agentController.getAgent);
router.get('/:id/capabilities', agentController.getAgentCapabilities);

export const agentRoutes = router;