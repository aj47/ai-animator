
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:video/mp4;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const extractFrameFromVideo = (videoUrl: string, time = 0): Promise<{ base64: string; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    // Only set crossOrigin for non-blob URLs
    if (!videoUrl.startsWith('blob:')) {
      video.crossOrigin = "anonymous";
    }

    // Add timeout to prevent hanging forever
    const timeout = setTimeout(() => {
      console.error('[extractFrameFromVideo] Timeout waiting for video seek at time:', time);
      video.src = "";
      reject(new Error(`Timeout extracting frame at ${time}s`));
    }, 15000);

    video.onloadedmetadata = () => {
      console.log('[extractFrameFromVideo] Metadata loaded, duration:', video.duration, 'seeking to:', time);
      // Ensure we don't seek past the end
      video.currentTime = Math.min(time, video.duration);
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      console.log('[extractFrameFromVideo] Seeked to:', video.currentTime);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          const base64 = dataUrl.split(',')[1];
          resolve({
            base64,
            width: video.videoWidth,
            height: video.videoHeight
          });
        } else {
          reject(new Error("Could not get canvas context"));
        }
      } catch (e) {
        console.error('[extractFrameFromVideo] Error drawing frame:', e);
        reject(e);
      } finally {
        // Clean up
        video.src = "";
        video.load();
      }
    };

    video.onerror = (e) => {
      clearTimeout(timeout);
      const mediaError = video.error;
      const errorDetails = mediaError ? {
        code: mediaError.code,
        message: mediaError.message,
        // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
        codeDescription: ['', 'MEDIA_ERR_ABORTED', 'MEDIA_ERR_NETWORK', 'MEDIA_ERR_DECODE', 'MEDIA_ERR_SRC_NOT_SUPPORTED'][mediaError.code] || 'UNKNOWN'
      } : null;
      console.error('[extractFrameFromVideo] Video error:', e);
      console.error('[extractFrameFromVideo] Media error details:', errorDetails);
      console.error('[extractFrameFromVideo] Video URL:', videoUrl.substring(0, 100));
      reject(new Error(`Error loading video for frame extraction: ${errorDetails?.codeDescription || 'Unknown error'}`));
    };

    // Set src after all handlers are attached
    console.log('[extractFrameFromVideo] Setting video src:', videoUrl.substring(0, 100));
    video.src = videoUrl;
  });
};

export const getClosestAspectRatio = (width: number, height: number): string => {
  const ratio = width / height;
  
  const supportedRatios = [
    { id: "1:1", value: 1 },
    { id: "3:4", value: 3/4 },
    { id: "4:3", value: 4/3 },
    { id: "9:16", value: 9/16 },
    { id: "16:9", value: 16/9 },
  ];

  // Find the ratio with the smallest difference
  const closest = supportedRatios.reduce((prev, curr) => {
    return (Math.abs(curr.value - ratio) < Math.abs(prev.value - ratio) ? curr : prev);
  });

  return closest.id;
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
