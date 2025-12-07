import { AnalysisResult, GenerationPipelineState, AppState } from '../types';

const STORAGE_KEY = 'gemini-animator-project';

export interface ProjectData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  // Video file info (can't store the actual file, but store metadata)
  videoFileName: string | null;
  videoFileType: string | null;
  videoAspectRatio: string;
  // Analysis and generated content
  analysis: AnalysisResult | null;
  // Pipeline state
  pipelineState: GenerationPipelineState;
  // App state
  appState: AppState;
}

const createDefaultProject = (): ProjectData => ({
  id: crypto.randomUUID(),
  name: 'Untitled Project',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  videoFileName: null,
  videoFileType: null,
  videoAspectRatio: '16:9',
  analysis: null,
  pipelineState: {
    isRunning: false,
    isPaused: false,
    currentPhase: 'idle',
    progress: { promptsGenerated: 0, imagesGenerated: 0, videosGenerated: 0, totalSegments: 0 }
  },
  appState: AppState.IDLE
});

export const saveProject = (data: Partial<ProjectData>): void => {
  try {
    const existing = loadProject();
    const updated: ProjectData = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('[Autosave] Project saved', updated.updatedAt);
  } catch (err) {
    console.error('[Autosave] Failed to save project:', err);
  }
};

export const loadProject = (): ProjectData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ProjectData;
      console.log('[Autosave] Project loaded from', parsed.updatedAt);
      return parsed;
    }
  } catch (err) {
    console.error('[Autosave] Failed to load project:', err);
  }
  return createDefaultProject();
};

export const clearProject = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Autosave] Project cleared');
  } catch (err) {
    console.error('[Autosave] Failed to clear project:', err);
  }
};

export const hasStoredProject = (): boolean => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ProjectData;
      // Only return true if there's actual meaningful data
      return parsed.analysis !== null || parsed.videoFileName !== null;
    }
  } catch (err) {
    console.error('[Autosave] Failed to check stored project:', err);
  }
  return false;
};

