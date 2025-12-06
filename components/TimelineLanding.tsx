import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Upload, FileVideo, Play, StopCircle, Loader2, Sparkles, Film, Image, Video, CheckCircle2 } from 'lucide-react';
import { AnalysisResult, Segment, GenerationPipelineState } from '../types';
import { MAX_VIDEO_SIZE_MB } from '../constants';
import { formatTime } from '../utils/videoUtils';

interface TimelineLandingProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  statusMessage: string;
  analysis: AnalysisResult | null;
  videoUrl: string | null;
  pipelineState: GenerationPipelineState;
  onStopGeneration: () => void;
  onViewSegment: (segment: Segment) => void;
  onOpenTimelineEditor: () => void;
  hasKey: boolean;
  onConnectKey: () => void;
}

const TimelineLanding: React.FC<TimelineLandingProps> = ({
  onFileSelect,
  isLoading,
  statusMessage,
  analysis,
  videoUrl,
  pipelineState,
  onStopGeneration,
  onViewSegment,
  onOpenTimelineEditor,
  hasKey,
  onConnectKey
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateAndPass = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError("Please upload a video file.");
      return;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      setError(`File too large (${sizeMB.toFixed(1)}MB). Max size is ${MAX_VIDEO_SIZE_MB}MB.`);
      return;
    }
    setError(null);
    onFileSelect(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndPass(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndPass(e.target.files[0]);
    }
  };

  const getSegmentStatusIcon = (segment: Segment) => {
    if (segment.status === 'video-success') return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (segment.status === 'generating-video') return <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />;
    if (segment.status === 'image-success') return <Image className="w-4 h-4 text-blue-400" />;
    if (segment.status === 'generating-image') return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    return <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />;
  };

  const getPhaseLabel = () => {
    switch (pipelineState.currentPhase) {
      case 'prompts': return 'Generating prompts...';
      case 'images': return 'Creating images...';
      case 'videos': return 'Animating videos...';
      case 'complete': return 'Generation complete!';
      default: return '';
    }
  };

  // Show file picker if no video is loaded
  if (!videoUrl) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {/* Timeline-style header */}
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <Film className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-white">Timeline Editor</h1>
          </div>
        </div>

        {/* Empty timeline with file picker */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {!hasKey && (
            <div className="mb-8 p-6 bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/20 rounded-2xl max-w-md text-center">
              <h2 className="text-lg font-bold text-white mb-2">Connect API Key</h2>
              <p className="text-zinc-400 text-sm mb-4">Connect your Google Cloud API Key to get started.</p>
              <button onClick={onConnectKey} className="bg-white text-black font-bold py-2 px-6 rounded-full hover:bg-zinc-200">
                Connect Key
              </button>
            </div>
          )}

          <div
            className={`
              relative w-full max-w-2xl border-2 border-dashed rounded-2xl p-16 transition-all
              ${dragActive ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-500'}
              ${isLoading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              accept="video/*"
              onChange={handleChange}
              disabled={isLoading}
            />
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`p-5 rounded-full ${dragActive ? 'bg-purple-500/20' : 'bg-zinc-800'}`}>
                <Upload className={`w-10 h-10 ${dragActive ? 'text-purple-400' : 'text-zinc-400'}`} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Drop a video to begin</h3>
                <p className="text-zinc-400">or click to browse your files</p>
              </div>
              <div className="text-xs text-zinc-500 px-4 py-2 bg-zinc-900 rounded-full border border-zinc-800">
                Max size: {MAX_VIDEO_SIZE_MB}MB • MP4, MOV, WebM
              </div>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  // Video is loaded - show timeline with video and segments
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Render continues in TimelineLandingLoaded section */}
      <TimelineLandingLoaded
        videoUrl={videoUrl}
        videoRef={videoRef}
        analysis={analysis}
        isLoading={isLoading}
        statusMessage={statusMessage}
        pipelineState={pipelineState}
        onStopGeneration={onStopGeneration}
        onViewSegment={onViewSegment}
        onOpenTimelineEditor={onOpenTimelineEditor}
        getSegmentStatusIcon={getSegmentStatusIcon}
        getPhaseLabel={getPhaseLabel}
      />
    </div>
  );
};

// Sub-component for when video is loaded
interface TimelineLandingLoadedProps {
  videoUrl: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  analysis: AnalysisResult | null;
  isLoading: boolean;
  statusMessage: string;
  pipelineState: GenerationPipelineState;
  onStopGeneration: () => void;
  onViewSegment: (segment: Segment) => void;
  onOpenTimelineEditor: () => void;
  getSegmentStatusIcon: (segment: Segment) => React.ReactNode;
  getPhaseLabel: () => string;
}

const TimelineLandingLoaded: React.FC<TimelineLandingLoadedProps> = ({
  videoUrl,
  videoRef,
  analysis,
  isLoading,
  statusMessage,
  pipelineState,
  onStopGeneration,
  onViewSegment,
  onOpenTimelineEditor,
  getSegmentStatusIcon,
  getPhaseLabel
}) => {
  const [videoDuration, setVideoDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handleLoadedMetadata = () => setVideoDuration(video.duration);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }
  }, [videoRef]);

  const getSegmentPosition = (timestamp: number) => {
    return videoDuration > 0 ? (timestamp / videoDuration) * 100 : 0;
  };

  const getSegmentWidth = (duration: number) => {
    return videoDuration > 0 ? (duration / videoDuration) * 100 : 5;
  };

  return (
    <>
      {/* Header with controls */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-bold text-white">Timeline Editor</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Generation status */}
            {pipelineState.isRunning && (
              <div className="flex items-center gap-3 bg-purple-900/30 px-4 py-2 rounded-full border border-purple-500/30">
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                <span className="text-sm text-purple-300">{getPhaseLabel()}</span>
                <button
                  onClick={onStopGeneration}
                  className="flex items-center gap-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                >
                  <StopCircle className="w-3 h-3" />
                  Stop
                </button>
              </div>
            )}

            {pipelineState.currentPhase === 'complete' && (
              <div className="flex items-center gap-2 bg-green-900/30 px-4 py-2 rounded-full border border-green-500/30">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-300">Complete</span>
              </div>
            )}

            {/* Open full timeline editor */}
            {analysis && (
              <button
                onClick={onOpenTimelineEditor}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
              >
                <Play className="w-4 h-4" />
                Preview
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex">
        {/* Video preview */}
        <div className="w-1/3 p-4 border-r border-zinc-800">
          <div className="aspect-video bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              controls
            />
          </div>

          {/* Progress stats */}
          {analysis && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="bg-zinc-900 rounded-lg p-3 text-center border border-zinc-800">
                <div className="flex items-center justify-center gap-1 text-zinc-400 mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span className="text-xs">Prompts</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {pipelineState.progress.promptsGenerated}/{pipelineState.progress.totalSegments}
                </span>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3 text-center border border-zinc-800">
                <div className="flex items-center justify-center gap-1 text-zinc-400 mb-1">
                  <Image className="w-3 h-3" />
                  <span className="text-xs">Images</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {pipelineState.progress.imagesGenerated}/{pipelineState.progress.totalSegments}
                </span>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3 text-center border border-zinc-800">
                <div className="flex items-center justify-center gap-1 text-zinc-400 mb-1">
                  <Video className="w-3 h-3" />
                  <span className="text-xs">Videos</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {pipelineState.progress.videosGenerated}/{pipelineState.progress.totalSegments}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Timeline and segments list */}
        <div className="flex-1 flex flex-col">
          {/* Loading/analyzing state */}
          {isLoading && !analysis && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mb-4" />
              <p className="text-zinc-400">{statusMessage || 'Analyzing video...'}</p>
            </div>
          )}

          {/* Segments timeline visualization */}
          {analysis && (
            <>
              {/* Visual timeline bar */}
              <div className="p-4 border-b border-zinc-800">
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 mb-2">Animation Timeline</div>
                  <div className="h-12 bg-zinc-800 rounded relative">
                    {analysis.segments.map((segment) => {
                      const left = getSegmentPosition(segment.timestamp);
                      const width = getSegmentWidth(segment.duration || 5);
                      const isComplete = segment.status === 'video-success';
                      const isGenerating = segment.status.includes('generating');

                      return (
                        <div
                          key={segment.id}
                          className={`
                            absolute top-1 bottom-1 rounded cursor-pointer transition-all
                            ${isComplete ? 'bg-green-500/60 border border-green-400/50' :
                              isGenerating ? 'bg-purple-500/40 border border-purple-400/50 animate-pulse' :
                              segment.status === 'image-success' ? 'bg-blue-500/40 border border-blue-400/50' :
                              'bg-zinc-700 border border-zinc-600 border-dashed'}
                          `}
                          style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                          onClick={() => onViewSegment(segment)}
                          title={`${segment.topic} - ${formatTime(segment.timestamp)}`}
                        >
                          <div className="px-1 py-0.5 truncate">
                            <span className="text-[9px] text-white/80">{segment.topic}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Segments list */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {analysis.segments.map((segment) => (
                    <div
                      key={segment.id}
                      onClick={() => onViewSegment(segment)}
                      className="bg-zinc-900 hover:bg-zinc-800 rounded-lg p-4 border border-zinc-800 cursor-pointer transition-colors flex items-center gap-4"
                    >
                      {/* Status icon */}
                      <div className="shrink-0">
                        {getSegmentStatusIcon(segment)}
                      </div>

                      {/* Timestamp */}
                      <div className="shrink-0 w-16 text-center">
                        <span className="font-mono text-sm text-zinc-400">{segment.formattedTime}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white truncate">{segment.topic}</h4>
                        <p className="text-xs text-zinc-500 truncate">{segment.description}</p>
                      </div>

                      {/* Preview thumbnail */}
                      {segment.imageUrl && (
                        <div className="shrink-0 w-20 h-12 rounded overflow-hidden border border-zinc-700">
                          <img src={segment.imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default TimelineLanding;

