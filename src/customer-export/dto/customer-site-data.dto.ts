export interface WhitelistEntry {
  vrm: string;
  type: 'WHITELIST' | 'RESIDENT' | 'STAFF' | 'CONTRACTOR' | 'QRWHITELIST';
  validFrom: string; // ISO timestamp
  validUntil: string | null; // null = indefinite
}

export interface ParkingEntry {
  vrm: string;
  startTime: string; // ISO timestamp
  expiryTime: string; // ISO timestamp
}

export interface SiteConfig {
  operatingModel: string;
  gracePeriods?: {
    entry?: number;
    exit?: number;
  };
}

export interface SiteStats {
  whitelistCount: number;
  activePaymentsCount: number;
}

export interface CustomerSiteData {
  // Site metadata
  siteId: string;
  siteName: string;
  generatedAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp (generatedAt + TTL)

  // Site configuration (public-safe subset)
  config: SiteConfig;

  // Active whitelist entries (permits)
  whitelist: WhitelistEntry[];

  // Active parking sessions (payments)
  parking: ParkingEntry[];

  // Statistics
  stats: SiteStats;
}
