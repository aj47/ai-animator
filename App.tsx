
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AnalysisResult, Segment, GenerationProgress, GenerationPhase } from './types';
import VideoUploader from './components/VideoUploader';
import PromptSelector from './components/PromptSelector'; // Now acts as Timeline View
import VeoGenerator from './components/VeoGenerator'; // Now acts as Detail View
import TimelineEditor from './components/TimelineEditor'; // Video editor timeline view
import { fileToBase64, extractFrameFromVideo, getClosestAspectRatio, formatTime } from './utils/videoUtils';
import { analyzeVideoContent, generateImageAsset, generateVeoAnimation, checkApiKey, promptApiKey } from './services/geminiService';
import { Zap, AlertTriangle, Key, Film } from 'lucide-react';

const App: React.FC = () => {
  // Core state - Start in TIMELINE_EDITOR for timeline-first experience
  const [state, setState] = useState<AppState>(AppState.TIMELINE_EDITOR);
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
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({
    phase: 'idle',
    completedSegments: 0,
    totalSegments: 0,
    statusMessage: ''
  });
  const stopGenerationRef = useRef(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  useEffect(() => {
    checkApiKey().then(setHasKey);
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectKey = async () => {
    try {
        const success = await promptApiKey();
        if (success) setHasKey(true);
    } catch (e) {
        console.error("Failed to select key", e);
    }
  };

  // Stop generation handler
  const handleStopGeneration = useCallback(() => {
    stopGenerationRef.current = true;
    setIsAutoGenerating(false);
    setGenerationProgress(prev => ({ ...prev, phase: 'stopped', statusMessage: 'Generation stopped' }));
  }, []);

  const handleFileSelect = async (file: File) => {
    if (!hasKey) {
        await handleConnectKey();
        const keyNow = await checkApiKey();
        if(!keyNow) return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    // Reset stop flag and start auto generation
    stopGenerationRef.current = false;
    setIsAutoGenerating(true);
    setError(null);

    // Update progress for analyzing phase
    setGenerationProgress({
      phase: 'analyzing',
      completedSegments: 0,
      totalSegments: 0,
      statusMessage: 'Pre-processing video...'
    });

    try {
      // 1. Get Aspect Ratio from initial frame (0s)
      const { width, height } = await extractFrameFromVideo(url, 0);
      const aspectRatio = getClosestAspectRatio(width, height);
      setVideoAspectRatio(aspectRatio);

      // Check if stopped
      if (stopGenerationRef.current) return;

      // 2. Prepare Base64 for Gemini
      const base64Video = await fileToBase64(file);

      // Check if stopped
      if (stopGenerationRef.current) return;

      // 3. Analyze - this generates the prompts
      setGenerationProgress(prev => ({
        ...prev,
        phase: 'generating-prompts',
        statusMessage: 'Gemini is analyzing the timeline for topics...'
      }));

      const result = await analyzeVideoContent(base64Video, file.type);
      setAnalysis(result);

      // Check if stopped
      if (stopGenerationRef.current) {
        setIsAutoGenerating(false);
        return;
      }

      // 4. Auto-generate images for each segment
      setGenerationProgress({
        phase: 'generating-images',
        completedSegments: 0,
        totalSegments: result.segments.length,
        statusMessage: 'Generating images...'
      });

      // Generate images one at a time to show progress
      for (let i = 0; i < result.segments.length; i++) {
        if (stopGenerationRef.current) break;

        const segment = result.segments[i];
        setGenerationProgress(prev => ({
          ...prev,
          currentSegment: segment.id,
          statusMessage: `Generating image ${i + 1}/${result.segments.length}: ${segment.topic}`
        }));

        // Generate image for this segment
        await handleGenerateSegmentImageForPipeline(segment, url, aspectRatio);

        setGenerationProgress(prev => ({
          ...prev,
          completedSegments: i + 1
        }));
      }

      // Check if stopped
      if (stopGenerationRef.current) {
        setIsAutoGenerating(false);
        return;
      }

      // 5. Auto-generate videos for each segment
      setGenerationProgress({
        phase: 'generating-videos',
        completedSegments: 0,
        totalSegments: result.segments.length,
        statusMessage: 'Generating animations...'
      });

      // Get latest analysis state for video generation
      // We need to re-read analysis as it may have been updated
      for (let i = 0; i < result.segments.length; i++) {
        if (stopGenerationRef.current) break;

        const segment = result.segments[i];
        setGenerationProgress(prev => ({
          ...prev,
          currentSegment: segment.id,
          statusMessage: `Generating video ${i + 1}/${result.segments.length}: ${segment.topic}`
        }));

        // Generate video - we need the latest imageUrl from state
        await handleGenerateSegmentVideoFromState(segment.id);

        setGenerationProgress(prev => ({
          ...prev,
          completedSegments: i + 1
        }));
      }

      // Complete
      setGenerationProgress({
        phase: 'complete',
        completedSegments: result.segments.length,
        totalSegments: result.segments.length,
        statusMessage: 'Generation complete!'
      });
      setIsAutoGenerating(false);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process video.");
      setGenerationProgress(prev => ({ ...prev, phase: 'stopped', statusMessage: err.message }));
      setIsAutoGenerating(false);
    }
  };

  // Helper function for pipeline image generation (doesn't rely on state for videoUrl)
  const handleGenerateSegmentImageForPipeline = async (segment: Segment, videoUrlParam: string, aspectRatio: string): Promise<string | null> => {
    // Check key
    if (!await checkApiKey()) {
        const success = await promptApiKey();
        if(!success) return null;
    }

    // Update Segment Status
    setAnalysis(prev => prev ? ({
        ...prev,
        segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-image' } : s)
    }) : null);

    try {
        const { base64 } = await extractFrameFromVideo(videoUrlParam, segment.timestamp);
        const uri = await generateImageAsset(segment.prompt, base64, aspectRatio);

        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'image-success', imageUrl: uri } : s)
        }) : null);

        return uri;

    } catch (err: any) {
        console.error(err);
        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message } : s)
        }) : null);
        return null;
    }
  };

  // Helper function for pipeline video generation (reads imageUrl from current state)
  const handleGenerateSegmentVideoFromState = async (segmentId: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setAnalysis(prev => {
        if (!prev) {
          resolve(null);
          return null;
        }

        const segment = prev.segments.find(s => s.id === segmentId);
        if (!segment?.imageUrl) {
          resolve(null);
          return prev;
        }

        // Trigger the video generation
        (async () => {
          try {
            const imageUrl = segment.imageUrl!;
            const base64Data = imageUrl.split(',')[1];
            const mimeType = imageUrl.split(':')[1].split(';')[0];

            // Update status to generating
            setAnalysis(p => p ? ({
              ...p,
              segments: p.segments.map(s => s.id === segmentId ? { ...s, status: 'generating-video' } : s)
            }) : null);

            const videoUri = await generateVeoAnimation(segment.animationPrompt, base64Data, mimeType, videoAspectRatio);

            setAnalysis(p => p ? ({
              ...p,
              segments: p.segments.map(s => s.id === segmentId ? { ...s, status: 'video-success', videoUrl: videoUri } : s)
            }) : null);

            resolve(videoUri);
          } catch (err: any) {
            console.error(err);
            setAnalysis(p => p ? ({
              ...p,
              segments: p.segments.map(s => s.id === segmentId ? { ...s, status: 'error', error: err.message } : s)
            }) : null);
            resolve(null);
          }
        })();

        return prev;
      });
    });
  };

  const handleGenerateSegmentImage = async (segment: Segment): Promise<string | null> => {
    if (!analysis || !videoUrl) return null;

    // Check key
    if (!await checkApiKey()) {
        const success = await promptApiKey();
        if(!success) return null;
    }

    // Update Segment Status
    setAnalysis(prev => prev ? ({
        ...prev,
        segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-image' } : s)
    }) : null);

    try {
        const { base64 } = await extractFrameFromVideo(videoUrl, segment.timestamp);
        const uri = await generateImageAsset(segment.prompt, base64, videoAspectRatio);

        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'image-success', imageUrl: uri } : s)
        }) : null);

        // If this was triggered from Detail view, update active segment
        if (activeSegment && activeSegment.id === segment.id) {
            setActiveSegment(prev => prev ? ({ ...prev, status: 'image-success', imageUrl: uri }) : null);
        }
        
        return uri;

    } catch (err: any) {
        console.error(err);
        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message } : s)
        }) : null);
        return null;
    }
  };

  const handleGenerateSegmentVideo = async (segment: Segment, overrideImageUrl?: string): Promise<string | null> => {
    // We can allow an override URL to enable chaining from image generation immediately
    const imageUrl = overrideImageUrl || segment.imageUrl;

    if (!imageUrl) return null;

    // Check key
    if (!await checkApiKey()) {
        const success = await promptApiKey();
        if(!success) return null;
    }

    // Update Status
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
        const videoUri = await generateVeoAnimation(segment.animationPrompt, base64Data, mimeType, videoAspectRatio);

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
        setAnalysis(prev => prev ? ({
            ...prev,
            segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message } : s)
        }) : null);
        return null;
    }
  };

  const handleBatchGenerateImages = async () => {
      if (!analysis || !videoUrl) return;
      setIsBatchProcessing(true);

      const segmentsToProcess = analysis.segments.filter(s => s.status === 'idle');
      
      // Parallel execution using Promise.all
      const promises = segmentsToProcess.map(segment => handleGenerateSegmentImage(segment));
      await Promise.all(promises);
      
      setIsBatchProcessing(false);
  };

  const handleBatchAnimate = async () => {
    if (!analysis) return;
    setIsBatchProcessing(true);

    const segmentsToProcess = analysis.segments.filter(s => s.status === 'image-success');

    // Parallel execution
    const promises = segmentsToProcess.map(segment => handleGenerateSegmentVideo(segment));
    await Promise.all(promises);

    setIsBatchProcessing(false);
  };

  const handleFullAutoGenerate = async () => {
    if (!analysis) return;
    setIsBatchProcessing(true);

    // Process all segments that aren't already done
    const segments = analysis.segments;
    
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
  };

  const handleViewSegment = (segment: Segment) => {
    setActiveSegment(segment);
    setState(AppState.DETAIL_VIEW);
  };

  const handleBackToTimeline = () => {
    setActiveSegment(null);
    setState(AppState.TIMELINE_EDITOR);
  };

  const handleUpdateSegmentPrompts = (segmentId: string, prompt: string, animationPrompt: string) => {
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
    // Get the latest segment data from analysis (in case prompts were just updated)
    const latestSegment = analysis?.segments.find(s => s.id === segment.id);
    if (!latestSegment) return;

    // Clear existing image/video and regenerate
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

  const handleUpdateSegmentDuration = (segmentId: string, newDuration: number) => {
    setAnalysis(prev => prev ? ({
      ...prev,
      segments: prev.segments.map(s =>
        s.id === segmentId ? { ...s, duration: newDuration } : s
      )
    }) : null);
  };

  const handleUpdateSegmentTimestamp = (segmentId: string, newTimestamp: number) => {
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

  const handleReset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setState(AppState.TIMELINE_EDITOR);
    setVideoFile(null);
    setAnalysis(null);
    setActiveSegment(null);
    setError(null);
    setIsBatchProcessing(false);
    setIsAutoGenerating(false);
    stopGenerationRef.current = false;
    setGenerationProgress({
      phase: 'idle',
      completedSegments: 0,
      totalSegments: 0,
      statusMessage: ''
    });
  };

  // Timeline-first: Show TimelineEditor as the primary view
  // The TimelineEditor now handles both the empty state (file upload) and loaded state
  if (state === AppState.TIMELINE_EDITOR) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950">
        <TimelineEditor
          videoUrl={videoUrl}
          analysis={analysis}
          onViewSegment={handleViewSegment}
          onUpdateSegmentDuration={handleUpdateSegmentDuration}
          onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
          onFileSelect={handleFileSelect}
          onStopGeneration={handleStopGeneration}
          generationProgress={generationProgress}
          isGenerating={isAutoGenerating}
        />
      </div>
    );
  }

  // Detail view for individual segment editing
  if (state === AppState.DETAIL_VIEW && activeSegment) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-pink-500 selection:text-white">
        <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" fill="currentColor" />
              </div>
              <h1 className="text-lg font-bold tracking-tight">Gemini <span className="text-zinc-400 font-light">Veo Animator</span></h1>
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-12">
          <VeoGenerator
            segment={activeSegment}
            originalVideoUrl={videoUrl}
            onBack={handleBackToTimeline}
            onAnimate={(seg) => handleGenerateSegmentVideo(seg)}
            onRegenerateImage={handleRegenerateImage}
            onUpdateSegmentPrompts={handleUpdateSegmentPrompts}
            onGenerateImage={handleGenerateSegmentImage}
          />
        </main>
      </div>
    );
  }

  // Error state
  if (state === AppState.ERROR) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-pink-500 selection:text-white flex items-center justify-center">
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
      </div>
    );
  }

  // Fallback to timeline editor (should not typically reach here)
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950">
      <TimelineEditor
        videoUrl={videoUrl}
        analysis={analysis}
        onViewSegment={handleViewSegment}
        onUpdateSegmentDuration={handleUpdateSegmentDuration}
        onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
        onFileSelect={handleFileSelect}
        onStopGeneration={handleStopGeneration}
        generationProgress={generationProgress}
        isGenerating={isAutoGenerating}
      />
    </div>
  );
};

export default App;
