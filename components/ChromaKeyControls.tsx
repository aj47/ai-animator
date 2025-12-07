import React, { useState, useCallback } from 'react';
import { Pipette, Sliders, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { ChromaKeySettings, DEFAULT_CHROMA_KEY_SETTINGS } from '../types';

interface ChromaKeyControlsProps {
  settings: ChromaKeySettings;
  onChange: (settings: ChromaKeySettings) => void;
  onPickColor: () => void;
  isPickingColor: boolean;
  compact?: boolean;
}

const ChromaKeyControls: React.FC<ChromaKeyControlsProps> = ({
  settings,
  onChange,
  onPickColor,
  isPickingColor,
  compact = false
}) => {
  const handleToggle = () => {
    onChange({ ...settings, enabled: !settings.enabled });
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...settings, keyColor: e.target.value });
  };

  const handleSliderChange = (key: keyof ChromaKeySettings, value: number) => {
    onChange({ ...settings, [key]: value });
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_CHROMA_KEY_SETTINGS });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
        <button
          onClick={handleToggle}
          className={`p-1.5 rounded transition-colors ${
            settings.enabled ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'
          }`}
          title={settings.enabled ? 'Disable chroma key' : 'Enable chroma key'}
        >
          {settings.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded border border-zinc-600 cursor-pointer"
            style={{ backgroundColor: settings.keyColor }}
            onClick={onPickColor}
            title="Key color"
          />
          <button
            onClick={onPickColor}
            className={`p-1.5 rounded transition-colors ${
              isPickingColor ? 'bg-purple-500/30 text-purple-400' : 'hover:bg-zinc-700 text-zinc-400'
            }`}
            title="Pick color from image"
          >
            <Pipette className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-zinc-500 shrink-0">Tol</span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.tolerance}
            onChange={(e) => handleSliderChange('tolerance', Number(e.target.value))}
            className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-green-500"
            disabled={!settings.enabled}
          />
          <span className="text-[10px] text-zinc-400 w-6">{settings.tolerance}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-bold text-white">Chroma Key</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              settings.enabled
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
            }`}
          >
            {settings.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* Color Picker */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400 font-medium">Key Color</label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="color"
              value={settings.keyColor}
              onChange={handleColorChange}
              className="w-12 h-10 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
              disabled={!settings.enabled}
            />
          </div>
          <button
            onClick={onPickColor}
            disabled={!settings.enabled}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isPickingColor
                ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50 ring-2 ring-purple-500/30'
                : settings.enabled
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                  : 'bg-zinc-800/50 text-zinc-600 border border-zinc-800 cursor-not-allowed'
            }`}
          >
            <Pipette className="w-4 h-4" />
            {isPickingColor ? 'Click on image...' : 'Pick from Image'}
          </button>
          <span className="text-xs text-zinc-500 font-mono">{settings.keyColor.toUpperCase()}</span>
        </div>
      </div>

      {/* Tolerance Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400 font-medium">Tolerance</label>
          <span className="text-xs text-zinc-500">{settings.tolerance}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={settings.tolerance}
          onChange={(e) => handleSliderChange('tolerance', Number(e.target.value))}
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500"
          disabled={!settings.enabled}
        />
        <p className="text-[10px] text-zinc-600">How much color variance to remove</p>
      </div>

      {/* Spill Suppression Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400 font-medium">Spill Suppression</label>
          <span className="text-xs text-zinc-500">{settings.spillSuppression}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={settings.spillSuppression}
          onChange={(e) => handleSliderChange('spillSuppression', Number(e.target.value))}
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          disabled={!settings.enabled}
        />
        <p className="text-[10px] text-zinc-600">Reduce color spill on edges</p>
      </div>

      {/* Edge Softness Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400 font-medium">Edge Softness</label>
          <span className="text-xs text-zinc-500">{settings.edgeSoftness}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={settings.edgeSoftness}
          onChange={(e) => handleSliderChange('edgeSoftness', Number(e.target.value))}
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
          disabled={!settings.enabled}
        />
        <p className="text-[10px] text-zinc-600">Feather the keyed edges</p>
      </div>
    </div>
  );
};

export default ChromaKeyControls;
