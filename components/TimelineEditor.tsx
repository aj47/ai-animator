
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Layers, Film, Sparkles, ChevronLeft, Eye, EyeOff,
  Diamond, Maximize2, ZoomIn, ZoomOut, Clock, GripVertical, GripHorizontal,
  Plus, Minus
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AnalysisResult, Segment } from '../types';
import { formatTime } from '../utils/videoUtils';

interface TimelineEditorProps {
  videoUrl: string;
  analysis: AnalysisResult;
  onBack: () => void;
  onViewSegment: (segment: Segment) => void;
  onUpdateSegmentDuration: (segmentId: string, newDuration: number) => void;
  onUpdateSegmentTimestamp: (segmentId: string, newTimestamp: number) => void;
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
  onBack,
  onViewSegment,
  onUpdateSegmentDuration,
  onUpdateSegmentTimestamp
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);
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

  // Find the currently active segment based on playback time
  const findActiveSegment = useCallback((time: number): Segment | null => {
    // Find segment that contains this time (using segment's duration)
    for (const segment of analysis.segments) {
      const segmentDuration = segment.duration || 5;
      if (time >= segment.timestamp && time < segment.timestamp + segmentDuration) {
        return segment;
      }
    }
    return null;
  }, [analysis.segments]);

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
  }, [findActiveSegment, isPlaying]);

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

    const segment = analysis.segments.find(s => s.id === segmentDrag.segmentId);
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
  }, [segmentDrag, duration, analysis.segments, onUpdateSegmentTimestamp, onUpdateSegmentDuration]);

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

  return (
    <div className="w-full h-screen flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Results
        </button>
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Film className="w-4 h-4 text-purple-400" />
          Timeline Editor
        </h2>
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

      {/* Main Content - Vertical PanelGroup for main area and timeline */}
      <PanelGroup direction="vertical" className="flex-1" autoSaveId="timeline-editor-vertical">
        {/* Top Section: Preview + Sidebar */}
        <Panel defaultSize={70} minSize={40}>
          <PanelGroup direction="horizontal" className="h-full" autoSaveId="timeline-editor-horizontal">
            {/* Preview Panel */}
            <Panel defaultSize={75} minSize={40}>
              <div className="h-full flex flex-col p-4 gap-4">
                {/* Video Preview with Composite */}
                <div ref={previewContainerRef} className="flex-1 relative bg-black rounded-xl overflow-hidden border border-zinc-800">
                  {/* Base Video Layer */}
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className={`absolute inset-0 w-full h-full object-contain ${!layerVisibility.video ? 'opacity-0' : ''}`}
                    playsInline
                  />

                  {/* Animation Overlay Layer */}
                  {activeSegment?.videoUrl && layerVisibility.animation && (
                    <video
                      ref={overlayVideoRef}
                      src={activeSegment.videoUrl}
                      className="absolute inset-0 w-full h-full object-contain mix-blend-screen"
                      muted
                      loop
                      playsInline
                    />
                  )}

                  {/* Static Image Overlay (when no video) */}
                  {activeSegment?.imageUrl && !activeSegment.videoUrl && layerVisibility.animation && (
                    <img
                      src={activeSegment.imageUrl}
                      alt="Overlay"
                      className="absolute inset-0 w-full h-full object-contain mix-blend-screen"
                    />
                  )}

                  {/* Overlay Info Badge */}
                  {activeSegment && (
                    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-green-500/30">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-green-400 font-medium">{activeSegment.topic}</span>
                      </div>
                    </div>
                  )}

                  {/* Fullscreen button */}
                  <button
                    onClick={() => previewContainerRef.current?.requestFullscreen()}
                    className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-zinc-400 hover:text-white"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

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
                <div className="p-3 border-b border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Keyframes
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {analysis.segments.map((segment) => (
                    <div
                      key={segment.id}
                      onClick={() => jumpToSegment(segment)}
                      className={`
                        p-3 border-b border-zinc-800/50 cursor-pointer transition-colors
                        ${activeSegment?.id === segment.id ? 'bg-purple-900/20 border-l-2 border-l-purple-500' : 'hover:bg-zinc-800/50'}
                      `}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Diamond className={`w-3 h-3 ${segment.status.includes('success') ? 'text-green-400' : 'text-zinc-500'}`} />
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

                      {segment.status.includes('success') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewSegment(segment); }}
                          className="mt-2 text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          View Details
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        {/* Vertical Resize Handle */}
        <PanelResizeHandle className="h-1.5 bg-zinc-800 hover:bg-purple-500/50 transition-colors cursor-row-resize flex items-center justify-center group">
          <GripHorizontal className="w-4 h-3 text-zinc-600 group-hover:text-purple-400" />
        </PanelResizeHandle>

        {/* Timeline Panel */}
        <Panel defaultSize={30} minSize={15} maxSize={60}>
          <div className="h-full border-t border-zinc-800 bg-zinc-900/50 overflow-auto">
        {/* Layer Controls */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800/50">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Layers className="w-3 h-3" />
            <span className="font-medium">Layers:</span>
          </div>
          <button
            onClick={() => toggleLayerVisibility('video')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              layerVisibility.video ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {layerVisibility.video ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Video
          </button>
          <button
            onClick={() => toggleLayerVisibility('animation')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              layerVisibility.animation ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {layerVisibility.animation ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Animation
          </button>
        </div>

        {/* Timeline Tracks */}
        <div className="px-4 py-3" style={{ minWidth: `${100 * zoom}%` }}>
          {/* Time Ruler */}
          <div className="flex items-end h-6 mb-2 relative">
            {duration > 0 && Array.from({ length: Math.ceil(duration / 10) + 1 }).map((_, i) => {
              const time = i * 10;
              const position = (time / duration) * 100;
              if (position > 100) return null;
              return (
                <div
                  key={i}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: `${position}%` }}
                >
                  <span className="text-[10px] text-zinc-500 font-mono">{formatTime(time)}</span>
                  <div className="w-px h-2 bg-zinc-700 mt-0.5" />
                </div>
              );
            })}
          </div>

          {/* Video Track */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-20 shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">Video</span>
            </div>
            <div className="flex-1 h-8 bg-blue-900/20 rounded border border-blue-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 via-blue-600/20 to-blue-500/30" />
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center">
                <span className="text-[10px] text-blue-400/60 font-medium">Source Video</span>
              </div>
            </div>
          </div>

          {/* Animation Track */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-20 shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-green-400 font-bold">Animation</span>
            </div>
            <div
              ref={animationTrackRef}
              className="flex-1 h-10 bg-zinc-800/50 rounded border border-zinc-700 relative overflow-visible"
            >
              {/* Segment clips on animation track */}
              {analysis.segments.map((segment) => {
                const hasContent = segment.status.includes('success');
                const left = getSegmentPosition(segment.timestamp);
                const segmentDuration = segment.duration || 5;
                const width = duration > 0 ? (segmentDuration / duration) * 100 : 5;
                const isDraggingThis = segmentDrag?.segmentId === segment.id;

                return (
                  <div
                    key={segment.id}
                    className={`
                      absolute top-1 bottom-1 rounded cursor-grab select-none group/segment
                      ${hasContent
                        ? 'bg-gradient-to-r from-green-600/80 to-green-500/60 border border-green-400/50 hover:border-green-400'
                        : 'bg-zinc-700/50 border border-zinc-600/50 border-dashed'}
                      ${activeSegment?.id === segment.id ? 'ring-2 ring-white/50' : ''}
                      ${isDraggingThis ? 'ring-2 ring-purple-500 cursor-grabbing z-20' : 'z-10'}
                    `}
                    style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                    title={`${segment.topic} (${segmentDuration}s)`}
                    onMouseDown={(e) => handleSegmentDragStart(e, segment, 'move')}
                    onClick={(e) => { e.stopPropagation(); jumpToSegment(segment); }}
                  >
                    {/* Left resize handle */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-500/50 rounded-l transition-colors"
                      onMouseDown={(e) => handleSegmentDragStart(e, segment, 'resize-start')}
                    />

                    {/* Content */}
                    <div className="px-2 py-0.5 overflow-hidden pointer-events-none">
                      <span className="text-[9px] text-white font-medium truncate block">{segment.topic}</span>
                      <span className="text-[8px] text-white/60 font-mono">{segmentDuration}s</span>
                    </div>

                    {/* Right resize handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-500/50 rounded-r transition-colors"
                      onMouseDown={(e) => handleSegmentDragStart(e, segment, 'resize-end')}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrub Bar / Playhead */}
          <div
            ref={timelineRef}
            className="relative h-10 bg-zinc-800/30 rounded-lg cursor-pointer group"
            onClick={handleTimelineClick}
            onMouseDown={() => setIsDragging(true)}
          >
            {/* Progress fill */}
            <div
              className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-purple-600/30 to-pink-600/20 rounded-l-lg"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />

            {/* Keyframe markers */}
            {analysis.segments.map((segment) => {
              const position = getSegmentPosition(segment.timestamp);
              const hasContent = segment.status.includes('success');

              return (
                <div
                  key={segment.id}
                  className="absolute top-0 bottom-0 flex flex-col items-center justify-center z-10"
                  style={{ left: `${position}%` }}
                >
                  <div
                    className={`
                      w-3 h-3 rotate-45 cursor-pointer transition-transform hover:scale-125
                      ${hasContent
                        ? 'bg-green-500 shadow-lg shadow-green-500/50'
                        : 'bg-zinc-500 border-2 border-zinc-400'}
                      ${activeSegment?.id === segment.id ? 'scale-125 ring-2 ring-white' : ''}
                    `}
                    onClick={(e) => { e.stopPropagation(); jumpToSegment(segment); }}
                    title={`${segment.formattedTime} - ${segment.topic}`}
                  />
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg shadow-white/50 z-20 pointer-events-none"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
            </div>

            {/* Hover time indicator */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="absolute top-0 left-0 h-full w-full" />
            </div>
          </div>
        </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default TimelineEditor;
