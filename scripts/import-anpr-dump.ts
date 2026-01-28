import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AnprIngestionService } from '../src/ingestion/services/anpr-ingestion.service';
import { IngestAnprDto } from '../src/ingestion/dto/ingest-anpr.dto';
import * as fs from 'fs';
import * as path from 'path';

async function importAnprDump() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const anprService = app.get(AnprIngestionService);

  const dumpDir = '/Users/ewanrichardson/Downloads/anpr-results';
  const files = fs.readdirSync(dumpDir).filter((f) => f.endsWith('.json'));

  console.log(`Found ${files.length} JSON files to import`);

  // Read all files and extract timestamps for sorting
  console.log('Reading and sorting movements by timestamp...');
  const movements: Array<{ file: string; timestamp: Date; data: any }> = [];

  for (const file of files) {
    try {
      const filePath = path.join(dumpDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Skip invalid entries
      if (
        !data.plateNumber ||
        data.plateNumber === 'unknown' ||
        data.plateNumber === ''
      ) {
        continue;
      }

      const timestamp = data.timestamp
        ? new Date(data.timestamp)
        : new Date();

      movements.push({ file, timestamp, data });
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }

  // Sort by timestamp ASCENDING (oldest first)
  movements.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  console.log(
    `Sorted ${movements.length} movements chronologically. Processing...`,
  );

  let processed = 0;
  let success = 0;
  let errors = 0;

  // Process sequentially to maintain chronological order
  for (const { file, data } of movements) {
    try {
      const dto = new IngestAnprDto();
          dto.cameraId = data.cameraId;
          dto.direction = data.direction;
          dto.timestamp = data.timestamp
            ? new Date(data.timestamp).toISOString()
            : new Date().toISOString();
          dto.plateNumber = data.plateNumber;
          dto.cameraType = data.cameraType;
          dto.confidence = data.confidence;

          // Map siteId from cameraId
          dto.siteId = deriveSiteIdFromCameraName(data.cameraId);

          // Extract and save base64 images from rawData
          dto.images = [];
          const eventId = data.id;

          // Hikvision cameras: images in rawData.decodes[0]
          if (data.rawData?.decodes?.[0]) {
            const decode = data.rawData.decodes[0];

            // Save plate image if exists
            if (decode.plate && decode.plate.length > 0) {
              try {
                const plateFilename = `${eventId}-plate.jpg`;
                const platePath = path.join(
                  '/Users/ewanrichardson/Development/POS/uploads/images',
                  plateFilename,
                );
                const plateBuffer = Buffer.from(decode.plate, 'base64');
                fs.writeFileSync(platePath, plateBuffer);
                dto.images.push({
                  url: `/api/images/${plateFilename}`,
                  type: 'plate',
                });
              } catch (err) {
                // Ignore image save errors
              }
            }

            // Save overview image if exists
            if (decode.overview && decode.overview.length > 0) {
              try {
                const overviewFilename = `${eventId}-overview.jpg`;
                const overviewPath = path.join(
                  '/Users/ewanrichardson/Development/POS/uploads/images',
                  overviewFilename,
                );
                const overviewBuffer = Buffer.from(decode.overview, 'base64');
                fs.writeFileSync(overviewPath, overviewBuffer);
                dto.images.push({
                  url: `/api/images/${overviewFilename}`,
                  type: 'overview',
                });
              } catch (err) {
                // Ignore image save errors
              }
            }
          }
          // Axis cameras: images in SOAP envelope
          else if (data.rawData?.['soapenv:Envelope']?.['soapenv:Body']?.CameraToInstation?.ImageArray?.Image) {
            const images = data.rawData['soapenv:Envelope']['soapenv:Body'].CameraToInstation.ImageArray.Image;
            const imageArray = Array.isArray(images) ? images : [images];

            for (const img of imageArray) {
              try {
                if (img.ImageType === 'platePatch' && img.BinaryImage) {
                  const plateFilename = `${eventId}-plate.jpg`;
                  const platePath = path.join(
                    '/Users/ewanrichardson/Development/POS/uploads/images',
                    plateFilename,
                  );
                  const plateBuffer = Buffer.from(img.BinaryImage, 'base64');
                  fs.writeFileSync(platePath, plateBuffer);
                  dto.images.push({
                    url: `/api/images/${plateFilename}`,
                    type: 'plate',
                  });
                } else if (img.ImageType === 'overviewImage' && img.BinaryImage) {
                  const overviewFilename = `${eventId}-overview.jpg`;
                  const overviewPath = path.join(
                    '/Users/ewanrichardson/Development/POS/uploads/images',
                    overviewFilename,
                  );
                  const overviewBuffer = Buffer.from(img.BinaryImage, 'base64');
                  fs.writeFileSync(overviewPath, overviewBuffer);
                  dto.images.push({
                    url: `/api/images/${overviewFilename}`,
                    type: 'overview',
                  });
                }
              } catch (err) {
                // Ignore image save errors
              }
            }
          }

          await anprService.ingest(dto);
          success++;
        } catch (err: unknown) {
          errors++;
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          console.error(`Error processing ${file}: ${errorMessage}`);
        }

    processed++;
    if (processed % 100 === 0) {
      console.log(
        `Progress: ${processed}/${movements.length} (${success} success, ${errors} errors)`,
      );
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Total movements: ${movements.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Success: ${success}`);
  console.log(`Errors: ${errors}`);

  await app.close();
}

function deriveSiteIdFromCameraName(cameraName: string): string {
  const patterns: { [key: string]: string } = {
    yorkshireinbusiness: 'YIB01',
    semourmalthouselan: 'SMM01',
    southport: 'SPS01',
    greenford: 'GRN01',
    kickoff: 'KOD01',
    aspect: 'ASP01',
    kent_wharf: 'KWF01',
    kentwharf: 'KWF01',
    radisson: 'RDB01',
    kyle: 'KMS01',
    bridlington: 'BPD01',
    coastal: 'CPZ01',
    yibby: 'YIB01',
    bognor: 'BGH01',
    sydney: 'SYD01',
    san: 'SAN01',
    cambridge: 'CAM01',
    torpedoes: 'TPT01',
    victoria: 'VPE01',
    wembley: 'WML01',
    springfields: 'SPS01',
    kempston: 'KCS01',
    arcadia: 'ARC01',
    ribblesdale: 'RBF01',
    chatham: 'CHM01',
    surbiton: 'SRL01',
    west_point: 'WPS01',
    westpoint: 'WPS01',
    summer: 'SMM01',
    redbridge: 'RDB01',
  };

  const lowerCameraName = cameraName.toLowerCase().replace(/[_\s&\-]/g, '');

  for (const [pattern, siteId] of Object.entries(patterns)) {
    if (lowerCameraName.includes(pattern.replace(/[_\s&\-]/g, ''))) {
      return siteId;
    }
  }

  // Fallback to GRN01 (Greenford) for unknown cameras instead of failing
  console.warn(
    `Could not map camera "${cameraName}" to a site, using GRN01 as fallback`,
  );
  return 'GRN01';
}

importAnprDump().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
