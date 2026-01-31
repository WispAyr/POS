import { useState } from 'react';
import { Camera, Clock, ArrowUpCircle, ArrowDownCircle, X, RotateCcw, Trash2, RefreshCw, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { ImageWithLoader, ThumbnailWithLoader } from './ImageWithLoader';
import axios from 'axios';

interface EventImage {
  url: string;
  type: 'plate' | 'overview';
}

interface HailoResult {
  vehicleCount?: number;
  confidence?: number;
  detections?: Array<{
    class: string;
    confidence: number;
    bbox?: number[];
  }>;
}

interface EventProps {
  id: string;
  vrm: string;
  siteId: string;
  timestamp: string;
  direction: string;
  cameraIds: string;
  images?: EventImage[];
  discarded?: boolean;
  hailoValidated?: boolean;
  hailoVehicleCount?: number;
  hailoConfidence?: number;
  hailoResult?: HailoResult;
  onUpdate?: () => void; // Callback to refresh parent list
}

export function EventCard({
  id,
  vrm,
  siteId,
  timestamp,
  direction,
  cameraIds,
  images,
  discarded,
  hailoValidated,
  hailoVehicleCount,
  hailoConfidence,
  hailoResult,
  onUpdate,
}: EventProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [showHailoDetails, setShowHailoDetails] = useState(false);

  const handleFlipDirection = async () => {
    if (isFlipping) return;
    setIsFlipping(true);
    try {
      await axios.patch(`/api/movements/${id}/flip-direction`, {
        reprocessSession: true,
      });
      onUpdate?.();
    } catch (error) {
      console.error('Failed to flip direction:', error);
      alert('Failed to flip direction');
    } finally {
      setIsFlipping(false);
    }
  };

  const handleSetDirection = async (newDirection: 'ENTRY' | 'EXIT') => {
    if (isFlipping) return;
    setIsFlipping(true);
    try {
      await axios.patch(`/api/movements/${id}/set-direction`, {
        direction: newDirection,
        reprocessSession: true,
      });
      onUpdate?.();
    } catch (error) {
      console.error('Failed to set direction:', error);
      alert('Failed to set direction');
    } finally {
      setIsFlipping(false);
    }
  };

  const handleDiscard = async () => {
    if (isDiscarding) return;
    const reason = prompt('Reason for discarding (optional):');
    if (reason === null) return; // User cancelled
    
    setIsDiscarding(true);
    try {
      await axios.patch(`/api/movements/${id}/discard`, { reason });
      onUpdate?.();
    } catch (error) {
      console.error('Failed to discard:', error);
      alert('Failed to discard movement');
    } finally {
      setIsDiscarding(false);
    }
  };

  const handleRestore = async () => {
    try {
      await axios.patch(`/api/movements/${id}/restore`);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to restore:', error);
      alert('Failed to restore movement');
    }
  };

  // Resolve relative URLs to full API URLs
  const API_BASE = '';
  const resolveImageUrl = (url: string | undefined) => {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    return `${API_BASE}${url}`;
  };

  const plateImage = resolveImageUrl(
    images?.find((i) => i.type === 'plate')?.url,
  );
  const overviewImage = resolveImageUrl(
    images?.find((i) => i.type === 'overview')?.url,
  );

  const isEntry = direction === 'ENTRY';
  const isExit = direction === 'EXIT';
  const isUnknown = direction === 'UNKNOWN' || (!isEntry && !isExit);
  const formattedTime = new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const openImageModal = (url: string) => {
    setSelectedImage(url);
    setShowModal(true);
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden hover:shadow-lg dark:hover:shadow-black/50 transition-all duration-300 group">
        {/* Image Section */}
        <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden">
          {overviewImage ? (
            <ImageWithLoader
              src={overviewImage}
              alt="Overview"
              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
              onClick={() => openImageModal(overviewImage)}
            />
          ) : plateImage ? (
            <ImageWithLoader
              src={plateImage}
              alt={`Plate ${vrm}`}
              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
              onClick={() => openImageModal(plateImage)}
            />
          ) : (
            <ImageWithLoader
              src={undefined}
              alt="No image"
              showPlaceholderIcon={true}
            />
          )}

          {/* Direction Badge */}
          <div
            className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm ${
              isEntry
                ? 'bg-emerald-500/90 text-white'
                : isExit
                  ? 'bg-rose-500/90 text-white'
                  : 'bg-amber-500/90 text-white'
            }`}
          >
            {isEntry ? (
              <ArrowDownCircle className="w-3.5 h-3.5" />
            ) : isExit ? (
              <ArrowUpCircle className="w-3.5 h-3.5" />
            ) : (
              <HelpCircle className="w-3.5 h-3.5" />
            )}
            {direction}
          </div>

          {/* Hailo Validation Badge */}
          {hailoValidated !== undefined && (
            <div
              className={`absolute top-3 right-3 px-2 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 backdrop-blur-sm cursor-pointer transition-transform hover:scale-105 ${
                hailoValidated && hailoVehicleCount && hailoVehicleCount > 0
                  ? 'bg-green-500/90 text-white'
                  : hailoValidated && hailoVehicleCount === 0
                    ? 'bg-red-500/90 text-white'
                    : 'bg-gray-500/90 text-white'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setShowHailoDetails(!showHailoDetails);
              }}
              title={
                hailoValidated
                  ? `AI: ${hailoVehicleCount} vehicle(s) detected (${Math.round((hailoConfidence || 0) * 100)}% conf)`
                  : 'AI validation pending'
              }
            >
              {hailoValidated && hailoVehicleCount && hailoVehicleCount > 0 ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : hailoValidated && hailoVehicleCount === 0 ? (
                <XCircle className="w-3.5 h-3.5" />
              ) : (
                <HelpCircle className="w-3.5 h-3.5" />
              )}
              {hailoValidated ? 'AI' : '?'}
            </div>
          )}

          {/* Plate thumbnail */}
          {overviewImage && plateImage && (
            <div
              className="absolute bottom-2 right-2 w-20 h-10 rounded-lg overflow-hidden border-2 border-white/50 shadow-lg cursor-pointer hover:scale-110 transition-transform bg-black"
              onClick={(e) => {
                e.stopPropagation();
                openImageModal(plateImage);
              }}
            >
              <ThumbnailWithLoader
                src={plateImage}
                alt="Plate Crop"
                className="w-full h-full object-contain"
              />
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className={`p-4 ${discarded ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xl font-bold tracking-wider font-mono transition-colors ${discarded ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
              {vrm}
            </span>
            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 rounded-md font-medium transition-colors">
              {siteId}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 transition-colors">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formattedTime}
            </div>
            <div className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              {cameraIds}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
            {discarded ? (
              <button
                onClick={handleRestore}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore
              </button>
            ) : isUnknown ? (
              <>
                <button
                  onClick={() => handleSetDirection('ENTRY')}
                  disabled={isFlipping}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                  title="Set as Entry"
                >
                  <ArrowDownCircle className={`w-3.5 h-3.5 ${isFlipping ? 'animate-pulse' : ''}`} />
                  Make Entry
                </button>
                <button
                  onClick={() => handleSetDirection('EXIT')}
                  disabled={isFlipping}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors disabled:opacity-50"
                  title="Set as Exit"
                >
                  <ArrowUpCircle className={`w-3.5 h-3.5 ${isFlipping ? 'animate-pulse' : ''}`} />
                  Make Exit
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={isDiscarding}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                  title="Discard this event"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${isDiscarding ? 'animate-pulse' : ''}`} />
                  Discard
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleFlipDirection}
                  disabled={isFlipping}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                  title={`Change to ${isEntry ? 'EXIT' : 'ENTRY'}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFlipping ? 'animate-spin' : ''}`} />
                  Flip to {isEntry ? 'Exit' : 'Entry'}
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={isDiscarding}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                  title="Discard this event"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${isDiscarding ? 'animate-pulse' : ''}`} />
                  Discard
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {/* Image Modal */}
      {showModal && selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
              onClick={() => setShowModal(false)}
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Hailo Details Modal */}
      {showHailoDetails && hailoValidated !== undefined && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowHailoDetails(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {hailoValidated && hailoVehicleCount && hailoVehicleCount > 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : hailoValidated && hailoVehicleCount === 0 ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <HelpCircle className="w-5 h-5 text-gray-500" />
                )}
                AI Validation Details
              </h3>
              <button
                onClick={() => setShowHailoDetails(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-600 dark:text-gray-400">Status</span>
                <span
                  className={`font-medium ${
                    hailoValidated && hailoVehicleCount && hailoVehicleCount > 0
                      ? 'text-green-600 dark:text-green-400'
                      : hailoValidated && hailoVehicleCount === 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {hailoValidated
                    ? hailoVehicleCount && hailoVehicleCount > 0
                      ? 'Vehicle Confirmed'
                      : 'No Vehicle Detected'
                    : 'Pending Validation'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-600 dark:text-gray-400">Vehicles Detected</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {hailoVehicleCount ?? '-'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-600 dark:text-gray-400">Confidence</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {hailoConfidence ? `${Math.round(hailoConfidence * 100)}%` : '-'}
                </span>
              </div>

              {hailoResult?.detections && hailoResult.detections.length > 0 && (
                <div className="pt-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Detections:
                  </span>
                  <div className="mt-2 space-y-1">
                    {hailoResult.detections.map((det, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-sm bg-gray-50 dark:bg-slate-800 px-3 py-1.5 rounded"
                      >
                        <span className="text-gray-700 dark:text-gray-300 capitalize">
                          {det.class}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
              Powered by Hailo-8 Edge AI
            </div>
          </div>
        </div>
      )}
    </>
  );
}
