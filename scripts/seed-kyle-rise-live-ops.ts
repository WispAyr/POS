/**
 * Seed Kyle Rise site with Live Ops configuration
 * 
 * Run with: npx ts-node scripts/seed-kyle-rise-live-ops.ts
 */

import { DataSource } from 'typeorm';
import { Site } from '../src/domain/entities/site.entity';

const KYLE_RISE_ID = 'kyle-rise';

const liveOpsConfig = {
  enabled: true,
  cameras: [
    { id: 'front', name: 'Ground Floor Front', protectId: '692dd5480096ea03e4000423' },
    { id: 'rear', name: 'Ground Floor Rear', protectId: '692dd54800e1ea03e4000424' },
    { id: 'ramp', name: 'Ground Floor & Ramp', protectId: '692dd5480117ea03e4000426' },
  ],
  announcements: [
    {
      id: 'cctv',
      label: 'CCTV Warning',
      message: 'Attention. This area is monitored by CCTV. All activity is being recorded.',
      target: 'cameras' as const,
      volume: 100,
    },
    {
      id: 'antisocial',
      label: 'Antisocial Behavior',
      message: 'Warning. Antisocial behavior has been detected. Please be aware that CCTV is recording and authorities may be contacted.',
      target: 'cameras' as const,
      volume: 100,
    },
    {
      id: 'closing15',
      label: 'Closing 15min',
      message: 'Attention please. The car park will be closing in 15 minutes. Please return to your vehicle.',
      target: 'cameras' as const,
      volume: 100,
    },
    {
      id: 'closing5',
      label: 'Closing 5min',
      message: 'Attention. The car park closes in 5 minutes. Please exit the premises.',
      target: 'all' as const,
      volume: 50,
    },
    {
      id: 'move',
      label: 'Move Vehicle',
      message: 'Attention. Your vehicle is parked in a restricted area. Please move your vehicle immediately.',
      target: 'cameras' as const,
      volume: 100,
    },
  ],
  controls: {},
};

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'pos_user',
    password: process.env.DB_PASSWORD || 'pos_pass',
    database: process.env.DB_DATABASE || 'pos_db',
    entities: [Site],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Connected to database');

  const siteRepo = dataSource.getRepository(Site);

  // Find Kyle Rise site
  let site = await siteRepo.findOne({ where: { id: KYLE_RISE_ID } });

  if (!site) {
    // Try to find by name pattern
    site = await siteRepo.findOne({ 
      where: [
        { name: 'Kyle Rise' },
        { name: 'Kyle Rise Car Park' },
      ] 
    });
  }

  if (!site) {
    console.log('Kyle Rise site not found. Available sites:');
    const allSites = await siteRepo.find();
    allSites.forEach((s) => console.log(`  - ${s.id}: ${s.name}`));
    
    // Create the site if it doesn't exist
    console.log('\nCreating Kyle Rise site with live ops config...');
    site = siteRepo.create({
      id: KYLE_RISE_ID,
      name: 'Kyle Rise',
      config: {
        operatingModel: 'ANPR',
        liveOps: liveOpsConfig,
      },
      active: true,
    });
    await siteRepo.save(site);
    console.log('Kyle Rise site created with live ops config');
  } else {
    // Update existing site with live ops config
    console.log(`Found site: ${site.id} - ${site.name}`);
    site.config = {
      ...site.config,
      liveOps: liveOpsConfig,
    };
    await siteRepo.save(site);
    console.log('Updated Kyle Rise with live ops config');
  }

  console.log('\nLive Ops Config:');
  console.log(JSON.stringify(site.config.liveOps, null, 2));

  await dataSource.destroy();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
