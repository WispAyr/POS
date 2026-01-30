// Live Operations Types

export interface LiveOpsCamera {
  id: string;
  name: string;
  protectId: string; // UniFi Protect camera ID
}

export interface LiveOpsAnnouncement {
  id: string;
  label: string;
  message: string;
  target: 'cameras' | 'horn' | 'all';
  volume: number; // 0-100
}

export interface LiveOpsControls {
  barrier?: {
    enabled: boolean;
    apiEndpoint?: string;
  };
  // Add more control types as needed
}

export interface LiveOpsConfig {
  enabled: boolean;
  cameras?: LiveOpsCamera[];
  announcements?: LiveOpsAnnouncement[];
  controls?: LiveOpsControls;
  unifiNvr?: {
    host: string;
    apiKey: string;
  };
}

export interface AnnounceRequestDto {
  message: string;
  target?: 'cameras' | 'horn' | 'all';
  volume?: number;
}

export interface AnnouncementResult {
  success: boolean;
  message: string;
  target: string;
  volume: number;
  timestamp: Date;
}

export interface CameraSnapshotResult {
  success: boolean;
  contentType: string;
  data?: Buffer;
  error?: string;
}
