import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const SENTRYFLOW_URL = process.env.SENTRYFLOW_URL || 'http://localhost:3500';

@Injectable()
export class SentryflowService {
  private readonly logger = new Logger(SentryflowService.name);

  private async request<T>(method: string, path: string, data?: any): Promise<T> {
    try {
      const response = await axios({
        method,
        url: `${SENTRYFLOW_URL}${path}`,
        data,
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`SentryFlow request failed: ${method} ${path}`, error.message);
      throw error;
    }
  }

  async getStatus() {
    return this.request<any>('GET', '/api/status');
  }

  async getRules() {
    return this.request<any[]>('GET', '/api/rules');
  }

  async getRule(id: string) {
    return this.request<any>('GET', `/api/rules/${id}`);
  }

  async createRule(rule: any) {
    return this.request<any>('POST', '/api/rules', rule);
  }

  async updateRule(id: string, rule: any) {
    return this.request<any>('PUT', `/api/rules/${id}`, rule);
  }

  async deleteRule(id: string) {
    return this.request<any>('DELETE', `/api/rules/${id}`);
  }

  async toggleRule(id: string) {
    return this.request<any>('PATCH', `/api/rules/${id}/toggle`);
  }

  async getEvents(limit = 50) {
    return this.request<any[]>('GET', `/api/events?limit=${limit}`);
  }

  async getEscalationState(ruleId: string) {
    return this.request<any>('GET', `/api/rules/${ruleId}/escalation`);
  }

  async resetEscalation(ruleId: string) {
    return this.request<any>('POST', `/api/rules/${ruleId}/escalation/reset`);
  }

  async setAlarmMode(mode: 'armed' | 'disarmed', pin?: string) {
    return this.request<any>('POST', '/api/alarm/mode', { mode, pin });
  }

  async getAlarmStatus() {
    return this.request<any>('GET', '/api/alarm/status');
  }

  /**
   * Get rules for a specific site (by camera IDs)
   */
  async getRulesForSite(cameraIds: string[]): Promise<any[]> {
    const allRules = await this.getRules();
    return allRules.filter(rule => {
      if (!rule.cameras || rule.cameras.length === 0) {
        return false; // Rules with no cameras specified don't match any site
      }
      return rule.cameras.some((camId: string) => cameraIds.includes(camId));
    });
  }
}
