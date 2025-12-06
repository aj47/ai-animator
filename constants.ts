
export const MAX_VIDEO_SIZE_MB = 200;
export const MAX_VIDEO_DURATION_SEC = 600; // 10 minutes

// Supported ratios: "1:1", "3:4", "4:3", "9:16", "16:9"
// This will now be calculated dynamically.

export const ANALYSIS_MODEL = "gemini-2.5-flash"; // Good balance for video analysis
export const GENERATION_MODEL = "gemini-3-pro-image-preview"; // High quality image editing/generation

export const SAMPLE_PROMPTS = [
  "A futuristic cyberpunk remix with neon lights and glitch effects.",
  "A claymation style animation with smooth stop-motion aesthetic.",
  "A hand-drawn anime opening style with speed lines and dramatic lighting."
];
