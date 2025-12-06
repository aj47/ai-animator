
export interface Segment {
  id: string;
  timestamp: number; // Seconds
  formattedTime: string; // e.g., "00:15"
  topic: string;
  description: string;
  prompt: string; // The specific prompt for generation
  animationPrompt: string; // Description of how the static asset should animate
  status: 'idle' | 'generating' | 'success' | 'error';
  imageUrl?: string;
  error?: string;
}

export interface AnalysisResult {
  visualSummary: string;
  audioSummary: string;
  segments: Segment[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  TIMELINE = 'TIMELINE', // Replaces PROMPT_SELECTION
  DETAIL_VIEW = 'DETAIL_VIEW', // Replaces GENERATING/COMPLETE
  ERROR = 'ERROR'
}

// Deprecated but kept for type safety if needed
export interface VeoPrompt {
  id: string;
  title: string;
  description: string;
  style: string;
}
