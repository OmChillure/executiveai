import { google, docs_v1, drive_v3, Auth } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as aiModelService from '../services/ai-model.service';

export interface GoogleDocsResult {
  type: string;
  content: string;
  metadata?: {
    action: string;
    data?: any;
    success: boolean;
    requiresConfirmation?: boolean;
    confirmationPrompt?: string;
    parsedCommand?: ParsedDocsCommand;
  };
  error?: string;
}

export interface ParsedDocsCommand {
  action: DocsAction;
  parameters: any;
  confirmationRequired?: boolean;
  userInput?: string;
}

export enum DocsAction {
  CreateDocument = 'create_document',
  ReadDocument = 'read_document',
  UpdateDocument = 'update_document',
  SearchDocuments = 'search_documents',
  ShareDocument = 'share_document',
  DeleteDocument = 'delete_document',
  Unknown = 'unknown_action',
}

export interface UserCredentials {
  userId: string;
  tokens: Auth.Credentials;
  expiresAt: Date;
}

const SCOPES: string[] = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const EAGER_REFRESH_THRESHOLD_MS: number = 5 * 60 * 1000;

const userCredentialsStore: Map<string, UserCredentials> = new Map();

class GoogleDocsAgent {
  private docs: docs_v1.Docs | null = null;
  private drive: drive_v3.Drive | null = null;
  private oauth2Client: OAuth2Client | null = null;
  private initialized: boolean = false;
  private userId: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(userId: string, clientId: string, clientSecret: string, redirectUri: string) {
    this.userId = userId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  public async initialize(): Promise<string | null> {
    if (this.initialized) return null;
    
    try {
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );

      const userCreds = userCredentialsStore.get(this.userId);
      if (userCreds) {
        this.oauth2Client.setCredentials(userCreds.tokens);
        
        if (userCreds.expiresAt.getTime() <= (Date.now() + EAGER_REFRESH_THRESHOLD_MS)) {
          try {
            const { credentials: newCredentials } = await this.oauth2Client.refreshAccessToken();
            this.oauth2Client.setCredentials(newCredentials);
            this.saveUserCredentials(newCredentials);
            this.log('Token refreshed and saved successfully.');
          } catch (refreshError) {
            this.handleError(refreshError, 'Token Refresh');
            this.log('Failed to refresh token. Authorization needed.');
            return this.getAuthUrl();
          }
        }
        
        this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        this.initialized = true;
        return null;
      } else {
        return this.getAuthUrl();
      }
    } catch (error) {
      this.handleError(error, 'Agent Initialization');
      throw new Error(`Google Docs Agent initialization failed: ${(error as Error).message}`);
    }
  }

  private getAuthUrl(): string {
    return this.oauth2Client!.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: this.userId
    });
  }

  public async handleAuthCode(code: string): Promise<boolean> {
    try {
      const { tokens } = await this.oauth2Client!.getToken(code);
      this.oauth2Client!.setCredentials(tokens);
      this.saveUserCredentials(tokens);
      this.docs = google.docs({ version: 'v1', auth: this.oauth2Client! });
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client! });
      this.initialized = true;
      this.log('Authorization successful. Token stored for user.');
      return true;
    } catch (err) {
      this.handleError(err, 'Auth Code Handling');
      throw new Error(`Failed to process authorization: ${(err as Error).message}`);
    }
  }

  private saveUserCredentials(tokens: Auth.Credentials): void {
    const expiryDate = new Date();
    if (tokens.expiry_date) {
      expiryDate.setTime(tokens.expiry_date);
    } else {
      expiryDate.setTime(Date.now() + 3600 * 1000);
    }

    userCredentialsStore.set(this.userId, {
      userId: this.userId,
      tokens,
      expiresAt: expiryDate
    });
  }

  private constructNLPPrompt(userCommand: string): string {
    const today = new Date().toISOString().split('T')[0];
    
    return `
You are an intelligent Google Docs command parser. Convert the user's natural language request into a structured JSON command.

The output JSON MUST have an "action" field (string) and a "parameters" field (object).

Possible actions and their typical parameters:
- "${DocsAction.CreateDocument}": "title": string, "content": string (optional)
- "${DocsAction.ReadDocument}": "documentId": string OR "searchName": string
- "${DocsAction.UpdateDocument}": "documentId": string, "updates": array of update objects
- "${DocsAction.SearchDocuments}": "name": string, "exactMatch": boolean (optional), "limit": number (optional)
- "${DocsAction.ShareDocument}": "documentId": string, "shareType": "user"|"anyone"|"domain", "email": string (optional), "role": "owner"|"writer"|"commenter"|"reader"
- "${DocsAction.DeleteDocument}": "documentId": string OR "searchName": string
- "${DocsAction.Unknown}": "missing_info": string

Update object format for updateDocument:
{
  "action": "insertText"|"deleteText"|"replaceText"|"insertParagraph",
  "text": string (optional),
  "index": number (optional),
  "endIndex": number (optional),
  "searchText": string (optional - for replace),
  "replaceText": string (optional - for replace)
}

Examples:
- User: "Create a new document called 'Meeting Notes'"
  JSON: {"action": "${DocsAction.CreateDocument}", "parameters": {"title": "Meeting Notes"}}

- User: "Read the document with ID abc123"
  JSON: {"action": "${DocsAction.ReadDocument}", "parameters": {"documentId": "abc123"}}

- User: "Find documents with 'report' in the name"
  JSON: {"action": "${DocsAction.SearchDocuments}", "parameters": {"name": "report", "exactMatch": false}}

- User: "Share document xyz with john@example.com as editor"
  JSON: {"action": "${DocsAction.ShareDocument}", "parameters": {"documentId": "xyz", "shareType": "user", "email": "john@example.com", "role": "writer"}}

User Command: "${userCommand}"

Output JSON (ONLY the JSON object, no other text):
`;
  }

  public async processNaturalLanguageCommand(command: string, modelId: string): Promise<GoogleDocsResult> {
    if (!this.initialized || !this.docs || !this.drive) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Please connect your Google account in the Plugins page.', 
        error: 'Not authorized'
      };
    }

    this.log(`Processing natural language command: "${command}"`);

    const prompt = this.constructNLPPrompt(command);
    let parsedCommand: ParsedDocsCommand;

    try {
      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        prompt,
        "You are an expert Google Docs command parser. Parse natural language to structured JSON commands."
      );
      
      const text = aiResponse.content;
      this.log(`AI response text: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
      
      const cleanedJsonString = text.replace(/```json\n?|\n?```/g, '').trim();
      parsedCommand = JSON.parse(cleanedJsonString) as ParsedDocsCommand;
      parsedCommand.userInput = command;
    } catch (error) {
      this.handleError(error, 'AI Parsing Natural Language Command');
      return { 
        type: 'error', 
        content: `Error parsing command: ${(error as Error).message}`, 
        error: (error as Error).message
      };
    }
    
    this.log(`Parsed command: ${JSON.stringify(parsedCommand)}`);
    return this.executeParsedCommand(parsedCommand);
  }

  public async executeParsedCommand(parsedCommand: ParsedDocsCommand): Promise<GoogleDocsResult> {
    if (!this.initialized || !this.docs || !this.drive) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Please connect your Google account.', 
        error: 'Not authorized'
      };
    }

    this.log(`Executing action: ${parsedCommand.action} with params: ${JSON.stringify(parsedCommand.parameters)}`);
    
    try {
      switch (parsedCommand.action) {
        case DocsAction.CreateDocument:
          return await this.createDocument(parsedCommand.parameters);
          
        case DocsAction.ReadDocument:
          return await this.readDocument(parsedCommand.parameters);
          
        case DocsAction.UpdateDocument:
          return await this.updateDocument(parsedCommand.parameters);
          
        case DocsAction.SearchDocuments:
          return await this.searchDocuments(parsedCommand.parameters);
          
        case DocsAction.ShareDocument:
          return await this.shareDocument(parsedCommand.parameters);
          
        case DocsAction.DeleteDocument:
          return await this.deleteDocument(parsedCommand.parameters);
          
        default:
          return {
            type: 'error',
            content: `Action "${parsedCommand.action}" is not supported.`,
            error: 'Unsupported action',
            metadata: {
              action: parsedCommand.action,
              success: false,
              parsedCommand
            }
          };
      }
    } catch (error) {
      this.handleError(error, `Executing ${parsedCommand.action}`);
      return { 
        type: 'error',
        content: `Error executing ${parsedCommand.action}: ${(error as Error).message}`,
        error: (error as Error).message,
        metadata: {
          action: parsedCommand.action,
          success: false,
          parsedCommand
        }
      };
    }
  }

  private async createDocument(params: any): Promise<GoogleDocsResult> {
    const { title, content } = params;
    
    if (!title) {
      throw new Error('Document title is required');
    }

    const createResponse = await this.docs!.documents.create({
      requestBody: { title }
    });

    const documentId = createResponse.data.documentId!;
    
    if (content) {
      const requests = [{
        insertText: {
          location: { index: 1 },
          text: content
        }
      }];

      await this.docs!.documents.batchUpdate({
        documentId: documentId,
        requestBody: { requests }
      });
    }

    return {
      type: 'docs_action',
      content: `Document "${title}" created successfully.`,
      metadata: {
        action: DocsAction.CreateDocument,
        data: {
          id: documentId,
          title: createResponse.data.title,
          url: `https://docs.google.com/document/d/${documentId}/edit`,
          revisionId: createResponse.data.revisionId
        },
        success: true
      }
    };
  }

  private async readDocument(params: any): Promise<GoogleDocsResult> {
    let documentId = params.documentId;
    
    // If no documentId provided, try to search by name
    if (!documentId && params.searchName) {
      const searchResult = await this.searchDocumentByName(params.searchName, true);
      if (searchResult.length === 0) {
        throw new Error(`No document found with name "${params.searchName}"`);
      }
      documentId = searchResult[0].id;
    }
    
    if (!documentId) {
      throw new Error('Document ID or search name is required');
    }

    const response = await this.docs!.documents.get({ documentId });
    
    let textContent = "";
    const doc = response.data;
    
    if (doc.body && doc.body.content) {
      doc.body.content.forEach(element => {
        if (element.paragraph && element.paragraph.elements) {
          element.paragraph.elements.forEach(elem => {
            if (elem.textRun && elem.textRun.content) {
              textContent += elem.textRun.content;
            }
          });
        }
      });
    }

    return {
      type: 'docs_action',
      content: `Document "${doc.title}" read successfully.`,
      metadata: {
        action: DocsAction.ReadDocument,
        data: {
          documentId,
          title: doc.title,
          content: textContent.trim(),
          url: `https://docs.google.com/document/d/${documentId}/edit`,
          metadata: {
            revisionId: doc.revisionId,
            wordCount: textContent.trim().split(/\s+/).length,
            characterCount: textContent.length
          }
        },
        success: true
      }
    };
  }

  private async updateDocument(params: any): Promise<GoogleDocsResult> {
    const { documentId, updates } = params;
    
    if (!documentId || !updates || !Array.isArray(updates)) {
      throw new Error('Document ID and updates array are required');
    }

    const requests = updates.map((update: any) => {
      switch (update.action) {
        case "insertText":
          return {
            insertText: {
              location: { index: update.index || 1 },
              text: update.text
            }
          };
        
        case "deleteText":
          return {
            deleteContentRange: {
              range: {
                startIndex: update.index,
                endIndex: update.endIndex
              }
            }
          };
        
        case "replaceText":
          return {
            replaceAllText: {
              containsText: {
                text: update.searchText,
                matchCase: false
              },
              replaceText: update.replaceText
            }
          };
        
        case "insertParagraph":
          return {
            insertText: {
              location: { index: update.index || 1 },
              text: "\n" + (update.text || "")
            }
          };
        
        default:
          throw new Error(`Unknown update action: ${update.action}`);
      }
    });

    const response = await this.docs!.documents.batchUpdate({
      documentId: documentId,
      requestBody: { requests }
    });

    return {
      type: 'docs_action',
      content: `Document updated successfully with ${updates.length} changes.`,
      metadata: {
        action: DocsAction.UpdateDocument,
        data: {
          documentId,
          updatesApplied: updates.length,
          revisionId: response.data.documentId
        },
        success: true
      }
    };
  }

  private async searchDocuments(params: any): Promise<GoogleDocsResult> {
    const { name, exactMatch = false, limit = 20 } = params;
    
    if (!name) {
      throw new Error('Search name is required');
    }

    const documents = await this.searchDocumentByName(name, exactMatch, limit);

    return {
      type: 'docs_action',
      content: `Found ${documents.length} document(s) ${exactMatch ? 'matching' : 'containing'} "${name}".`,
      metadata: {
        action: DocsAction.SearchDocuments,
        data: {
          searchQuery: name,
          totalResults: documents.length,
          documents,
          exactMatch
        },
        success: true
      }
    };
  }

  private async shareDocument(params: any): Promise<GoogleDocsResult> {
    const { documentId, shareType, email, role = 'reader' } = params;
    
    if (!documentId || !shareType) {
      throw new Error('Document ID and share type are required');
    }

    let resource: any = { role, type: shareType };
    let responseMessage = "";
    
    switch (shareType) {
      case "user":
        if (!email) {
          throw new Error("Email is required when shareType is 'user'");
        }
        resource.emailAddress = email;
        responseMessage = `Document shared successfully with ${email} as ${role}`;
        break;
        
      case "anyone":
        responseMessage = `Document is now accessible to anyone with the link with ${role} permissions`;
        break;
        
      case "domain":
        responseMessage = `Document shared with everyone in your organization as ${role}`;
        break;
    }
    
    const response = await this.drive!.permissions.create({
      fileId: documentId,
      requestBody: resource,
      sendNotificationEmail: shareType === "user",
      fields: 'id,type,role,emailAddress'
    });
    
    const fileResponse = await this.drive!.files.get({
      fileId: documentId,
      fields: 'webViewLink'
    });

    return {
      type: 'docs_action',
      content: responseMessage,
      metadata: {
        action: DocsAction.ShareDocument,
        data: {
          documentId,
          permission: {
            id: (response as any).data.id,
            type: shareType,
            role: role,
            email: email || null
          },
          shareableLink: fileResponse.data.webViewLink
        },
        success: true
      }
    };
  }

  private async deleteDocument(params: any): Promise<GoogleDocsResult> {
    let documentId = params.documentId;
    
    // If no documentId provided, try to search by name
    if (!documentId && params.searchName) {
      const searchResult = await this.searchDocumentByName(params.searchName, true);
      if (searchResult.length === 0) {
        throw new Error(`No document found with name "${params.searchName}"`);
      }
      documentId = searchResult[0].id;
    }
    
    if (!documentId) {
      throw new Error('Document ID or search name is required');
    }

    await this.drive!.files.delete({ fileId: documentId });

    return {
      type: 'docs_action',
      content: 'Document deleted successfully.',
      metadata: {
        action: DocsAction.DeleteDocument,
        data: { documentId },
        success: true
      }
    };
  }

  private async searchDocumentByName(name: string, exactMatch: boolean = false, limit: number = 20): Promise<any[]> {
    let query = "mimeType='application/vnd.google-apps.document'";
    if (exactMatch) {
      query += ` and name='${name}'`;
    } else {
      query += ` and name contains '${name}'`;
    }
    query += " and trashed=false";
    
    const response = await this.drive!.files.list({
      q: query,
      fields: "files(id, name, createdTime, modifiedTime, webViewLink, owners)",
      orderBy: "createdTime desc",
      pageSize: limit
    });
    
    if (!response.data.files) return [];
    
    const now = new Date();
    return response.data.files.map(file => {
      const createdTime = new Date(file.createdTime!);
      const modifiedTime = new Date(file.modifiedTime!);

      const createdDiff = now.getTime() - createdTime.getTime();
      const modifiedDiff = now.getTime() - modifiedTime.getTime();
      
      const formatRelativeTime = (diff: number) => {
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
      };
      
      return {
        id: file.id,
        name: file.name,
        url: file.webViewLink,
        createdTime: file.createdTime,
        createdTimeRelative: formatRelativeTime(createdDiff),
        modifiedTime: file.modifiedTime,
        modifiedTimeRelative: formatRelativeTime(modifiedDiff),
        owner: file.owners && file.owners[0] ? file.owners[0].emailAddress : 'Unknown'
      };
    });
  }

  private log(message: string, data?: any): void {
    const logMessage = `[GoogleDocsAgent:${this.userId}] ${new Date().toISOString()} ${message}`;
    if (data) {
      console.log(logMessage, typeof data === 'object' ? JSON.stringify(data, null, 2).substring(0, 500) : data);
    } else {
      console.log(logMessage);
    }
  }

  private handleError(error: any, operation: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GoogleDocsAgent:${this.userId}] ERROR during ${operation}: ${errorMessage}`);
    if (error.response?.data?.error) {
      console.error(`[GoogleDocsAgent:${this.userId}] API Error: ${JSON.stringify(error.response.data.error)}`);
    }
  }
}

// Agent instances map
const agentInstances: Map<string, GoogleDocsAgent> = new Map();

const GDOCS_CLIENT_ID = process.env.GDRIVE_CLIENT_ID || '';
const GDOCS_CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET || '';
const GDOCS_REDIRECT_URI = process.env.GDRIVE_REDIRECT_URI || 'http://localhost:5001/api/gdocs/oauth2callback';

// Get an agent for a specific user
export const getGoogleDocsAgent = async (userId: string): Promise<GoogleDocsAgent> => {
  if (!GDOCS_CLIENT_ID || !GDOCS_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured. Please set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET environment variables.');
  }
  
  if (!agentInstances.has(userId)) {
    agentInstances.set(
      userId, 
      new GoogleDocsAgent(userId, GDOCS_CLIENT_ID, GDOCS_CLIENT_SECRET, GDOCS_REDIRECT_URI)
    );
  }
  
  return agentInstances.get(userId)!;
};

export const initializeGDocsAgent = async (userId: string): Promise<string | null> => {
  const agent = await getGoogleDocsAgent(userId);
  return agent.initialize();
};

export const handleAuthCallback = async (userId: string, code: string): Promise<boolean> => {
  const agent = await getGoogleDocsAgent(userId);
  return agent.handleAuthCode(code);
};

export const disconnectGoogleDocs = async (userId: string): Promise<boolean> => {
    try {
        userCredentialsStore.delete(userId);
        agentInstances.delete(userId);
        
        console.log(`[GoogleDocsAgent] User ${userId} disconnected successfully`);
        return true;
    } catch (error) {
        console.error(`[GoogleDocsAgent] Error disconnecting user ${userId}:`, error);
        return false;
    }
};

export const processGoogleDocsRequest = async (
  message: string,
  modelId: string,
  userId: string
): Promise<GoogleDocsResult> => {
  try {
    const agent = await getGoogleDocsAgent(userId);
    const authUrl = await agent.initialize();

    if (authUrl) {
      return {
        type: 'authorization_required',
        content: 'To use Google Docs features, you need to connect your Google account in the Plugins page.',
        metadata: {
          action: 'authorization_required',
          data: { 
            authUrl,
            message: 'Please connect your Google account from the Plugins page to use Google Docs features.'
          },
          success: false
        }
      };
    }
    
    return await agent.processNaturalLanguageCommand(message, modelId);
  } catch (error) {
    console.error('Error processing Google Docs message:', error);
    return {
      type: 'error',
      content: `Failed to process command: ${(error as Error).message}`,
      error: (error as Error).message
    };
  }
};