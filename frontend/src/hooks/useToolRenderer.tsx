import { useState, useCallback } from 'react';

export interface ThinkingStep {
  id: string;
  type: 'intent_analysis' | 'agent_selection' | 'agent_execution' | 'response_generation';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  metadata?: any;
  timestamp: Date;
}

export interface ThinkingProcessState {
  steps: ThinkingStep[];
  isVisible: boolean;
  isComplete: boolean;
}

export const useThinkingProcess = () => {
  const [state, setState] = useState<ThinkingProcessState>({
    steps: [],
    isVisible: false,
    isComplete: false
  });

  const startThinking = useCallback(() => {
    setState({
      steps: [],
      isVisible: true,
      isComplete: false
    });
  }, []);

  const addStep = useCallback((step: ThinkingStep) => {
    setState(prev => ({
      ...prev,
      steps: [...prev.steps, step]
    }));
  }, []);

  const updateStep = useCallback((stepId: string, updates: Partial<ThinkingStep>) => {
    setState(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.id === stepId ? { ...step, ...updates } : step
      )
    }));
  }, []);

  const completeThinking = useCallback(() => {
    setState(prev => ({
      ...prev,
      isComplete: true
    }));
  }, []);

  const hideThinking = useCallback(() => {
    setState({
      steps: [],
      isVisible: false,
      isComplete: false
    });
  }, []);

  return {
    ...state,
    startThinking,
    addStep,
    updateStep,
    completeThinking,
    hideThinking
  };
};