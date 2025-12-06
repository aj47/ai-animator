
export interface Segment {
  id: string;
  timestamp: number; // Seconds
  formattedTime: string; // e.g., "00:15"
  topic: string;
  description: string;
  prompt: string; // The specific prompt for generation
  animationPrompt: string; // Description of how the static asset should animate
  status: 'idle' | 'generating-image' | 'image-success' | 'generating-video' | 'video-success' | 'error';
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
  duration: number; // Duration of the segment in seconds (default: 5)
}

export interface AnalysisResult {
  visualSummary: string;
  audioSummary: string;
  segments: Segment[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  TIMELINE = 'TIMELINE',
  TIMELINE_EDITOR = 'TIMELINE_EDITOR',
  DETAIL_VIEW = 'DETAIL_VIEW',
  ERROR = 'ERROR'
}

// Generation pipeline states for timeline-first experience
export type GenerationPhase = 'idle' | 'analyzing' | 'generating-prompts' | 'generating-images' | 'generating-videos' | 'complete' | 'stopped';

export interface GenerationProgress {
  phase: GenerationPhase;
  currentSegment?: string;
  completedSegments: number;
  totalSegments: number;
  statusMessage: string;
}

// Deprecated but kept for type safety if needed
export interface VeoPrompt {
  id: string;
  title: string;
  description: string;
  style: string;
}
