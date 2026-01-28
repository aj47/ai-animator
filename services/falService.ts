/**
 * FAL AI Service
 * 
 * Provides image generation via FLUX and video generation via Kling models.
 * API key is stored in localStorage for client-side use.
 */

import { fal } from "@fal-ai/client";
import { logger } from "../utils/logger";

// LocalStorage key for FAL API key
const FAL_API_KEY_STORAGE = "fal_api_key";

// FAL Model identifiers
export const FAL_IMAGE_MODEL = "fal-ai/flux/dev";
export const FAL_VIDEO_MODEL = "fal-ai/kling-video/v1/standard/image-to-video";

/**
 * Set the FAL API key and store it in localStorage
 */
export const setFalApiKey = (apiKey: string): void => {
  localStorage.setItem(FAL_API_KEY_STORAGE, apiKey);
  fal.config({ credentials: apiKey });
  logger.api.request("setFalApiKey", { keyLength: apiKey.length });
};

/**
 * Get the FAL API key from localStorage
 */
export const getFalApiKey = (): string | null => {
  return localStorage.getItem(FAL_API_KEY_STORAGE);
};

/**
 * Check if FAL API key is configured
 */
export const checkFalApiKey = (): boolean => {
  const key = getFalApiKey();
  const hasKey = !!key && key.length > 0;
  logger.api.keyCheck(hasKey);
  return hasKey;
};

/**
 * Prompt user for FAL API key
 * Returns true if key was set, false if cancelled
 */
export const promptFalApiKey = (): boolean => {
  const apiKey = window.prompt(
    "Enter your FAL AI API key (get one at https://fal.ai/dashboard/keys):"
  );
  if (apiKey && apiKey.trim()) {
    setFalApiKey(apiKey.trim());
    return true;
  }
  return false;
};

/**
 * Initialize FAL client with stored API key
 * Call this on app startup
 */
export const initFalClient = (): boolean => {
  const apiKey = getFalApiKey();
  if (apiKey) {
    fal.config({ credentials: apiKey });
    return true;
  }
  return false;
};

// Image size mapping from aspect ratio to FAL format
const mapAspectRatioToFalSize = (
  aspectRatio: string
): "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9" => {
  switch (aspectRatio) {
    case "1:1":
      return "square_hd";
    case "3:4":
      return "portrait_4_3";
    case "9:16":
      return "portrait_16_9";
    case "4:3":
      return "landscape_4_3";
    case "16:9":
    default:
      return "landscape_16_9";
  }
};

/**
 * Generate an image using FAL FLUX model
 */
export const generateFalImage = async (
  prompt: string,
  aspectRatio: string = "16:9",
  onProgress?: (message: string) => void,
  segmentId?: string
): Promise<string> => {
  logger.imageGen.start(segmentId || "unknown", prompt);
  logger.api.request("fal.subscribe", { model: FAL_IMAGE_MODEL, prompt: prompt.substring(0, 100) });

  if (onProgress) onProgress("Generating image with FLUX...");

  const result = await fal.subscribe(FAL_IMAGE_MODEL, {
    input: {
      prompt,
      image_size: mapAspectRatioToFalSize(aspectRatio),
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && onProgress) {
        onProgress("Image generation in progress...");
      }
    },
  });

  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) {
    logger.imageGen.error(segmentId || "unknown", "No image URL returned");
    throw new Error("FAL image generation failed: No image returned");
  }

  logger.imageGen.success(segmentId || "unknown", imageUrl.length);
  logger.api.response("fal.subscribe", "success");

  return imageUrl;
};

/**
 * Upload a base64 image to FAL storage and get a public URL
 */
export const uploadBase64ToFalStorage = async (
  base64Data: string,
  mimeType: string = "image/png"
): Promise<string> => {
  logger.api.request("fal.storage.upload", { mimeType, dataLength: base64Data.length });

  // Convert base64 to Blob
  const byteString = atob(base64Data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeType });
  const file = new File([blob], "image.png", { type: mimeType });

  const url = await fal.storage.upload(file);
  logger.api.response("fal.storage.upload", "success");
  return url;
};

/**
 * Generate a video from an image using FAL Kling model
 *
 * @param prompt - Animation/motion description
 * @param imageUrl - URL of the source image (can be FAL storage URL or data URL)
 * @param segmentId - Optional segment ID for logging
 */
export const generateFalVideo = async (
  prompt: string,
  imageUrl: string,
  onProgress?: (message: string) => void,
  segmentId?: string
): Promise<string> => {
  logger.videoGen.start(segmentId || "unknown", prompt);

  // If imageUrl is a data URL, upload it to FAL storage first
  let finalImageUrl = imageUrl;
  if (imageUrl.startsWith("data:")) {
    if (onProgress) onProgress("Uploading image to FAL storage...");
    const base64Data = imageUrl.split(",")[1];
    const mimeType = imageUrl.match(/data:([^;]+);/)?.[1] || "image/png";
    finalImageUrl = await uploadBase64ToFalStorage(base64Data, mimeType);
  }

  const config = {
    model: FAL_VIDEO_MODEL,
    prompt,
    imageUrl: finalImageUrl.substring(0, 50) + "...",
  };
  logger.videoGen.config(config);
  logger.api.request("fal.subscribe", { model: FAL_VIDEO_MODEL, prompt });

  if (onProgress) onProgress("Generating video with Kling...");

  const result = await fal.subscribe(FAL_VIDEO_MODEL, {
    input: {
      prompt,
      image_url: finalImageUrl,
      duration: "5",
      negative_prompt: "blur, distort, and low quality",
      cfg_scale: 0.5,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        logger.videoGen.polling(segmentId || "unknown", 1);
        if (onProgress) onProgress("Video generation in progress...");
      }
    },
  });

  const videoUrl = result.data?.video?.url;
  if (!videoUrl) {
    logger.videoGen.error(segmentId || "unknown", "No video URL returned");
    throw new Error("FAL video generation failed: No video returned");
  }

  logger.videoGen.success(segmentId || "unknown", videoUrl);
  logger.api.response("fal.subscribe", "success");

  return videoUrl;
};

