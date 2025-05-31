import { Router } from 'express';
import * as chatController from '../controller/chat.controller';
import { verifyApiKey } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyApiKey);

router.get('/', chatController.getChatSessions);
router.post('/', chatController.createChatSession);
router.get('/:id', chatController.getChatSession);
router.delete('/:id', chatController.deleteChatSession);
router.post('/:id/messages', chatController.sendMessage);
router.post('/:id/tools', chatController.sendMessageWithThinking);
router.post('/:id/analyze-file', chatController.analyzeFile);

export const chatRoutes = router;