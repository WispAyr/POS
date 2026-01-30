import { useState } from 'react';
import { CarParkLive } from './CarParkLive';
import { CarParkLiveDetail } from './CarParkLiveDetail';

export function CarParkLiveView() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  if (selectedSiteId) {
    return (
      <CarParkLiveDetail
        siteId={selectedSiteId}
        onBack={() => setSelectedSiteId(null)}
      />
    );
  }

  return <CarParkLive onSelectSite={(siteId) => setSelectedSiteId(siteId)} />;
}
