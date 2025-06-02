// services/file-upload.service.ts (Fixed types)
import multer from 'multer';
import { Request } from 'express';
import pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ProcessedFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  content?: string; 
  buffer: Buffer;
  metadata?: {
    pageCount?: number;
    sheetNames?: string[];
    encoding?: string;
    dimensions?: { width: number; height: number };
  };
  type: 'text' | 'document' | 'spreadsheet' | 'image' | 'pdf' | 'unknown';
  processingError?: string;
}

export interface FileUploadResult {
  files: ProcessedFile[];
  totalSize: number;
  errors: string[];
}

class FileUploadService {
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_FILES = 5;
  private readonly ALLOWED_TYPES = [
    'text/plain',
    'text/csv',
    'application/json',
    'application/javascript',
    'text/javascript',
    'text/html',
    'text/css',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/xml',
    'text/xml'
  ];

  private fileStorage: Map<string, ProcessedFile[]> = new Map();

  public getMulterConfig(): multer.Multer {
    return multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: this.MAX_FILE_SIZE,
        files: this.MAX_FILES,
        fieldSize: this.MAX_FILE_SIZE,
        fieldNameSize: 100,
        fields: 20,
        parts: 20,
        headerPairs: 2000
      },
      fileFilter: (
        req: Request, 
        file: Express.Multer.File, 
        cb: multer.FileFilterCallback
      ) => {
        console.log(`Checking file: ${file.originalname}, type: ${file.mimetype}`);
        
        if (this.ALLOWED_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          const error = new Error(`File type ${file.mimetype} not allowed. Allowed types: ${this.ALLOWED_TYPES.join(', ')}`);
          cb(error);
        }
      }
    });
  }

  public async processFiles(
    files: Express.Multer.File[],
    sessionId: string
  ): Promise<FileUploadResult> {
    const processedFiles: ProcessedFile[] = [];
    const errors: string[] = [];
    let totalSize = 0;

    for (const file of files) {
      try {
        const processedFile = await this.processIndividualFile(file);
        processedFiles.push(processedFile);
        totalSize += file.size;
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        errors.push(`Failed to process ${file.originalname}: ${(error as Error).message}`);
      }
    }

    // Store files in memory for the session
    this.fileStorage.set(sessionId, processedFiles);

    return {
      files: processedFiles,
      totalSize,
      errors
    };
  }

  private async processIndividualFile(file: Express.Multer.File): Promise<ProcessedFile> {
    const fileId = this.generateFileId();
    const baseFile: ProcessedFile = {
      id: fileId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
      type: this.determineFileType(file.mimetype)
    };

    try {
      switch (file.mimetype) {
        case 'application/pdf':
          return await this.processPDF(baseFile);
        
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return await this.processDocx(baseFile);
        
        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          return await this.processExcel(baseFile);
        
        case 'text/csv':
          return await this.processCSV(baseFile);
        
        case 'text/plain':
        case 'text/javascript':
        case 'application/javascript':
        case 'text/html':
        case 'text/css':
        case 'application/json':
        case 'application/xml':
        case 'text/xml':
          return await this.processTextFile(baseFile);
        
        case 'image/jpeg':
        case 'image/png':
        case 'image/gif':
        case 'image/webp':
          return await this.processImage(baseFile);
        
        default:
          return baseFile;
      }
    } catch (error) {
      return {
        ...baseFile,
        processingError: (error as Error).message
      };
    }
  }

  private async processPDF(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      console.log('Starting PDF processing for:', file.originalName);
      const data = await pdf(file.buffer);
      console.log('PDF processing completed.', data.text);
      return {
        ...file,
        content: data.text,
        metadata: {
          pageCount: data.numpages
        }
      };
    } catch (error) {
      throw new Error(`Failed to process PDF: ${(error as Error).message}`);
    }
  }

 private async processDocx(file: ProcessedFile): Promise<ProcessedFile> {
  try {
    console.log('Starting DOCX processing for:', file.originalName);
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    console.log('DOCX processing completed. Text length:', result.value.length);
    return {
      ...file,
      content: result.value
    };
  } catch (error) {
    console.error('DOCX processing failed:', error);
    throw new Error(`Failed to process DOCX: ${(error as Error).message}`);
  }
}

  private async processExcel(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      let content = '';

      sheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        const csvData = XLSX.utils.sheet_to_csv(worksheet);
        content += `Sheet: ${sheetName}\n${csvData}\n\n`;
      });

      return {
        ...file,
        content: content.trim(),
        metadata: {
          sheetNames
        }
      };
    } catch (error) {
      throw new Error(`Failed to process Excel file: ${(error as Error).message}`);
    }
  }

  private async processCSV(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      const csvText = file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
      });

      const preview = Papa.unparse(parsed.data.slice(0, 10));
      
      return {
        ...file,
        content: `CSV Preview (first 10 rows):\n${preview}\n\nTotal rows: ${parsed.data.length}`
      };
    } catch (error) {
      throw new Error(`Failed to process CSV: ${(error as Error).message}`);
    }
  }

  private async processTextFile(file: ProcessedFile): Promise<ProcessedFile> {
    try {
      const content = file.buffer.toString('utf-8');
      return {
        ...file,
        content,
        metadata: {
          encoding: 'utf-8'
        }
      };
    } catch (error) {
      // Try with different encoding
      try {
        const content = file.buffer.toString('latin1');
        return {
          ...file,
          content,
          metadata: {
            encoding: 'latin1'
          }
        };
      } catch (fallbackError) {
        throw new Error(`Failed to process text file: ${(error as Error).message}`);
      }
    }
  }

  private async processImage(file: ProcessedFile): Promise<ProcessedFile> {
    return {
      ...file,
      content: `Image file: ${file.originalName} (${(file.size / 1024).toFixed(1)} KB)`,
      metadata: {
      }
    };
  }

  private determineFileType(mimeType: string): ProcessedFile['type'] {
    if (mimeType.startsWith('text/') || 
        mimeType === 'application/json' || 
        mimeType === 'application/javascript' ||
        mimeType === 'text/javascript') {
      return 'text';
    }
    
    if (mimeType === 'application/pdf') {
      return 'pdf';
    }
    
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return 'document';
    }
    
    if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
      return 'spreadsheet';
    }
    
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    
    return 'unknown';
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getSessionFiles(sessionId: string): ProcessedFile[] {
    return this.fileStorage.get(sessionId) || [];
  }

  public clearSessionFiles(sessionId: string): void {
    this.fileStorage.delete(sessionId);
  }

  public getFile(sessionId: string, fileId: string): ProcessedFile | null {
    const files = this.getSessionFiles(sessionId);
    return files.find(f => f.id === fileId) || null;
  }

  public removeFile(sessionId: string, fileId: string): boolean {
    const files = this.getSessionFiles(sessionId);
    const filteredFiles = files.filter(f => f.id !== fileId);
    
    if (filteredFiles.length !== files.length) {
      this.fileStorage.set(sessionId, filteredFiles);
      return true;
    }
    
    return false;
  }
  
  public prepareFilesForAI(sessionId: string): string {
    const files = this.getSessionFiles(sessionId);
    
    if (files.length === 0) {
      return '';
    }

    let contextString = '\n\n--- UPLOADED FILES ---\n';
    
    files.forEach((file, index) => {
      contextString += `\nFile ${index + 1}: ${file.originalName}\n`;
      contextString += `Type: ${file.type}\n`;
      contextString += `Size: ${(file.size / 1024).toFixed(1)} KB\n`;
      
      if (file.processingError) {
        contextString += `Error: ${file.processingError}\n`;
      } else if (file.content) {
        contextString += `Content:\n${file.content}\n`;
      }
      
      contextString += '---\n';
    });

    return contextString;
  }
}

export const fileUploadService = new FileUploadService();