export interface CameraLastDetection {
  timestamp: string | null;
  vrm: string | null;
  imageUrl: string | null;
}

export interface CameraStatus {
  cameraId: string;
  name: string;
  direction: 'ENTRY' | 'EXIT' | 'INTERNAL' | null;
  lastDetection: CameraLastDetection;
  status: 'online' | 'offline' | 'warning';
}

export interface SiteStats {
  today: {
    entries: number;
    exits: number;
    violations: number;
  };
  hourlyActivity: { hour: number; count: number }[];
}

export interface SiteHealth {
  status: 'healthy' | 'warning' | 'critical';
  lastSync: string | null;
}

export interface OperationsSiteData {
  siteId: string;
  siteName: string;
  cameras: CameraStatus[];
  stats: SiteStats;
  health: SiteHealth;
}

export interface OperationsDashboardResponse {
  sites: OperationsSiteData[];
  summary: {
    totalActiveAlarms: number;
    reviewQueueCount: number;
    systemStatus: 'healthy' | 'warning' | 'critical';
  };
  generatedAt: string;
}
