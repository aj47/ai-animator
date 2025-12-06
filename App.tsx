
import React, { useState, useEffect } from 'react';
import { AppState, AnalysisResult, Segment } from './types';
import VideoUploader from './components/VideoUploader';
import PromptSelector from './components/PromptSelector'; // Now acts as Timeline View
import VeoGenerator from './components/VeoGenerator'; // Now acts as Detail View
import TimelineEditor from './components/TimelineEditor'; // Video editor timeline view
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
      setState(AppState.TIMELINE);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze video.");
      setState(AppState.ERROR);
    }
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
    setState(AppState.TIMELINE);
  };

  const handleOpenTimelineEditor = () => {
    setState(AppState.TIMELINE_EDITOR);
  };

  const handleBackFromEditor = () => {
    setState(AppState.TIMELINE);
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
  };

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
          
          {!hasKey && (
             <button onClick={handleConnectKey} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full flex items-center gap-2 border border-zinc-700">
                <Key className="w-3 h-3" /> Connect API Key
             </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {!hasKey && state === AppState.IDLE && (
            <div className="mb-8 p-6 bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/20 rounded-2xl flex flex-col items-center text-center space-y-4">
                <h2 className="text-xl font-bold text-white">Get Started</h2>
                <p className="text-zinc-400 max-w-lg">Connect your Google Cloud API Key to analyze videos and generate overlays.</p>
                <button onClick={handleConnectKey} className="bg-white text-black font-bold py-2 px-6 rounded-full hover:bg-zinc-200 transition-colors">Connect Key</button>
            </div>
        )}

        {state === AppState.IDLE && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-12 space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500">
                Remix your reality.
              </h2>
              <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                Upload longer videos. Gemini identifies key topics and creates custom green screen overlays for every segment.
              </p>
            </div>
            <VideoUploader onFileSelect={handleFileSelect} isLoading={false} />
          </div>
        )}

        {state === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center space-y-8 py-20 animate-in fade-in duration-500">
             <div className="relative w-24 h-24">
                <div className="absolute inset-0 border-t-4 border-purple-500 rounded-full animate-spin"></div>
                <div className="absolute inset-2 border-r-4 border-pink-500 rounded-full animate-spin animation-delay-200"></div>
             </div>
             <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-white">Analyzing Video Timeline</h3>
                <p className="text-zinc-400">{statusMessage}</p>
             </div>
          </div>
        )}

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
                  <button onClick={handleReset} className="text-sm text-zinc-500 hover:text-zinc-300">Start Over</button>
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
             />
        )}

        {state === AppState.TIMELINE_EDITOR && analysis && videoUrl && (
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
