import { EventEmitter } from 'events';

export interface ThinkingStep {
  id: string;
  type: 'intent_analysis' | 'agent_selection' | 'agent_execution' | 'response_generation';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  metadata?: any;
  timestamp: Date;
}

export class ThinkingProcessService extends EventEmitter {
  private steps: Map<string, ThinkingStep[]> = new Map();

  createSession(sessionId: string): void {
    this.steps.set(sessionId, []);
  }

  addStep(sessionId: string, step: Omit<ThinkingStep, 'timestamp'>): void {
    const steps = this.steps.get(sessionId) || [];
    const newStep: ThinkingStep = {
      ...step,
      timestamp: new Date()
    };
    
    steps.push(newStep);
    this.steps.set(sessionId, steps);
    
    // Emit the update
    this.emit(`update:${sessionId}`, newStep);
  }

  updateStep(sessionId: string, stepId: string, updates: Partial<ThinkingStep>): void {
    const steps = this.steps.get(sessionId) || [];
    const stepIndex = steps.findIndex(s => s.id === stepId);
    
    if (stepIndex !== -1) {
      steps[stepIndex] = { ...steps[stepIndex], ...updates };
      this.steps.set(sessionId, steps);
      
      // Emit the update
      this.emit(`update:${sessionId}`, steps[stepIndex]);
    }
  }

  getSteps(sessionId: string): ThinkingStep[] {
    return this.steps.get(sessionId) || [];
  }

  clearSession(sessionId: string): void {
    this.steps.delete(sessionId);
    this.removeAllListeners(`update:${sessionId}`);
  }
}

export const thinkingProcessService = new ThinkingProcessService();
