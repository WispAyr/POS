import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlateValidationRule, PlateRegion } from '../../domain/entities/plate-validation-rule.entity';
import { ValidationStatus } from '../../domain/entities/plate-review.entity';

export interface ValidationResult {
  isValid: boolean;
  validationStatus: ValidationStatus;
  matchedRegion?: PlateRegion;
  matchedPattern?: string;
}

export interface SuspicionResult {
  isSuspicious: boolean;
  reasons: string[];
  validationResult: ValidationResult;
}

export interface CorrectionSuggestion {
  originalVrm: string;
  suggestedVrm: string;
  reason: string;
  confidence: number;
}

@Injectable()
export class PlateValidationService {
  private readonly logger = new Logger(PlateValidationService.name);

  // Built-in UK patterns (fallback if no rules in database)
  private readonly UK_PATTERNS = [
    { name: 'UK Standard (2001+)', pattern: /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/, priority: 1 },
    { name: 'UK Prefix', pattern: /^[A-Z][0-9]{1,3}[A-Z]{3}$/, priority: 2 },
    { name: 'UK Suffix', pattern: /^[A-Z]{3}[0-9]{1,3}[A-Z]?$/, priority: 3 },
    { name: 'UK Dateless', pattern: /^[A-Z]{1,3}[0-9]{1,4}$/, priority: 4 },
  ];

  // Common OCR errors
  private readonly OCR_SUBSTITUTIONS: Array<{ from: string; to: string; reason: string }> = [
    { from: '0', to: 'O', reason: 'Zero to letter O' },
    { from: 'O', to: '0', reason: 'Letter O to zero' },
    { from: '1', to: 'I', reason: 'One to letter I' },
    { from: 'I', to: '1', reason: 'Letter I to one' },
    { from: '5', to: 'S', reason: 'Five to letter S' },
    { from: 'S', to: '5', reason: 'Letter S to five' },
    { from: '8', to: 'B', reason: 'Eight to letter B' },
    { from: 'B', to: '8', reason: 'Letter B to eight' },
    { from: '2', to: 'Z', reason: 'Two to letter Z' },
    { from: 'Z', to: '2', reason: 'Letter Z to two' },
    { from: '6', to: 'G', reason: 'Six to letter G' },
    { from: 'G', to: '6', reason: 'Letter G to six' },
  ];

  constructor(
    @InjectRepository(PlateValidationRule)
    private readonly validationRuleRepository: Repository<PlateValidationRule>,
  ) {}

  /**
   * Validates a VRM against UK and international patterns
   */
  async validatePlate(vrm: string): Promise<ValidationResult> {
    // Basic validation
    if (!vrm || vrm.length < 2 || vrm.length > 10) {
      return {
        isValid: false,
        validationStatus: ValidationStatus.INVALID,
      };
    }

    // Get active validation rules from database
    const rules = await this.validationRuleRepository.find({
      where: { active: true },
      order: { priority: 'ASC' },
    });

    // Try database rules first
    if (rules.length > 0) {
      for (const rule of rules) {
        try {
          const regex = new RegExp(rule.pattern);
          if (regex.test(vrm)) {
            const isUK = rule.region === PlateRegion.UK;
            return {
              isValid: true,
              validationStatus: isUK ? ValidationStatus.UK_VALID : ValidationStatus.INTERNATIONAL_VALID,
              matchedRegion: rule.region,
              matchedPattern: rule.name,
            };
          }
        } catch (error) {
          this.logger.warn(`Invalid regex pattern in rule ${rule.id}: ${error.message}`);
        }
      }
    }

    // Fallback to built-in UK patterns
    for (const pattern of this.UK_PATTERNS) {
      if (pattern.pattern.test(vrm)) {
        return {
          isValid: true,
          validationStatus: ValidationStatus.UK_VALID,
          matchedRegion: PlateRegion.UK,
          matchedPattern: pattern.name,
        };
      }
    }

    // Check if it's a generic international format (alphanumeric, 2-10 chars)
    if (/^[A-Z0-9]{2,10}$/.test(vrm)) {
      return {
        isValid: true,
        validationStatus: ValidationStatus.INTERNATIONAL_VALID,
        matchedRegion: PlateRegion.INTERNATIONAL,
        matchedPattern: 'International Generic',
      };
    }

    return {
      isValid: false,
      validationStatus: ValidationStatus.INVALID,
    };
  }

  /**
   * Detects if a plate is suspicious based on multiple criteria
   */
  async detectSuspiciousPlate(vrm: string, confidence?: number): Promise<SuspicionResult> {
    const reasons: string[] = [];
    const validationResult = await this.validatePlate(vrm);

    // Check confidence score (guard against null AND undefined)
    if (confidence != null && confidence < 0.8) {
      reasons.push(`LOW_CONFIDENCE:${confidence.toFixed(2)}`);
    }

    // Check for special characters (should only be alphanumeric after normalization)
    if (/[^A-Z0-9]/.test(vrm)) {
      reasons.push('SPECIAL_CHARACTERS');
    }

    // Check for all same character
    if (/^(.)\1+$/.test(vrm)) {
      reasons.push('REPEATED_CHARACTER');
    }

    // Check for all zeros
    if (/^0+$/.test(vrm)) {
      reasons.push('ALL_ZEROS');
    }

    // Check length
    if (vrm.length < 2) {
      reasons.push('TOO_SHORT');
    }
    if (vrm.length > 10) {
      reasons.push('TOO_LONG');
    }

    // Check for suspicious patterns (e.g., III111, OOO000)
    if (/^[IOZ]{3,}/.test(vrm) || /^[0125]{3,}/.test(vrm)) {
      reasons.push('SUSPICIOUS_PATTERN');
    }

    // If validation failed, it's suspicious
    if (!validationResult.isValid) {
      reasons.push('INVALID_FORMAT');
    }

    // If it's UK suspicious (doesn't match UK patterns but is alphanumeric)
    if (validationResult.validationStatus === ValidationStatus.INTERNATIONAL_VALID) {
      // Could be international or misread UK plate
      reasons.push('NON_UK_FORMAT');
    }

    const isSuspicious = reasons.length > 0;

    return {
      isSuspicious,
      reasons,
      validationResult,
    };
  }

  /**
   * Suggests corrections for common OCR errors
   */
  async suggestCorrections(vrm: string): Promise<CorrectionSuggestion[]> {
    const suggestions: CorrectionSuggestion[] = [];

    // Try each character position with each substitution
    for (let i = 0; i < vrm.length; i++) {
      const char = vrm[i];

      // Find applicable substitutions for this character
      for (const substitution of this.OCR_SUBSTITUTIONS) {
        if (char === substitution.from) {
          const suggestedVrm = vrm.substring(0, i) + substitution.to + vrm.substring(i + 1);

          // Validate the suggested VRM
          const validationResult = await this.validatePlate(suggestedVrm);

          if (validationResult.isValid) {
            // Calculate confidence based on validation status
            let confidence = 0.5; // Base confidence for valid suggestion
            if (validationResult.validationStatus === ValidationStatus.UK_VALID) {
              confidence = 0.8;
            } else if (validationResult.validationStatus === ValidationStatus.INTERNATIONAL_VALID) {
              confidence = 0.6;
            }

            suggestions.push({
              originalVrm: vrm,
              suggestedVrm,
              reason: `Position ${i + 1}: ${substitution.reason}`,
              confidence,
            });
          }
        }
      }
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Return top 5 suggestions
    return suggestions.slice(0, 5);
  }

  /**
   * Seeds the database with default UK validation rules
   */
  async seedDefaultRules(): Promise<void> {
    const existingRules = await this.validationRuleRepository.count();

    if (existingRules > 0) {
      this.logger.log('Validation rules already exist, skipping seed');
      return;
    }

    const defaultRules = [
      {
        name: 'UK Standard (2001 onwards)',
        pattern: '^[A-Z]{2}[0-9]{2}[A-Z]{3}$',
        region: PlateRegion.UK,
        priority: 1,
        description: 'Current UK format: 2 letters, 2 numbers, 3 letters (e.g., AB12CDE)',
      },
      {
        name: 'UK Prefix (1983-2001)',
        pattern: '^[A-Z][0-9]{1,3}[A-Z]{3}$',
        region: PlateRegion.UK,
        priority: 2,
        description: 'Prefix format: 1 letter, 1-3 numbers, 3 letters (e.g., A123BCD)',
      },
      {
        name: 'UK Suffix (1963-1983)',
        pattern: '^[A-Z]{3}[0-9]{1,3}[A-Z]?$',
        region: PlateRegion.UK,
        priority: 3,
        description: 'Suffix format: 3 letters, 1-3 numbers, optional letter (e.g., ABC123D)',
      },
      {
        name: 'UK Dateless (Pre-1963)',
        pattern: '^[A-Z]{1,3}[0-9]{1,4}$',
        region: PlateRegion.UK,
        priority: 4,
        description: 'Dateless format: 1-3 letters, 1-4 numbers (e.g., AB1234)',
      },
      {
        name: 'International Generic',
        pattern: '^[A-Z0-9]{2,10}$',
        region: PlateRegion.INTERNATIONAL,
        priority: 10,
        description: 'Generic international format: 2-10 alphanumeric characters',
      },
    ];

    await this.validationRuleRepository.save(defaultRules);
    this.logger.log(`Seeded ${defaultRules.length} default validation rules`);
  }
}
