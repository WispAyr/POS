import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONDAY_API_URL = 'https://api.monday.com/v2';
const BOARD_ID = 5001075614;
const API_KEY = process.env.MONDAY_API_KEY;

async function investigateBoard() {
  if (!API_KEY) {
    console.error('ERROR: MONDAY_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('QR WHITELIST BOARD INVESTIGATION');
  console.log('Board ID:', BOARD_ID);
  console.log('='.repeat(80));

  try {
    // First, get the board structure
    const structureQuery = `
      query {
        boards(ids: [${BOARD_ID}]) {
          name
          description
          columns {
            id
            title
            type
          }
        }
      }
    `;

    console.log('\n📋 Fetching board structure...\n');

    const structureResponse = await axios.post(
      MONDAY_API_URL,
      { query: structureQuery },
      { headers: { Authorization: API_KEY } }
    );

    if (structureResponse.data.errors) {
      console.error('GraphQL Errors:', JSON.stringify(structureResponse.data.errors, null, 2));
      return;
    }

    const board = structureResponse.data.data?.boards?.[0];
    if (!board) {
      console.error('Board not found!');
      return;
    }

    console.log('Board Name:', board.name);
    console.log('Description:', board.description || '(none)');
    console.log('\n📊 COLUMNS:');
    console.log('-'.repeat(60));

    for (const col of board.columns) {
      console.log(`  ${col.id.padEnd(25)} | ${col.type.padEnd(15)} | ${col.title}`);
    }

    // Now get sample items
    const itemsQuery = `
      query {
        boards(ids: [${BOARD_ID}]) {
          items_page(limit: 10) {
            items {
              id
              name
              column_values {
                id
                text
                value
              }
            }
          }
        }
      }
    `;

    console.log('\n\n📝 Fetching sample items...\n');

    const itemsResponse = await axios.post(
      MONDAY_API_URL,
      { query: itemsQuery },
      { headers: { Authorization: API_KEY } }
    );

    if (itemsResponse.data.errors) {
      console.error('GraphQL Errors:', JSON.stringify(itemsResponse.data.errors, null, 2));
      return;
    }

    const items = itemsResponse.data.data?.boards?.[0]?.items_page?.items || [];
    console.log(`Found ${items.length} items\n`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log('='.repeat(80));
      console.log(`ITEM ${i + 1}: ${item.name} (ID: ${item.id})`);
      console.log('='.repeat(80));

      for (const col of item.column_values) {
        const colDef = board.columns.find((c: any) => c.id === col.id);
        const colTitle = colDef?.title || col.id;

        console.log(`\n  📌 ${colTitle} (${col.id}):`);

        if (col.text) {
          console.log(`     Text: ${col.text}`);
        }

        if (col.value) {
          try {
            const parsed = JSON.parse(col.value);
            console.log(`     Value (parsed): ${JSON.stringify(parsed, null, 6).split('\n').join('\n     ')}`);
          } catch {
            console.log(`     Value (raw): ${col.value}`);
          }
        }

        // Check if this looks like a URL
        const textOrValue = col.text || col.value || '';
        if (textOrValue.includes('http')) {
          console.log(`     🔗 POTENTIAL URL FOUND!`);
        }
      }
      console.log('\n');
    }

    // Try to find and fetch a JSON file
    console.log('\n\n🔍 SEARCHING FOR JSON URLs...\n');

    let jsonUrls: string[] = [];

    for (const item of items) {
      for (const col of item.column_values) {
        // Check text
        if (col.text && col.text.includes('http')) {
          const urls = col.text.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi);
          if (urls) {
            for (const url of urls) {
              if (url.includes('.json') || url.includes('json')) {
                jsonUrls.push(url);
                console.log(`  Found JSON URL in item "${item.name}": ${url}`);
              }
            }
          }
        }

        // Check value
        if (col.value) {
          try {
            const parsed = JSON.parse(col.value);
            // File column
            if (parsed.files && Array.isArray(parsed.files)) {
              for (const file of parsed.files) {
                if (file.assetUrl || file.url) {
                  const url = file.assetUrl || file.url;
                  jsonUrls.push(url);
                  console.log(`  Found file URL in item "${item.name}": ${url}`);
                }
              }
            }
            // Link column
            if (parsed.url) {
              jsonUrls.push(parsed.url);
              console.log(`  Found link URL in item "${item.name}": ${parsed.url}`);
            }
          } catch {
            // Check raw value for URLs
            const urls = col.value.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi);
            if (urls) {
              for (const url of urls) {
                jsonUrls.push(url);
                console.log(`  Found URL in raw value in item "${item.name}": ${url}`);
              }
            }
          }
        }
      }
    }

    // Fetch first JSON URL found
    if (jsonUrls.length > 0) {
      console.log(`\n\n📥 FETCHING SAMPLE JSON: ${jsonUrls[0]}\n`);

      try {
        const jsonResponse = await axios.get(jsonUrls[0], {
          timeout: 30000,
          headers: { Accept: 'application/json' }
        });

        console.log('JSON Content:');
        console.log('-'.repeat(60));
        console.log(JSON.stringify(jsonResponse.data, null, 2));
        console.log('-'.repeat(60));
      } catch (err: any) {
        console.error(`Failed to fetch JSON: ${err.message}`);
      }
    } else {
      console.log('  No JSON URLs found in sample items');
    }

    console.log('\n\n✅ Investigation complete!\n');

  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response:', err.response.data);
    }
  }
}

investigateBoard();
