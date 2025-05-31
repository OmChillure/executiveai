import { Router } from 'express';
import * as modelsController from '../controller/model.controller';
import { verifyApiKey } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyApiKey);

router.get('/', modelsController.getAIModels);
router.get('/:id', modelsController.getAIModel);

export const modelsRoutes = router;