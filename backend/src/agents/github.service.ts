import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import fetch from 'node-fetch';
import * as aiModelService from '../services/ai-model.service';


export enum GithubAction {
  FetchOpenPullRequests = 'fetch_open_pull_requests', 
  ListAssignedIssues = 'list_assigned_issues', 
  ListOpenIssues = 'list_open_issues', 
  ListUserRepositories = 'list_user_repositories',
  GetOrgRepositories = 'get_org_repositories', 

  ListRepositoryIssues = 'list_repository_issues', // General issues listing
  ListRepositoryPullRequests = 'list_repository_pull_requests', // General PRs listing
  GetRepositoryContent = 'get_repository_content',
  GetIssueDetails = 'get_issue_details',
  GetPullRequestDetails = 'get_pull_request_details',

  WriteReadme = 'write_readme',
  CreateIssue = 'create_issue',

  // Existing AI-powered actions
  SummarizeRepository = 'summarize_repository',
  MapCodebase = 'map_codebase',
  AnalyzeDependencies = 'analyze_dependencies',

  // New Actions
  GenerateReadmeContent = 'generate_readme_content',
  IdentifyPRChanges = 'identify_pr_changes',
  ReviewPullRequestDescription = 'review_pull_request_description',
  DetectCodeIssues = 'detect_code_issues',
  SummarizeComments = 'summarize_comments',
  ClassifyIssue = 'classify_issue',
  SummarizeCiCdRuns = 'summarize_ci_cd_runs',
  IdentifyCiCdFailures = 'identify_ci_cd_failures',
  CheckContributionGuidelines = 'check_contribution_guidelines',
  SummarizeContributorActivity = 'summarize_contributor_activity',
  TrackMilestones = 'track_milestones',
  IdentifyStaleItems = 'identify_stale_items',
  MonitorRepoHealth = 'monitor_repo_health',
  TranslateDescription = 'translate_description',
  CheckSecurityAlerts = 'check_security_alerts',
  GetRepositoryMetadata = 'get_repository_metadata', // For stars, forks, etc.

  Unknown = 'unknown_action',
}

export interface GithubActionMetadata {
  action: string;
  data?: any;
  success: boolean;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  [key: string]: any;
}

export interface ParsedGithubCommand {
  action: GithubAction;
  parameters: any;
  confirmationRequired?: boolean;
  userInput?: string;
}

export interface GithubResult {
  type: string;
  content: string;
  metadata?: GithubActionMetadata;
  error?: string;
}

export interface UserCredentials {
  userId: string;
  accessToken: string;
  scope?: string;
  tokenType?: string;
}

// Define the simplified comment structure that fetchComments will return
export interface SimplifiedComment {
  user?: string | null; // GitHub API's user object can sometimes be null (e.g., deleted users)
  body?: string | null;
  created_at?: string;
  html_url?: string;
}

// Consider adding 'workflow' and 'security_events' if needed for full functionality
// 'security_events' is critical for CheckSecurityAlerts
// 'workflow' could be useful for more detailed CI/CD interactions
const SCOPES: string[] = ['repo', 'user:email', 'read:org', 'security_events', 'workflow'];

const userCredentialsStore: Map<string, UserCredentials> = new Map();
const userCommandHistory: Map<string, Array<{ command: ParsedGithubCommand; response: any; timestamp: Date }>> = new Map();
const MAX_HISTORY_SIZE = 10;

class GithubAgent {
  private octokit: Octokit | null = null;
  private initialized: boolean = false;
  private userId: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private userLogin: string | null = null;

  constructor(userId: string, clientId: string, clientSecret: string, redirectUri: string) {
    this.userId = userId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  public async initialize(): Promise<string | null> {
    if (this.initialized) return null;
    try {
      const userCreds = userCredentialsStore.get(this.userId);

      if (userCreds && userCreds.accessToken) {
        this.octokit = new Octokit({
          auth: userCreds.accessToken,
        });
        try {
          const userResponse = await this.octokit.rest.users.getAuthenticated();
          this.userLogin = userResponse.data.login;
          this.log(`Authenticated as GitHub user: ${this.userLogin}`);
        } catch (authError) {
          this.handleError(authError, 'Fetching authenticated user login');
          userCredentialsStore.delete(this.userId); // Invalidate token if it fails
          return this.getAuthUrl();
        }
        
        this.initialized = true;
        this.log('GitHub Agent initialized with existing token.');
        return null;
      } else {
        return this.getAuthUrl();
      }
    } catch (error) {
      this.handleError(error, 'Agent Initialization');
      throw new Error(`GitHub Agent initialization failed: ${(error as Error).message}`);
    }
  }

  private getAuthUrl(): string {
    const scopes = SCOPES.join(' ');
    return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${this.userId}`;
  }

  public async handleAuthCode(code: string): Promise<boolean> {
    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: code,
          redirect_uri: this.redirectUri,
        }),
      });

      const data = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string; scope?: string; token_type?: string; };

      if (data.error) {
        throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
      }

      const accessToken = data.access_token;
      const scope = data.scope;
      const tokenType = data.token_type;

      if (!accessToken) {
        throw new Error('No access token received from GitHub.');
      }

      this.saveUserCredentials({ accessToken, scope, tokenType });
      this.octokit = new Octokit({ auth: accessToken });
      
      const userResponse = await this.octokit.rest.users.getAuthenticated();
      this.userLogin = userResponse.data.login;

      this.initialized = true;
      this.log(`Authorization successful. GitHub token stored for user: ${this.userLogin}.`);
      return true;
    } catch (err) {
      this.handleError(err, 'Auth Code Handling');
      throw new Error(`Failed to process GitHub authorization: ${(err as Error).message}`);
    }
  }

  private saveUserCredentials(tokens: { accessToken: string; scope?: string; tokenType?: string }): void {
    userCredentialsStore.set(this.userId, {
      userId: this.userId,
      accessToken: tokens.accessToken,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
    });
  }

  private getUserCommandHistory(): Array<{ command: ParsedGithubCommand; response: any; timestamp: Date }> {
    if (!userCommandHistory.has(this.userId)) {
      userCommandHistory.set(this.userId, []);
    }
    return userCommandHistory.get(this.userId)!;
  }

  private addToCommandHistory(command: ParsedGithubCommand, response: any): void {
    const history = this.getUserCommandHistory();
    history.push({ command, response, timestamp: new Date() });
    
    if (history.length > MAX_HISTORY_SIZE) {
      history.shift();
    }
  }

  private constructNLPPrompt(userCommand: string): string {
    const today = new Date().toISOString().split('T')[0];
    let recentContext = "";
    
    const commandHistory = this.getUserCommandHistory();
    if (commandHistory.length > 0) {
      const lastRelevantOp = commandHistory.slice().reverse().find(op => 
        op.response.metadata?.owner && op.response.metadata?.repo
      );
      if (lastRelevantOp && lastRelevantOp.response.metadata) {
        const { owner, repo } = lastRelevantOp.response.metadata;
        if (owner && repo) {
          recentContext = `\nThe last operation was related to the repository "${owner}/${repo}". If the user refers to "this repo", "it", or "that project", they might mean "${owner}/${repo}".`;
        }
      }
    }

    const authenticatedUserContext = this.userLogin ? ` The current authenticated GitHub user is "${this.userLogin}". If the user says "my" or refers to their own repositories, issues, or pull requests, assume the owner is "${this.userLogin}".` : '';

    return `
You are an expert GitHub agent capable of understanding complex natural language commands and translating them into structured JSON actions for the GitHub API. Your capabilities include managing repositories, issues, and pull requests, generating content, performing code analysis, monitoring CI/CD, and checking security. You can fetch and summarize information, identify patterns, and assist with various development workflows.
Today's date is ${today}.${authenticatedUserContext}${recentContext}

The output JSON MUST have an "action" field (string) and a "parameters" field (object).
If the action modifies repository content (e.g., writing a README, creating an issue), ALWAYS include a "confirmationRequired": true field at the top level.

Possible actions and their typical parameters (which go INSIDE the "parameters" object):
- "${GithubAction.ListUserRepositories}": Lists repositories for the authenticated user. Optional: "type": "owner"|"member"|"all" (default "owner"), "sort": "updated"|"created"|"pushed"|"full_name", "direction": "asc"|"desc".
- "${GithubAction.GetOrgRepositories}": Lists repositories for a specific organization. Requires: "org" (string, the organization login).
- "${GithubAction.ListRepositoryIssues}": Lists issues in a repository. Requires: "owner", "repo". Optional: "state": "open" | "closed" | "all" (default "open"), "labels": string[] (comma-separated), "assignee": string (username). Use "me" for the authenticated user.
- "${GithubAction.ListOpenIssues}": A shortcut to list open issues. Requires: "owner", "repo".
- "${GithubAction.ListAssignedIssues}": Lists issues assigned to a specific user. Requires: "owner", "repo", "assignee" (string, username, or "me").
- "${GithubAction.ListRepositoryPullRequests}": Lists pull requests in a repository. Requires: "owner", "repo". Optional: "state": "open" | "closed" | "all" (default "open"), "head": "branch_name", "base": "branch_name".
- "${GithubAction.FetchOpenPullRequests}": A shortcut to list open pull requests. Requires: "owner", "repo".
- "${GithubAction.GetRepositoryContent}": Gets file content or directory listing. Requires: "owner", "repo", "path" (e.g., "README.md", "src/index.ts").
- "${GithubAction.GetIssueDetails}": Gets details for a specific issue. Requires: "owner", "repo", "issue_number" (number).
- "${GithubAction.GetPullRequestDetails}": Gets details for a specific pull request. Requires: "owner", "repo", "pull_number" (number).

- "${GithubAction.WriteReadme}": Creates or updates README.md. Requires: "owner", "repo", "content" (string). Optional: "message" (commit message, default "Update README via AI Agent"). ALWAYS requires confirmation.
- "${GithubAction.CreateIssue}": Creates a new issue. Requires: "owner", "repo", "title" (string). Optional: "body" (string). ALWAYS requires confirmation.

- "${GithubAction.SummarizeRepository}": Summarizes repository purpose and recent activity. Requires: "owner", "repo".
- "${GithubAction.MapCodebase}": Maps the codebase structure. Requires: "owner", "repo".
- "${GithubAction.AnalyzeDependencies}": Analyzes project dependencies. Requires: "owner", "repo".

- "${GithubAction.GenerateReadmeContent}": Generates or suggests README content based on project structure. Requires: "owner", "repo".
- "${GithubAction.IdentifyPRChanges}": Identifies changed files or modules in a pull request. Requires: "owner", "repo", "pull_number" (number).
- "${GithubAction.ReviewPullRequestDescription}": Reviews PR description and linked issues for completeness and clarity. Requires: "owner", "repo", "pull_number" (number).
- "${GithubAction.DetectCodeIssues}": Detects potential code issues in a PR (e.g., missing tests, docs). Requires: "owner", "repo", "pull_number" (number).
- "${GithubAction.SummarizeComments}": Fetches and summarizes comments and discussions on issues or pull requests. Requires: "owner", "repo", "type": "issue"|"pull_request", "number" (issue/PR number).
- "${GithubAction.ClassifyIssue}": Classifies or tags an issue based on its content (e.g., bug, feature request, enhancement). Requires: "owner", "repo", "issue_number" (number).
- "${GithubAction.SummarizeCiCdRuns}": Summarizes recent CI/CD pipeline runs and their results. Requires: "owner", "repo". Optional: "workflow_id" (string or number), "branch" (string).
- "${GithubAction.IdentifyCiCdFailures}": Identifies CI/CD failures and extracts related logs or error messages. Requires: "owner", "repo". Optional: "workflow_id" (string or number), "branch" (string), "run_id" (number).
- "${GithubAction.CheckContributionGuidelines}": Checks if repositories follow contribution guidelines and contain required files (e.g., README, LICENSE). Requires: "owner", "repo".
- "${GithubAction.SummarizeContributorActivity}": Summarizes recent contributor activity in a repository. Requires: "owner", "repo".
- "${GithubAction.TrackMilestones}": Tracks milestones, deadlines, and progress toward project goals. Requires: "owner", "repo". Optional: "state": "open" | "closed" | "all".
- "${GithubAction.IdentifyStaleItems}": Identifies stale issues or pull requests that need attention. Requires: "owner", "repo". Optional: "type": "issue"|"pull_request"|"both" (default "both"), "days_inactive" (number, default 30).
- "${GithubAction.MonitorRepoHealth}": Monitors and reports on repository health (open issues, unmerged PRs, build status). Requires: "owner", "repo".
- "${GithubAction.TranslateDescription}": Translates issue or pull request descriptions into different languages. Requires: "owner", "repo", "type": "issue"|"pull_request", "number" (issue/PR number), "target_language" (e.g., "Spanish", "French").
- "${GithubAction.CheckSecurityAlerts}": Checks for security alerts or known vulnerabilities in dependencies. Requires: "owner", "repo". (Note: Requires 'security_events' scope or admin access.)
- "${GithubAction.GetRepositoryMetadata}": Fetches metadata like stars, forks, latest commit, and contributor count for repositories. Requires: "owner", "repo".

- "${GithubAction.Unknown}": If the intent is unclear or not supported. "parameters": { "missing_info": "..." }.

General Rules:
- For actions requiring "owner" and "repo", if the user says "my repos", "my project", or refers to their own content, use the authenticated user's login ("${this.userLogin}") for "owner". If a repo name is given without an explicit owner, try to infer the owner from the current authenticated user or the recent context. If still ambiguous, ask for clarification.
- CRITICAL: Only ONE primary action per command. If multiple operations are implied, select the most primary or first logical action.
- When generating content for AI, be mindful of token limits. Summarize or truncate large bodies of text/code before sending to the AI model.

Examples:
- User: "List my repositories."
  JSON: { "action": "${GithubAction.ListUserRepositories}", "parameters": {} }
- User: "Show open issues in octokit/rest.js."
  JSON: { "action": "${GithubAction.ListOpenIssues}", "parameters": { "owner": "octokit", "repo": "rest.js" } }
- User: "What are the latest pull requests for my-org/my-project?"
  JSON: { "action": "${GithubAction.FetchOpenPullRequests}", "parameters": { "owner": "my-org", "repo": "my-project" } }
- User: "Summarize the repository user/awesome-project."
  JSON: { "action": "${GithubAction.SummarizeRepository}", "parameters": { "owner": "user", "repo": "awesome-project" } }
- User: "Write a new README for my_username/my_repo, saying 'This is a great project!'"
  JSON: { "action": "${GithubAction.WriteReadme}", "parameters": { "owner": "my_username", "repo": "my_repo", "content": "This is a great project!", "message": "Updated README via AI Agent" }, "confirmationRequired": true }
- User: "Create an issue in my_username/my_repo titled 'Bug: Login failed' with body 'Users cannot log in after recent deploy.'"
  JSON: { "action": "${GithubAction.CreateIssue}", "parameters": { "owner": "my_username", "repo": "my_repo", "title": "Bug: Login failed", "body": "Users cannot log in after recent deploy." }, "confirmationRequired": true }
- User: "Can you map the codebase structure for cli/cli?"
  JSON: { "action": "${GithubAction.MapCodebase}", "parameters": { "owner": "cli", "repo": "cli" } }
- User: "List assigned issues for me in my-org/my-project."
  JSON: { "action": "${GithubAction.ListAssignedIssues}", "parameters": { "owner": "my-org", "repo": "my-project", "assignee": "me" } }
- User: "What files changed in PR #123 of owner/repo?"
  JSON: { "action": "${GithubAction.IdentifyPRChanges}", "parameters": { "owner": "owner", "repo": "repo", "pull_number": 123 } }
- User: "Summarize recent CI runs for owner/repo on main branch."
  JSON: { "action": "${GithubAction.SummarizeCiCdRuns}", "parameters": { "owner": "owner", "repo": "repo", "branch": "main" } }
- User: "Check security alerts for my-username/my-app."
  JSON: { "action": "${GithubAction.CheckSecurityAlerts}", "parameters": { "owner": "my-username", "repo": "my-app" } }
- User: "Translate issue 456 in owner/repo to Spanish."
  JSON: { "action": "${GithubAction.TranslateDescription}", "parameters": { "owner": "owner", "repo": "repo", "type": "issue", "number": 456, "target_language": "Spanish" } }

User Command: "${userCommand}"

Output JSON (ONLY the JSON object, no other text or markdown formatting like \`\`\`json):
`;
  }

  public async processNaturalLanguageCommand(command: string, modelId: string): Promise<GithubResult> {
    if (!this.initialized || !this.octokit) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Authorization required.', 
        error: 'Not authorized'
      };
    }
    this.log(`Processing natural language command: "${command}"`);

    const prompt = this.constructNLPPrompt(command);
    let parsedCommand: ParsedGithubCommand;

    try {
      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        prompt,
        "You are an expert GitHub agent capable of understanding complex natural language commands and translating them into structured JSON actions for the GitHub API. Your capabilities include managing repositories, issues, and pull requests, generating content, performing code analysis, monitoring CI/CD, and checking security. You can fetch and summarize information, identify patterns, and assist with various development workflows."
      );
      
      const text = aiResponse.content;
      this.log(`AI response text: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
      
      const cleanedJsonString = text.replace(/```json\n?|\n?```/g, '').trim();
      parsedCommand = JSON.parse(cleanedJsonString) as ParsedGithubCommand;
      parsedCommand.userInput = command;

      // Handle "me" for assignee
      if (parsedCommand.action === GithubAction.ListRepositoryIssues && parsedCommand.parameters.assignee === 'me') {
        parsedCommand.parameters.assignee = this.userLogin;
      }
      if (parsedCommand.action === GithubAction.ListAssignedIssues && parsedCommand.parameters.assignee === 'me') {
        parsedCommand.parameters.assignee = this.userLogin;
      }
    } catch (error) {
      this.handleError(error, 'AI Parsing Natural Language Command');
      return { 
        type: 'error', 
        content: `Error parsing command: ${(error as Error).message}`, 
        error: (error as Error).message
      };
    }
    
    this.log(`Parsed command: ${JSON.stringify(parsedCommand)}`);
    return this.executeParsedCommand(parsedCommand, false, modelId);
  }

  private getActionsRequiringDetailedConfirmation(): GithubAction[] {
    return [
      GithubAction.WriteReadme,
      GithubAction.CreateIssue,
    ];
  }

  private isModifyingAction(action: GithubAction): boolean {
    return [
      GithubAction.WriteReadme,
      GithubAction.CreateIssue,
    ].includes(action);
  }

  public async executeParsedCommand(parsedCommand: ParsedGithubCommand, confirmed: boolean = false, modelId: string): Promise<GithubResult> {
    if (!this.initialized || !this.octokit) {
      return { 
        type: 'error', 
        content: 'Agent not initialized. Authorization required.', 
        error: 'Not authorized'
      };
    }

    const needsDetailedConfirmation = this.getActionsRequiringDetailedConfirmation().includes(parsedCommand.action) || parsedCommand.confirmationRequired;

    if (needsDetailedConfirmation && !confirmed) {
      const promptMessage = `You are about to perform action: ${parsedCommand.action.replace(/_/g, ' ')}. Parameters: ${JSON.stringify(parsedCommand.parameters)}. Do you confirm?`;
      
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
    
    let result: GithubResult;
    
    try {
      const { owner, repo, issue_number, pull_number, path, content, message, title, body, state, labels, assignee, org, type, number, target_language, days_inactive, workflow_id, branch, run_id } = parsedCommand.parameters;

      let actualOwner = owner;
      let actualRepo = repo;

      if (this.userLogin && !actualOwner && actualRepo && parsedCommand.action !== GithubAction.ListUserRepositories && parsedCommand.action !== GithubAction.GetOrgRepositories) {
          actualOwner = this.userLogin;
          this.log(`Inferred owner as authenticated user: ${actualOwner}`);
      }
      
      if (!actualOwner && !actualRepo && ![GithubAction.ListUserRepositories, GithubAction.GetOrgRepositories, GithubAction.ListAssignedIssues].includes(parsedCommand.action)) {
          return {
              type: 'error',
              content: 'Owner and repository name are required for this action. Please specify them (e.g., "owner/repo").',
              error: 'Missing owner/repo information',
              metadata: {
                  action: parsedCommand.action,
                  success: false,
                  parsedCommand
              }
          };
      }

      switch (parsedCommand.action) {
        case GithubAction.ListUserRepositories:
          result = await this.listUserRepositories(parsedCommand.parameters);
          break;
        case GithubAction.GetOrgRepositories:
          result = await this.listOrgRepositories(org);
          break;
        case GithubAction.ListRepositoryIssues:
        case GithubAction.ListOpenIssues: // Redirect to general issue listing with state 'open'
          result = await this.listRepoIssues(actualOwner, actualRepo, state || 'open', labels, assignee);
          break;
        case GithubAction.ListAssignedIssues: // Redirect to general issue listing with assignee
          result = await this.listRepoIssues(actualOwner, actualRepo, state || 'open', labels, assignee || this.userLogin);
          break;
        case GithubAction.ListRepositoryPullRequests:
        case GithubAction.FetchOpenPullRequests: // Redirect to general PR listing with state 'open'
          result = await this.listRepoPullRequests(actualOwner, actualRepo, state || 'open', parsedCommand.parameters.head, parsedCommand.parameters.base);
          break;
        case GithubAction.GetRepositoryContent:
          result = await this.getRepositoryContent(actualOwner, actualRepo, path);
          break;
        case GithubAction.GetIssueDetails:
          result = await this.getIssueDetails(actualOwner, actualRepo, issue_number);
          break;
        case GithubAction.GetPullRequestDetails:
          result = await this.getPullRequestDetails(actualOwner, actualRepo, pull_number);
          break;
        case GithubAction.WriteReadme:
          result = await this.writeReadme(actualOwner, actualRepo, content, message);
          break;
        case GithubAction.CreateIssue:
          result = await this.createIssue(actualOwner, actualRepo, title, body);
          break;
        case GithubAction.SummarizeRepository:
          result = await this.summarizeRepository(actualOwner, actualRepo, modelId);
          break;
        case GithubAction.MapCodebase:
          result = await this.mapCodebase(actualOwner, actualRepo, modelId);
          break;
        case GithubAction.AnalyzeDependencies:
          result = await this.analyzeDependencies(actualOwner, actualRepo, modelId);
          break;
        case GithubAction.GenerateReadmeContent:
          result = await this.generateReadmeContent(actualOwner, actualRepo, modelId);
          break;
        case GithubAction.IdentifyPRChanges:
          result = await this.identifyPRChanges(actualOwner, actualRepo, pull_number);
          break;
        case GithubAction.ReviewPullRequestDescription:
          result = await this.reviewPullRequestDescription(actualOwner, actualRepo, pull_number, modelId);
          break;
        case GithubAction.DetectCodeIssues:
          result = await this.detectCodeIssues(actualOwner, actualRepo, pull_number, modelId);
          break;
        case GithubAction.SummarizeComments:
          result = await this.summarizeComments(actualOwner, actualRepo, type, number, modelId);
          break;
        case GithubAction.ClassifyIssue:
          result = await this.classifyIssue(actualOwner, actualRepo, issue_number, modelId);
          break;
        case GithubAction.SummarizeCiCdRuns:
          result = await this.summarizeCiCdRuns(actualOwner, actualRepo, modelId, workflow_id, branch);
          break;
        case GithubAction.IdentifyCiCdFailures:
          result = await this.identifyCiCdFailures(actualOwner, actualRepo, modelId, workflow_id, branch, run_id);
          break;
        case GithubAction.CheckContributionGuidelines:
          result = await this.checkContributionGuidelines(actualOwner, actualRepo, modelId);
          break;
        case GithubAction.SummarizeContributorActivity:
          result = await this.summarizeContributorActivity(actualOwner, actualRepo, modelId);
          break;
        case GithubAction.TrackMilestones:
          result = await this.trackMilestones(actualOwner, actualRepo, modelId, state);
          break;
        case GithubAction.IdentifyStaleItems:
          result = await this.identifyStaleItems(actualOwner, actualRepo, modelId, type, days_inactive);
          break;
        case GithubAction.MonitorRepoHealth:
          result = await this.monitorRepoHealth(actualOwner, actualRepo, modelId);
          break;
        case GithubAction.TranslateDescription:
          result = await this.translateDescription(actualOwner, actualRepo, type, number, target_language, modelId);
          break;
        case GithubAction.CheckSecurityAlerts:
          result = await this.checkSecurityAlerts(actualOwner, actualRepo);
          break;
        case GithubAction.GetRepositoryMetadata:
          result = await this.getRepositoryMetadata(actualOwner, actualRepo);
          break;
        default:
          result = {
            type: 'error',
            content: `Action "${parsedCommand.action}" is not implemented in this version or recognized.`,
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

  // --- Core GitHub API Wrapper Methods ---

  private async listUserRepositories(params: any): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.ListUserRepositories, success: false } };
    try {
      const res = await this.octokit.rest.repos.listForAuthenticatedUser({
        type: params.type || 'owner', 
        sort: params.sort || 'updated',
        direction: params.direction || 'desc',
        per_page: 50,
      });
      const repos = res.data.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        private: repo.private,
        fork: repo.fork,
        owner: repo.owner.login,
        default_branch: repo.default_branch,
      }));

      let contentString = `Found ${repos.length} repositories for your account.`;
      if (repos.length > 0) {
        contentString += "\n\nHere are some details:";
        const reposToList = repos.slice(0, 10);
        reposToList.forEach(repo => {
          contentString += `\n- **${repo.name}** (${repo.full_name})`;
          if (repo.description) {
            contentString += `: ${repo.description}`;
          }
          contentString += ` [Link](${repo.html_url})`;
        });
        if (repos.length > reposToList.length) {
          contentString += `\n...and ${repos.length - reposToList.length} more.`;
        }
      }

      return {
        type: 'github_action',
        content: contentString,
        metadata: { action: GithubAction.ListUserRepositories, data: repos, success: true }
      };
    } catch (error) {
      this.handleError(error, 'ListUserRepositories');
      return { type: 'error', content: `Failed to list repositories: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.ListUserRepositories, success: false } };
    }
  }

  private async listOrgRepositories(org: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.GetOrgRepositories, success: false } };
    try {
      const res = await this.octokit.rest.repos.listForOrg({
        org,
        per_page: 50,
      });
      const repos = res.data.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        private: repo.private,
        fork: repo.fork,
        owner: repo.owner.login,
        default_branch: repo.default_branch,
      }));

      let contentString = `Found ${repos.length} repositories for organization "${org}".`;
      if (repos.length > 0) {
        contentString += "\n\nHere are some details:";
        const reposToList = repos.slice(0, 10);
        reposToList.forEach(repo => {
          contentString += `\n- **${repo.name}** (${repo.full_name})`;
          if (repo.description) {
            contentString += `: ${repo.description}`;
          }
          contentString += ` [Link](${repo.html_url})`;
        });
        if (repos.length > reposToList.length) {
          contentString += `\n...and ${repos.length - reposToList.length} more.`;
        }
      }

      return {
        type: 'github_action',
        content: contentString,
        metadata: { action: GithubAction.GetOrgRepositories, data: repos, success: true, org }
      };
    } catch (error) {
      this.handleError(error, `ListOrgRepositories for ${org}`);
      return { type: 'error', content: `Failed to list repositories for organization ${org}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.GetOrgRepositories, success: false } };
    }
  }

  private async listRepoIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', labels?: string[], assignee?: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.ListRepositoryIssues, success: false } };
    try {
      const res = await this.octokit.rest.issues.listForRepo({
        owner,
        repo,
        state,
        labels: labels ? labels.join(',') : undefined,
        assignee: assignee === 'none' ? 'none' : assignee || undefined, // "none" for unassigned
        per_page: 50,
      });
      const issues = res.data.map(issue => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        creator: issue.user?.login,
        assignees: issue.assignees?.map(a => a.login),
        labels: issue.labels?.map(l => typeof l === 'string' ? l : l.name),
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        html_url: issue.html_url,
      }));

      let contentString = `Found ${issues.length} ${state} issues in ${owner}/${repo}.`;
      if (assignee && assignee !== 'none') contentString += ` (assigned to ${assignee})`;
      else if (assignee === 'none') contentString += ` (unassigned)`;

      if (issues.length > 0) {
        contentString += "\n\nHere are some details:";
        const issuesToList = issues.slice(0, 5);
        issuesToList.forEach(issue => {
          contentString += `\n- **#${issue.number}: ${issue.title}** (State: ${issue.state}, Created by: ${issue.creator})`;
          if (issue.assignees && issue.assignees.length > 0) {
            contentString += `, Assigned to: ${issue.assignees.join(', ')}`;
          }
          if (issue.body) {
            const bodyPreview = issue.body.length > 150 ? issue.body.substring(0, 150) + '...' : issue.body;
            contentString += `\n  Description: "${bodyPreview.replace(/\n/g, ' ')}"`;
          }
          contentString += ` [Link](${issue.html_url})`;
        });
        if (issues.length > issuesToList.length) {
          contentString += `\n...and ${issues.length - issuesToList.length} more.`;
        }
      }

      return {
        type: 'github_action',
        content: contentString,
        metadata: { action: GithubAction.ListRepositoryIssues, data: issues, success: true, owner, repo } 
      };
    } catch (error) {
      this.handleError(error, 'ListRepositoryIssues');
      return { type: 'error', content: `Failed to list issues for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.ListRepositoryIssues, success: false } };
    }
  }

  private async listRepoPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', head?: string, base?: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.ListRepositoryPullRequests, success: false } };
    try {
      const res = await this.octokit.rest.pulls.list({
        owner,
        repo,
        state,
        head,
        base,
        per_page: 50,
      });
      const prs = res.data.map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        creator: pr.user?.login,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        html_url: pr.html_url,
      }));

      let contentString = `Found ${prs.length} ${state} pull requests in ${owner}/${repo}.`;
      if (prs.length > 0) {
        contentString += "\n\nHere are some details:";
        const prsToList = prs.slice(0, 5);
        prsToList.forEach(pr => {
          contentString += `\n- **#${pr.number}: ${pr.title}** (State: ${pr.state}, Created by: ${pr.creator})`;
          if (pr.body) {
            const bodyPreview = pr.body.length > 150 ? pr.body.substring(0, 150) + '...' : pr.body;
            contentString += `\n  Description: "${bodyPreview.replace(/\n/g, ' ')}"`;
          }
          contentString += ` [Link](${pr.html_url})`;
        });
        if (prs.length > prsToList.length) {
          contentString += `\n...and ${prs.length - prsToList.length} more.`;
        }
      }

      return {
        type: 'github_action',
        content: contentString,
        metadata: { action: GithubAction.ListRepositoryPullRequests, data: prs, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, 'ListRepositoryPullRequests');
      return { type: 'error', content: `Failed to list pull requests for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.ListRepositoryPullRequests, success: false } };
    }
  }

  private async getRepositoryContent(owner: string, repo: string, path: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.GetRepositoryContent, success: false } };
    try {
      const res = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(res.data)) {
        return {
          type: 'github_action',
          content: `Directory contents for ${path} in ${owner}/${repo}.`,
          metadata: { action: GithubAction.GetRepositoryContent, data: res.data.map(item => ({ name: item.name, type: item.type, path: item.path, size: (item as any).size })), success: true, owner, repo, path }
        };
      } else if (res.data && 'content' in res.data && res.data.content) {
        const fileContent = Buffer.from(res.data.content, res.data.encoding as BufferEncoding).toString('utf8');
        return {
          type: 'github_action',
          content: `Content of ${path} in ${owner}/${repo} retrieved successfully.`,
          metadata: { action: GithubAction.GetRepositoryContent, data: { name: res.data.name, path: res.data.path, size: res.data.size, content: fileContent }, success: true, owner, repo, path }
        };
      } else {
         return {
          type: 'error',
          content: `Could not retrieve content for ${path} in ${owner}/${repo}. Item is neither a file nor a directory with retrievable content.`,
          error: 'Unsupported content type or empty content',
          metadata: { action: GithubAction.GetRepositoryContent, success: false }
        };
      }
    } catch (error: any) {
      this.handleError(error, `GetRepositoryContent for ${path}`);
      if (error.status === 404) {
        return { type: 'error', content: `Path "${path}" not found in ${owner}/${repo}.`, error: 'Not Found', metadata: { action: GithubAction.GetRepositoryContent, success: false } };
      }
      return { type: 'error', content: `Failed to get content for ${path} in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.GetRepositoryContent, success: false } };
    }
  }

  private async getIssueDetails(owner: string, repo: string, issue_number: number): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.GetIssueDetails, success: false } };
    try {
      const res = await this.octokit.rest.issues.get({ owner, repo, issue_number });
      const issue = res.data;
      return {
        type: 'github_action',
        content: `Details for issue #${issue_number} in ${owner}/${repo}.`,
        metadata: { action: GithubAction.GetIssueDetails, data: {
          number: issue.number, title: issue.title, body: issue.body, state: issue.state,
          user: issue.user?.login, created_at: issue.created_at, updated_at: issue.updated_at,
          html_url: issue.html_url, comments_count: issue.comments,
          labels: issue.labels?.map(l => typeof l === 'string' ? l : l.name),
          assignees: issue.assignees?.map(a => a.login),
        }, success: true, owner, repo, issue_number }
      };
    } catch (error) {
      this.handleError(error, `GetIssueDetails for ${issue_number}`);
      return { type: 'error', content: `Failed to get issue #${issue_number} for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.GetIssueDetails, success: false } };
    }
  }

  private async getPullRequestDetails(owner: string, repo: string, pull_number: number): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.GetPullRequestDetails, success: false } };
    try {
      const res = await this.octokit.rest.pulls.get({ owner, repo, pull_number });
      const pr = res.data;
      return {
        type: 'github_action',
        content: `Details for pull request #${pull_number} in ${owner}/${repo}.`,
        metadata: { action: GithubAction.GetPullRequestDetails, data: {
          number: pr.number, title: pr.title, body: pr.body, state: pr.state,
          user: pr.user?.login, created_at: pr.created_at, updated_at: pr.updated_at,
          html_url: pr.html_url, additions: pr.additions, deletions: pr.deletions,
          merge_commit_sha: pr.merge_commit_sha, changed_files: pr.changed_files,
          head_branch: pr.head.ref, base_branch: pr.base.ref,
        }, success: true, owner, repo, pull_number }
      };
    } catch (error) {
      this.handleError(error, `GetPullRequestDetails for ${pull_number}`);
      return { type: 'error', content: `Failed to get pull request #${pull_number} for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.GetPullRequestDetails, success: false } };
    }
  }

  private async writeReadme(owner: string, repo: string, content: string, message?: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.WriteReadme, success: false } };
    const path = 'README.md';
    const commitMessage = message || 'Updated README via AI Agent';

    try {
      let sha: string | undefined;
      try {
        const { data: fileData } = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path,
        }) as { data: { sha: string } };
        sha = fileData.sha;
        this.log(`Found existing README.md SHA: ${sha}`);
      } catch (error: any) {
        if (error.status === 404) {
          this.log(`README.md does not exist in ${owner}/${repo}. Will create it.`);
          sha = undefined;
        } else {
          throw error;
        }
      }

      const res = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        sha,
      });

      return {
        type: 'github_action',
        content: `Successfully ${sha ? 'updated' : 'created'} README.md in ${owner}/${repo}.`,
        metadata: { action: GithubAction.WriteReadme, data: res.data.content, success: true, owner, repo, path: path, commit: res.data.commit }
      };
    } catch (error) {
      this.handleError(error, `WriteReadme for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to write README.md for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.WriteReadme, success: false } };
    }
  }

  private async createIssue(owner: string, repo: string, title: string, body?: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.CreateIssue, success: false } };
    try {
      const res = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
      });

      return {
        type: 'github_action',
        content: `Successfully created issue #${res.data.number}: "${res.data.title}" in ${owner}/${repo}.`,
        metadata: { action: GithubAction.CreateIssue, data: res.data, success: true, owner, repo, issue_number: res.data.number }
      };
    } catch (error) {
      this.handleError(error, `CreateIssue for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to create issue in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.CreateIssue, success: false } };
    }
  }

  // --- AI-powered and New Action Implementations ---

  private async fetchRepoTree(owner: string, repo: string, branch: string = 'main', maxFiles: number = 200): Promise<{ path: string; content?: string }[]> {
    const files: { path: string; content?: string }[] = [];
    try {
      // Try to get default branch
      try {
        const repoDetails = await this.octokit!.rest.repos.get({ owner, repo });
        branch = repoDetails.data.default_branch;
      } catch (branchError) {
        this.log(`Could not determine default branch for ${owner}/${repo}. Using '${branch}' as fallback.`, branchError);
      }

      const { data: { commit: { sha: treeSha } } } = await this.octokit!.rest.repos.getBranch({
        owner,
        repo,
        branch,
      });

      const { data: treeData } = await this.octokit!.rest.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: 'true',
      });

      const fileBlobsToFetch: { path: string; sha: string }[] = [];
      const MAX_FILE_SIZE_TO_FETCH_KB = 250; // Limit file size for content fetching

      for (const item of treeData.tree) {
        if (item.type === 'blob' && item.path) {
          if (item.path.startsWith('.git/') || item.path.includes('node_modules/') || item.path.includes('dist/') || item.path.includes('.yarn/') || item.path.includes('.svelte-kit/') || item.path.includes('.next/')) {
            continue; // Skip common build/dependency folders
          }
          if (item.size && item.size > MAX_FILE_SIZE_TO_FETCH_KB * 1024) {
              this.log(`Skipping large file content: ${item.path} (${(item.size / 1024).toFixed(2)} KB)`);
              files.push({ path: item.path }); // Add path without content
              continue;
          }

          if (fileBlobsToFetch.length >= maxFiles) {
            this.log(`Reached maxFiles limit (${maxFiles}). Stopping content fetching for ${owner}/${repo}.`);
            files.push({ path: item.path });
            continue;
          }

          fileBlobsToFetch.push({ path: item.path, sha: item.sha! });
          
        } else if (item.type === 'tree' && item.path) {
            files.push({ path: item.path + '/' });
        }
      }

      const fetchedContents = await Promise.all(
        fileBlobsToFetch.map(async (blob) => {
          try {
            const { data: blobData } = await this.octokit!.rest.git.getBlob({
              owner,
              repo,
              file_sha: blob.sha,
            });
            return {
              path: blob.path,
              content: Buffer.from(blobData.content, blobData.encoding as BufferEncoding).toString('utf8'),
            };
          } catch (blobError) {
            this.handleError(blobError, `Fetching blob content for ${blob.path}`);
            return { path: blob.path, content: `Error fetching content: ${blobError instanceof Error ? blobError.message : String(blobError)}` };
          }
        })
      );
      files.push(...fetchedContents);

    } catch (error) {
      this.handleError(error, `Fetching repository tree for ${owner}/${repo}`);
      return [];
    }
    return files;
  }

  private async summarizeRepository(owner: string, repo: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.SummarizeRepository, success: false } };

    try {
      const repoDetailsRes = await this.octokit.rest.repos.get({ owner, repo });
      const repoDetails = repoDetailsRes.data;

      let readmeContent = 'No README.md found.';
      try {
        const readmeRes = await this.getRepositoryContent(owner, repo, 'README.md');
        if (readmeRes.metadata?.success && readmeRes.metadata?.data?.content) {
          readmeContent = readmeRes.metadata.data.content;
        }
      } catch (e: any) { /* ignore if no README */ }

      const { data: commits } = await this.octokit.rest.repos.listCommits({ owner, repo, per_page: 5 });
      const recentCommits = commits.map(c => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message,
        author: c.commit.author?.name,
        date: c.commit.author?.date,
      }));

      const { data: issues } = await this.octokit.rest.issues.listForRepo({ owner, repo, state: 'open', per_page: 3 });
      const recentIssues = issues.map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        user: i.user?.login,
      }));

      const { data: pulls } = await this.octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 3 });
      const recentPulls = pulls.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        user: pr.user?.login,
      }));

      const context = `
Repository Name: ${repoDetails.full_name}
Description: ${repoDetails.description || 'N/A'}
Primary Language: ${repoDetails.language || 'N/A'}
Stars: ${repoDetails.stargazers_count}
Forks: ${repoDetails.forks_count}
Last Updated: ${repoDetails.updated_at}
Default Branch: ${repoDetails.default_branch}
Is Private: ${repoDetails.private ? 'Yes' : 'No'}

--- README.md Content (truncated) ---
${readmeContent.substring(0, 2000)} ${readmeContent.length > 2000 ? '...' : ''}

--- Recent Commits ---
${recentCommits.map(c => `SHA: ${c.sha}, Author: ${c.author}, Date: ${c.date}\nMessage: ${c.message.substring(0, 100)}...`).join('\n\n')}

--- Recent Open Issues ---
${recentIssues.length > 0 ? recentIssues.map(i => `Issue #${i.number}: ${i.title} (${i.state}) by ${i.user}`).join('\n') : 'None'}

--- Recent Open Pull Requests ---
${recentPulls.length > 0 ? recentPulls.map(pr => `PR #${pr.number}: ${pr.title} (${pr.state}) by ${pr.user}`).join('\n') : 'None'}

Based on the above information, provide a concise summary of the GitHub repository. Focus on its purpose, primary technologies, recent activity, and overall health/status.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant that summarizes GitHub repositories. Provide a concise summary based on the provided data."
      );

      return {
        type: 'github_action',
        content: `Repository summary for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.SummarizeRepository, data: { summary: aiResponse.content, owner, repo }, success: true, owner, repo }
      };

    } catch (error) {
      this.handleError(error, `SummarizeRepository for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to summarize repository ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.SummarizeRepository, success: false } };
    }
  }

  private async mapCodebase(owner: string, repo: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.MapCodebase, success: false } };

    try {
      const files = await this.fetchRepoTree(owner, repo);

      if (files.length === 0) {
        return {
          type: 'github_action',
          content: `No files found in ${owner}/${repo} to map the codebase.`,
          metadata: { action: GithubAction.MapCodebase, data: { files: [] }, success: true, owner, repo }
        };
      }

      const fileStructure = files.map(f => f.path).join('\n');
      const sampleContents = files
          .filter(f => f.content && !f.path.includes('node_modules') && !f.path.includes('dist') && !f.path.includes('vendor/') && !f.path.includes('build/'))
          .slice(0, 15) // Limit to 15 files
          .map(f => `--- File: ${f.path} ---\n${f.content?.substring(0, 750)}...`) // Truncate content
          .join('\n\n');

      const context = `
Repository: ${owner}/${repo}

File Structure (paths only - directories end with /):
\`\`\`
${fileStructure}
\`\`\`

Sample File Contents (first 750 chars of up to 15 relevant files):
${sampleContents}

Based on the file structure and provided sample file contents, provide a high-level mapping of the codebase. Describe its main components, typical directory layout (e.g., 'src', 'public', 'tests'), and how different parts might interact. Identify the primary programming languages, frameworks, and build systems if evident.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant that maps codebase structures. Analyze the provided file list and sample content to describe the architecture and technology stack."
      );

      return {
        type: 'github_action',
        content: `Codebase mapping for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.MapCodebase, data: { mapping: aiResponse.content, owner, repo }, success: true, owner, repo }
      };

    } catch (error) {
      this.handleError(error, `MapCodebase for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to map codebase for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.MapCodebase, success: false } };
    }
  }

  private async analyzeDependencies(owner: string, repo: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.AnalyzeDependencies, success: false } };

    try {
      const dependencyFiles: { path: string; content: string }[] = [];
      const commonDependencyFilePaths = [
        'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
        'requirements.txt', 'Pipfile', 'Pipfile.lock', 'pyproject.toml',
        'pom.xml', 'build.gradle',
        'Gemfile', 'Gemfile.lock',
        'go.mod', 'go.sum',
        'Cargo.toml', 'Cargo.lock',
        'composer.json', 'composer.lock',
      ];

      for (const filePath of commonDependencyFilePaths) {
        try {
          const res = await this.getRepositoryContent(owner, repo, filePath);
          if (res.metadata?.success && res.metadata?.data?.content) {
            dependencyFiles.push({ path: filePath, content: res.metadata.data.content });
          }
        } catch (e: any) {
          if (e.error !== 'Not Found') {
            this.handleError(e, `Fetching dependency file ${filePath}`);
          }
        }
      }

      if (dependencyFiles.length === 0) {
        return {
          type: 'github_action',
          content: `No common dependency files (e.g., package.json, requirements.txt, pom.xml) found in ${owner}/${repo} to analyze dependencies.`,
          metadata: { action: GithubAction.AnalyzeDependencies, data: { dependencies: [] }, success: true, owner, repo }
        };
      }

      const dependencyContext = dependencyFiles.map(file => `--- File: ${file.path} ---\n\`\`\`json\n${file.content}\n\`\`\``).join('\n\n');

      const context = `
Repository: ${owner}/${repo}

Dependency Files Content:
${dependencyContext}

Based on the content of these dependency files, analyze the project's dependencies.
Identify the main package manager(s) used, list key direct dependencies, and highlight any potential areas of interest such as:
- Primary frameworks or libraries
- Outdated versions (if version ranges allow or specific versions are very old)
- Large number of dependencies
- Security vulnerabilities (if any common patterns are detectable or implied)
- Build tools used
Provide a structured summary.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant that analyzes project dependencies. Review the provided dependency files and extract key insights about technologies, versions, and potential issues."
      );

      return {
        type: 'github_action',
        content: `Dependency analysis for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.AnalyzeDependencies, data: { analysis: aiResponse.content, owner, repo }, success: true, owner, repo }
      };

    } catch (error) {
      this.handleError(error, `AnalyzeDependencies for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to analyze dependencies for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.AnalyzeDependencies, success: false } };
    }
  }

  private async generateReadmeContent(owner: string, repo: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.GenerateReadmeContent, success: false } };

    try {
      const files = await this.fetchRepoTree(owner, repo, 'main', 50); // Fetch up to 50 files for README generation context

      if (files.length === 0) {
        return {
          type: 'github_action',
          content: `No files found in ${owner}/${repo} to generate README content.`,
          metadata: { action: GithubAction.GenerateReadmeContent, success: true, owner, repo }
        };
      }

      const filePaths = files.map(f => f.path);
      const relevantContents = files
          .filter(f => f.content && !f.path.includes('test') && !f.path.includes('spec') && !f.path.includes('example')) // Filter out test files
          .slice(0, 10) // Limit to 10 relevant files
          .map(f => `--- File: ${f.path} ---\n${f.content?.substring(0, 500)}...`) // Truncate content
          .join('\n\n');
      
      const repoDetails = await this.octokit.rest.repos.get({ owner, repo });

      const context = `
Repository: ${owner}/${repo}
Description: ${repoDetails.data.description || 'Not provided'}
Languages: ${repoDetails.data.language || 'Not detected'}

File Structure (paths only):
\`\`\`
${filePaths.join('\n')}
\`\`\`

Sample Relevant File Contents:
${relevantContents}

Based on the repository's description, detected languages, file structure, and sample code, generate a comprehensive README.md content. Include sections like:
- Project Title and Overview
- Features
- Technologies Used
- Installation Guide
- Usage Examples
- Contributing Guidelines (suggest what should be included)
- License (suggest a placeholder if not found)
- Credits (suggest a placeholder)
The output should be markdown directly usable as a README.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant for generating README.md content. Based on the provided project context, generate a detailed and professional README in Markdown format."
      );

      return {
        type: 'github_action',
        content: `Suggested README content for ${owner}/${repo}:\n\n\`\`\`markdown\n${aiResponse.content}\n\`\`\``,
        metadata: { action: GithubAction.GenerateReadmeContent, data: { readme_content: aiResponse.content }, success: true, owner, repo }
      };

    } catch (error) {
      this.handleError(error, `GenerateReadmeContent for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to generate README content for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.GenerateReadmeContent, success: false } };
    }
  }

  private async identifyPRChanges(owner: string, repo: string, pull_number: number): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.IdentifyPRChanges, success: false } };
    try {
      const { data: files } = await this.octokit.rest.pulls.listFiles({ owner, repo, pull_number, per_page: 100 });
      if (files.length === 0) {
        return {
          type: 'github_action',
          content: `No files found changed in pull request #${pull_number} in ${owner}/${repo}.`,
          metadata: { action: GithubAction.IdentifyPRChanges, data: { files: [] }, success: true, owner, repo, pull_number }
        };
      }

      const changedFiles = files.map(f => ({
        filename: f.filename,
        status: f.status, // added, removed, modified, renamed
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        raw_url: f.raw_url, // URL to fetch content
      }));

      let contentString = `Changed files in pull request #${pull_number} (${owner}/${repo}):\n\n`;
      changedFiles.slice(0, 10).forEach(file => {
        contentString += `- **${file.filename}** (${file.status}) - +${file.additions} -${file.deletions}\n`;
      });
      if (changedFiles.length > 10) {
        contentString += `...and ${changedFiles.length - 10} more files.`;
      }

      return {
        type: 'github_action',
        content: contentString,
        metadata: { action: GithubAction.IdentifyPRChanges, data: { changed_files: changedFiles }, success: true, owner, repo, pull_number }
      };
    } catch (error) {
      this.handleError(error, `IdentifyPRChanges for PR #${pull_number}`);
      return { type: 'error', content: `Failed to identify PR changes for #${pull_number} in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.IdentifyPRChanges, success: false } };
    }
  }

  private async reviewPullRequestDescription(owner: string, repo: string, pull_number: number, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.ReviewPullRequestDescription, success: false } };
    try {
      const prRes = await this.octokit.rest.pulls.get({ owner, repo, pull_number });
      const pr = prRes.data;

      const issueLinks = pr.body?.match(/(#(\d+)|https:\/\/github.com\/[^/]+\/[^/]+\/issues\/(\d+))/g) || [];
      
      const context = `
Pull Request Title: ${pr.title}
Pull Request Body:
${pr.body || 'No description provided.'}

Linked Issues (extracted from body):
${issueLinks.length > 0 ? issueLinks.join('\n') : 'No explicit issue links found.'}

Based on the above Pull Request title and description, review its completeness and clarity. Consider:
- Is the purpose of the PR clear?
- Are the changes adequately described?
- Are there clear links to related issues or tasks?
- Is there any missing information that a reviewer would need?
Provide constructive feedback.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant for reviewing GitHub pull request descriptions. Provide concise and actionable feedback on clarity and completeness."
      );

      return {
        type: 'github_action',
        content: `Review of PR #${pull_number} description in ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.ReviewPullRequestDescription, data: { review: aiResponse.content }, success: true, owner, repo, pull_number }
      };
    } catch (error) {
      this.handleError(error, `ReviewPullRequestDescription for PR #${pull_number}`);
      return { type: 'error', content: `Failed to review PR description for #${pull_number} in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.ReviewPullRequestDescription, success: false } };
    }
  }

  private async detectCodeIssues(owner: string, repo: string, pull_number: number, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.DetectCodeIssues, success: false } };
    try {
      const { data: files } = await this.octokit.rest.pulls.listFiles({ owner, repo, pull_number, per_page: 5 }); // Limit files to check
      if (files.length === 0) {
        return {
          type: 'github_action',
          content: `No code changes found in pull request #${pull_number} in ${owner}/${repo} to analyze.`,
          metadata: { action: GithubAction.DetectCodeIssues, success: true, owner, repo, pull_number }
        };
      }

      let codeContext = '';
      for (const file of files) {
        if (file.patch) { // patch contains the diff
          codeContext += `--- File: ${file.filename} (Status: ${file.status}) ---\n\`\`\`diff\n${file.patch.substring(0, 1500)}\n\`\`\`\n\n`; // Truncate patch
        } else if (file.raw_url && (file.filename.endsWith('.js') || file.filename.endsWith('.ts') || file.filename.endsWith('.py') || file.filename.endsWith('.java'))) {
             // Fallback to fetch content if no patch, but prefer patch
             // Not ideal as it doesn't show *changes*, but the current file content.
             // Best is to fetch base and head content and diff locally, or rely on `patch`.
             try {
                const response = await fetch(file.raw_url);
                if (response.ok) {
                    const content = await response.text();
                    codeContext += `--- File (current version): ${file.filename} ---\n\`\`\`\n${content.substring(0, 1500)}\n\`\`\`\n\n`;
                }
             } catch (fetchError) {
                 this.handleError(fetchError, `Fetching raw file content for ${file.filename}`);
             }
        }
      }

      if (!codeContext) {
        return {
          type: 'github_action',
          content: `Could not retrieve sufficient code changes for analysis in pull request #${pull_number} in ${owner}/${repo}.`,
          metadata: { action: GithubAction.DetectCodeIssues, success: true, owner, repo, pull_number }
        };
      }

      const context = `
Pull Request Code Changes for ${owner}/${repo} PR #${pull_number}:
(Showing up to 5 files, patches truncated to 1500 characters)

${codeContext}

Analyze the provided code changes from the pull request. Identify potential issues such as:
- Missing unit tests for new or changed functionality.
- Lack of clear documentation for new features or complex logic.
- Potential performance bottlenecks.
- Security vulnerabilities (if evident from patterns).
- Code style inconsistencies or violations of common best practices.
- Obvious bugs or logical errors.
Provide actionable suggestions for improvement.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI code reviewer. Analyze the provided code changes and identify potential issues or areas for improvement in terms of tests, documentation, security, and best practices."
      );

      return {
        type: 'github_action',
        content: `Code issue detection for PR #${pull_number} in ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.DetectCodeIssues, data: { issues_detected: aiResponse.content }, success: true, owner, repo, pull_number }
      };
    } catch (error) {
      this.handleError(error, `DetectCodeIssues for PR #${pull_number}`);
      return { type: 'error', content: `Failed to detect code issues for PR #${pull_number} in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.DetectCodeIssues, success: false } };
    }
  }

  // Updated to return Promise<SimplifiedComment[]>
  private async fetchComments(owner: string, repo: string, type: 'issue' | 'pull_request', number: number): Promise<SimplifiedComment[]> {
    if (!this.octokit) return [];
    try {
      const commentsRes = await this.octokit.rest.issues.listComments({ owner, repo, issue_number: number, per_page: 50 });
      
      // The `comment` parameter's type is inferred correctly from `commentsRes.data` by TypeScript.
      // We explicitly return an object matching the `SimplifiedComment` interface.
      return commentsRes.data.map((comment) => ({
        user: comment.user?.login, // Safely access login, as user can be null
        body: comment.body,
        created_at: comment.created_at,
        html_url: comment.html_url,
      }));
    } catch (error) {
      this.handleError(error, `Fetching comments for ${type} #${number}`);
      return [];
    }
  }

  private async summarizeComments(owner: string, repo: string, type: 'issue' | 'pull_request', number: number, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.SummarizeComments, success: false } };
    try {
      const comments = await this.fetchComments(owner, repo, type, number);
      if (comments.length === 0) {
        return {
          type: 'github_action',
          content: `No comments found for ${type} #${number} in ${owner}/${repo}.`,
          metadata: { action: GithubAction.SummarizeComments, success: true, owner, repo, type, number }
        };
      }

      const commentsContext = comments.map(c => `User: ${c.user} (on ${c.created_at}):\n${c.body?.substring(0, 500)}...`).join('\n\n'); // Truncate comment bodies

      const context = `
Discussions/Comments for ${type} #${number} in ${owner}/${repo}:
${commentsContext}

Based on the above comments and discussions, provide a concise summary of the key points, decisions, and outstanding questions.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant that summarizes discussions. Summarize the provided comments, highlighting key points, decisions, and open questions."
      );

      return {
        type: 'github_action',
        content: `Summary of comments for ${type} #${number} in ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.SummarizeComments, data: { summary: aiResponse.content }, success: true, owner, repo, type, number }
      };
    } catch (error) {
      this.handleError(error, `SummarizeComments for ${type} #${number}`);
      return { type: 'error', content: `Failed to summarize comments for ${type} #${number} in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.SummarizeComments, success: false } };
    }
  }

  private async classifyIssue(owner: string, repo: string, issue_number: number, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.ClassifyIssue, success: false } };
    try {
      const issueRes = await this.octokit.rest.issues.get({ owner, repo, issue_number });
      const issue = issueRes.data;

      const context = `
Issue Title: ${issue.title}
Issue Body:
${issue.body || 'No description provided.'}

Based on the title and body of this issue, classify it into one or more of the following categories:
- Bug: Describes an error, flaw, or fault in a computer program or system that causes it to produce an incorrect or unexpected result, or to behave in unintended ways.
- Feature Request: A suggestion for new functionality to be added to the software.
- Enhancement: An improvement to existing functionality or performance.
- Documentation: Related to improving or adding documentation.
- Question: A query or request for information.
- Refactoring: Changes to code structure without altering external behavior.
- Chore/Maintenance: Routine tasks, dependency updates, build process changes, etc.

Provide only the classification(s), e.g., "Bug, Performance". If multiple, separate with commas. If none fit perfectly, suggest the closest.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant for classifying GitHub issues. Classify the issue based on its content into predefined categories."
      );

      return {
        type: 'github_action',
        content: `Classification for issue #${issue_number} in ${owner}/${repo}: ${aiResponse.content}`,
        metadata: { action: GithubAction.ClassifyIssue, data: { classification: aiResponse.content }, success: true, owner, repo, issue_number }
      };
    } catch (error) {
      this.handleError(error, `ClassifyIssue for #${issue_number}`);
      return { type: 'error', content: `Failed to classify issue #${issue_number} in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.ClassifyIssue, success: false } };
    }
  }

  private async fetchWorkflowRuns(owner: string, repo: string, workflow_id?: string | number, branch?: string, status?: string, per_page: number = 10) {
    if (!this.octokit) return [];
    try {
      const params: any = { owner, repo, per_page, status };
      if (workflow_id) params.workflow_id = workflow_id;
      if (branch) params.branch = branch;

      const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo(params);
      return data.workflow_runs.map(run => ({
        id: run.id,
        name: run.name,
        workflow_id: run.workflow_id,
        node_id: run.node_id,
        head_branch: run.head_branch,
        status: run.status,
        conclusion: run.conclusion,
        created_at: run.created_at,
        updated_at: run.updated_at,
        html_url: run.html_url,
        run_started_at: run.run_started_at,
      }));
    } catch (error) {
      this.handleError(error, `Fetching workflow runs for ${owner}/${repo}`);
      return [];
    }
  }

  private async summarizeCiCdRuns(owner: string, repo: string, modelId: string, workflow_id?: string | number, branch?: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.SummarizeCiCdRuns, success: false } };
    try {
      const runs = await this.fetchWorkflowRuns(owner, repo, workflow_id, branch, undefined, 10);
      if (runs.length === 0) {
        return {
          type: 'github_action',
          content: `No recent CI/CD workflow runs found for ${owner}/${repo}${branch ? ` on branch ${branch}` : ''}${workflow_id ? ` for workflow ID ${workflow_id}` : ''}.`,
          metadata: { action: GithubAction.SummarizeCiCdRuns, success: true, owner, repo }
        };
      }

      const runsContext = runs.map(run => 
        `Run #${run.id} (Workflow: ${run.name}, Branch: ${run.head_branch})\nStatus: ${run.status}, Conclusion: ${run.conclusion || 'N/A'}\nStarted: ${run.run_started_at} | [Link](${run.html_url})`
      ).join('\n\n');

      const context = `
Recent CI/CD Workflow Runs for ${owner}/${repo}:
${runsContext}

Based on the above, summarize the recent CI/CD pipeline runs and their overall results. Highlight any trends, successful deployments, or recurring issues.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant for summarizing CI/CD pipeline runs. Provide a concise summary of recent runs, focusing on results, trends, and issues."
      );

      return {
        type: 'github_action',
        content: `Summary of recent CI/CD runs for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.SummarizeCiCdRuns, data: { summary: aiResponse.content }, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `SummarizeCiCdRuns for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to summarize CI/CD runs for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.SummarizeCiCdRuns, success: false } };
    }
  }

  private async identifyCiCdFailures(owner: string, repo: string, modelId: string, workflow_id?: string | number, branch?: string, run_id?: number): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.IdentifyCiCdFailures, success: false } };
    try {
      let runs = [];
      if (run_id) {
        const { data: singleRun } = await this.octokit.rest.actions.getWorkflowRun({ owner, repo, run_id });
        runs = [singleRun];
      } else {
        runs = await this.fetchWorkflowRuns(owner, repo, workflow_id, branch, 'failure', 5); // Fetch recent failed runs
      }
      
      if (runs.length === 0) {
        return {
          type: 'github_action',
          content: `No recent CI/CD failures found for ${owner}/${repo}${branch ? ` on branch ${branch}` : ''}${workflow_id ? ` for workflow ID ${workflow_id}` : ''}${run_id ? ` for run ID ${run_id}` : ''}.`,
          metadata: { action: GithubAction.IdentifyCiCdFailures, success: true, owner, repo }
        };
      }

      let failureContext = '';
      for (const run of runs) {
        if (run.conclusion === 'failure') {
          failureContext += `--- Failed Run #${run.id} (Workflow: ${run.name}, Branch: ${run.head_branch}) ---\n`;
          failureContext += `[Link to run](${run.html_url})\n`;
          
          try {
            // Attempt to get job details and logs
            const { data: jobsData } = await this.octokit.rest.actions.listJobsForWorkflowRun({ owner, repo, run_id: run.id });
            for (const job of jobsData.jobs) {
              if (job.conclusion === 'failure') {
                failureContext += `Failed Job: ${job.name} (Status: ${job.status}, Conclusion: ${job.conclusion})\n`;
                // Fetch logs for the failed job (Octokit.rest.actions.downloadJobLogsForWorkflowRun)
                // Note: Direct job log download per_step is not directly exposed as text by octokit rest.
                // Could download as zip and parse, or advise user to check link.
                // For AI context, it's better to provide direct console outputs if possible, which is hard.
                // Instead, advise checking the job URL for logs or summarize general failure.
                failureContext += `Check job logs at: ${job.html_url}\n`;
                // If possible, get general error from steps summary
                // Corrected: only check conclusion for 'failure' as status can be 'in_progress' or 'completed'
                const failedStep = job.steps?.find(step => step.conclusion === 'failure');
                if (failedStep) {
                    failureContext += `Failed Step: ${failedStep.name || 'Unknown step'}\n`;
                    failureContext += `Error hints: ${failedStep.name} failed. Common causes: incorrect commands, missing dependencies, test failures.\n`;
                }
              }
            }
          } catch (jobError) {
            this.handleError(jobError, `Fetching jobs for run ${run.id}`);
            failureContext += `Could not fetch job details for this run.\n`;
          }
          failureContext += '\n';
        }
      }
      
      if (!failureContext) {
         return {
          type: 'github_action',
          content: `No failures found in the specified CI/CD runs for ${owner}/${repo}.`,
          metadata: { action: GithubAction.IdentifyCiCdFailures, success: true, owner, repo }
        };
      }

      const context = `
CI/CD Failures for ${owner}/${repo}:
${failureContext}

Based on the above, identify the root cause or common patterns of CI/CD failures. Extract any related logs or error messages (if provided). Suggest potential solutions or next steps for debugging.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant for debugging CI/CD failures. Analyze the provided failure details, extract key errors, and suggest debugging steps or solutions."
      );

      return {
        type: 'github_action',
        content: `Analysis of CI/CD failures for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.IdentifyCiCdFailures, data: { analysis: aiResponse.content }, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `IdentifyCiCdFailures for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to identify CI/CD failures for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.IdentifyCiCdFailures, success: false } };
    }
  }

  private async checkContributionGuidelines(owner: string, repo: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.CheckContributionGuidelines, success: false } };
    try {
      const requiredFiles = ['README.md', 'LICENSE', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md'];
      let foundFiles = [];
      let missingFiles = [];
      let contentContext = '';

      for (const file of requiredFiles) {
        try {
          const res = await this.getRepositoryContent(owner, repo, file);
          if (res.metadata?.success && res.metadata?.data?.content) {
            foundFiles.push(file);
            contentContext += `--- Content of ${file} (truncated) ---\n${res.metadata.data.content.substring(0, 1000)}...\n\n`;
          } else {
            missingFiles.push(file);
          }
        } catch (e: any) {
          if (e.error !== 'Not Found') {
            this.handleError(e, `Checking file ${file}`);
          }
          missingFiles.push(file);
        }
      }

      const context = `
Repository: ${owner}/${repo}

Required Contribution Files Check:
Found: ${foundFiles.length > 0 ? foundFiles.join(', ') : 'None'}
Missing: ${missingFiles.length > 0 ? missingFiles.join(', ') : 'None'}

Content of found files:
${contentContext || 'No relevant content to analyze.'}

Based on the presence and content of these files, determine if the repository generally follows common contribution guidelines and contains essential project files. Provide feedback on what's good, what's missing, and what could be improved.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant that reviews GitHub repositories for adherence to contribution guidelines and presence of essential files. Provide a clear assessment and suggestions."
      );

      return {
        type: 'github_action',
        content: `Contribution guideline check for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.CheckContributionGuidelines, data: { analysis: aiResponse.content, found_files: foundFiles, missing_files: missingFiles }, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `CheckContributionGuidelines for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to check contribution guidelines for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.CheckContributionGuidelines, success: false } };
    }
  }

  private async summarizeContributorActivity(owner: string, repo: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.SummarizeContributorActivity, success: false } };
    try {
      // Corrected destructuring for listContributors
      const { data: contributorsData, headers: contributorsHeaders } = await this.octokit.rest.repos.listContributors({ owner, repo, per_page: 10 }); // Top 10 contributors
      const { data: recentCommits } = await this.octokit.rest.repos.listCommits({ owner, repo, per_page: 20 }); // Last 20 commits

      if (contributorsData.length === 0 && recentCommits.length === 0) {
        return {
          type: 'github_action',
          content: `No significant contributor activity found for ${owner}/${repo}.`,
          metadata: { action: GithubAction.SummarizeContributorActivity, success: true, owner, repo }
        };
      }

      const contributorSummary = contributorsData.map(c => `- ${c.login} (${c.contributions} contributions)`).join('\n');
      const commitSummary = recentCommits.map(c => 
        `- ${c.commit.author?.name || 'Unknown Author'} (${c.commit.author?.date?.substring(0, 10) || 'Unknown Date'}): "${c.commit.message.substring(0, 80)}..." [${c.sha.substring(0, 7)}]`
      ).join('\n');

      const context = `
Repository: ${owner}/${repo}

Top 10 Contributors:
${contributorSummary || 'No contributors found.'}

Recent 20 Commits:
${commitSummary || 'No recent commits found.'}

Based on the above, summarize the recent contributor activity in the repository. Identify active contributors, recent commit trends, and overall development pace.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant for summarizing GitHub contributor activity. Analyze the provided data and summarize recent activity and trends."
      );

      return {
        type: 'github_action',
        content: `Recent contributor activity for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.SummarizeContributorActivity, data: { summary: aiResponse.content }, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `SummarizeContributorActivity for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to summarize contributor activity for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.SummarizeContributorActivity, success: false } };
    }
  }

  private async trackMilestones(owner: string, repo: string, modelId: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.TrackMilestones, success: false } };
    try {
      const { data: milestones } = await this.octokit.rest.issues.listMilestones({ owner, repo, state, per_page: 20 });

      if (milestones.length === 0) {
        return {
          type: 'github_action',
          content: `No ${state} milestones found for ${owner}/${repo}.`,
          metadata: { action: GithubAction.TrackMilestones, success: true, owner, repo }
        };
      }

      let milestoneContext = '';
      for (const milestone of milestones) {
        milestoneContext += `--- Milestone: ${milestone.title} (#${milestone.number}) ---\n`;
        milestoneContext += `Description: ${milestone.description || 'N/A'}\n`;
        milestoneContext += `State: ${milestone.state}\n`;
        milestoneContext += `Due Date: ${milestone.due_on ? milestone.due_on.substring(0, 10) : 'No due date'}\n`;
        milestoneContext += `Open Issues: ${milestone.open_issues}\n`;
        milestoneContext += `Closed Issues: ${milestone.closed_issues}\n`;
        milestoneContext += `Progress: ${milestone.open_issues + milestone.closed_issues > 0 ? (milestone.closed_issues / (milestone.open_issues + milestone.closed_issues) * 100).toFixed(2) : '0.00'}% complete\n\n`;
      }

      const context = `
Milestones and Progress for ${owner}/${repo} (${state} state):
${milestoneContext}

Based on the above, summarize the current status of milestones, their progress, and any upcoming deadlines. Highlight milestones that are at risk or nearing completion.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant that tracks project milestones. Summarize the status, progress, and deadlines of the provided milestones."
      );

      return {
        type: 'github_action',
        content: `Milestone tracking for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.TrackMilestones, data: { summary: aiResponse.content }, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `TrackMilestones for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to track milestones for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.TrackMilestones, success: false } };
    }
  }

  private async identifyStaleItems(owner: string, repo: string, modelId: string, itemType: 'issue' | 'pull_request' | 'both' = 'both', days_inactive: number = 30): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.IdentifyStaleItems, success: false } };
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days_inactive);
      const cutoffIso = cutoffDate.toISOString();

      let staleItems: any[] = [];

      if (itemType === 'issue' || itemType === 'both') {
        const { data: issues } = await this.octokit.rest.issues.listForRepo({
          owner, repo, state: 'open', per_page: 100, sort: 'updated', direction: 'asc'
        });
        issues.filter(i => new Date(i.updated_at!) < cutoffDate).forEach(i => {
          staleItems.push({ type: 'issue', number: i.number, title: i.title, updated_at: i.updated_at, html_url: i.html_url });
        });
      }

      if (itemType === 'pull_request' || itemType === 'both') {
        const { data: prs } = await this.octokit.rest.pulls.list({
          owner, repo, state: 'open', per_page: 100, sort: 'updated', direction: 'asc'
        });
        prs.filter(pr => new Date(pr.updated_at!) < cutoffDate).forEach(pr => {
          staleItems.push({ type: 'pull_request', number: pr.number, title: pr.title, updated_at: pr.updated_at, html_url: pr.html_url });
        });
      }

      if (staleItems.length === 0) {
        return {
          type: 'github_action',
          content: `No stale ${itemType === 'both' ? 'issues or pull requests' : itemType + 's'} (inactive for ${days_inactive} days) found in ${owner}/${repo}.`,
          metadata: { action: GithubAction.IdentifyStaleItems, success: true, owner, repo }
        };
      }

      const staleContext = staleItems.map(item => 
        `- ${item.type.toUpperCase()} #${item.number}: "${item.title}" (Last updated: ${item.updated_at?.substring(0, 10)}) [Link](${item.html_url})`
      ).join('\n');

      const context = `
Stale ${itemType === 'both' ? 'Issues and Pull Requests' : itemType + 's'} in ${owner}/${repo} (inactive for at least ${days_inactive} days):
${staleContext}

Based on the above list, identify the stale items that need attention. Suggest potential actions such as:
- Closing inactive items.
- Pinging original authors or assignees.
- Re-evaluating priority.
- Breaking down large/complex items.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        "You are an expert AI assistant that identifies and manages stale GitHub items. Review the list of stale issues/PRs and suggest appropriate actions."
      );

      return {
        type: 'github_action',
        content: `Stale items in ${owner}/${repo} (inactive for ${days_inactive} days):\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.IdentifyStaleItems, data: { stale_items: staleItems, analysis: aiResponse.content }, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `IdentifyStaleItems for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to identify stale items for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.IdentifyStaleItems, success: false } };
    }
  }

  private async monitorRepoHealth(owner: string, repo: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.MonitorRepoHealth, success: false } };
    try {
      const repoDetails = await this.octokit.rest.repos.get({ owner, repo });
      // GitHub API list calls for issues/pulls usually return a 'Link' header for pagination.
      // To get total counts without fetching all pages, we can check that header for 'last' page number.
      // If no link header, it means all results fit on one page (<= per_page).
      const { data: openIssues, headers: openIssuesHeaders } = await this.octokit.rest.issues.listForRepo({ owner, repo, state: 'open', per_page: 1 });
      const totalOpenIssues = openIssuesHeaders['link']?.match(/page=(\d+)>; rel="last"/) ? parseInt(openIssuesHeaders['link'].match(/page=(\d+)>; rel="last"/)![1]) : openIssues.length;
      
      const { data: openPrs, headers: openPrsHeaders } = await this.octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 1 });
      const totalOpenPrs = openPrsHeaders['link']?.match(/page=(\d+)>; rel="last"/) ? parseInt(openPrsHeaders['link'].match(/page=(\d+)>; rel="last"/)![1]) : openPrs.length;

      const recentCiRuns = await this.fetchWorkflowRuns(owner, repo, undefined, undefined, undefined, 5); // Latest 5 CI runs
      const securityAlerts = await this.checkSecurityAlerts(owner, repo); // This function will return result with data if successful.

      const healthContext = `
Repository Health Report for ${owner}/${repo}:
- Description: ${repoDetails.data.description || 'N/A'}
- Stars: ${repoDetails.data.stargazers_count}
- Forks: ${repoDetails.data.forks_count}
- Open Issues: ${totalOpenIssues}
- Open Pull Requests: ${totalOpenPrs}
- Latest Build Status (last 5 runs):
  ${recentCiRuns.length > 0 ? recentCiRuns.map(r => `  - ${r.name} on ${r.head_branch}: ${r.conclusion || r.status} [Link](${r.html_url})`).join('\n') : 'No recent CI runs.'}
- Security Alerts: ${securityAlerts.metadata?.data?.alerts && securityAlerts.metadata.data.alerts.length > 0 ? `${securityAlerts.metadata.data.alerts.length} alerts found.` : 'None found.'}
  ${(securityAlerts.metadata?.data?.alerts || []).slice(0, 3).map((a:any) => `  - ${a.state}: ${a.security_vulnerability?.package.name} (${a.security_vulnerability?.severity})`).join('\n')}

Based on the above data, provide a comprehensive report on the repository's health. Include overall stability, activity, and areas that might need attention.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        healthContext,
        "You are an expert AI assistant for monitoring GitHub repository health. Provide a concise yet comprehensive report on the repository's stability, activity, and potential issues."
      );

      return {
        type: 'github_action',
        content: `Repository health report for ${owner}/${repo}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.MonitorRepoHealth, data: { health_report: aiResponse.content }, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `MonitorRepoHealth for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to monitor repository health for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.MonitorRepoHealth, success: false } };
    }
  }

  private async translateDescription(owner: string, repo: string, type: 'issue' | 'pull_request', number: number, target_language: string, modelId: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.TranslateDescription, success: false } };
    try {
      let description: string | undefined;
      if (type === 'issue') {
        const issueRes = await this.octokit.rest.issues.get({ owner, repo, issue_number: number });
        description = issueRes.data.body || issueRes.data.title;
      } else { // pull_request
        const prRes = await this.octokit.rest.pulls.get({ owner, repo, pull_number: number });
        description = prRes.data.body || prRes.data.title;
      }

      if (!description) {
        return {
          type: 'github_action',
          content: `No description found for ${type} #${number} in ${owner}/${repo} to translate.`,
          metadata: { action: GithubAction.TranslateDescription, success: true, owner, repo, type, number }
        };
      }

      const context = `
Translate the following text to ${target_language}:

\`\`\`
${description}
\`\`\`

Provide only the translated text.
      `;

      const aiResponse = await aiModelService.generateAIResponse(
        modelId,
        context,
        `You are an expert AI translator. Translate the provided text into ${target_language}.`
      );

      return {
        type: 'github_action',
        content: `Translated ${type} #${number} description to ${target_language}:\n\n${aiResponse.content}`,
        metadata: { action: GithubAction.TranslateDescription, data: { translated_text: aiResponse.content, original_text: description, target_language }, success: true, owner, repo, type, number }
      };
    } catch (error) {
      this.handleError(error, `TranslateDescription for ${type} #${number}`);
      return { type: 'error', content: `Failed to translate ${type} #${number} description in ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.TranslateDescription, success: false } };
    }
  }

  private async checkSecurityAlerts(owner: string, repo: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.CheckSecurityAlerts, success: false } };
    try {
      // Note: This API endpoint (listVulnerabilityAlerts/listAlertsForRepo) requires the 'security_events' scope,
      // and for private repos, the authenticated user must have admin permissions.
      // If the token doesn't have it, it will fail.
      const { data: alerts } = await this.octokit.rest.dependabot.listAlertsForRepo({ owner, repo });

      if (alerts.length === 0) {
        return {
          type: 'github_action',
          content: `No security alerts or known vulnerabilities found by Dependabot for ${owner}/${repo}.`,
          metadata: { action: GithubAction.CheckSecurityAlerts, data: { alerts: [] }, success: true, owner, repo }
        };
      }

      const activeAlerts = alerts.filter(alert => alert.state === 'open');
      let contentString = `Found ${activeAlerts.length} active security alerts for ${owner}/${repo}:\n\n`;
      activeAlerts.slice(0, 5).forEach(alert => {
        contentString += `- **${alert.security_vulnerability?.package.name}** (Severity: ${alert.security_vulnerability?.severity})\n`;
        contentString += `  Vulnerable range: ${alert.security_vulnerability?.vulnerable_version_range}\n`;
        contentString += `  Fixed in: ${alert.security_vulnerability?.first_patched_version?.identifier || 'N/A'}\n`;
        contentString += `  [Link to alert](${alert.html_url})\n\n`;
      });
      if (activeAlerts.length > 5) {
        contentString += `...and ${activeAlerts.length - 5} more alerts.`;
      }

      return {
        type: 'github_action',
        content: contentString,
        metadata: { action: GithubAction.CheckSecurityAlerts, data: { alerts: activeAlerts }, success: true, owner, repo }
      };
    } catch (error: any) {
      this.handleError(error, `CheckSecurityAlerts for ${owner}/${repo}`);
      if (error.status === 403) {
        return { type: 'error', content: `Failed to check security alerts for ${owner}/${repo}: Forbidden. This action requires 'security_events' scope or admin permissions on the repository.`, error: 'Permission Denied', metadata: { action: GithubAction.CheckSecurityAlerts, success: false } };
      }
      return { type: 'error', content: `Failed to check security alerts for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.CheckSecurityAlerts, success: false } };
    }
  }

  private async getRepositoryMetadata(owner: string, repo: string): Promise<GithubResult> {
    if (!this.octokit) return { type: 'error', content: 'Octokit not initialized.', error: 'Not initialized', metadata: { action: GithubAction.GetRepositoryMetadata, success: false } };
    try {
      const repoDetailsRes = await this.octokit.rest.repos.get({ owner, repo });
      const repoData = repoDetailsRes.data;

      // Fetch contributor count directly
      let contributorCount = 'N/A';
      try {
          // Correctly destructure data and headers from the response
          const { data: contributorsData, headers: contributorsHeaders } = await this.octokit.rest.repos.listContributors({ owner, repo, per_page: 1 });
          // The API returns max 100 per_page. To get total, we need to check the Link header.
          const linkHeader = contributorsHeaders['link'];
          if (linkHeader) {
            const matches = linkHeader.match(/page=(\d+)>; rel="last"/);
            if (matches && matches[1]) {
                // If there's a "last" page, multiply by per_page (which was set to 1, but for full count, it implies actual page size)
                // For a more accurate approximation of total count if per_page was 1, we can't assume 100.
                // It's better to state what we got directly or iterate. For simplicity here, we'll indicate more.
                contributorCount = (parseInt(matches[1]) * 1) + " (approx total)"; // Still approximate based on per_page of 1
            } else {
                // If no "last" link, but data exists, it means all contributors fit on the first page.
                contributorCount = (contributorsData.length).toString();
            }
          } else {
              contributorCount = (contributorsData.length).toString(); // If no link header, all fit on first page
          }
      } catch (e) {
          this.log(`Could not fetch exact contributor count for ${owner}/${repo}`, e);
          contributorCount = 'Unknown';
      }

      const metadata = {
        name: repoData.name,
        full_name: repoData.full_name,
        description: repoData.description,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        watchers: repoData.subscribers_count,
        language: repoData.language,
        default_branch: repoData.default_branch,
        open_issues_count: repoData.open_issues_count,
        created_at: repoData.created_at,
        updated_at: repoData.updated_at,
        pushed_at: repoData.pushed_at, // Last push activity (often latest commit)
        license: repoData.license?.spdx_id || 'N/A',
        html_url: repoData.html_url,
        contributor_count: contributorCount,
      };

      let contentString = `Metadata for repository ${owner}/${repo}:\n\n`;
      Object.entries(metadata).forEach(([key, value]) => {
          contentString += `- ${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${value}\n`;
      });

      return {
        type: 'github_action',
        content: contentString,
        metadata: { action: GithubAction.GetRepositoryMetadata, data: metadata, success: true, owner, repo }
      };
    } catch (error) {
      this.handleError(error, `GetRepositoryMetadata for ${owner}/${repo}`);
      return { type: 'error', content: `Failed to fetch repository metadata for ${owner}/${repo}: ${(error as Error).message}`, error: (error as Error).message, metadata: { action: GithubAction.GetRepositoryMetadata, success: false } };
    }
  }


  private log(message: string, data?: any): void {
    const logMessage = `[GitHubAgent:${this.userId}] ${new Date().toISOString()} ${message}`;
    if (data) {
      console.log(logMessage, typeof data === 'object' ? JSON.stringify(data, null, 2).substring(0, 500) : data);
    } else {
      console.log(logMessage);
    }
  }

  private handleError(error: any, operation: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GitHubAgent:${this.userId}] ERROR during ${operation}: ${errorMessage}`);
    if (error.response?.data?.message) {
      console.error(`[GitHubAgent:${this.userId}] GitHub API Error: ${error.response.data.message}`);
    } else if (error.status && error.message) { 
      console.error(`[GitHubAgent:${this.userId}] GitHub API Error (${error.status}): ${error.message}`);
    }
  }
}

const agentInstances: Map<string, GithubAgent> = new Map();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || 'http://localhost:5001/api/github/oauth2callback';

export const getGithubAgent = async (userId: string): Promise<GithubAgent> => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error('GitHub OAuth credentials not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.');
  }
  
  if (!agentInstances.has(userId)) {
    agentInstances.set(
      userId, 
      new GithubAgent(userId, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI)
    );
  }
  
  return agentInstances.get(userId)!;
};

export const initializeGithubAgent = async (userId: string): Promise<string | null> => {
  const agent = await getGithubAgent(userId);
  return agent.initialize();
};

export const handleAuthCallback = async (userId: string, code: string): Promise<boolean> => {
  const agent = await getGithubAgent(userId);
  return agent.handleAuthCode(code);
};

export const processGithubMessage = async (
  message: string,
  modelId: string,
  userId: string,
  confirmed?: boolean,
  parsedCommand?: ParsedGithubCommand
): Promise<GithubResult> => {
  try {
    const agent = await getGithubAgent(userId);
    const authUrl = await agent.initialize();

    if (authUrl) {
      const pluginsUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/plugins` : '/plugins';
      return {
        type: 'authorization_required',
        content: 'To use GitHub features, you need to connect your account. Please visit the Plugins page to connect.',
        metadata: {
          action: 'authorization_required',
          data: { 
            authUrl,
            pluginsUrl,
            message: 'Please connect your GitHub account from the Plugins page to use this feature.'
          },
          success: false
        }
      };
    }
    
    if (parsedCommand && confirmed) {
      return await agent.executeParsedCommand(parsedCommand, true, modelId);
    }
    
    return await agent.processNaturalLanguageCommand(message, modelId);
  } catch (error) {
    console.error('Error processing GitHub message:', error);
    return {
      type: 'error',
      content: `Failed to process command: ${(error as Error).message}`,
      error: (error as Error).message
    };
  }
};

export const disconnectGithub = async (userId: string): Promise<boolean> => {
  try {
    userCredentialsStore.delete(userId);
    userCommandHistory.delete(userId);
    return true;
  } catch (error) {
    console.error('Error disconnecting GitHub:', error);
    return false;
  }
};
