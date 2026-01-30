#!/usr/bin/env node
/**
 * POS System - MCP Server
 * 
 * Model Context Protocol server that exposes parking operations
 * functionality as tools for LLM assistants.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

const VERSION = '0.1.0';
const BASE_URL = process.env.POS_API_URL || 'http://localhost:3000';

// HTTP client for POS API
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

/**
 * Tool definitions for MCP
 */
const tools: Tool[] = [
  // Health & Status
  {
    name: 'pos_health',
    description: 'Check if the POS backend is healthy and responding.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pos_stats',
    description: 'Get system statistics including session and decision counts.',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Filter by site ID (optional)' },
      },
    },
  },

  // Sites
  {
    name: 'pos_sites_list',
    description: 'List all parking sites configured in the system.',
    inputSchema: { type: 'object', properties: {} },
  },

  // Events & Movements
  {
    name: 'pos_events_list',
    description: 'List ANPR movement events with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Filter by site ID' },
        vrm: { type: 'string', description: 'Filter by VRM (partial match)' },
        page: { type: 'number', description: 'Page number (default: 1)' },
        limit: { type: 'number', description: 'Items per page (default: 20, max: 50)' },
      },
    },
  },
  {
    name: 'pos_movements_debug',
    description: 'Get detailed movement data for debugging purposes.',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Filter by site ID' },
        vrm: { type: 'string', description: 'Filter by VRM' },
        limit: { type: 'number', description: 'Number of records (default: 100)' },
      },
    },
  },

  // Plate Review
  {
    name: 'pos_plate_review_queue',
    description: 'Get the queue of plates awaiting human review.',
    inputSchema: {
      type: 'object',
      properties: {
        reviewStatus: { type: 'string', enum: ['PENDING', 'APPROVED', 'CORRECTED', 'DISCARDED'], description: 'Filter by status' },
        siteId: { type: 'string', description: 'Filter by site ID' },
        limit: { type: 'number', description: 'Max items to return' },
      },
    },
  },
  {
    name: 'pos_plate_review_get',
    description: 'Get details of a specific plate review item.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Review item ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'pos_plate_review_approve',
    description: 'Approve a plate as correctly read.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Review item ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'pos_plate_review_correct',
    description: 'Correct a misread plate with the proper VRM.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Review item ID' },
        correctedVrm: { type: 'string', description: 'Corrected VRM value' },
      },
      required: ['id', 'correctedVrm'],
    },
  },
  {
    name: 'pos_plate_review_discard',
    description: 'Discard a plate review item (invalid/unreadable).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Review item ID' },
        reason: { type: 'string', description: 'Reason for discarding' },
      },
      required: ['id'],
    },
  },
  {
    name: 'pos_plate_review_stats',
    description: 'Get summary statistics for plate reviews.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pos_plate_suggestions',
    description: 'Get correction suggestions for a plate.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Review item ID' },
      },
      required: ['id'],
    },
  },

  // Enforcement
  {
    name: 'pos_enforcement_queue',
    description: 'Get the enforcement review queue.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], description: 'Filter by status' },
        siteId: { type: 'string', description: 'Filter by site ID' },
      },
    },
  },
  {
    name: 'pos_enforcement_review',
    description: 'Review an enforcement decision (approve/reject).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Enforcement item ID' },
        decision: { type: 'string', enum: ['APPROVED', 'REJECTED'], description: 'Review decision' },
        reason: { type: 'string', description: 'Reason for decision' },
      },
      required: ['id', 'decision'],
    },
  },

  // Permits
  {
    name: 'pos_permit_add',
    description: 'Add a new permit/whitelist entry.',
    inputSchema: {
      type: 'object',
      properties: {
        vrm: { type: 'string', description: 'Vehicle registration mark' },
        type: { type: 'string', enum: ['WHITELIST', 'RESIDENT', 'STAFF', 'CONTRACTOR'], description: 'Permit type' },
        siteId: { type: 'string', description: 'Site ID (null for global)' },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        endDate: { type: 'string', description: 'End date (ISO 8601, optional)' },
      },
      required: ['vrm', 'type', 'startDate'],
    },
  },

  // Ingestion (for testing/manual entry)
  {
    name: 'pos_ingest_anpr',
    description: 'Manually ingest an ANPR event (for testing).',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Site ID' },
        vrm: { type: 'string', description: 'Vehicle registration mark' },
        cameraId: { type: 'string', description: 'Camera ID' },
        direction: { type: 'string', enum: ['ENTRY', 'EXIT', 'TOWARDS', 'AWAY'], description: 'Direction' },
        timestamp: { type: 'string', description: 'Timestamp (ISO 8601, defaults to now)' },
      },
      required: ['siteId', 'vrm', 'cameraId'],
    },
  },
];

/**
 * Handle tool calls
 */
async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      // Health & Status
      case 'pos_health': {
        const res = await api.get('/health');
        return res.data;
      }

      case 'pos_stats': {
        const params: Record<string, string> = {};
        if (args.siteId) params.siteId = args.siteId as string;
        const res = await api.get('/api/stats', { params });
        return res.data;
      }

      // Sites
      case 'pos_sites_list': {
        const res = await api.get('/api/sites');
        return res.data;
      }

      // Events
      case 'pos_events_list': {
        const params: Record<string, unknown> = {};
        if (args.siteId) params.siteId = args.siteId;
        if (args.vrm) params.vrm = args.vrm;
        if (args.page) params.page = args.page;
        if (args.limit) params.limit = args.limit;
        const res = await api.get('/api/events', { params });
        return res.data;
      }

      case 'pos_movements_debug': {
        const params: Record<string, unknown> = {};
        if (args.siteId) params.siteId = args.siteId;
        if (args.vrm) params.vrm = args.vrm;
        if (args.limit) params.limit = args.limit;
        const res = await api.get('/api/debug/movements', { params });
        return res.data;
      }

      // Plate Review
      case 'pos_plate_review_queue': {
        const params: Record<string, unknown> = {};
        if (args.reviewStatus) params.reviewStatus = args.reviewStatus;
        if (args.siteId) params.siteId = args.siteId;
        if (args.limit) params.limit = args.limit;
        const res = await api.get('/plate-review/queue', { params });
        return res.data;
      }

      case 'pos_plate_review_get': {
        const res = await api.get(`/plate-review/${args.id}`);
        return res.data;
      }

      case 'pos_plate_review_approve': {
        const res = await api.post(`/plate-review/${args.id}/approve`);
        return res.data;
      }

      case 'pos_plate_review_correct': {
        const res = await api.post(`/plate-review/${args.id}/correct`, {
          correctedVrm: args.correctedVrm,
        });
        return res.data;
      }

      case 'pos_plate_review_discard': {
        const res = await api.post(`/plate-review/${args.id}/discard`, {
          reason: args.reason,
        });
        return res.data;
      }

      case 'pos_plate_review_stats': {
        const res = await api.get('/plate-review/stats/summary');
        return res.data;
      }

      case 'pos_plate_suggestions': {
        const res = await api.get(`/plate-review/${args.id}/suggestions`);
        return res.data;
      }

      // Enforcement
      case 'pos_enforcement_queue': {
        const params: Record<string, unknown> = {};
        if (args.status) params.status = args.status;
        if (args.siteId) params.siteId = args.siteId;
        const res = await api.get('/enforcement/queue', { params });
        return res.data;
      }

      case 'pos_enforcement_review': {
        const res = await api.post(`/enforcement/review/${args.id}`, {
          decision: args.decision,
          reason: args.reason,
        });
        return res.data;
      }

      // Permits
      case 'pos_permit_add': {
        const res = await api.post('/ingestion/permit', {
          vrm: args.vrm,
          type: args.type,
          siteId: args.siteId || null,
          startDate: args.startDate,
          endDate: args.endDate || null,
          active: true,
        });
        return res.data;
      }

      // Ingestion
      case 'pos_ingest_anpr': {
        const res = await api.post('/ingestion/anpr', {
          siteId: args.siteId,
          vrm: args.vrm,
          cameraId: args.cameraId,
          direction: args.direction || 'ENTRY',
          timestamp: args.timestamp || new Date().toISOString(),
        });
        return res.data;
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      };
    }
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Main entry point
 */
async function main() {
  const server = new Server(
    {
      name: 'pos-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const result = await handleToolCall(name, args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`POS MCP Server v${VERSION} running on stdio (API: ${BASE_URL})`);
}

main().catch(console.error);
