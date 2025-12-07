
import { GoogleGenAI, Type } from "@google/genai";
import { ANALYSIS_MODEL, GENERATION_MODEL } from "../constants";
import { AnalysisResult, Segment } from "../types";
import { formatTime } from "../utils/videoUtils";
import { logger } from "../utils/logger";

// Helper to get fresh instance (handling key updates)
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const checkApiKey = async (): Promise<boolean> => {
  // Check for env variable first (local development)
  if (process.env.API_KEY || process.env.GEMINI_API_KEY) {
    logger.api.keyCheck(true);
    return true;
  }
  // Then check AI Studio environment
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    logger.api.keyCheck(hasKey);
    return hasKey;
  }
  logger.api.keyCheck(false);
  return false;
};

export const promptApiKey = async (): Promise<boolean> => {
  logger.api.request('promptApiKey', {});
  // In local dev with env key, nothing to prompt
  if (process.env.API_KEY || process.env.GEMINI_API_KEY) {
    return true;
  }
  const win = window as any;
  if (win.aistudio && win.aistudio.openSelectKey) {
    await win.aistudio.openSelectKey();
    return true;
  }
  return false;
};

export const analyzeVideoContent = async (videoBase64: string, mimeType: string): Promise<AnalysisResult> => {
  const ai = getAI();

  logger.api.request('analyzeVideoContent', { mimeType, videoBase64Length: videoBase64.length });

  const prompt = `
    You are an expert video editor and educational content strategist.

    TASK:
    Analyze the provided video to identify distinct "segments" or "topics" where the visual context or spoken subject changes significantly.
    For each segment, I need you to suggest a Green Screen Overlay Asset (AR Graphic) that would help explain that specific topic.

    INSTRUCTIONS:
    1. Identify 3-5 key moments/segments in the video.
    2. For each segment, provide:
       - 'timestamp': The best time (in seconds) to capture a frame and display the overlay.
       - 'topic': A short title for this segment.
       - 'description': A brief explanation of what is happening or being said.
       - 'prompt': A specific image generation prompt for a 3D, green-screen compatible element (chart, object, text) that matches this segment's topic.
       - 'animationPrompt': A short, clear description of how this specific element should animate (e.g., "Bar chart bars rising up", "Text typing on", "Object spinning slowly").
    3. Ensure the 'prompt' describes an isolated object suitable for AR compositing (e.g., "A floating 3D bar chart showing growth", "Gold trophy icon", "3D text 'SECRET REVEALED'").

    Return a JSON object with a visual summary, audio summary, and the list of segments.
  `;

  logger.prompt.analysis(prompt);

  const response = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: videoBase64 } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          visualSummary: { type: Type.STRING, description: "Overall visual description of the video" },
          audioSummary: { type: Type.STRING, description: "Overall summary of the spoken content" },
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                timestamp: { type: Type.NUMBER, description: "Time in seconds" },
                topic: { type: Type.STRING },
                description: { type: Type.STRING },
                prompt: { type: Type.STRING, description: "Image generation prompt for the overlay" },
                animationPrompt: { type: Type.STRING, description: "Motion guide for animating this asset" },
              },
              required: ["id", "timestamp", "topic", "description", "prompt", "animationPrompt"]
            }
          }
        },
        required: ["visualSummary", "audioSummary", "segments"]
      }
    }
  });

  logger.api.response('analyzeVideoContent', 'success');

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");

  const result = JSON.parse(text) as AnalysisResult;

  // Post-process to add formatted time, default status, and default duration
  result.segments = result.segments.map(s => ({
    ...s,
    formattedTime: formatTime(s.timestamp),
    status: 'idle',
    duration: 5 // Default duration of 5 seconds
  }));

  logger.prompt.analysisResult(result);

  // Log each segment's prompts
  result.segments.forEach(s => {
    logger.prompt.imagePrompt(s.id, s.prompt);
    logger.prompt.animationPrompt(s.id, s.animationPrompt);
  });

  return result;
};

/**
 * Step 1: Generate a scene with overlay graphics placed in the correct positions
 * This recreates the original scene and adds the new diagrams/illustrations/highlights
 */
export const generateSceneWithOverlay = async (
  promptText: string,
  imageBase64: string,
  aspectRatio: string,
  onProgress?: (msg: string) => void,
  segmentId?: string
): Promise<string> => {
  const ai = getAI();

  logger.imageGen.step1Start(segmentId || 'unknown');
  logger.api.request('generateSceneWithOverlay', { promptLength: promptText.length, aspectRatio });
  if (onProgress) onProgress("Step 1: Recreating scene with overlay graphics...");

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: {
      parts: [
        { text: `TASK: Add the following educational overlay graphic to this scene:

**GRAPHIC TO GENERATE: ${promptText}**

INSTRUCTIONS:
1. Analyze the input image to understand the 3D perspective, lighting, camera angle, and position of all elements.
2. KEEP the original scene EXACTLY as-is - same speaker/subject, background, and all original elements.
3. ADD ONLY the specific graphic described above: "${promptText}"
4. Position this new graphic floating naturally in the scene - next to the subject or in an unobstructed area.
5. Make sure the new graphic's lighting, shadows, and perspective match the scene.
6. The graphic should look like an AR overlay that exists naturally in the 3D space.

IMPORTANT: The output must clearly show "${promptText}" as a distinct overlay element on top of the original scene.` },
        { inlineData: { mimeType: 'image/png', data: imageBase64 } }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any
      }
    }
  });

  let imageUrl = "";
  if (response.candidates && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        imageUrl = `data:${part.inlineData.mimeType};base64,${base64Data}`;
        break;
      }
    }
  }

  if (!imageUrl) {
    logger.api.error('generateSceneWithOverlay', 'No image returned');
    throw new Error("Scene recreation failed: No image returned.");
  }

  logger.imageGen.step1Complete(segmentId || 'unknown');
  logger.api.response('generateSceneWithOverlay', 'success');

  return imageUrl;
};

/**
 * Step 2: Remove all original elements and replace background with green screen
 * Takes the scene with overlays and isolates only the new graphics on green screen
 * Now receives both the original image and the prompt for better comparison
 */
export const generateGreenScreenBackground = async (
  sceneImageBase64: string,
  originalImageBase64: string,
  promptText: string,
  aspectRatio: string,
  onProgress?: (msg: string) => void,
  segmentId?: string
): Promise<string> => {
  const ai = getAI();

  logger.imageGen.step2Start(segmentId || 'unknown');
  logger.api.request('generateGreenScreenBackground', { aspectRatio, promptLength: promptText.length });
  if (onProgress) onProgress("Step 2: Generating green screen background...");

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: {
      parts: [
        { text: `TASK: Extract ONLY the newly added graphics and place them on a green screen background.

        YOU ARE PROVIDED WITH TWO IMAGES:
        - IMAGE 1 (first image): The ORIGINAL scene from the video - this shows the original background, people, furniture, etc.
        - IMAGE 2 (second image): The MODIFIED scene with new educational graphics added on top.

        THE NEW GRAPHICS THAT WERE ADDED ARE: ${promptText}

        INSTRUCTIONS:
        1. COMPARE the two images carefully to identify EXACTLY what elements are NEW (exist only in Image 2).
        2. The new elements are: ${promptText}
        3. REMOVE EVERYTHING that appears in Image 1 - this includes ALL people, backgrounds, furniture, walls, floors, and any original scene elements.
        4. KEEP ONLY the NEW graphics/overlays that were added (the elements described above).
        5. Replace the ENTIRE background with a solid, flat CHROMA KEY GREEN (#00FF00).
        6. The final output must contain ONLY the newly generated graphics rendered against the solid green background.
        7. EXTREMELY IMPORTANT: Ensure there is NO green spill, green reflections, or green tint on the graphics themselves. The edges must be sharp and clean for perfect chroma keying.
        8. Maintain the exact position, size, and perspective of the graphics as they appeared in Image 2.
        9. If you see ANY remnants of the original scene (people, background, etc.), you MUST remove them completely.` },
        { inlineData: { mimeType: 'image/png', data: originalImageBase64 } },
        { inlineData: { mimeType: 'image/png', data: sceneImageBase64 } }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any
      }
    }
  });

  let imageUrl = "";
  if (response.candidates && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        imageUrl = `data:${part.inlineData.mimeType};base64,${base64Data}`;
        break;
      }
    }
  }

  if (!imageUrl) {
    logger.api.error('generateGreenScreenBackground', 'No image returned');
    throw new Error("Green screen generation failed: No image returned.");
  }

  logger.imageGen.step2Complete(segmentId || 'unknown');
  logger.api.response('generateGreenScreenBackground', 'success');

  return imageUrl;
};

// Result type for the two-step image generation
export interface ImageGenerationResult {
  finalImageUrl: string; // The green screen result
  intermediateImageUrl: string; // The scene with overlay (Step 1 result)
}

// Progress callback with step info
export interface ImageGenerationProgressCallback {
  (step: 1 | 2, message: string, intermediateImageUrl?: string): void;
}

/**
 * Main function: Two-step image generation process
 * Step 1: Recreate scene with overlay graphics in correct positions
 * Step 2: Remove original elements and replace background with green screen
 */
export const generateImageAsset = async (
  promptText: string,
  imageBase64: string,
  aspectRatio: string,
  onProgress?: ImageGenerationProgressCallback,
  segmentId?: string
): Promise<ImageGenerationResult> => {
  logger.imageGen.start(segmentId || 'unknown', promptText);

  // Step 1: Generate scene with overlays positioned correctly
  if (onProgress) onProgress(1, "Step 1/2: Recreating scene with overlay graphics...");

  const sceneWithOverlay = await generateSceneWithOverlay(
    promptText,
    imageBase64,
    aspectRatio,
    undefined, // onProgress for step functions is unused, we handle at this level
    segmentId
  );

  // Notify step 1 complete with intermediate image
  if (onProgress) onProgress(1, "Step 1/2: Complete! Scene with overlay generated.", sceneWithOverlay);

  // Extract base64 from the data URL for step 2
  const sceneBase64 = sceneWithOverlay.split(',')[1];

  // Step 2: Replace background with green screen
  // Pass both the original image and prompt so step 2 can compare and know what to keep
  if (onProgress) onProgress(2, "Step 2/2: Generating green screen background...", sceneWithOverlay);

  const greenScreenResult = await generateGreenScreenBackground(
    sceneBase64,
    imageBase64,
    promptText,
    aspectRatio,
    undefined,
    segmentId
  );

  if (onProgress) onProgress(2, "Step 2/2: Complete! Green screen applied.", sceneWithOverlay);

  logger.imageGen.success(segmentId || 'unknown', greenScreenResult.length);

  return {
    finalImageUrl: greenScreenResult,
    intermediateImageUrl: sceneWithOverlay
  };
};

export const generateVeoAnimation = async (
  promptText: string,
  imageBase64Data: string, // Pure base64 data without prefix
  mimeType: string,
  inputAspectRatio: string,
  segmentId?: string
): Promise<string> => {
  const ai = getAI();

  logger.videoGen.start(segmentId || 'unknown', promptText);

  // Veo only supports 16:9 (Landscape) or 9:16 (Portrait).
  // We map the input aspect ratio to the closest supported format.
  let veoAspectRatio = '16:9';
  if (inputAspectRatio === '9:16' || inputAspectRatio === '3:4') {
    veoAspectRatio = '9:16';
  }

  const config = {
    model: 'veo-3.0-generate-001',
    numberOfVideos: 1,
    resolution: '720p',
    aspectRatio: veoAspectRatio,
    inputAspectRatio,
    mimeType,
  };
  logger.videoGen.config(config);

  const fullPrompt = `${promptText}. Keep the background solid green (#00FF00) for chroma keying. Do NOT change the camera angle.`;
  logger.api.request('generateVideos', { prompt: fullPrompt, config });

  let operation = await ai.models.generateVideos({
    model: 'veo-3.0-generate-001',
    prompt: fullPrompt,
    image: {
      imageBytes: imageBase64Data,
      mimeType: mimeType
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: veoAspectRatio as any
    }
  });

  let pollAttempt = 0;
  while (!operation.done) {
    pollAttempt++;
    logger.videoGen.polling(segmentId || 'unknown', pollAttempt);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) {
    logger.videoGen.error(segmentId || 'unknown', 'No video URI returned');
    throw new Error("Video generation failed");
  }

  logger.api.request('fetchVideo', { videoUri: videoUri.substring(0, 50) + '...' });

  // Fetch the actual video bytes using the API key
  const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  if (!response.ok) {
    logger.videoGen.error(segmentId || 'unknown', `Failed to download: ${response.status}`);
    throw new Error("Failed to download generated video");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  logger.videoGen.success(segmentId || 'unknown', objectUrl);
  logger.api.response('generateVideos', 'success');

  return objectUrl;
};
