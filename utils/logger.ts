/**
 * Extensive logging utility for debugging imagegen, videogen, prompts, and UI
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

const COLORS = {
  DEBUG: '#8B8B8B',
  INFO: '#4FC3F7',
  WARN: '#FFB74D',
  ERROR: '#EF5350',
  // Categories
  IMAGE_GEN: '#4CAF50',
  VIDEO_GEN: '#9C27B0',
  PROMPT: '#FF9800',
  UI: '#2196F3',
  API: '#00BCD4',
  STATE: '#E91E63',
  PIPELINE: '#673AB7',
};

class Logger {
  private enabled: boolean = true;
  private logHistory: LogEntry[] = [];
  private maxHistory: number = 500;

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().substr(11, 12);
  }

  private log(level: LogLevel, category: string, message: string, data?: any) {
    if (!this.enabled) return;

    const timestamp = this.formatTimestamp();
    const entry: LogEntry = { timestamp, level, category, message, data };
    
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistory) {
      this.logHistory.shift();
    }

    const categoryColor = COLORS[category as keyof typeof COLORS] || COLORS.INFO;
    const levelColor = COLORS[level];

    const prefix = `%c[${timestamp}]%c[${category}]%c[${level}]`;
    const styles = [
      'color: #888',
      `color: ${categoryColor}; font-weight: bold`,
      `color: ${levelColor}; font-weight: bold`,
    ];

    if (data !== undefined) {
      console.groupCollapsed(prefix + ` ${message}`, ...styles);
      console.log('Data:', data);
      console.groupEnd();
    } else {
      console.log(prefix + ` ${message}`, ...styles);
    }
  }

  // Image Generation
  imageGen = {
    start: (segmentId: string, prompt: string) => 
      this.log('INFO', 'IMAGE_GEN', `Starting image generation for segment ${segmentId}`, { segmentId, prompt: prompt.substring(0, 100) + '...' }),
    step1Start: (segmentId: string) => 
      this.log('DEBUG', 'IMAGE_GEN', `Step 1: Generating scene with overlay for ${segmentId}`),
    step1Complete: (segmentId: string) => 
      this.log('DEBUG', 'IMAGE_GEN', `Step 1 complete for ${segmentId}`),
    step2Start: (segmentId: string) => 
      this.log('DEBUG', 'IMAGE_GEN', `Step 2: Generating green screen for ${segmentId}`),
    step2Complete: (segmentId: string) => 
      this.log('DEBUG', 'IMAGE_GEN', `Step 2 complete for ${segmentId}`),
    success: (segmentId: string, imageUrlLength: number) => 
      this.log('INFO', 'IMAGE_GEN', `✓ Image generated successfully for ${segmentId}`, { dataUrlLength: imageUrlLength }),
    error: (segmentId: string, error: any) => 
      this.log('ERROR', 'IMAGE_GEN', `✗ Image generation failed for ${segmentId}`, { error: error?.message || error }),
    chromaDetected: (segmentId: string, color: string) => 
      this.log('DEBUG', 'IMAGE_GEN', `Chroma key color detected for ${segmentId}: ${color}`),
  };

  // Video Generation
  videoGen = {
    start: (segmentId: string, animationPrompt: string) => 
      this.log('INFO', 'VIDEO_GEN', `Starting video generation for segment ${segmentId}`, { segmentId, animationPrompt }),
    polling: (segmentId: string, attempt: number) => 
      this.log('DEBUG', 'VIDEO_GEN', `Polling Veo status for ${segmentId} (attempt ${attempt})`),
    success: (segmentId: string, videoUrl: string) => 
      this.log('INFO', 'VIDEO_GEN', `✓ Video generated successfully for ${segmentId}`, { videoUrl: videoUrl.substring(0, 50) + '...' }),
    error: (segmentId: string, error: any) => 
      this.log('ERROR', 'VIDEO_GEN', `✗ Video generation failed for ${segmentId}`, { error: error?.message || error }),
    config: (config: any) => 
      this.log('DEBUG', 'VIDEO_GEN', 'Veo configuration', config),
  };

  // Prompts
  prompt = {
    analysis: (prompt: string) => 
      this.log('INFO', 'PROMPT', 'Video analysis prompt sent', { promptLength: prompt.length }),
    analysisResult: (result: any) => 
      this.log('INFO', 'PROMPT', `Analysis complete: ${result.segments?.length || 0} segments detected`, { 
        visualSummary: result.visualSummary?.substring(0, 100),
        segmentCount: result.segments?.length 
      }),
    imagePrompt: (segmentId: string, prompt: string) => 
      this.log('DEBUG', 'PROMPT', `Image prompt for ${segmentId}`, { prompt }),
    animationPrompt: (segmentId: string, prompt: string) => 
      this.log('DEBUG', 'PROMPT', `Animation prompt for ${segmentId}`, { prompt }),
    updated: (segmentId: string, imagePrompt: string, animationPrompt: string) => 
      this.log('INFO', 'PROMPT', `Prompts updated for ${segmentId}`, { imagePrompt: imagePrompt.substring(0, 50), animationPrompt }),
  };

  // UI Events
  ui = {
    stateChange: (from: string, to: string) => 
      this.log('INFO', 'UI', `State change: ${from} → ${to}`),
    segmentSelected: (segmentId: string) => 
      this.log('DEBUG', 'UI', `Segment selected: ${segmentId}`),
    fileSelected: (fileName: string, fileSize: number, fileType: string) => 
      this.log('INFO', 'UI', `File selected: ${fileName}`, { size: `${(fileSize / 1024 / 1024).toFixed(2)} MB`, type: fileType }),
    buttonClick: (action: string) => 
      this.log('DEBUG', 'UI', `Button clicked: ${action}`),
    editorOpen: () => 
      this.log('DEBUG', 'UI', 'Timeline editor opened'),
    editorClose: () => 
      this.log('DEBUG', 'UI', 'Timeline editor closed'),
  };

  // Pipeline
  pipeline = {
    start: (totalSegments: number) => 
      this.log('INFO', 'PIPELINE', `Pipeline started with ${totalSegments} segments`),
    phaseChange: (phase: string) => 
      this.log('INFO', 'PIPELINE', `Pipeline phase: ${phase}`),
    progress: (progress: any) => 
      this.log('DEBUG', 'PIPELINE', 'Pipeline progress', progress),
    stopped: () => 
      this.log('WARN', 'PIPELINE', 'Pipeline stopped by user'),
    resumed: () => 
      this.log('INFO', 'PIPELINE', 'Pipeline resumed'),
    complete: () => 
      this.log('INFO', 'PIPELINE', '✓ Pipeline complete'),
  };

  // API
  api = {
    request: (endpoint: string, params?: any) => 
      this.log('DEBUG', 'API', `API request: ${endpoint}`, params),
    response: (endpoint: string, status: string) => 
      this.log('DEBUG', 'API', `API response: ${endpoint} - ${status}`),
    error: (endpoint: string, error: any) => 
      this.log('ERROR', 'API', `API error: ${endpoint}`, { error: error?.message || error }),
    keyCheck: (hasKey: boolean) => 
      this.log('DEBUG', 'API', `API key check: ${hasKey ? 'present' : 'missing'}`),
  };

  // State changes
  state = {
    analysisUpdate: (segmentCount: number) => 
      this.log('DEBUG', 'STATE', `Analysis state updated: ${segmentCount} segments`),
    segmentStatusChange: (segmentId: string, oldStatus: string, newStatus: string) => 
      this.log('DEBUG', 'STATE', `Segment ${segmentId} status: ${oldStatus} → ${newStatus}`),
    chromaKeyUpdate: (segmentId: string, settings: any) => 
      this.log('DEBUG', 'STATE', `Chroma key updated for ${segmentId}`, settings),
  };

  // Utility methods
  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  clearHistory(): void {
    this.logHistory = [];
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }
}

// Export singleton instance
export const logger = new Logger();

// Also expose on window for debugging in console
if (typeof window !== 'undefined') {
  (window as any).__logger = logger;
}

