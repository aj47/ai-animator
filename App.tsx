
import React, { useState, useEffect, useRef } from 'react';
import { AppState, AnalysisResult, Segment, GenerationPipelineState, ChromaKeySettings, ImageGenerationProgress, OverlayTransform } from './types';
import PromptSelector from './components/PromptSelector';
import VeoGenerator from './components/VeoGenerator';
import TimelineEditor from './components/TimelineEditor';
import { fileToBase64, extractFrameFromVideo, getClosestAspectRatio, formatTime } from './utils/videoUtils';
import { analyzeVideoContent, generateImageAsset, generateVeoAnimation, checkApiKey, promptApiKey } from './services/geminiService';
import { detectDominantGreenFromDataUrl } from './utils/chromaKey';
import { DEFAULT_CHROMA_KEY_SETTINGS } from './types';
import { Zap, AlertTriangle, Film } from 'lucide-react';
import { logger } from './utils/logger';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [videoAspectRatio, setVideoAspectRatio] = useState<string>("16:9");

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);

  // Generation pipeline state
  const [pipelineState, setPipelineState] = useState<GenerationPipelineState>({
    isRunning: false,
    isPaused: false,
    currentPhase: 'idle',
    progress: { promptsGenerated: 0, imagesGenerated: 0, videosGenerated: 0, totalSegments: 0 }
  });
  const stopGenerationRef = useRef(false);

  useEffect(() => {
    checkApiKey().then(setHasKey);
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectKey = async () => {
    logger.ui.buttonClick('connectKey');
    try {
        const success = await promptApiKey();
        if (success) setHasKey(true);
    } catch (e) {
        console.error("Failed to select key", e);
        logger.api.error('promptApiKey', e);
    }
  };

  const handleStopGeneration = () => {
    logger.ui.buttonClick('stopGeneration');
    logger.pipeline.stopped();
    stopGenerationRef.current = true;
    setPipelineState(prev => ({ ...prev, isRunning: false, isPaused: true }));
  };

  // Resume generation from where it left off
  const handleResumeGeneration = async () => {
    if (!analysis || !videoUrl) return;

    logger.ui.buttonClick('resumeGeneration');
    logger.pipeline.resumed();
    stopGenerationRef.current = false;
    setPipelineState(prev => ({ ...prev, isRunning: true, isPaused: false }));

    // Continue the automatic pipeline with current state
    await runAutomaticPipeline(analysis, videoUrl, videoAspectRatio);
  };

  const handleFileSelect = async (file: File) => {
    logger.ui.fileSelected(file.name, file.size, file.type);

    if (!hasKey) {
        await handleConnectKey();
        const keyNow = await checkApiKey();
        if(!keyNow) return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    const prevState = state;
    setState(AppState.ANALYZING);
    logger.ui.stateChange(prevState, AppState.ANALYZING);
    setError(null);
    setStatusMessage("Pre-processing video...");
    stopGenerationRef.current = false;

    try {
      // 1. Get Aspect Ratio from initial frame (0s)
      logger.api.request('extractFrameFromVideo', { timestamp: 0 });
      const { width, height } = await extractFrameFromVideo(url, 0);
      const aspectRatio = getClosestAspectRatio(width, height);
      setVideoAspectRatio(aspectRatio);
      logger.api.response('extractFrameFromVideo', `${width}x${height}, aspect: ${aspectRatio}`);

      // 2. Prepare Base64 for Gemini
      logger.api.request('fileToBase64', { fileName: file.name });
      const base64Video = await fileToBase64(file);
      logger.api.response('fileToBase64', `${base64Video.length} chars`);

      // 3. Analyze
      setStatusMessage("Gemini is analyzing the timeline for topics...");
      const result = await analyzeVideoContent(base64Video, file.type);
      setAnalysis(result);
      logger.state.analysisUpdate(result.segments.length);
      setState(AppState.IDLE); // Stay on timeline landing
      logger.ui.stateChange(AppState.ANALYZING, AppState.IDLE);

      // 4. Initialize pipeline state
      setPipelineState({
        isRunning: true,
        isPaused: false,
        currentPhase: 'prompts',
        progress: { promptsGenerated: result.segments.length, imagesGenerated: 0, videosGenerated: 0, totalSegments: result.segments.length }
      });
      logger.pipeline.start(result.segments.length);

      // 5. Start automatic generation pipeline
      await runAutomaticPipeline(result, url, aspectRatio);

    } catch (err: any) {
      console.error(err);
      logger.api.error('handleFileSelect', err);
      setError(err.message || "Failed to analyze video.");
      setState(AppState.ERROR);
      logger.ui.stateChange(state, AppState.ERROR);
    }
  };

  // Automatic generation pipeline - runs after video analysis
  const runAutomaticPipeline = async (analysisResult: AnalysisResult, url: string, aspectRatio: string) => {
    const segments = analysisResult.segments;

    // Phase 1: Generate all images
    logger.pipeline.phaseChange('images');
    setPipelineState(prev => ({ ...prev, currentPhase: 'images' }));

    for (let i = 0; i < segments.length; i++) {
      if (stopGenerationRef.current) break;

      const segment = segments[i];
      if (segment.status !== 'idle') continue;

      try {
        // Update status to generating with initial progress
        const initialProgress: ImageGenerationProgress = { step: 1, message: 'Starting image generation...' };
        logger.state.segmentStatusChange(segment.id, segment.status, 'generating-image');
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-image', generationProgress: initialProgress } : s)
        }) : null);

        const { base64 } = await extractFrameFromVideo(url, segment.timestamp);

        // Progress callback to update segment with step info and intermediate image
        const onProgress = (step: 1 | 2, message: string, intermediateImageUrl?: string) => {
          const progress: ImageGenerationProgress = { step, message, intermediateImageUrl };
          setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, generationProgress: progress } : s)
          }) : null);
        };

        const result = await generateImageAsset(segment.prompt, base64, aspectRatio, onProgress, segment.id);

        // Detect dominant green color for chroma key
        const dominantGreen = await detectDominantGreenFromDataUrl(result.finalImageUrl);
        logger.imageGen.chromaDetected(segment.id, dominantGreen);
        const chromaKey = {
          ...DEFAULT_CHROMA_KEY_SETTINGS,
          keyColor: dominantGreen
        };

        logger.state.segmentStatusChange(segment.id, 'generating-image', 'image-success');
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? {
            ...s,
            status: 'image-success',
            imageUrl: result.finalImageUrl,
            chromaKey,
            generationProgress: { step: 2, message: 'Complete!', intermediateImageUrl: result.intermediateImageUrl }
          } : s)
        }) : null);

        setPipelineState(prev => {
          const newProgress = { ...prev.progress, imagesGenerated: prev.progress.imagesGenerated + 1 };
          logger.pipeline.progress(newProgress);
          return { ...prev, progress: newProgress };
        });

      } catch (err: any) {
        console.error(`Failed to generate image for segment ${segment.id}:`, err);
        logger.imageGen.error(segment.id, err);
        logger.state.segmentStatusChange(segment.id, 'generating-image', 'error');
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message, generationProgress: undefined } : s)
        }) : null);
      }
    }

    if (stopGenerationRef.current) {
      setPipelineState(prev => ({ ...prev, isRunning: false }));
      return;
    }

    // Phase 2: Generate all videos
    logger.pipeline.phaseChange('videos');
    setPipelineState(prev => ({ ...prev, currentPhase: 'videos' }));

    // Get updated analysis state for video generation
    const currentAnalysis = await new Promise<AnalysisResult | null>(resolve => {
      setAnalysis(prev => {
        resolve(prev);
        return prev;
      });
    });

    if (!currentAnalysis) return;

    for (let i = 0; i < currentAnalysis.segments.length; i++) {
      if (stopGenerationRef.current) break;

      const segment = currentAnalysis.segments[i];
      if (segment.status !== 'image-success' || !segment.imageUrl) continue;

      try {
        logger.state.segmentStatusChange(segment.id, segment.status, 'generating-video');
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-video' } : s)
        }) : null);

        const base64Data = segment.imageUrl.split(',')[1];
        const mimeType = segment.imageUrl.split(':')[1].split(';')[0];
        const videoUri = await generateVeoAnimation(segment.animationPrompt, base64Data, mimeType, aspectRatio, segment.id);

        logger.state.segmentStatusChange(segment.id, 'generating-video', 'video-success');
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'video-success', videoUrl: videoUri } : s)
        }) : null);

        setPipelineState(prev => {
          const newProgress = { ...prev.progress, videosGenerated: prev.progress.videosGenerated + 1 };
          logger.pipeline.progress(newProgress);
          return { ...prev, progress: newProgress };
        });

      } catch (err: any) {
        console.error(`Failed to generate video for segment ${segment.id}:`, err);
        logger.videoGen.error(segment.id, err);
        logger.state.segmentStatusChange(segment.id, 'generating-video', 'error');
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message } : s)
        }) : null);
      }
    }

    // Complete
    logger.pipeline.phaseChange('complete');
    logger.pipeline.complete();
    setPipelineState(prev => ({ ...prev, isRunning: false, currentPhase: 'complete' }));
  };

  const handleGenerateSegmentImage = async (segment: Segment): Promise<string | null> => {
    logger.ui.buttonClick(`generateImage-${segment.id}`);
    logger.imageGen.start(segment.id, segment.prompt);

    if (!analysis || !videoUrl) return null;

    // Check key
    if (!await checkApiKey()) {
        const success = await promptApiKey();
        if(!success) return null;
    }

    // Update Segment Status with initial progress
    const initialProgress: ImageGenerationProgress = { step: 1, message: 'Starting image generation...' };
    logger.state.segmentStatusChange(segment.id, segment.status, 'generating-image');
    setAnalysis(prev => prev ? ({
        ...prev,
        segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-image', generationProgress: initialProgress } : s)
    }) : null);

    // Also update active segment if in detail view
    if (activeSegment && activeSegment.id === segment.id) {
        setActiveSegment(prev => prev ? ({ ...prev, status: 'generating-image', generationProgress: initialProgress }) : null);
    }

    try {
        const { base64 } = await extractFrameFromVideo(videoUrl, segment.timestamp);

        // Progress callback to update segment with step info and intermediate image
        const onProgress = (step: 1 | 2, message: string, intermediateImageUrl?: string) => {
          const progress: ImageGenerationProgress = { step, message, intermediateImageUrl };
          setAnalysis(prev => prev ? ({
              ...prev,
              segments: prev.segments.map(s => s.id === segment.id ? { ...s, generationProgress: progress } : s)
          }) : null);
          // Also update active segment if in detail view
          if (activeSegment && activeSegment.id === segment.id) {
              setActiveSegment(prev => prev ? ({ ...prev, generationProgress: progress }) : null);
          }
        };

        const result = await generateImageAsset(segment.prompt, base64, videoAspectRatio, onProgress, segment.id);

        // Detect dominant green color for chroma key
        const dominantGreen = await detectDominantGreenFromDataUrl(result.finalImageUrl);
        logger.imageGen.chromaDetected(segment.id, dominantGreen);
        const chromaKey = {
          ...DEFAULT_CHROMA_KEY_SETTINGS,
          keyColor: dominantGreen
        };

        const finalProgress: ImageGenerationProgress = {
          step: 2,
          message: 'Complete!',
          intermediateImageUrl: result.intermediateImageUrl
        };

        logger.state.segmentStatusChange(segment.id, 'generating-image', 'image-success');
        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? {
              ...s,
              status: 'image-success',
              imageUrl: result.finalImageUrl,
              chromaKey,
              generationProgress: finalProgress
            } : s)
        }) : null);

        // If this was triggered from Detail view, update active segment
        if (activeSegment && activeSegment.id === segment.id) {
            setActiveSegment(prev => prev ? ({
              ...prev,
              status: 'image-success',
              imageUrl: result.finalImageUrl,
              chromaKey,
              generationProgress: finalProgress
            }) : null);
        }

        return result.finalImageUrl;

    } catch (err: any) {
        console.error(err);
        logger.imageGen.error(segment.id, err);
        logger.state.segmentStatusChange(segment.id, 'generating-image', 'error');
        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message, generationProgress: undefined } : s)
        }) : null);
        if (activeSegment && activeSegment.id === segment.id) {
            setActiveSegment(prev => prev ? ({ ...prev, status: 'error', error: err.message, generationProgress: undefined }) : null);
        }
        return null;
    }
  };

  const handleGenerateSegmentVideo = async (segment: Segment, overrideImageUrl?: string): Promise<string | null> => {
    logger.ui.buttonClick(`generateVideo-${segment.id}`);
    logger.videoGen.start(segment.id, segment.animationPrompt);

    // We can allow an override URL to enable chaining from image generation immediately
    const imageUrl = overrideImageUrl || segment.imageUrl;

    if (!imageUrl) {
      logger.videoGen.error(segment.id, 'No image URL provided');
      return null;
    }

    // Check key
    if (!await checkApiKey()) {
        const success = await promptApiKey();
        if(!success) return null;
    }

    // Update Status
    logger.state.segmentStatusChange(segment.id, segment.status, 'generating-video');
    setAnalysis(prev => prev ? ({
        ...prev,
        segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-video' } : s)
    }) : null);

    // Also update active segment if we are in detail view
    if (activeSegment && activeSegment.id === segment.id) {
        setActiveSegment(prev => prev ? ({...prev, status: 'generating-video'}) : null);
    }

    try {
        // Extract base64 data from the imageUrl (data URI)
        const base64Data = imageUrl.split(',')[1];
        const mimeType = imageUrl.split(':')[1].split(';')[0]; // likely image/png

        // Pass videoAspectRatio to respect input dimensions
        const videoUri = await generateVeoAnimation(segment.animationPrompt, base64Data, mimeType, videoAspectRatio, segment.id);

        logger.state.segmentStatusChange(segment.id, 'generating-video', 'video-success');
        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'video-success', videoUrl: videoUri } : s)
        }) : null);

        if (activeSegment && activeSegment.id === segment.id) {
            setActiveSegment(prev => prev ? ({...prev, status: 'video-success', videoUrl: videoUri}) : null);
        }

        return videoUri;

    } catch (err: any) {
        console.error(err);
        logger.videoGen.error(segment.id, err);
        logger.state.segmentStatusChange(segment.id, 'generating-video', 'error');
        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message } : s)
        }) : null);
        return null;
    }
  };

  const handleBatchGenerateImages = async () => {
      logger.ui.buttonClick('batchGenerateImages');
      if (!analysis || !videoUrl) return;
      setIsBatchProcessing(true);
      stopGenerationRef.current = false;
      setPipelineState(prev => ({ ...prev, isPaused: false }));

      const segmentsToProcess = analysis.segments.filter(s => s.status === 'idle');
      logger.pipeline.start(segmentsToProcess.length);

      // Parallel execution using Promise.all
      const promises = segmentsToProcess.map(segment => handleGenerateSegmentImage(segment));
      await Promise.all(promises);

      setIsBatchProcessing(false);
      logger.pipeline.complete();
  };

  const handleBatchAnimate = async () => {
    logger.ui.buttonClick('batchAnimate');
    if (!analysis) return;
    setIsBatchProcessing(true);
    stopGenerationRef.current = false;
    setPipelineState(prev => ({ ...prev, isPaused: false }));

    const segmentsToProcess = analysis.segments.filter(s => s.status === 'image-success');
    logger.pipeline.start(segmentsToProcess.length);

    // Parallel execution
    const promises = segmentsToProcess.map(segment => handleGenerateSegmentVideo(segment));
    await Promise.all(promises);

    setIsBatchProcessing(false);
    logger.pipeline.complete();
  };

  const handleFullAutoGenerate = async () => {
    logger.ui.buttonClick('fullAutoGenerate');
    if (!analysis) return;
    setIsBatchProcessing(true);
    stopGenerationRef.current = false;
    setPipelineState(prev => ({ ...prev, isPaused: false }));

    // Process all segments that aren't already done
    const segments = analysis.segments;
    logger.pipeline.start(segments.length);

    const promises = segments.map(async (segment) => {
        // Skip if already has video
        if (segment.status === 'video-success' || segment.status === 'generating-video') return;

        let currentImgUrl = segment.imageUrl;

        // Step 1: Generate Image if needed
        if (segment.status === 'idle' || segment.status === 'error' || !currentImgUrl) {
           currentImgUrl = await handleGenerateSegmentImage(segment);
        }

        // Step 2: Generate Video if we have an image
        if (currentImgUrl) {
            await handleGenerateSegmentVideo(segment, currentImgUrl);
        }
    });

    await Promise.all(promises);
    setIsBatchProcessing(false);
    logger.pipeline.complete();
  };

  const handleViewSegment = (segment: Segment) => {
    logger.ui.segmentSelected(segment.id);
    setActiveSegment(segment);
    const prevState = state;
    setState(AppState.DETAIL_VIEW);
    logger.ui.stateChange(prevState, AppState.DETAIL_VIEW);
  };

  const handleBackToTimeline = () => {
    logger.ui.buttonClick('backToTimeline');
    setActiveSegment(null);
    const prevState = state;
    setState(AppState.IDLE); // Go back to timeline landing
    logger.ui.stateChange(prevState, AppState.IDLE);
  };

  const handleOpenTimelineEditor = () => {
    logger.ui.buttonClick('openTimelineEditor');
    logger.ui.editorOpen();
    const prevState = state;
    setState(AppState.TIMELINE_EDITOR);
    logger.ui.stateChange(prevState, AppState.TIMELINE_EDITOR);
  };

  const handleBackFromEditor = () => {
    logger.ui.buttonClick('backFromEditor');
    logger.ui.editorClose();
    const prevState = state;
    setState(AppState.IDLE); // Go back to timeline landing
    logger.ui.stateChange(prevState, AppState.IDLE);
  };

  const handleUpdateSegmentPrompts = (segmentId: string, prompt: string, animationPrompt: string) => {
    logger.prompt.updated(segmentId, prompt, animationPrompt);
    setAnalysis(prev => prev ? ({
      ...prev,
      segments: prev.segments.map(s =>
        s.id === segmentId ? { ...s, prompt, animationPrompt } : s
      )
    }) : null);

    // Also update active segment if viewing it
    if (activeSegment && activeSegment.id === segmentId) {
      setActiveSegment(prev => prev ? ({ ...prev, prompt, animationPrompt }) : null);
    }
  };

  const handleRegenerateImage = async (segment: Segment) => {
    logger.ui.buttonClick(`regenerateImage-${segment.id}`);
    // Get the latest segment data from analysis (in case prompts were just updated)
    const latestSegment = analysis?.segments.find(s => s.id === segment.id);
    if (!latestSegment) return;

    // Clear existing image/video and regenerate
    logger.state.segmentStatusChange(segment.id, segment.status, 'idle');
    setAnalysis(prev => prev ? ({
      ...prev,
      segments: prev.segments.map(s =>
        s.id === segment.id ? { ...s, imageUrl: undefined, videoUrl: undefined, status: 'idle' } : s
      )
    }) : null);

    if (activeSegment && activeSegment.id === segment.id) {
      setActiveSegment(prev => prev ? ({ ...prev, imageUrl: undefined, videoUrl: undefined, status: 'idle' }) : null);
    }

    // Generate new image
    await handleGenerateSegmentImage({ ...latestSegment, status: 'idle', imageUrl: undefined, videoUrl: undefined });
  };

  const handleRegenerateVideo = async (segment: Segment) => {
    logger.ui.buttonClick(`regenerateVideo-${segment.id}`);
    // Get the latest segment data from analysis
    const latestSegment = analysis?.segments.find(s => s.id === segment.id);
    if (!latestSegment || !latestSegment.imageUrl) return;

    // Clear existing video and regenerate (keep the image)
    logger.state.segmentStatusChange(segment.id, segment.status, 'image-success');
    setAnalysis(prev => prev ? ({
      ...prev,
      segments: prev.segments.map(s =>
        s.id === segment.id ? { ...s, videoUrl: undefined, status: 'image-success' } : s
      )
    }) : null);

    if (activeSegment && activeSegment.id === segment.id) {
      setActiveSegment(prev => prev ? ({ ...prev, videoUrl: undefined, status: 'image-success' }) : null);
    }

    // Generate new video
    await handleGenerateSegmentVideo({ ...latestSegment, videoUrl: undefined, status: 'image-success' });
  };

  const handleUpdateSegmentDuration = (segmentId: string, newDuration: number) => {
    logger.state.segmentStatusChange(segmentId, 'duration', `${newDuration}s`);
    setAnalysis(prev => prev ? ({
      ...prev,
      segments: prev.segments.map(s =>
        s.id === segmentId ? { ...s, duration: newDuration } : s
      )
    }) : null);
  };

  const handleUpdateSegmentTimestamp = (segmentId: string, newTimestamp: number) => {
    logger.state.segmentStatusChange(segmentId, 'timestamp', `${newTimestamp}s`);
    setAnalysis(prev => {
      if (!prev) return null;
      const updatedSegments = prev.segments.map(s =>
        s.id === segmentId ? { ...s, timestamp: newTimestamp, formattedTime: formatTime(newTimestamp) } : s
      );
      // Sort segments by timestamp after update
      updatedSegments.sort((a, b) => a.timestamp - b.timestamp);
      return { ...prev, segments: updatedSegments };
    });
  };

  const handleUpdateChromaKey = (segmentId: string, settings: ChromaKeySettings) => {
    logger.state.chromaKeyUpdate(segmentId, settings);
    setAnalysis(prev => prev ? ({
      ...prev,
      segments: prev.segments.map(s =>
        s.id === segmentId ? { ...s, chromaKey: settings } : s
      )
    }) : null);

    // Also update active segment if viewing it
    if (activeSegment && activeSegment.id === segmentId) {
      setActiveSegment(prev => prev ? ({ ...prev, chromaKey: settings }) : null);
    }
  };

  const handleUpdateOverlayTransform = (segmentId: string, transform: OverlayTransform) => {
    setAnalysis(prev => prev ? ({
      ...prev,
      segments: prev.segments.map(s =>
        s.id === segmentId ? { ...s, overlayTransform: transform } : s
      )
    }) : null);

    // Also update active segment if viewing it
    if (activeSegment && activeSegment.id === segmentId) {
      setActiveSegment(prev => prev ? ({ ...prev, overlayTransform: transform }) : null);
    }
  };

  const handleReset = () => {
    logger.ui.buttonClick('reset');
    logger.ui.stateChange(state, AppState.IDLE);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setState(AppState.IDLE);
    setVideoFile(null);
    setAnalysis(null);
    setActiveSegment(null);
    setError(null);
    setIsBatchProcessing(false);
    stopGenerationRef.current = true;
    setPipelineState({
      isRunning: false,
      isPaused: false,
      currentPhase: 'idle',
      progress: { promptsGenerated: 0, imagesGenerated: 0, videosGenerated: 0, totalSegments: 0 }
    });
  };

  // Timeline-first rendering: TimelineEditor is the main view for IDLE, ANALYZING, and TIMELINE_EDITOR states
  // It handles empty state (file picker), loading state, and full editor in one component

  if (state === AppState.IDLE || state === AppState.ANALYZING || state === AppState.TIMELINE_EDITOR) {
    return (
      <TimelineEditor
        videoUrl={videoUrl}
        analysis={analysis}
        onFileSelect={handleFileSelect}
        isLoading={state === AppState.ANALYZING}
        statusMessage={statusMessage}
        pipelineState={pipelineState}
        onStopGeneration={handleStopGeneration}
        onResumeGeneration={handleResumeGeneration}
        onUpdateSegmentDuration={handleUpdateSegmentDuration}
        onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
        onUpdateChromaKey={handleUpdateChromaKey}
        onUpdateOverlayTransform={handleUpdateOverlayTransform}
        hasKey={hasKey}
        onConnectKey={handleConnectKey}
        onGenerateSegmentImage={handleGenerateSegmentImage}
        onGenerateSegmentVideo={handleGenerateSegmentVideo}
      />
    );
  }

  // For other states (DETAIL_VIEW, TIMELINE, ERROR), show with header
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-pink-500 selection:text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={handleBackToTimeline} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" fill="currentColor" />
              </div>
              <h1 className="text-lg font-bold tracking-tight">Gemini <span className="text-zinc-400 font-light">Veo Animator</span></h1>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {state !== AppState.ERROR && (
              <button onClick={handleBackToTimeline} className="text-sm text-zinc-400 hover:text-white">
                ← Back to Timeline
              </button>
            )}
            <button onClick={handleReset} className="text-sm text-zinc-500 hover:text-zinc-300">
              Start Over
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {state === AppState.TIMELINE && analysis && (
          <div className="space-y-8">
             <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Analysis Results</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleOpenTimelineEditor}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-bold py-2 px-4 rounded-full transition-all shadow-lg shadow-purple-900/20"
                  >
                    <Film className="w-4 h-4" />
                    Timeline Editor
                  </button>
                </div>
             </div>
             <PromptSelector
                analysis={analysis}
                onGenerateSegmentImage={handleGenerateSegmentImage}
                onGenerateSegmentVideo={handleGenerateSegmentVideo}
                onViewSegment={handleViewSegment}
                onBatchGenerateImages={handleBatchGenerateImages}
                onBatchAnimate={handleBatchAnimate}
                onFullAutoGenerate={handleFullAutoGenerate}
                onUpdateSegmentPrompts={handleUpdateSegmentPrompts}
                onRegenerateImage={handleRegenerateImage}
                isBatchProcessing={isBatchProcessing}
                disabled={isBatchProcessing}
             />
          </div>
        )}

        {state === AppState.DETAIL_VIEW && activeSegment && (
             <VeoGenerator
                segment={activeSegment}
                originalVideoUrl={videoUrl}
                onBack={handleBackToTimeline}
                onAnimate={(seg) => handleGenerateSegmentVideo(seg)}
                onRegenerateImage={handleRegenerateImage}
                onRegenerateVideo={handleRegenerateVideo}
                onUpdateSegmentPrompts={handleUpdateSegmentPrompts}
                onGenerateImage={handleGenerateSegmentImage}
                onUpdateChromaKey={handleUpdateChromaKey}
             />
        )}

        {state === AppState.ERROR && (
           <div className="max-w-md mx-auto text-center space-y-6 py-20 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                 <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-bold text-white">Something went wrong</h3>
                 <p className="text-zinc-400">{error}</p>
              </div>
              <button onClick={handleReset} className="bg-zinc-800 text-white font-semibold py-2 px-6 rounded-full hover:bg-zinc-700 transition-colors">Try Again</button>
           </div>
        )}
      </main>
    </div>
  );
};

export default App;
