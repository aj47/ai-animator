
import { GoogleGenAI, Type } from "@google/genai";
import { ANALYSIS_MODEL, GENERATION_MODEL } from "../constants";
import { AnalysisResult, Segment } from "../types";
import { formatTime } from "../utils/videoUtils";

// Helper to get fresh instance (handling key updates)
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const checkApiKey = async (): Promise<boolean> => {
  // Check for env variable first (local development)
  if (process.env.API_KEY || process.env.GEMINI_API_KEY) {
    return true;
  }
  // Then check AI Studio environment
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    return await win.aistudio.hasSelectedApiKey();
  }
  return false;
};

export const promptApiKey = async (): Promise<boolean> => {
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
  onProgress?: (msg: string) => void
): Promise<string> => {
  const ai = getAI();

  if (onProgress) onProgress("Step 1: Recreating scene with overlay graphics...");

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: {
      parts: [
        { text: `${promptText}.

        TASK: Recreate this scene with new educational overlay graphics positioned correctly.

        INSTRUCTIONS:
        1. Carefully analyze the provided input image to understand the 3D perspective, lighting conditions, camera angle, and the position of all elements (speaker, background, objects).
        2. RECREATE the entire scene faithfully - keep the speaker/subject, the background, and all original elements.
        3. ADD the requested educational graphic elements (charts, text, diagrams, highlights, illustrations) positioned correctly in this 3D space.
        4. Position the new graphics in a way that makes sense spatially - floating next to the subject, in the foreground, or as overlays that don't obscure the main subject.
        5. Ensure the lighting, shadows, and perspective of the new elements match the original scene perfectly.
        6. The output should look like an augmented reality view where the new graphics exist naturally in the original scene.` },
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

  if (!imageUrl) throw new Error("Scene recreation failed: No image returned.");

  return imageUrl;
};

/**
 * Step 2: Remove all original elements and replace background with green screen
 * Takes the scene with overlays and isolates only the new graphics on green screen
 */
export const generateGreenScreenBackground = async (
  sceneImageBase64: string,
  aspectRatio: string,
  onProgress?: (msg: string) => void
): Promise<string> => {
  const ai = getAI();

  if (onProgress) onProgress("Step 2: Generating green screen background...");

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: {
      parts: [
        { text: `TASK: Create a chroma-keyable overlay by replacing the background with green screen.

        INSTRUCTIONS:
        1. Analyze the provided image which contains a scene with educational graphics/overlays (charts, text, diagrams, etc.).
        2. IDENTIFY all the NEW graphics elements that were added to the scene (charts, 3D text, diagrams, illustrations, icons, etc.).
        3. REMOVE the original scene elements completely - remove any people, the original background, furniture, walls, everything from the original video frame.
        4. KEEP ONLY the educational graphics/overlay elements.
        5. Replace the ENTIRE background with a solid, flat CHROMA KEY GREEN (#00FF00).
        6. The final output must contain ONLY the new generated graphics rendered against the solid green background.
        7. EXTREMELY IMPORTANT: Ensure there is NO green spill, green reflections, or green tint on the graphics themselves. The edges must be sharp and clean for perfect chroma keying.
        8. Maintain the exact position, size, and perspective of the graphics as they appeared in the input image.` },
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

  if (!imageUrl) throw new Error("Green screen generation failed: No image returned.");

  return imageUrl;
};

/**
 * Main function: Two-step image generation process
 * Step 1: Recreate scene with overlay graphics in correct positions
 * Step 2: Remove original elements and replace background with green screen
 */
export const generateImageAsset = async (
  promptText: string,
  imageBase64: string,
  aspectRatio: string,
  onProgress?: (msg: string) => void
): Promise<string> => {
  // Step 1: Generate scene with overlays positioned correctly
  const sceneWithOverlay = await generateSceneWithOverlay(
    promptText,
    imageBase64,
    aspectRatio,
    onProgress
  );

  // Extract base64 from the data URL for step 2
  const sceneBase64 = sceneWithOverlay.split(',')[1];

  // Step 2: Replace background with green screen
  const greenScreenResult = await generateGreenScreenBackground(
    sceneBase64,
    aspectRatio,
    onProgress
  );

  return greenScreenResult;
};

export const generateVeoAnimation = async (
  promptText: string,
  imageBase64Data: string, // Pure base64 data without prefix
  mimeType: string,
  inputAspectRatio: string
): Promise<string> => {
  const ai = getAI();

  // Veo only supports 16:9 (Landscape) or 9:16 (Portrait).
  // We map the input aspect ratio to the closest supported format.
  let veoAspectRatio = '16:9';
  if (inputAspectRatio === '9:16' || inputAspectRatio === '3:4') {
    veoAspectRatio = '9:16';
  }

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `${promptText}. Keep the background solid green (#00FF00) for chroma keying. Do NOT change the camera angle.`,
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

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed");

  // Fetch the actual video bytes using the API key
  const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  if (!response.ok) throw new Error("Failed to download generated video");
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
