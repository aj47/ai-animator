
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

// Overlay position and transform settings
export interface OverlayTransform {
  x: number; // Horizontal position as percentage (-100 to 100, 0 = center)
  y: number; // Vertical position as percentage (-100 to 100, 0 = center)
  scale: number; // Scale factor (0.1 to 3, 1 = 100%)
}

export const DEFAULT_OVERLAY_TRANSFORM: OverlayTransform = {
  x: 0,
  y: 0,
  scale: 1
};

// Image generation step progress
export interface ImageGenerationProgress {
  step: 1 | 2; // Step 1: Scene with overlay, Step 2: Green screen
  message: string; // Current progress message
  intermediateImageUrl?: string; // Step 1 result (scene with overlay before green screen)
}

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
  generationProgress?: ImageGenerationProgress; // Track image generation step progress
  overlayTransform?: OverlayTransform; // Position and scale of the overlay
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
