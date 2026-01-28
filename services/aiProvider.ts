/**
 * AI Provider Abstraction Layer
 * 
 * Provides a unified interface for switching between Gemini and FAL AI providers.
 * Video analysis always uses Gemini (FAL doesn't have equivalent capability).
 */

import * as geminiService from './geminiService';
import type { AnalysisResult } from '../types';
import type { ImageGenerationResult, ImageGenerationProgressCallback } from './geminiService';

// Provider types
export type AIProvider = 'gemini' | 'fal';

// Local storage key for persisting provider selection
const PROVIDER_STORAGE_KEY = 'ai-animator-provider';

// Default provider
const DEFAULT_PROVIDER: AIProvider = 'gemini';

/**
 * Get the currently selected AI provider from localStorage
 */
export const getCurrentProvider = (): AIProvider => {
  try {
    const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (stored === 'gemini' || stored === 'fal') {
      return stored;
    }
  } catch (err) {
    console.error('[AIProvider] Failed to read provider from storage:', err);
  }
  return DEFAULT_PROVIDER;
};

/**
 * Set the current AI provider and persist to localStorage
 */
export const setCurrentProvider = (provider: AIProvider): void => {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    console.log('[AIProvider] Provider set to:', provider);
  } catch (err) {
    console.error('[AIProvider] Failed to save provider to storage:', err);
  }
};

/**
 * Check if the current provider has a valid API key configured
 */
export const checkApiKey = async (): Promise<boolean> => {
  const provider = getCurrentProvider();
  
  if (provider === 'fal') {
    // FAL uses localStorage key - will be implemented by falService
    const { checkFalApiKey } = await import('./falService');
    return checkFalApiKey();
  }
  
  // Default to Gemini
  return geminiService.checkApiKey();
};

/**
 * Prompt user to enter API key for current provider
 */
export const promptApiKey = async (): Promise<boolean> => {
  const provider = getCurrentProvider();
  
  if (provider === 'fal') {
    const { promptFalApiKey } = await import('./falService');
    return promptFalApiKey();
  }
  
  return geminiService.promptApiKey();
};

/**
 * Analyze video content - ALWAYS uses Gemini
 * FAL doesn't have equivalent video analysis capability
 */
export const analyzeVideoContent = async (
  videoBase64: string,
  mimeType: string
): Promise<AnalysisResult> => {
  // Always use Gemini for video analysis regardless of provider setting
  return geminiService.analyzeVideoContent(videoBase64, mimeType);
};

/**
 * Generate image asset with green screen background
 * Routes to the current provider's implementation
 *
 * Note: FAL uses a different approach - direct image generation without scene recreation.
 * The result is adapted to match the Gemini ImageGenerationResult interface.
 */
export const generateImageAsset = async (
  promptText: string,
  imageBase64: string,
  aspectRatio: string,
  onProgress?: ImageGenerationProgressCallback,
  segmentId?: string
): Promise<ImageGenerationResult> => {
  const provider = getCurrentProvider();

  if (provider === 'fal') {
    const { generateFalImage } = await import('./falService');

    // Wrap progress callback to match FAL's simpler signature
    const falProgress = onProgress ? (msg: string) => onProgress(1, msg) : undefined;

    // FAL generates directly - enhance prompt for green screen
    const enhancedPrompt = `${promptText}. Generate on a solid bright green (#00FF00) chroma key background. Isolated object suitable for AR compositing.`;

    if (onProgress) onProgress(1, "Generating image with FAL FLUX...");
    const imageUrl = await generateFalImage(enhancedPrompt, aspectRatio, falProgress, segmentId);
    if (onProgress) onProgress(2, "Complete!", imageUrl);

    // Return in ImageGenerationResult format (no intermediate for FAL)
    return {
      finalImageUrl: imageUrl,
      intermediateImageUrl: imageUrl // FAL doesn't have intermediate step
    };
  }

  return geminiService.generateImageAsset(promptText, imageBase64, aspectRatio, onProgress, segmentId);
};

/**
 * Generate video animation from image
 * Routes to the current provider's implementation
 */
export const generateVideoAnimation = async (
  promptText: string,
  imageBase64Data: string,
  mimeType: string,
  inputAspectRatio: string,
  segmentId?: string
): Promise<string> => {
  const provider = getCurrentProvider();

  if (provider === 'fal') {
    const { generateFalVideo } = await import('./falService');

    // For FAL, we need to convert base64 to data URL for upload
    const dataUrl = `data:${mimeType};base64,${imageBase64Data}`;

    // Enhance prompt for green screen retention
    const enhancedPrompt = `${promptText}. Keep the background solid green (#00FF00) for chroma keying. Do NOT change the camera angle.`;

    return generateFalVideo(enhancedPrompt, dataUrl, undefined, segmentId);
  }

  return geminiService.generateVeoAnimation(promptText, imageBase64Data, mimeType, inputAspectRatio, segmentId);
};

// Re-export types for convenience
export type { ImageGenerationResult, ImageGenerationProgressCallback };

