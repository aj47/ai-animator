
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
    duration: 5 // Default duration in seconds
  }));

  return result;
};

export const generateImageAsset = async (
  promptText: string, 
  imageBase64: string,
  aspectRatio: string,
  onProgress?: (msg: string) => void
): Promise<string> => {
  const ai = getAI();

  if (onProgress) onProgress("Generating green screen overlay...");

  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: {
      parts: [
        { text: `${promptText}. 
        
        TASK: Generate a high-quality, chroma-keyable AR overlay asset.

        INSTRUCTIONS:
        1. Analyze the provided input image to understand the 3D perspective, lighting conditions, and the position of the speaker/subject.
        2. Generate the requested educational graphic elements (charts, text, objects) positioned correctly in this 3D space relative to the subject (e.g. floating next to them, or in the foreground).
        3. CRITICAL: Render the entire background AND the original subject as a solid, flat CHROMA KEY GREEN (#00FF00).
        4. The final output must contain ONLY the new generated 3D elements rendered against the solid green background. Do NOT include the original person or room.
        5. Ensure the lighting on the generated elements matches the direction of light in the input image.
        6. EXTREMELY IMPORTANT: Ensure there is NO green spill, green reflections, or green ambiance on the generated object itself. The edges of the object must be sharp and clean against the green background to ensure perfect chroma keying.` },
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

  if (!imageUrl) throw new Error("Image generation failed: No image returned.");

  return imageUrl;
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
