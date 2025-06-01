import { google, drive_v3, Auth } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as readlinePromises from 'readline/promises';
import * as aiModelService from '../services/ai-model.service';
import { db } from '../db';
import { eq } from 'drizzle-orm';

function calculateLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  a = a.toLowerCase();
  b = b.toLowerCase();

  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + indicator, // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

function calculateStringSimilarity(s1: string, s2: string): number {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  const longerLength = longer.length;
  if (longerLength === 0) {
    return 1.0;
  }
  return (longerLength - calculateLevenshteinDistance(longer, shorter)) / longerLength;
}


export interface ResolvedTargetItem {
  id: string;
  name: string;
  originalName?: string; 
  originalParentIds?: string[];
  type: 'file' | 'folder';
  userInput?: string; 
  isSuggestion?: boolean;
  similarity?: number;
}

export interface BatchItemDetail {
  id: string;
  name: string;
  originalName: string; 
  originalParentIds?: string[];
  mimeType?: string | null; 
}

export interface ParsedDriveCommand {
  action: DriveAction;
  parameters: any;
  confirmationRequired?: boolean;
  userInput?: string;
  resolvedTargetItems?: ResolvedTargetItem[];
  preModificationDetails?: (Pick<ResolvedTargetItem, 'id' | 'name' | 'originalName' | 'originalParentIds'> | BatchItemDetail)[];
}

export enum DriveAction {
  SearchFiles = 'search_files',
  UploadFile = 'upload_file',
  DeleteFileById = 'delete_file_by_id',
  DeleteFileByName = 'delete_file_by_name',
  DeleteFolderById = 'delete_folder_by_id',
  DeleteFolderByName = 'delete_folder_by_name',
  MoveItem = 'move_item',
  ViewFileInfo = 'view_file_info',
  DownloadFile = 'download_file',
  CreateFolder = 'create_folder',
  RenameItem = 'rename_item',
  ListFolderContents = 'list_folder_contents',
  UndoLastAction = 'undo_last_action',
  Unknown = 'unknown_action',

  // Batch actions
  DeleteItemsByQuery = 'delete_items_by_query',
  MoveItemsByQuery = 'move_items_by_query',
}

export interface DriveResult {
  type: string;
  content: string;
  metadata?: {
    action: string;
    data?: any;
    success: boolean;
    requiresConfirmation?: boolean;
    confirmationPrompt?: string;
    parsedCommand?: ParsedDriveCommand;
  };
  error?: string;
}

export interface UserCredentials {
  userId: string;
  tokens: Auth.Credentials;
  expiresAt: Date;
}

const SCOPES: string[] = ['https://www.googleapis.com/auth/drive'];
const TOKEN_DIR: string = path.join(os.homedir(), '.credentials');
const FUZZY_SIMILARITY_THRESHOLD = 0.75;
const EAGER_REFRESH_THRESHOLD_MS: number = 5 * 60 * 1000;

const userCredentialsStore: Map<string, UserCredentials> = new Map();

const userCommandHistory: Map<string, Array<{ command: ParsedDriveCommand; response: any; timestamp: Date }>> = new Map();
const MAX_HISTORY_SIZE = 10;

class GoogleDriveAgent {
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
        
        if (this.oauth2Client) {
          this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        } else {
          throw new Error('OAuth2 client not initialized');
        }
        this.initialized = true;
        return null; // No auth needed
      } else {
        return this.getAuthUrl();
      }
    } catch (error) {
      this.handleError(error, 'Agent Initialization');
      throw new Error(`Google Drive Agent initialization failed: ${(error as Error).message}`);
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

  private getUserCommandHistory(): Array<{ command: ParsedDriveCommand; response: any; timestamp: Date }> {
    if (!userCommandHistory.has(this.userId)) {
      userCommandHistory.set(this.userId, []);
    }
    return userCommandHistory.get(this.userId)!;
  }

  private addToCommandHistory(command: ParsedDriveCommand, response: any): void {
    const history = this.getUserCommandHistory();
    history.push({ command, response, timestamp: new Date() });
    
    if (history.length > MAX_HISTORY_SIZE) {
      history.shift();
    }
  }

  private constructNLPPrompt(userCommand: string): string {
    const today = new Date().toISOString().split('T')[0];
    let recentItemContext = "";
    const commandHistory = this.getUserCommandHistory();
    
    if (commandHistory.length > 0) {
      const lastModifyingOp = commandHistory.slice().reverse().find(op => this.isModifyingAction(op.command.action) && op.response.success);
      if (lastModifyingOp && lastModifyingOp.response.data) {
        const data = lastModifyingOp.response.data;
        let itemName = "";
        if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object' && 'name' in data[0]) {
          itemName = (data[0] as any).name;
        } else if (!Array.isArray(data) && data && typeof data === 'object' && 'name' in data) {
          itemName = (data as any).name;
        }

        if (itemName) {
          recentItemContext = `\nThe last successfully modified item was likely related to: "${itemName}". If the user says "that item", "it", or refers to a previous action, they might be referring to this.`;
        }
      }
    }

    return `
You are an intelligent Google Drive command parser. Convert the user's natural language request into a structured JSON command that the GoogleDrive agent can execute.
Today's date is ${today}.${recentItemContext}

The output JSON MUST have an "action" field (string) and a "parameters" field (object).
If the action is one of the "delete_*", "move_item*", "rename_item", or any "*_by_query" modifying action, ALWAYS include a "confirmationRequired": true field at the top level.
If the user asks to "undo", "reverse the last action", or similar, use the "${DriveAction.UndoLastAction}" action. Parameters can be an empty object: {}.

Possible actions and their typical parameters (which go INSIDE the "parameters" object):
- "${DriveAction.SearchFiles}": "q": Drive query string. "fields": Optional. Use this for questions about files.
- "${DriveAction.UploadFile}": "localPath", "fileName" (optional), "destinationFolderName"/"destinationFolderId" (optional, 'root' for MyDrive).
- "${DriveAction.DeleteFileById}": "fileId".
- "${DriveAction.DeleteFileByName}": "fileName", "parentFolderName"/"parentFolderId" (optional).
- "${DriveAction.DeleteFolderById}": "folderId".
- "${DriveAction.DeleteFolderByName}": "folderName", "parentFolderName"/"parentFolderId" (optional).
- "${DriveAction.MoveItem}": "itemId"/"itemName", "destinationFolderId"/"destinationFolderName", "sourceParentId"/"sourceParentName" (optional).
- "${DriveAction.ViewFileInfo}": "fileId"/"itemName", "parentFolderId"/"parentFolderName" (optional).
- "${DriveAction.DownloadFile}": "fileId"/"itemName", "destinationPath", "parentFolderId"/"parentFolderName" (optional).
- "${DriveAction.CreateFolder}": "folderName", "parentFolderId"/"parentFolderName" (optional, 'root' for MyDrive).
- "${DriveAction.RenameItem}": "itemId"/"itemName", "newName", "parentFolderId"/"parentFolderName" (optional).
- "${DriveAction.ListFolderContents}": "folderId"/"folderName" (optional, 'root' for MyDrive).
- "${DriveAction.UndoLastAction}": (No parameters needed, or empty object: {}).

BATCH ACTIONS (operate on multiple items based on a query):
- "${DriveAction.DeleteItemsByQuery}": "q": Drive query string. "itemType": (optional, "file" or "folder"), "parentFolderName": (optional string, if query is within a specific folder name).
- "${DriveAction.MoveItemsByQuery}": "q": Drive query string. "destinationFolderId"/"destinationFolderName". "itemType": (optional, "file" or "folder"), "parentFolderName": (optional string, if query is within a specific folder name).

General Rules for Query Construction ('q' parameter):
- For specific types:
    - PDFs: "mimeType='application/pdf'"
    - Text files: "mimeType='text/plain'"
    - Google Docs: "mimeType='application/vnd.google-apps.document'"
    - Google Sheets: "mimeType='application/vnd.google-apps.spreadsheet'"
    - Images: "(mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/gif')"
    - Folders: "mimeType='application/vnd.google-apps.folder'"
- For names: "name contains 'keyword'" or "name = 'exact_keyword.ext'"
- For dates (use YYYY-MM-DD format):
    - Modified today: "modifiedTime > '${today}T00:00:00Z'"
    - Modified before a date: "modifiedTime < 'YYYY-MM-DD'"
    - Modified within a range: "modifiedTime > 'YYYY-MM-DD' and modifiedTime < 'YYYY-MM-DD'"
- Combine with 'and' or 'or': "name contains 'receipt' and mimeType='application/pdf'"
- Parent folder context: If the user says "in folder X", include "parentFolderName": "X" in parameters for batch actions. The agent will resolve "X" to an ID and prepend "'<folder_id>' in parents and " to the q. For non-batch, the parent can be resolved directly for the "itemName" or "fileName" lookup.
- Not trashed: Always add "and trashed = false" to the 'q' string, unless user explicitly asks about trash.

Intent Distinction:
- If the user is asking a question (e.g., "how many PDFs?", "list all reports", "what was the last file I touched?"), use "${DriveAction.SearchFiles}".
- If the user is giving a command to change something (e.g., "delete all receipts", "move old logs"), use the appropriate modifying action (e.g., "${DriveAction.DeleteItemsByQuery}", "${DriveAction.MoveItemsByQuery}").
- If the user's intent is ambiguous, or the command is extremely broad without clear criteria (e.g., "clean up my drive"), use action "${DriveAction.Unknown}" and "parameters": { "missing_info": "The command is too ambiguous or broad. Please be more specific, e.g., 'delete all files older than one year named temp_*'." }.

Context:
- 'MyDrive', 'My Drive', or the root directory explicitly means 'root' for folder ID/name parameters.
- CRITICAL: Only ONE primary action per command. If multiple operations are implied, select the most primary or first logical action.

Examples for batch actions:
- User: "Delete all PDFs named 'invoice' in the 'Archive' folder."
  JSON: { "action": "${DriveAction.DeleteItemsByQuery}", "parameters": { "q": "name contains 'invoice' and mimeType='application/pdf' and trashed=false", "parentFolderName": "Archive" }, "confirmationRequired": true }
- User: "Move all my spreadsheets to 'Backup Sheets'."
  JSON: { "action": "${DriveAction.MoveItemsByQuery}", "parameters": { "q": "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false", "destinationFolderName": "Backup Sheets" }, "confirmationRequired": true }
- User: "Find all text files."
  JSON: { "action": "${DriveAction.SearchFiles}", "parameters": { "q": "mimeType='text/plain' and trashed=false" } }
- User: "Delete all files named 'temp_log' modified before 2023-01-01."
  JSON: { "action": "${DriveAction.DeleteItemsByQuery}", "parameters": { "q": "name = 'temp_log' and modifiedTime < '2023-01-01' and trashed=false", "itemType": "file" }, "confirmationRequired": true }

User Command: "${userCommand}"

Output JSON (ONLY the JSON object, no other text or markdown formatting like \`\`\`json):
`;
  }

  public async processNaturalLanguageCommand(command: string, modelId: string): Promise<DriveResult> {
    if (!this.initialized || !this.drive) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Authorization required.', 
        error: 'Not authorized'
      };
    }
    this.log(`Processing natural language command: "${command}"`);

    const prompt = this.constructNLPPrompt(command);
    let parsedCommand: ParsedDriveCommand;

    try {
      // Use the aiModelService instead of directly using Gemini
      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        prompt,
        "You are an expert Google Drive command parser. Parse natural language to structured JSON commands."
      );
      
      const text = aiResponse.content;
      this.log(`AI response text: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
      
      // Clean the response to ensure it's valid JSON
      const cleanedJsonString = text.replace(/```json\n?|\n?```/g, '').trim();
      parsedCommand = JSON.parse(cleanedJsonString) as ParsedDriveCommand;
      parsedCommand.userInput = command; // Store original user input
    } catch (error) {
      this.handleError(error, 'AI Parsing Natural Language Command');
      return { 
        type: 'error', 
        content: `Error parsing command: ${(error as Error).message}`, 
        error: (error as Error).message
      };
    }
    
    this.log(`Parsed command: ${JSON.stringify(parsedCommand)}`);
    return this.executeParsedCommand(parsedCommand, false);
  }

  private getActionsRequiringDetailedConfirmation(): DriveAction[] {
    return [
      DriveAction.UploadFile,
      DriveAction.DeleteFileById, DriveAction.DeleteFileByName,
      DriveAction.DeleteFolderById, DriveAction.DeleteFolderByName,
      DriveAction.MoveItem, DriveAction.RenameItem,
      DriveAction.DeleteItemsByQuery, DriveAction.MoveItemsByQuery,
    ];
  }

  private isModifyingAction(action: DriveAction): boolean {
    return [
      DriveAction.UploadFile, DriveAction.DeleteFileById, DriveAction.DeleteFileByName,
      DriveAction.DeleteFolderById, DriveAction.DeleteFolderByName, DriveAction.MoveItem,
      DriveAction.CreateFolder, DriveAction.RenameItem,
      DriveAction.DeleteItemsByQuery, DriveAction.MoveItemsByQuery,
    ].includes(action);
  }

  public async executeParsedCommand(parsedCommand: ParsedDriveCommand, confirmed: boolean = false): Promise<DriveResult> {
    if (!this.initialized || !this.drive) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Authorization required.', 
        error: 'Not authorized'
      };
    }

    if (parsedCommand.action === DriveAction.UndoLastAction) {
      return this.executeUndoLastAction();
    }

    const actionsRequiringConfirmation = this.getActionsRequiringDetailedConfirmation();
    const needsDetailedConfirmation = actionsRequiringConfirmation.includes(parsedCommand.action) || parsedCommand.confirmationRequired;

    if (needsDetailedConfirmation && !confirmed) {
      // Here we would normally try to resolve target items, but for simplicity
      // we'll just return the confirmation prompt
      const promptMessage = `You are about to perform action: ${parsedCommand.action.replace(/_/g, ' ')}.`;
      
      return { 
        type: 'confirmation_required', 
        content: 'Confirmation required for this action.', 
        metadata: {
          action: parsedCommand.action,
          success: true,
          requiresConfirmation: true,
          confirmationPrompt: promptMessage,
          parsedCommand
        }
      };
    }

    this.log(`Executing action: ${parsedCommand.action} with params: ${JSON.stringify(parsedCommand.parameters)} (Confirmed: ${confirmed})`);
    
    let result: DriveResult;
    
    try {
      switch (parsedCommand.action) {
        case DriveAction.SearchFiles:
          const searchResult = await this.searchFiles(parsedCommand.parameters.q, parsedCommand.parameters.fields);
          result = {
            type: 'drive_action',
            content: `Found ${searchResult.data?.length || 0} items matching your query.`,
            metadata: {
              action: parsedCommand.action,
              data: searchResult.data,
              success: searchResult.success,
              parsedCommand
            }
          };
          break;
          
        case DriveAction.ListFolderContents:
          const listResult = await this.listFolderContents(
            parsedCommand.parameters.folderId || parsedCommand.parameters.folderName,
            parsedCommand.parameters.parentFolderId || parsedCommand.parameters.parentFolderName
          );
          result = {
            type: 'drive_action',
            content: `Folder contents: ${listResult.data?.length || 0} items.`,
            metadata: {
              action: parsedCommand.action,
              data: listResult.data,
              success: listResult.success,
              parsedCommand
            }
          };
          break;

          
        default:
          result = {
            type: 'error',
            content: `Action "${parsedCommand.action}" is not implemented in this version.`,
            error: 'Not implemented',
            metadata: {
              action: parsedCommand.action,
              success: false,
              parsedCommand
            }
          };
      }
      
      if (result.metadata?.success && this.isModifyingAction(parsedCommand.action)) {
        this.addToCommandHistory(parsedCommand, result);
      }
      
      return result;
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

  private async searchFiles(query: string, fields?: string): Promise<any> {
    if (!this.drive) return { success: false, message: "Drive service not available." };
    const effectiveFields = fields || 'files(id, name, mimeType, modifiedTime, webViewLink, parents, size)';
    let finalQuery = query;
    if (!finalQuery.toLowerCase().includes('trashed')) {
      finalQuery = `(${finalQuery}) and trashed = false`;
    }
    this.log(`Searching files with query: "${finalQuery}"`);
    try {
      const res = await this.drive.files.list({ 
        q: finalQuery, 
        fields: effectiveFields, 
        pageSize: 50 
      });
      return { success: true, message: 'File search successful.', data: res.data.files || [] };
    } catch (error) {
      this.handleError(error, 'SearchFiles');
      return { success: false, message: `Failed to search files: ${(error as Error).message}` };
    }
  }

  private async listFolderContents(folderNameOrId?: string, parentNameOrId?: string): Promise<any> {
    if (!this.drive) return { success: false, message: "Drive service not available." };
    try {
      const folderIdToList = folderNameOrId || 'root';
      const query = `'${folderIdToList}' in parents and trashed = false`;
      const res = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, modifiedTime, size, parents)',
        pageSize: 100
      });
      return { 
        success: true, 
        message: `Contents of folder "${folderNameOrId || 'My Drive'}" listed successfully.`,
        data: res.data.files || []
      };
    } catch (error) {
      this.handleError(error, 'ListFolderContents');
      return { success: false, message: `Failed to list folder contents: ${(error as Error).message}` };
    }
  }

  private async executeUndoLastAction(): Promise<DriveResult> {
    const commandHistory = this.getUserCommandHistory();
    const lastModifiableAction = commandHistory
      .slice()
      .reverse()
      .find(entry => this.isModifyingAction(entry.command.action) && entry.response.success);
      
    if (!lastModifiableAction) {
      return {
        type: 'error',
        content: "No previous actions found that can be undone.",
        error: "No undoable actions"
      };
    }
    
    return {
      type: 'drive_action',
      content: `The last action "${lastModifiableAction.command.action}" would be undone.`,
      metadata: {
        action: DriveAction.UndoLastAction,
        data: {
          undoTarget: lastModifiableAction.command.action,
          timestamp: lastModifiableAction.timestamp
        },
        success: true
      }
    };
  }

  private log(message: string, data?: any): void {
    const logMessage = `[GoogleDriveAgent:${this.userId}] ${new Date().toISOString()} ${message}`;
    if (data) {
      console.log(logMessage, typeof data === 'object' ? JSON.stringify(data, null, 2).substring(0, 500) : data);
    } else {
      console.log(logMessage);
    }
  }

  private handleError(error: any, operation: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GoogleDriveAgent:${this.userId}] ERROR during ${operation}: ${errorMessage}`);
    if (error.response?.data?.error) {
      console.error(`[GoogleDriveAgent:${this.userId}] API Error: ${JSON.stringify(error.response.data.error)}`);
    }
  }
}


const agentInstances: Map<string, GoogleDriveAgent> = new Map();

const GDRIVE_CLIENT_ID = process.env.GDRIVE_CLIENT_ID || '';
const GDRIVE_CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET || '';
const GDRIVE_REDIRECT_URI = process.env.GDRIVE_REDIRECT_URI || 'http://localhost:5001/api/gdrive/oauth2callback';

// Get an agent for a specific user
export const getGoogleDriveAgent = async (userId: string): Promise<GoogleDriveAgent> => {
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  }
  
  if (!agentInstances.has(userId)) {
    agentInstances.set(
      userId, 
      new GoogleDriveAgent(userId, GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REDIRECT_URI)
    );
  }
  
  return agentInstances.get(userId)!;
};

export const initializeGDriveAgent = async (userId: string): Promise<string | null> => {
  const agent = await getGoogleDriveAgent(userId);
  return agent.initialize();
};

export const handleAuthCallback = async (userId: string, code: string): Promise<boolean> => {
  const agent = await getGoogleDriveAgent(userId);
  return agent.handleAuthCode(code);
};

export const processGDriveMessage = async (
  message: string,
  modelId: string,
  userId: string,
  confirmed?: boolean,
  parsedCommand?: ParsedDriveCommand
): Promise<DriveResult> => {
  try {
    const agent = await getGoogleDriveAgent(userId);
    const authUrl = await agent.initialize();

    if (authUrl) {
      const pluginsUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/plugins` : '/plugins';
      return {
        type: 'authorization_required',
        content: 'To use Google Drive features, you need to connect your account. Please visit the Plugins page to connect.',
        metadata: {
          action: 'authorization_required',
          data: { 
            authUrl,
            pluginsUrl,
            message: 'Please connect your Google Drive account from the Plugins page to use this feature.'
          },
          success: false
        }
      };
    }
    
    if (parsedCommand && confirmed) {
      return await agent.executeParsedCommand(parsedCommand, true);
    }
    

    return await agent.processNaturalLanguageCommand(message, modelId);
  } catch (error) {
    console.error('Error processing Google Drive message:', error);
    return {
      type: 'error',
      content: `Failed to process command: ${(error as Error).message}`,
      error: (error as Error).message
    };
  }
};

export const disconnectGoogleDrive = async (userId: string): Promise<boolean> => {
  try {
    userCredentialsStore.delete(userId);
    userCommandHistory.delete(userId);
    
    return true;
  } catch (error) {
    console.error('Error disconnecting Google Drive:', error);
    return false;
  }
};