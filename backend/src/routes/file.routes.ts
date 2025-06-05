import { Router } from 'express';
import * as fileController from '../controller/file.controller';
import { verifyApiKey } from '../middleware/auth.middleware';
import { fileUploadService } from '../services/fileProcessing.service';

const router = Router();

router.use(verifyApiKey);

const upload = fileUploadService.getMulterConfig();

router.post('/upload', upload.array('files', 5), fileController.uploadFiles);
router.get('/session/:sessionId', fileController.getSessionFiles);
router.get('/session/:sessionId/file/:fileId', fileController.getFileContent);
router.get('/session/:sessionId/file/:fileId/download', fileController.downloadFile);
router.delete('/session/:sessionId/file/:fileId', fileController.removeFile);
router.delete('/session/:sessionId', fileController.clearSessionFiles);

export const fileRoutes = router;