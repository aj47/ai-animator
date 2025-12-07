
// Chroma key settings for removing green screen backgrounds
export interface ChromaKeySettings {
  enabled: boolean;
  keyColor: string; // Hex color, e.g., "#00FF00"
  tolerance: number; // 0-100, how much color variance to key out
  spillSuppression: number; // 0-100, reduce color spill on edges
  edgeSoftness: number; // 0-100, feather/blur the edges
}

export const DEFAULT_CHROMA_KEY_SETTINGS: ChromaKeySettings = {
  enabled: true,
  keyColor: '#00FF00',
  tolerance: 40,
  spillSuppression: 50,
  edgeSoftness: 10
};

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
  chromaKey?: ChromaKeySettings; // Per-segment chroma key settings
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

// Generation pipeline status
export interface GenerationPipelineState {
  isRunning: boolean;
  isPaused: boolean;
  currentPhase: 'idle' | 'prompts' | 'images' | 'videos' | 'complete';
  progress: {
    promptsGenerated: number;
    imagesGenerated: number;
    videosGenerated: number;
    totalSegments: number;
  };
}

// Deprecated but kept for type safety if needed
export interface VeoPrompt {
  id: string;
  title: string;
  description: string;
  style: string;
}
