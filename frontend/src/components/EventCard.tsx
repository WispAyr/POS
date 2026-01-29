import { useState } from 'react';
import { Camera, Clock, ArrowUpCircle, ArrowDownCircle, X } from 'lucide-react';

interface EventImage {
    url: string;
    type: 'plate' | 'overview';
}

interface EventProps {
    id: string;
    vrm: string;
    siteId: string;
    timestamp: string;
    direction: string;
    cameraIds: string;
    images?: EventImage[];
}

export function EventCard({ vrm, siteId, timestamp, direction, cameraIds, images }: EventProps) {
    const [showModal, setShowModal] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Resolve relative URLs to full API URLs
    const resolveImageUrl = (url: string | undefined) => {
        if (!url) return undefined;
        if (url.startsWith('http')) return url;
        return url; // Relative URLs will use current origin
    };

    const plateImage = resolveImageUrl(images?.find(i => i.type === 'plate')?.url);
    const overviewImage = resolveImageUrl(images?.find(i => i.type === 'overview')?.url);

    const isEntry = direction === 'ENTRY';
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
                        <img
                            src={overviewImage}
                            alt="Overview"
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onClick={() => openImageModal(overviewImage)}
                        />
                    ) : plateImage ? (
                        <img
                            src={plateImage}
                            alt={`Plate ${vrm}`}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onClick={() => openImageModal(plateImage)}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <Camera className="w-12 h-12 opacity-30" />
                        </div>
                    )}

                    {/* Direction Badge */}
                    <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm ${isEntry
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-rose-500/90 text-white'
                        }`}>
                        {isEntry ? <ArrowDownCircle className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                        {direction}
                    </div>

                    {/* Plate thumbnail */}
                    {overviewImage && plateImage && (
                        <div
                            className="absolute bottom-2 right-2 w-20 h-10 rounded-lg overflow-hidden border-2 border-white/50 shadow-lg cursor-pointer hover:scale-110 transition-transform bg-black"
                            onClick={(e) => {
                                e.stopPropagation();
                                openImageModal(plateImage);
                            }}
                        >
                            <img
                                src={plateImage}
                                alt="Plate Crop"
                                className="w-full h-full object-contain"
                                loading="lazy"
                            />
                        </div>
                    )}
                </div>

                {/* Info Section */}
                <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xl font-bold text-gray-900 dark:text-white tracking-wider font-mono transition-colors">{vrm}</span>
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 rounded-md font-medium transition-colors">{siteId}</span>
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
                </div>
            </div>

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
        </>
    );
}
