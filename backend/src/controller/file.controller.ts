import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';
import { fileUploadService, ProcessedFile } from '../services/fileProcessing.service';
import multer from 'multer';

interface UploadFilesRequest {
  sessionId: string;
}

interface RemoveFileRequest {
  sessionId: string;
  fileId: string;
}

export const uploadFiles = async (
  req: Request<{}, any, UploadFilesRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      const error = new Error('Session ID is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    // Fix: Use req.files with proper type assertion
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      const error = new Error('No files uploaded') as AppError;
      error.statusCode = 400;
      throw error;
    }

    // Check total file size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

    if (totalSize > MAX_TOTAL_SIZE) {
      const error = new Error(`Total file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds limit of 50MB`) as AppError;
      error.statusCode = 413;
      throw error;
    }

    console.log(`Processing ${files.length} files for session: ${sessionId}`);
    console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

    // Process all uploaded files
    const result = await fileUploadService.processFiles(files, sessionId);

    // Return processed files info (without buffer data)
    const responseFiles = result.files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      type: file.type,
      content: file.content ? file.content.substring(0, 500) + (file.content.length > 500 ? '...' : '') : undefined,
      metadata: file.metadata,
      processingError: file.processingError,
      hasFullContent: !!file.content
    }));

    res.json({
      success: true,
      message: `Successfully processed ${result.files.length} file(s)`,
      files: responseFiles,
      totalSize: result.totalSize,
      errors: result.errors,
      summary: {
        totalFiles: result.files.length,
        totalSizeMB: (result.totalSize / 1024 / 1024).toFixed(2),
        fileTypes: [...new Set(result.files.map(f => f.type))]
      }
    });

  } catch (error) {
    console.error('Error uploading files:', error);
    
    // Handle specific multer errors
    if (error instanceof multer.MulterError) {
      let message = 'File upload error: ';
      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          message += `File too large. Maximum size is 10MB per file.`;
          break;
        case 'LIMIT_FILE_COUNT':
          message += `Too many files. Maximum is 5 files.`;
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          message += `Unexpected file field.`;
          break;
        default:
          message += error.message;
      }
      
      const appError = new Error(message) as AppError;
      appError.statusCode = 400;
      return next(appError);
    }
    
    next(error);
  }
};

export const getSessionFiles = async (
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      const error = new Error('Session ID is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    const files = fileUploadService.getSessionFiles(sessionId);

    // Return file info without buffer data
    const responseFiles = files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      type: file.type,
      content: file.content ? file.content.substring(0, 500) + (file.content.length > 500 ? '...' : '') : undefined,
      metadata: file.metadata,
      processingError: file.processingError,
      hasFullContent: !!file.content
    }));

    res.json({
      success: true,
      files: responseFiles,
      count: files.length
    });

  } catch (error) {
    next(error);
  }
};

export const getFileContent = async (
  req: Request<{ sessionId: string; fileId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sessionId, fileId } = req.params;

    if (!sessionId || !fileId) {
      const error = new Error('Session ID and File ID are required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    const file = fileUploadService.getFile(sessionId, fileId);

    if (!file) {
      const error = new Error('File not found') as AppError;
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      file: {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        type: file.type,
        content: file.content,
        metadata: file.metadata,
        processingError: file.processingError
      }
    });

  } catch (error) {
    next(error);
  }
};

export const downloadFile = async (
  req: Request<{ sessionId: string; fileId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sessionId, fileId } = req.params;

    if (!sessionId || !fileId) {
      const error = new Error('Session ID and File ID are required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    const file = fileUploadService.getFile(sessionId, fileId);

    if (!file) {
      const error = new Error('File not found') as AppError;
      error.statusCode = 404;
      throw error;
    }

    // Set appropriate headers for file download
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Length', file.size.toString());

    // Send the file buffer
    res.send(file.buffer);

  } catch (error) {
    next(error);
  }
};

export const removeFile = async (
  req: Request<{}, any, RemoveFileRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sessionId, fileId } = req.body;

    if (!sessionId || !fileId) {
      const error = new Error('Session ID and File ID are required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    const removed = fileUploadService.removeFile(sessionId, fileId);

    if (!removed) {
      const error = new Error('File not found') as AppError;
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      message: 'File removed successfully'
    });

  } catch (error) {
    next(error);
  }
};

export const clearSessionFiles = async (
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      const error = new Error('Session ID is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    fileUploadService.clearSessionFiles(sessionId);

    res.json({
      success: true,
      message: 'All files cleared for session'
    });

  } catch (error) {
    next(error);
  }
};