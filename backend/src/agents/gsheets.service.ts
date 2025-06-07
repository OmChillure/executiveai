import { google, sheets_v4, drive_v3, Auth } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as aiModelService from '../services/ai-model.service';

export interface GoogleSheetsResult {
  type: string;
  content: string;
  metadata?: {
    action: string;
    data?: any;
    success: boolean;
    requiresConfirmation?: boolean;
    confirmationPrompt?: string;
    parsedCommand?: ParsedSheetsCommand;
  };
  error?: string;
}

export interface ParsedSheetsCommand {
  action: SheetsAction;
  parameters: any;
  confirmationRequired?: boolean;
  userInput?: string;
}

export enum SheetsAction {
  CreateSpreadsheet = 'create_spreadsheet',
  ReadSpreadsheet = 'read_spreadsheet',
  UpdateSpreadsheet = 'update_spreadsheet',
  SearchSpreadsheets = 'search_spreadsheets',
  ShareSpreadsheet = 'share_spreadsheet',
  DeleteSpreadsheet = 'delete_spreadsheet',
  Unknown = 'unknown_action',
}

export interface UserCredentials {
  userId: string;
  tokens: Auth.Credentials;
  expiresAt: Date;
}

const SCOPES: string[] = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const EAGER_REFRESH_THRESHOLD_MS: number = 5 * 60 * 1000;

// In-memory storage
const userCredentialsStore: Map<string, UserCredentials> = new Map();

class GoogleSheetsAgent {
  private sheets: sheets_v4.Sheets | null = null;
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
        
        this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client });
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        this.initialized = true;
        return null;
      } else {
        return this.getAuthUrl();
      }
    } catch (error) {
      this.handleError(error, 'Agent Initialization');
      throw new Error(`Google Sheets Agent initialization failed: ${(error as Error).message}`);
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
      this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client! });
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
You are an intelligent Google Sheets command parser. Convert the user's natural language request into a structured JSON command.

The output JSON MUST have an "action" field (string) and a "parameters" field (object).

Possible actions and their typical parameters:
- "${SheetsAction.CreateSpreadsheet}": "title": string, "sheets": array (optional)
- "${SheetsAction.ReadSpreadsheet}": "spreadsheetId": string OR "searchName": string, "ranges": array (optional)
- "${SheetsAction.UpdateSpreadsheet}": "spreadsheetId": string, "range": string, "values": 2D array
- "${SheetsAction.SearchSpreadsheets}": "name": string, "exactMatch": boolean (optional), "limit": number (optional)
- "${SheetsAction.ShareSpreadsheet}": "spreadsheetId": string, "shareType": "user"|"anyone"|"domain", "email": string (optional), "role": "owner"|"writer"|"commenter"|"reader"
- "${SheetsAction.DeleteSpreadsheet}": "spreadsheetId": string OR "searchName": string
- "${SheetsAction.Unknown}": "missing_info": string

Sheet object format for createSpreadsheet:
{
  "title": string,
  "rowCount": number (optional, default 1000),
  "columnCount": number (optional, default 26)
}

Examples:
- User: "Create a new spreadsheet called 'Budget 2024'"
  JSON: {"action": "${SheetsAction.CreateSpreadsheet}", "parameters": {"title": "Budget 2024"}}

- User: "Read data from spreadsheet ID abc123"
  JSON: {"action": "${SheetsAction.ReadSpreadsheet}", "parameters": {"spreadsheetId": "abc123"}}

- User: "Update cell A1 in spreadsheet xyz with value 'Hello'"
  JSON: {"action": "${SheetsAction.UpdateSpreadsheet}", "parameters": {"spreadsheetId": "xyz", "range": "A1", "values": [["Hello"]]}}

- User: "Find spreadsheets with 'sales' in the name"
  JSON: {"action": "${SheetsAction.SearchSpreadsheets}", "parameters": {"name": "sales", "exactMatch": false}}

- User: "Share spreadsheet abc with john@example.com as editor"
  JSON: {"action": "${SheetsAction.ShareSpreadsheet}", "parameters": {"spreadsheetId": "abc", "shareType": "user", "email": "john@example.com", "role": "writer"}}

User Command: "${userCommand}"

Output JSON (ONLY the JSON object, no other text):
`;
  }

  public async processNaturalLanguageCommand(command: string, modelId: string): Promise<GoogleSheetsResult> {
    if (!this.initialized || !this.sheets || !this.drive) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Please connect your Google account in the Plugins page.', 
        error: 'Not authorized'
      };
    }

    this.log(`Processing natural language command: "${command}"`);

    const prompt = this.constructNLPPrompt(command);
    let parsedCommand: ParsedSheetsCommand;

    try {
      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        prompt,
        "You are an expert Google Sheets command parser. Parse natural language to structured JSON commands."
      );
      
      const text = aiResponse.content;
      this.log(`AI response text: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
      
      const cleanedJsonString = text.replace(/```json\n?|\n?```/g, '').trim();
      parsedCommand = JSON.parse(cleanedJsonString) as ParsedSheetsCommand;
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

  public async executeParsedCommand(parsedCommand: ParsedSheetsCommand): Promise<GoogleSheetsResult> {
    if (!this.initialized || !this.sheets || !this.drive) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Please connect your Google account.', 
        error: 'Not authorized'
      };
    }

    this.log(`Executing action: ${parsedCommand.action} with params: ${JSON.stringify(parsedCommand.parameters)}`);
    
    try {
      switch (parsedCommand.action) {
        case SheetsAction.CreateSpreadsheet:
          return await this.createSpreadsheet(parsedCommand.parameters);
          
        case SheetsAction.ReadSpreadsheet:
          return await this.readSpreadsheet(parsedCommand.parameters);
          
        case SheetsAction.UpdateSpreadsheet:
          return await this.updateSpreadsheet(parsedCommand.parameters);
          
        case SheetsAction.SearchSpreadsheets:
          return await this.searchSpreadsheets(parsedCommand.parameters);
          
        case SheetsAction.ShareSpreadsheet:
          return await this.shareSpreadsheet(parsedCommand.parameters);
          
        case SheetsAction.DeleteSpreadsheet:
          return await this.deleteSpreadsheet(parsedCommand.parameters);
          
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

  private async createSpreadsheet(params: any): Promise<GoogleSheetsResult> {
    const { title, sheets } = params;
    
    if (!title) {
      throw new Error('Spreadsheet title is required');
    }

    const resource: any = {
      properties: { title }
    };

    if (sheets && sheets.length > 0) {
      resource.sheets = sheets.map((sheet: any) => ({
        properties: {
          title: sheet.title,
          gridProperties: {
            rowCount: sheet.rowCount || 1000,
            columnCount: sheet.columnCount || 26
          }
        }
      }));
    }

    const response = await this.sheets!.spreadsheets.create({ requestBody: resource });

    return {
      type: 'sheets_action',
      content: `Spreadsheet "${title}" created successfully.`,
      metadata: {
        action: SheetsAction.CreateSpreadsheet,
        data: {
          id: response.data.spreadsheetId,
          title: response.data.properties?.title,
          url: response.data.spreadsheetUrl,
          sheets: response.data.sheets?.map(sheet => ({
            id: sheet.properties?.sheetId,
            title: sheet.properties?.title,
            index: sheet.properties?.index,
            rowCount: sheet.properties?.gridProperties?.rowCount,
            columnCount: sheet.properties?.gridProperties?.columnCount
          }))
        },
        success: true
      }
    };
  }

  private async readSpreadsheet(params: any): Promise<GoogleSheetsResult> {
    let spreadsheetId = params.spreadsheetId;
    const { ranges, includeMetadata = false } = params;
    
    // If no spreadsheetId provided, try to search by name
    if (!spreadsheetId && params.searchName) {
      const searchResult = await this.searchSpreadsheetByName(params.searchName, true);
      if (searchResult.length === 0) {
        throw new Error(`No spreadsheet found with name "${params.searchName}"`);
      }
      spreadsheetId = searchResult[0].id;
    }
    
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID or search name is required');
    }

    // Get metadata
    const metadataResponse = await this.sheets!.spreadsheets.get({
      spreadsheetId,
      includeGridData: false
    });

    const spreadsheetTitle = metadataResponse.data.properties?.title;
    const sheets = metadataResponse.data.sheets?.map(sheet => ({
      title: sheet.properties?.title,
      id: sheet.properties?.sheetId,
      index: sheet.properties?.index,
      rowCount: sheet.properties?.gridProperties?.rowCount,
      columnCount: sheet.properties?.gridProperties?.columnCount
    })) || [];

    let result: any = {
      spreadsheetId,
      title: spreadsheetTitle,
      url: metadataResponse.data.spreadsheetUrl,
      sheets: sheets
    };

    // Read data from ranges
    const rangesToRead = ranges || sheets.map((sheet: any) => `'${sheet.title}'`);
    
    if (rangesToRead.length > 0) {
      try {
        const valuesResponse = await this.sheets!.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges: rangesToRead
        });

        result.data = {};
        valuesResponse.data.valueRanges?.forEach(valueRange => {
          const range = valueRange.range!;
          const values = valueRange.values || [];
          
          const sheetMatch = range.match(/^'?([^'!]+)'?!/);
          const sheetName = sheetMatch ? sheetMatch[1] : 'Sheet1';
          
          if (!result.data[sheetName]) {
            result.data[sheetName] = {};
          }
          
          result.data[sheetName][range] = {
            range: range,
            values: values,
            rowCount: values.length,
            columnCount: values.length > 0 ? Math.max(...values.map(row => row.length)) : 0
          };
        });
      } catch (error) {
        result.dataError = `Failed to read some ranges: ${(error as Error).message}`;
      }
    }

    return {
      type: 'sheets_action',
      content: `Spreadsheet "${spreadsheetTitle}" read successfully.`,
      metadata: {
        action: SheetsAction.ReadSpreadsheet,
        data: result,
        success: true
      }
    };
  }

  private async updateSpreadsheet(params: any): Promise<GoogleSheetsResult> {
    const { spreadsheetId, range, values, valueInputOption = 'USER_ENTERED' } = params;
    
    if (!spreadsheetId || !range || !values) {
      throw new Error('Spreadsheet ID, range, and values are required');
    }

    const response = await this.sheets!.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values }
    });

    return {
      type: 'sheets_action',
      content: `Spreadsheet updated successfully. Updated ${response.data.updatedCells} cells.`,
      metadata: {
        action: SheetsAction.UpdateSpreadsheet,
        data: {
          spreadsheetId,
          updatedRange: response.data.updatedRange,
          updatedRows: response.data.updatedRows,
          updatedColumns: response.data.updatedColumns,
          updatedCells: response.data.updatedCells
        },
        success: true
      }
    };
  }

  private async searchSpreadsheets(params: any): Promise<GoogleSheetsResult> {
    const { name, exactMatch = false, limit = 20 } = params;
    
    if (!name) {
      throw new Error('Search name is required');
    }

    const spreadsheets = await this.searchSpreadsheetByName(name, exactMatch, limit);

    return {
      type: 'sheets_action',
      content: `Found ${spreadsheets.length} spreadsheet(s) ${exactMatch ? 'matching' : 'containing'} "${name}".`,
      metadata: {
        action: SheetsAction.SearchSpreadsheets,
        data: {
          searchQuery: name,
          totalResults: spreadsheets.length,
          spreadsheets,
          exactMatch
        },
        success: true
      }
    };
  }

  private async shareSpreadsheet(params: any): Promise<GoogleSheetsResult> {
    const { spreadsheetId, shareType, email, role = 'reader' } = params;
    
    if (!spreadsheetId || !shareType) {
      throw new Error('Spreadsheet ID and share type are required');
    }

    let resource: any = { role, type: shareType };
    let responseMessage = "";
    
    switch (shareType) {
      case "user":
        if (!email) {
          throw new Error("Email is required when shareType is 'user'");
        }
        resource.emailAddress = email;
        responseMessage = `Spreadsheet shared successfully with ${email} as ${role}`;
        break;
        
      case "anyone":
        responseMessage = `Spreadsheet is now accessible to anyone with the link with ${role} permissions`;
        break;
        
      case "domain":
        responseMessage = `Spreadsheet shared with everyone in your organization as ${role}`;
        break;
    }
    
    const response = await this.drive!.permissions.create({
      fileId: spreadsheetId,
      requestBody: resource,
      fields: 'id,type,role,emailAddress'
    });
    
    const fileResponse = await this.drive!.files.get({
      fileId: spreadsheetId,
      fields: 'webViewLink'
    });

    return {
      type: 'sheets_action',
      content: responseMessage,
      metadata: {
        action: SheetsAction.ShareSpreadsheet,
        data: {
          spreadsheetId,
          permission: {
            id: response.data.id,
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

  private async deleteSpreadsheet(params: any): Promise<GoogleSheetsResult> {
    let spreadsheetId = params.spreadsheetId;
   
    if (!spreadsheetId && params.searchName) {
      const searchResult = await this.searchSpreadsheetByName(params.searchName, true);
      if (searchResult.length === 0) {
        throw new Error(`No spreadsheet found with name "${params.searchName}"`);
      }
      spreadsheetId = searchResult[0].id;
    }
    
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID or search name is required');
    }

    await this.drive!.files.delete({ fileId: spreadsheetId });

    return {
      type: 'sheets_action',
      content: 'Spreadsheet deleted successfully.',
      metadata: {
        action: SheetsAction.DeleteSpreadsheet,
        data: { spreadsheetId },
        success: true
      }
    };
  }

  private async searchSpreadsheetByName(name: string, exactMatch: boolean = false, limit: number = 20): Promise<any[]> {
    let query = "mimeType='application/vnd.google-apps.spreadsheet'";
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
    const logMessage = `[GoogleSheetsAgent:${this.userId}] ${new Date().toISOString()} ${message}`;
    if (data) {
      console.log(logMessage, typeof data === 'object' ? JSON.stringify(data, null, 2).substring(0, 500) : data);
    } else {
      console.log(logMessage);
    }
  }

  private handleError(error: any, operation: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GoogleSheetsAgent:${this.userId}] ERROR during ${operation}: ${errorMessage}`);
    if (error.response?.data?.error) {
      console.error(`[GoogleSheetsAgent:${this.userId}] API Error: ${JSON.stringify(error.response.data.error)}`);
    }
  }
}

const agentInstances: Map<string, GoogleSheetsAgent> = new Map();

const GSHEETS_CLIENT_ID = process.env.GDRIVE_CLIENT_ID || '';
const GSHEETS_CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET || '';
const GSHEETS_REDIRECT_URI = process.env.GDRIVE_REDIRECT_URI || 'http://localhost:5001/api/gsheets/oauth2callback';

export const getGoogleSheetsAgent = async (userId: string): Promise<GoogleSheetsAgent> => {
  if (!GSHEETS_CLIENT_ID || !GSHEETS_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured. Please set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET environment variables.');
  }
  
  if (!agentInstances.has(userId)) {
    agentInstances.set(
      userId, 
      new GoogleSheetsAgent(userId, GSHEETS_CLIENT_ID, GSHEETS_CLIENT_SECRET, GSHEETS_REDIRECT_URI)
    );
  }
  
  return agentInstances.get(userId)!;
};

export const initializeGSheetsAgent = async (userId: string): Promise<string | null> => {
  const agent = await getGoogleSheetsAgent(userId);
  return agent.initialize();
};

export const handleAuthCallback = async (userId: string, code: string): Promise<boolean> => {
  const agent = await getGoogleSheetsAgent(userId);
  return agent.handleAuthCode(code);
};

export const processGoogleSheetsRequest = async (
  message: string,
  modelId: string,
  userId: string
): Promise<GoogleSheetsResult> => {
  try {
    const agent = await getGoogleSheetsAgent(userId);
    const authUrl = await agent.initialize();

    if (authUrl) {
      return {
        type: 'authorization_required',
        content: 'To use Google Sheets features, you need to connect your Google account in the Plugins page.',
        metadata: {
          action: 'authorization_required',
          data: { 
            authUrl,
            message: 'Please connect your Google account from the Plugins page to use Google Sheets features.'
          },
          success: false
        }
      };
    }
    
    return await agent.processNaturalLanguageCommand(message, modelId);
  } catch (error) {
    console.error('Error processing Google Sheets message:', error);
    return {
      type: 'error',
      content: `Failed to process command: ${(error as Error).message}`,
      error: (error as Error).message
    };
  }
};

export const disconnectGoogleSheets = async (userId: string): Promise<boolean> => {
  try {
    const agent = agentInstances.get(userId);

    if (agent && agent['oauth2Client']) {
      try {
        const oauth2Client = agent['oauth2Client'];
        if (oauth2Client.credentials?.access_token) {
          await oauth2Client.revokeCredentials();
          console.log(`Revoked Google OAuth tokens for user: ${userId}`);
        }
      } catch (revokeError) {
        console.warn(`Failed to revoke Google tokens for user ${userId}:`, revokeError);
      }
    }

    userCredentialsStore.delete(userId);

    agentInstances.delete(userId);
    
    console.log(`Successfully disconnected Google Sheets for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('Error disconnecting Google Sheets:', error);
    return false;
  }
};