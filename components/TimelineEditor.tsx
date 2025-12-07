
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Layers, Film, Sparkles, Eye, EyeOff, Upload, Sliders,
  Diamond, Maximize2, ZoomIn, ZoomOut, Clock, GripVertical, GripHorizontal,
  Plus, Minus, Loader2, StopCircle, CheckCircle2, Image, Video
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AnalysisResult, Segment, GenerationPipelineState, ChromaKeySettings, DEFAULT_CHROMA_KEY_SETTINGS } from '../types';
import { formatTime } from '../utils/videoUtils';
import { MAX_VIDEO_SIZE_MB } from '../constants';
import ChromaKeyControls from './ChromaKeyControls';
import { createChromaKeyCanvas, sampleColorFromImage } from '../utils/chromaKey';

interface TimelineEditorProps {
  videoUrl: string | null;
  analysis: AnalysisResult | null;
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  statusMessage: string;
  pipelineState: GenerationPipelineState;
  onStopGeneration: () => void;
  onResumeGeneration: () => void;
  onUpdateSegmentDuration: (segmentId: string, newDuration: number) => void;
  onUpdateSegmentTimestamp: (segmentId: string, newTimestamp: number) => void;
  onUpdateChromaKey: (segmentId: string, settings: ChromaKeySettings) => void;
  hasKey: boolean;
  onConnectKey: () => void;
  onGenerateSegmentImage?: (segment: Segment) => Promise<string | null>;
  onGenerateSegmentVideo?: (segment: Segment) => Promise<string | null>;
}

interface LayerVisibility {
  video: boolean;
  animation: boolean;
}

type SegmentDragMode = 'move' | 'resize-start' | 'resize-end' | null;

interface SegmentDragState {
  segmentId: string;
  mode: SegmentDragMode;
  initialMouseX: number;
  initialTimestamp: number;
  initialDuration: number;
}

const TimelineEditor: React.FC<TimelineEditorProps> = ({
  videoUrl,
  analysis,
  onFileSelect,
  isLoading,
  statusMessage,
  pipelineState,
  onStopGeneration,
  onResumeGeneration,
  onUpdateSegmentDuration,
  onUpdateSegmentTimestamp,
  onUpdateChromaKey,
  hasKey,
  onConnectKey,
  onGenerateSegmentImage,
  onGenerateSegmentVideo
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);
  const overlayImageRef = useRef<HTMLImageElement>(null);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationTrackRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    video: true,
    animation: true
  });
  const [segmentDrag, setSegmentDrag] = useState<SegmentDragState | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Chroma key state
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [showChromaPanel, setShowChromaPanel] = useState(false);

  // File picker handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateAndSelectFile = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      setFileError("Please upload a video file.");
      return;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      setFileError(`File too large (${sizeMB.toFixed(1)}MB). Max size is ${MAX_VIDEO_SIZE_MB}MB.`);
      return;
    }
    setFileError(null);
    onFileSelect(file);
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  }, [validateAndSelectFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  // Pipeline helpers
  const getPhaseLabel = () => {
    switch (pipelineState.currentPhase) {
      case 'prompts': return 'Generating prompts...';
      case 'images': return 'Creating images...';
      case 'videos': return 'Animating videos...';
      case 'complete': return 'Complete';
      default: return '';
    }
  };

  const getSegmentStatusIcon = (segment: Segment) => {
    if (segment.status === 'video-success') return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (segment.status === 'generating-video') return <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />;
    if (segment.status === 'image-success') return <Image className="w-4 h-4 text-blue-400" />;
    if (segment.status === 'generating-image') return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    return <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />;
  };

  // Find the currently active segment based on playback time
  const findActiveSegment = useCallback((time: number): Segment | null => {
    if (!analysis) return null;
    // Find segment that contains this time (using segment's duration)
    for (const segment of analysis.segments) {
      const segmentDuration = segment.duration || 5;
      if (time >= segment.timestamp && time < segment.timestamp + segmentDuration) {
        return segment;
      }
    }
    return null;
  }, [analysis]);

  // Sync activeSegment when analysis changes (to pick up chromaKey updates)
  useEffect(() => {
    if (activeSegment && analysis) {
      const updatedSegment = analysis.segments.find(s => s.id === activeSegment.id);
      if (updatedSegment && updatedSegment !== activeSegment) {
        setActiveSegment(updatedSegment);
      }
    }
  }, [analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update current time during playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const segment = findActiveSegment(video.currentTime);
      setActiveSegment(segment);

      // Sync overlay video if present
      if (overlayVideoRef.current && segment?.videoUrl) {
        const overlayVideo = overlayVideoRef.current;
        const segmentTime = video.currentTime - segment.timestamp;
        if (Math.abs(overlayVideo.currentTime - segmentTime) > 0.3) {
          overlayVideo.currentTime = segmentTime;
        }
        if (isPlaying && overlayVideo.paused) {
          overlayVideo.play().catch(() => {});
        }
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      overlayVideoRef.current?.pause();
    };

    // Check if video already has metadata loaded (handles case where loadedmetadata fired before this effect)
    if (video.readyState >= 1 && video.duration) {
      setDuration(video.duration);
    }

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [findActiveSegment, isPlaying, videoUrl]);

  // Playback controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      overlayVideoRef.current?.pause();
    } else {
      videoRef.current.play();
      overlayVideoRef.current?.play().catch(() => {});
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const skipBackward = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
  };

  const skipForward = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
  };

  const jumpToSegment = (segment: Segment) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = segment.timestamp;
    setActiveSegment(segment);
  };

  // Timeline scrubbing
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, newTime));
  };

  const handleTimelineDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    videoRef.current.currentTime = newTime;
  }, [isDragging, duration]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleTimelineDrag);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleTimelineDrag);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleTimelineDrag, handleMouseUp]);

  // Segment drag handlers
  const handleSegmentDragStart = (
    e: React.MouseEvent,
    segment: Segment,
    mode: 'move' | 'resize-start' | 'resize-end'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSegmentDrag({
      segmentId: segment.id,
      mode,
      initialMouseX: e.clientX,
      initialTimestamp: segment.timestamp,
      initialDuration: segment.duration || 5
    });
  };

  const handleSegmentDragMove = useCallback((e: MouseEvent) => {
    if (!segmentDrag || !animationTrackRef.current) return;

    const trackRect = animationTrackRef.current.getBoundingClientRect();
    const trackWidth = trackRect.width;
    const deltaX = e.clientX - segmentDrag.initialMouseX;
    const deltaTime = (deltaX / trackWidth) * duration;

    const segment = analysis?.segments.find(s => s.id === segmentDrag.segmentId);
    if (!segment) return;

    if (segmentDrag.mode === 'move') {
      const newTimestamp = Math.max(0, Math.min(
        duration - (segment.duration || 5),
        segmentDrag.initialTimestamp + deltaTime
      ));
      onUpdateSegmentTimestamp(segmentDrag.segmentId, Math.round(newTimestamp * 10) / 10);
    } else if (segmentDrag.mode === 'resize-start') {
      const maxDelta = segmentDrag.initialDuration - 1;
      const clampedDelta = Math.max(-segmentDrag.initialTimestamp, Math.min(maxDelta, deltaTime));
      const newTimestamp = segmentDrag.initialTimestamp + clampedDelta;
      const newDuration = segmentDrag.initialDuration - clampedDelta;
      onUpdateSegmentTimestamp(segmentDrag.segmentId, Math.round(newTimestamp * 10) / 10);
      onUpdateSegmentDuration(segmentDrag.segmentId, Math.round(newDuration * 10) / 10);
    } else if (segmentDrag.mode === 'resize-end') {
      const newDuration = Math.max(1, Math.min(
        duration - segmentDrag.initialTimestamp,
        segmentDrag.initialDuration + deltaTime
      ));
      onUpdateSegmentDuration(segmentDrag.segmentId, Math.round(newDuration * 10) / 10);
    }
  }, [segmentDrag, duration, analysis?.segments, onUpdateSegmentTimestamp, onUpdateSegmentDuration]);

  const handleSegmentDragEnd = useCallback(() => {
    setSegmentDrag(null);
  }, []);

  useEffect(() => {
    if (segmentDrag) {
      window.addEventListener('mousemove', handleSegmentDragMove);
      window.addEventListener('mouseup', handleSegmentDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleSegmentDragMove);
      window.removeEventListener('mouseup', handleSegmentDragEnd);
    };
  }, [segmentDrag, handleSegmentDragMove, handleSegmentDragEnd]);

  const toggleLayerVisibility = (layer: keyof LayerVisibility) => {
    setLayerVisibility(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Calculate position percentages for segments
  const getSegmentPosition = (timestamp: number) => {
    return duration > 0 ? (timestamp / duration) * 100 : 0;
  };

  // Chroma key handlers
  const getActiveChromaSettings = (): ChromaKeySettings => {
    return activeSegment?.chromaKey || { ...DEFAULT_CHROMA_KEY_SETTINGS };
  };

  const handleChromaSettingsChange = (settings: ChromaKeySettings) => {
    if (activeSegment) {
      onUpdateChromaKey(activeSegment.id, settings);
    }
  };

  const handlePickColorClick = () => {
    setIsPickingColor(!isPickingColor);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement>) => {
    if (!isPickingColor || !activeSegment) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const color = sampleColorFromImage(target as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, x, y);
    const newSettings = { ...getActiveChromaSettings(), keyColor: color };
    onUpdateChromaKey(activeSegment.id, newSettings);
    setIsPickingColor(false);
  };

  // Update chroma canvas when active segment changes or settings change
  const updateChromaCanvas = useCallback(() => {
    if (!chromaCanvasRef.current || !activeSegment) return;

    const settings = activeSegment.chromaKey || DEFAULT_CHROMA_KEY_SETTINGS;
    if (!settings.enabled) return;

    const source = activeSegment.videoUrl
      ? overlayVideoRef.current
      : overlayImageRef.current;

    if (!source) return;

    const canvas = createChromaKeyCanvas(source as HTMLImageElement | HTMLVideoElement, settings);
    const ctx = chromaCanvasRef.current.getContext('2d');
    if (ctx) {
      chromaCanvasRef.current.width = canvas.width;
      chromaCanvasRef.current.height = canvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0);
    }
  }, [activeSegment]);

  // Empty state - no video loaded
  if (!videoUrl) {
    return (
      <div className="w-full h-screen flex flex-col bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-bold text-white">Timeline Editor</h1>
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
              onChange={handleFileChange}
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
          {fileError && <p className="text-red-400 text-sm mt-4">{fileError}</p>}
        </div>
      </div>
    );
  }

  // Analyzing state - video loaded but no analysis yet
  if (isLoading && !analysis) {
    return (
      <div className="w-full h-screen flex flex-col bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-bold text-white">Timeline Editor</h1>
          </div>
        </div>

        {/* Loading content */}
        <div className="flex-1 flex">
          {/* Video preview */}
          <div className="w-1/3 p-4 border-r border-zinc-800">
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              <video src={videoUrl} className="w-full h-full object-contain" controls />
            </div>
          </div>

          {/* Loading state */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-purple-400 animate-spin mb-4" />
            <p className="text-zinc-400">{statusMessage || 'Analyzing video...'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-zinc-950">
      {/* Header with pipeline status */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-purple-400" />
          <h1 className="text-lg font-bold text-white">Timeline Editor</h1>
        </div>

        {/* Center: Pipeline status */}
        <div className="flex items-center gap-4">
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
          {pipelineState.isPaused && !pipelineState.isRunning && pipelineState.currentPhase !== 'complete' && (
            <div className="flex items-center gap-3 bg-yellow-900/30 px-4 py-2 rounded-full border border-yellow-500/30">
              <StopCircle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-yellow-300">Paused</span>
              <button
                onClick={onResumeGeneration}
                className="flex items-center gap-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1 rounded-full text-xs font-medium transition-colors"
              >
                <Play className="w-3 h-3" />
                Resume
              </button>
            </div>
          )}
          {pipelineState.currentPhase === 'complete' && (
            <div className="flex items-center gap-2 bg-green-900/30 px-4 py-2 rounded-full border border-green-500/30">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-300">Complete</span>
            </div>
          )}
        </div>

        {/* Right: Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-500 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(3, zoom + 0.25))}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content - Horizontal PanelGroup for preview + sidebar */}
      <PanelGroup direction="horizontal" className="flex-1" autoSaveId="timeline-editor-horizontal">
            {/* Preview Panel */}
            <Panel defaultSize={75} minSize={40}>
              <div className="h-full flex flex-col p-4 gap-4">
                {/* Video Preview with Composite */}
                <div
                  ref={previewContainerRef}
                  className={`flex-1 relative bg-black rounded-xl overflow-hidden border ${isPickingColor ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-zinc-800'} ${isPickingColor ? 'cursor-crosshair' : ''}`}
                >
                  {/* Base Video Layer */}
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className={`absolute inset-0 w-full h-full object-contain ${!layerVisibility.video ? 'opacity-0' : ''}`}
                    playsInline
                  />

                  {/* Animation Overlay Layer - with chroma key support */}
                  {activeSegment?.videoUrl && layerVisibility.animation && (
                    <>
                      {/* Hidden video for chroma key processing */}
                      <video
                        ref={overlayVideoRef}
                        src={activeSegment.videoUrl}
                        className={`absolute inset-0 w-full h-full object-contain ${activeSegment.chromaKey?.enabled ? 'hidden' : ''}`}
                        style={!activeSegment.chromaKey?.enabled ? { mixBlendMode: 'screen' } : {}}
                        muted
                        loop
                        playsInline
                        onClick={handlePreviewClick}
                        onTimeUpdate={activeSegment.chromaKey?.enabled ? updateChromaCanvas : undefined}
                      />
                      {/* Chroma keyed canvas overlay */}
                      {activeSegment.chromaKey?.enabled && (
                        <canvas
                          ref={chromaCanvasRef}
                          className="absolute inset-0 w-full h-full object-contain"
                          onClick={handlePreviewClick}
                        />
                      )}
                    </>
                  )}

                  {/* Static Image Overlay (when no video) - with chroma key support */}
                  {activeSegment?.imageUrl && !activeSegment.videoUrl && layerVisibility.animation && (
                    <>
                      <img
                        ref={overlayImageRef}
                        src={activeSegment.imageUrl}
                        alt="Overlay"
                        className={`absolute inset-0 w-full h-full object-contain ${activeSegment.chromaKey?.enabled ? 'hidden' : ''}`}
                        style={!activeSegment.chromaKey?.enabled ? { mixBlendMode: 'screen' } : {}}
                        onClick={handlePreviewClick}
                        onLoad={activeSegment.chromaKey?.enabled ? updateChromaCanvas : undefined}
                      />
                      {/* Chroma keyed canvas overlay */}
                      {activeSegment.chromaKey?.enabled && (
                        <canvas
                          ref={chromaCanvasRef}
                          className="absolute inset-0 w-full h-full object-contain"
                          onClick={handlePreviewClick}
                        />
                      )}
                    </>
                  )}

                  {/* Eyedropper mode indicator */}
                  {isPickingColor && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-500/90 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 z-20">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      Click on overlay to pick chroma key color
                    </div>
                  )}

                  {/* Overlay Info Badge */}
                  {activeSegment && !isPickingColor && (
                    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-green-500/30">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-green-400 font-medium">{activeSegment.topic}</span>
                      </div>
                    </div>
                  )}

                  {/* Top right controls */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    {/* Layer visibility toggles */}
                    <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-lg p-1">
                      <button
                        onClick={() => toggleLayerVisibility('video')}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                          layerVisibility.video ? 'bg-blue-500/30 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                        title="Toggle Video Layer"
                      >
                        {layerVisibility.video ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        Video
                      </button>
                      <button
                        onClick={() => toggleLayerVisibility('animation')}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                          layerVisibility.animation ? 'bg-green-500/30 text-green-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                        title="Toggle Animation Layer"
                      >
                        {layerVisibility.animation ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        Overlay
                      </button>
                    </div>
                    {/* Fullscreen button */}
                    <button
                      onClick={() => previewContainerRef.current?.requestFullscreen()}
                      className="p-2 bg-black/50 hover:bg-black/70 rounded-lg text-zinc-400 hover:text-white"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Timeline Overlay at bottom of video */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-8 pb-2 px-3">
                    {/* Animation Track with Segments */}
                    <div
                      ref={animationTrackRef}
                      className="h-8 bg-zinc-800/50 rounded border border-zinc-700/50 relative overflow-visible mb-2"
                    >
                      {/* Segment clips on animation track */}
                      {analysis?.segments.map((segment) => {
                        const isVideoComplete = segment.status === 'video-success';
                        const isImageComplete = segment.status === 'image-success';
                        const left = getSegmentPosition(segment.timestamp);
                        const segmentDuration = segment.duration || 5;
                        const width = duration > 0 ? (segmentDuration / duration) * 100 : 5;
                        const isDraggingThis = segmentDrag?.segmentId === segment.id;

                        const getStatusClass = () => {
                          if (isVideoComplete) return 'bg-gradient-to-r from-green-600/80 to-green-500/60 border border-green-400/50 hover:border-green-400';
                          if (segment.status === 'generating-video') return 'bg-gradient-to-r from-purple-600/60 to-purple-500/40 border border-purple-400/50 animate-pulse';
                          if (isImageComplete) return 'bg-gradient-to-r from-blue-600/60 to-blue-500/40 border border-blue-400/50';
                          if (segment.status === 'generating-image') return 'bg-gradient-to-r from-blue-600/40 to-blue-500/20 border border-blue-400/30 animate-pulse';
                          return 'bg-zinc-700/50 border border-zinc-600/50 border-dashed';
                        };

                        return (
                          <div
                            key={`${segment.id}-${segment.status}`}
                            className={`
                              absolute top-0.5 bottom-0.5 rounded cursor-grab select-none
                              ${getStatusClass()}
                              ${activeSegment?.id === segment.id ? 'ring-2 ring-white/50' : ''}
                              ${isDraggingThis ? 'ring-2 ring-purple-500 cursor-grabbing z-20' : 'z-10'}
                            `}
                            style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                            title={`${segment.topic} (${segmentDuration}s)`}
                            onMouseDown={(e) => handleSegmentDragStart(e, segment, 'move')}
                            onClick={(e) => { e.stopPropagation(); jumpToSegment(segment); }}
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-purple-500/50 rounded-l transition-colors"
                              onMouseDown={(e) => handleSegmentDragStart(e, segment, 'resize-start')}
                            />
                            <div className="px-1.5 py-0.5 overflow-hidden pointer-events-none">
                              <span className="text-[8px] text-white font-medium truncate block">{segment.topic}</span>
                            </div>
                            <div
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-purple-500/50 rounded-r transition-colors"
                              onMouseDown={(e) => handleSegmentDragStart(e, segment, 'resize-end')}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Scrub Bar / Playhead */}
                    <div
                      ref={timelineRef}
                      className="relative h-6 bg-zinc-800/50 rounded cursor-pointer group"
                      onClick={handleTimelineClick}
                      onMouseDown={() => setIsDragging(true)}
                    >
                      {/* Progress fill */}
                      <div
                        className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-purple-600/50 to-pink-600/30 rounded-l"
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                      />
                      {/* Playhead */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg shadow-white/50 z-20 pointer-events-none"
                        style={{ left: `${(currentTime / duration) * 100}%` }}
                      >
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
                      </div>
                      {/* Time display */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-white/60 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Chroma Key Toggle Button */}
                  {activeSegment && (activeSegment.imageUrl || activeSegment.videoUrl) && (
                    <button
                      onClick={() => setShowChromaPanel(!showChromaPanel)}
                      className={`absolute bottom-4 right-4 p-2 rounded-lg transition-colors ${
                        showChromaPanel
                          ? 'bg-green-500/30 text-green-400 border border-green-500/50'
                          : 'bg-black/50 hover:bg-black/70 text-zinc-400 hover:text-white'
                      }`}
                      title="Chroma Key Settings"
                    >
                      <Sliders className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Chroma Key Controls Panel - Collapsible */}
                {showChromaPanel && activeSegment && (activeSegment.imageUrl || activeSegment.videoUrl) && (
                  <div className="shrink-0">
                    <ChromaKeyControls
                      settings={getActiveChromaSettings()}
                      onChange={handleChromaSettingsChange}
                      onPickColor={handlePickColorClick}
                      isPickingColor={isPickingColor}
                      compact={false}
                    />
                  </div>
                )}

                {/* Playback Controls */}
                <div className="flex items-center justify-center gap-4 py-2">
                  <button
                    onClick={skipBackward}
                    className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="p-3 rounded-full bg-white hover:bg-zinc-200 text-black transition-colors"
                  >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                  </button>
                  <button
                    onClick={skipForward}
                    className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                  <div className="w-px h-6 bg-zinc-800 mx-2" />
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <span className="text-sm text-zinc-400 font-mono min-w-[100px]">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </div>
            </Panel>

            {/* Horizontal Resize Handle */}
            <PanelResizeHandle className="w-1.5 bg-zinc-800 hover:bg-purple-500/50 transition-colors cursor-col-resize flex items-center justify-center group">
              <GripVertical className="w-3 h-4 text-zinc-600 group-hover:text-purple-400" />
            </PanelResizeHandle>

            {/* Segment List Sidebar */}
            <Panel defaultSize={25} minSize={15} maxSize={50}>
              <div className="h-full border-l border-zinc-800 bg-zinc-900/30 flex flex-col">
                {/* Progress Stats */}
                {analysis && (
                  <div className="p-3 border-b border-zinc-800">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-zinc-800 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-zinc-400 mb-0.5">
                          <Sparkles className="w-3 h-3" />
                          <span className="text-[10px]">Prompts</span>
                        </div>
                        <span className="text-sm font-bold text-white">
                          {pipelineState.progress.promptsGenerated}/{pipelineState.progress.totalSegments}
                        </span>
                      </div>
                      <div className="bg-zinc-800 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-zinc-400 mb-0.5">
                          <Image className="w-3 h-3" />
                          <span className="text-[10px]">Images</span>
                        </div>
                        <span className="text-sm font-bold text-white">
                          {pipelineState.progress.imagesGenerated}/{pipelineState.progress.totalSegments}
                        </span>
                      </div>
                      <div className="bg-zinc-800 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-zinc-400 mb-0.5">
                          <Video className="w-3 h-3" />
                          <span className="text-[10px]">Videos</span>
                        </div>
                        <span className="text-sm font-bold text-white">
                          {pipelineState.progress.videosGenerated}/{pipelineState.progress.totalSegments}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 border-b border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3 h-3" />
                    Segments
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {analysis?.segments.map((segment) => (
                    <div
                      key={`${segment.id}-${segment.status}-${segment.imageUrl ? 'img' : 'no-img'}`}
                      onClick={() => jumpToSegment(segment)}
                      className={`
                        p-3 border-b border-zinc-800/50 cursor-pointer transition-colors
                        ${activeSegment?.id === segment.id ? 'bg-purple-900/20 border-l-2 border-l-purple-500' : 'hover:bg-zinc-800/50'}
                      `}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {getSegmentStatusIcon(segment)}
                        <span className="font-mono text-xs text-zinc-400">{segment.formattedTime}</span>
                      </div>
                      <h4 className="text-sm font-medium text-white truncate">{segment.topic}</h4>
                      <p className="text-xs text-zinc-500 truncate mt-1">{segment.description}</p>

                      {/* Duration Controls */}
                      <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Duration:</span>
                        <div className="flex items-center gap-1 bg-zinc-800 rounded-md border border-zinc-700">
                          <button
                            onClick={() => onUpdateSegmentDuration(segment.id, Math.max(1, (segment.duration || 5) - 1))}
                            className="p-1 hover:bg-zinc-700 rounded-l-md text-zinc-400 hover:text-white transition-colors"
                            title="Decrease duration"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-mono text-zinc-300 min-w-[32px] text-center">
                            {segment.duration || 5}s
                          </span>
                          <button
                            onClick={() => onUpdateSegmentDuration(segment.id, Math.min(30, (segment.duration || 5) + 1))}
                            className="p-1 hover:bg-zinc-700 rounded-r-md text-zinc-400 hover:text-white transition-colors"
                            title="Increase duration"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Generation Action Buttons */}
                      <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                        {/* Generate Image Button - show if no image yet and not generating */}
                        {!segment.imageUrl && segment.status !== 'generating-image' && segment.status !== 'generating-video' && onGenerateSegmentImage && (
                          <button
                            onClick={() => onGenerateSegmentImage(segment)}
                            disabled={pipelineState.isRunning}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium transition-colors"
                            title="Generate Image"
                          >
                            <Sparkles className="w-3 h-3" />
                            Generate Image
                          </button>
                        )}

                        {/* Generate Video Button - show if image exists but no video yet */}
                        {segment.imageUrl && !segment.videoUrl && segment.status !== 'generating-video' && onGenerateSegmentVideo && (
                          <button
                            onClick={() => onGenerateSegmentVideo(segment)}
                            disabled={pipelineState.isRunning}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium transition-colors"
                            title="Generate Video"
                          >
                            <Film className="w-3 h-3" />
                            Animate
                          </button>
                        )}

                        {/* Regenerate Video Button - show if video already exists */}
                        {segment.videoUrl && segment.status !== 'generating-video' && onGenerateSegmentVideo && (
                          <button
                            onClick={() => onGenerateSegmentVideo(segment)}
                            disabled={pipelineState.isRunning}
                            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-medium transition-colors border border-zinc-600"
                            title="Regenerate Video"
                          >
                            <Video className="w-3 h-3" />
                            Regen Video
                          </button>
                        )}

                        {/* Show loading state when generating */}
                        {(segment.status === 'generating-image' || segment.status === 'generating-video') && (
                          <div className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-800 text-zinc-400 text-xs">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {segment.status === 'generating-image' ? 'Generating Image...' : 'Generating Video...'}
                          </div>
                        )}
                      </div>

                      {/* Segment Details - always shown */}
                      <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                        {/* Preview thumbnail */}
                        {(segment.videoUrl || segment.imageUrl) ? (
                          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-700">
                            {segment.videoUrl ? (
                              <video
                                src={segment.videoUrl}
                                className="w-full h-full object-contain"
                                muted
                                loop
                                playsInline
                                autoPlay
                              />
                            ) : segment.imageUrl ? (
                              <img
                                src={segment.imageUrl}
                                alt={segment.topic}
                                className="w-full h-full object-contain"
                              />
                            ) : null}
                          </div>
                        ) : (
                          <div className="aspect-video bg-zinc-800/50 rounded-lg border border-zinc-700 flex items-center justify-center">
                            <span className="text-xs text-zinc-500">No preview yet</span>
                          </div>
                        )}

                        {/* Prompt */}
                        {segment.prompt && (
                          <div className="bg-zinc-800/50 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Image Prompt</span>
                            </div>
                            <p className="text-xs text-zinc-300 line-clamp-3">{segment.prompt}</p>
                          </div>
                        )}

                        {/* Animation Prompt */}
                        {segment.animationPrompt && (
                          <div className="bg-zinc-800/50 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1">
                              <Film className="w-3 h-3 text-green-400" />
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Animation</span>
                            </div>
                            <p className="text-xs text-zinc-300 line-clamp-2">{segment.animationPrompt}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
      </PanelGroup>
    </div>
  );
};

export default TimelineEditor;
