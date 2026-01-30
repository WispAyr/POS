import { Injectable, Logger } from '@nestjs/common';
import { MetricsCollectorService } from './metrics-collector.service';
import { VariableConfig } from '../entities/scheduled-notification.entity';

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);

  constructor(
    private readonly metricsCollector: MetricsCollectorService,
  ) {}

  async renderTemplate(
    template: string,
    variableConfig: Record<string, VariableConfig>,
    siteId?: string,
  ): Promise<string> {
    let rendered = template;

    // Find all variables in the template
    const variablePattern = /\{\{(\w+)\}\}/g;
    const matches = template.matchAll(variablePattern);

    for (const match of matches) {
      const variableName = match[1];
      const config = variableConfig[variableName];

      if (!config) {
        this.logger.warn(`No config found for variable: ${variableName}`);
        continue;
      }

      const value = await this.resolveVariable(variableName, config, siteId);
      rendered = rendered.replace(new RegExp(`\\{\\{${variableName}\\}\\}`, 'g'), String(value));
    }

    return rendered;
  }

  async resolveVariable(
    variableName: string,
    config: VariableConfig,
    siteId?: string,
  ): Promise<string | number> {
    switch (config.source) {
      case 'METRIC':
        if (!config.metricKey) {
          this.logger.warn(`No metricKey specified for METRIC variable: ${variableName}`);
          return '';
        }
        return this.metricsCollector.collectMetric(config.metricKey, siteId);

      case 'STATIC':
        return config.staticValue ?? '';

      case 'DATE_FORMAT':
        return this.formatDate(config.dateFormat ?? 'DD/MM/YYYY');

      default:
        this.logger.warn(`Unknown variable source: ${config.source}`);
        return '';
    }
  }

  private formatDate(format: string): string {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return format
      .replace('YYYY', year.toString())
      .replace('YY', year.toString().slice(-2))
      .replace('MMMM', months[now.getMonth()])
      .replace('MMM', monthsShort[now.getMonth()])
      .replace('MM', month)
      .replace('DD', day)
      .replace('dddd', weekdays[now.getDay()])
      .replace('ddd', weekdaysShort[now.getDay()])
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  extractVariables(template: string): string[] {
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = variablePattern.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  validateVariableConfig(
    template: string,
    variableConfig: Record<string, VariableConfig>,
  ): { valid: boolean; missingVariables: string[] } {
    const templateVariables = this.extractVariables(template);
    const missingVariables: string[] = [];

    for (const varName of templateVariables) {
      if (!variableConfig[varName]) {
        missingVariables.push(varName);
      }
    }

    return {
      valid: missingVariables.length === 0,
      missingVariables,
    };
  }
}
