
import React, { useState, useEffect, useRef } from 'react';
import { AppState, AnalysisResult, Segment, GenerationPipelineState } from './types';
import TimelineLanding from './components/TimelineLanding';
import PromptSelector from './components/PromptSelector';
import VeoGenerator from './components/VeoGenerator';
import TimelineEditor from './components/TimelineEditor';
import { fileToBase64, extractFrameFromVideo, getClosestAspectRatio, formatTime } from './utils/videoUtils';
import { analyzeVideoContent, generateImageAsset, generateVeoAnimation, checkApiKey, promptApiKey } from './services/geminiService';
import { Zap, AlertTriangle, Key, Film } from 'lucide-react';

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
    try {
        const success = await promptApiKey();
        if (success) setHasKey(true);
    } catch (e) {
        console.error("Failed to select key", e);
    }
  };

  const handleStopGeneration = () => {
    stopGenerationRef.current = true;
    setPipelineState(prev => ({ ...prev, isRunning: false, isPaused: true }));
  };

  const handleFileSelect = async (file: File) => {
    if (!hasKey) {
        await handleConnectKey();
        const keyNow = await checkApiKey();
        if(!keyNow) return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    setState(AppState.ANALYZING);
    setError(null);
    setStatusMessage("Pre-processing video...");
    stopGenerationRef.current = false;

    try {
      // 1. Get Aspect Ratio from initial frame (0s)
      const { width, height } = await extractFrameFromVideo(url, 0);
      const aspectRatio = getClosestAspectRatio(width, height);
      setVideoAspectRatio(aspectRatio);

      // 2. Prepare Base64 for Gemini
      const base64Video = await fileToBase64(file);

      // 3. Analyze
      setStatusMessage("Gemini is analyzing the timeline for topics...");
      const result = await analyzeVideoContent(base64Video, file.type);
      setAnalysis(result);
      setState(AppState.IDLE); // Stay on timeline landing

      // 4. Initialize pipeline state
      setPipelineState({
        isRunning: true,
        isPaused: false,
        currentPhase: 'prompts',
        progress: { promptsGenerated: result.segments.length, imagesGenerated: 0, videosGenerated: 0, totalSegments: result.segments.length }
      });

      // 5. Start automatic generation pipeline
      await runAutomaticPipeline(result, url, aspectRatio);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze video.");
      setState(AppState.ERROR);
    }
  };

  // Automatic generation pipeline - runs after video analysis
  const runAutomaticPipeline = async (analysisResult: AnalysisResult, url: string, aspectRatio: string) => {
    const segments = analysisResult.segments;

    // Phase 1: Generate all images
    setPipelineState(prev => ({ ...prev, currentPhase: 'images' }));

    for (let i = 0; i < segments.length; i++) {
      if (stopGenerationRef.current) break;

      const segment = segments[i];
      if (segment.status !== 'idle') continue;

      try {
        // Update status to generating
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-image' } : s)
        }) : null);

        const { base64 } = await extractFrameFromVideo(url, segment.timestamp);
        const imageUri = await generateImageAsset(segment.prompt, base64, aspectRatio);

        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'image-success', imageUrl: imageUri } : s)
        }) : null);

        setPipelineState(prev => ({
          ...prev,
          progress: { ...prev.progress, imagesGenerated: prev.progress.imagesGenerated + 1 }
        }));

      } catch (err: any) {
        console.error(`Failed to generate image for segment ${segment.id}:`, err);
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message } : s)
        }) : null);
      }
    }

    if (stopGenerationRef.current) {
      setPipelineState(prev => ({ ...prev, isRunning: false }));
      return;
    }

    // Phase 2: Generate all videos
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
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'generating-video' } : s)
        }) : null);

        const base64Data = segment.imageUrl.split(',')[1];
        const mimeType = segment.imageUrl.split(':')[1].split(';')[0];
        const videoUri = await generateVeoAnimation(segment.animationPrompt, base64Data, mimeType, aspectRatio);

        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'video-success', videoUrl: videoUri } : s)
        }) : null);

        setPipelineState(prev => ({
          ...prev,
          progress: { ...prev.progress, videosGenerated: prev.progress.videosGenerated + 1 }
        }));

      } catch (err: any) {
        console.error(`Failed to generate video for segment ${segment.id}:`, err);
        setAnalysis(prev => prev ? ({
          ...prev,
          segments: prev.segments.map(s => s.id === segment.id ? { ...s, status: 'error', error: err.message } : s)
        }) : null);
      }
    }

    // Complete
    setPipelineState(prev => ({ ...prev, isRunning: false, currentPhase: 'complete' }));
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
    setState(AppState.IDLE); // Go back to timeline landing
  };

  const handleOpenTimelineEditor = () => {
    setState(AppState.TIMELINE_EDITOR);
  };

  const handleBackFromEditor = () => {
    setState(AppState.IDLE); // Go back to timeline landing
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

  // Timeline-first rendering: show TimelineLanding as main view for IDLE and ANALYZING states
  // Other views (DETAIL_VIEW, TIMELINE_EDITOR, TIMELINE) are shown on top or as navigations

  // For IDLE and ANALYZING states, show the timeline landing page
  if (state === AppState.IDLE || state === AppState.ANALYZING) {
    return (
      <TimelineLanding
        onFileSelect={handleFileSelect}
        isLoading={state === AppState.ANALYZING}
        statusMessage={statusMessage}
        analysis={analysis}
        videoUrl={videoUrl}
        pipelineState={pipelineState}
        onStopGeneration={handleStopGeneration}
        onViewSegment={handleViewSegment}
        onOpenTimelineEditor={handleOpenTimelineEditor}
        hasKey={hasKey}
        onConnectKey={handleConnectKey}
      />
    );
  }

  // For TIMELINE_EDITOR state, show full-screen editor
  if (state === AppState.TIMELINE_EDITOR && analysis && videoUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950">
        <TimelineEditor
          videoUrl={videoUrl}
          analysis={analysis}
          onBack={handleBackFromEditor}
          onViewSegment={handleViewSegment}
          onUpdateSegmentDuration={handleUpdateSegmentDuration}
          onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
        />
      </div>
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
                onUpdateSegmentPrompts={handleUpdateSegmentPrompts}
                onGenerateImage={handleGenerateSegmentImage}
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
