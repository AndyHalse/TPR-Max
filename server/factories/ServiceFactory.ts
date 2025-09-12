/**
 * Service factory for dependency injection
 */

import { AiModelManager } from '../managers/AiModelManager';
import { ImageFallbackChain } from '../managers/ImageFallbackChain';
import { QuestionService } from '../services/QuestionService';
import type { AiServiceDependencies } from '../interfaces/ai';

export class ServiceFactory {
  private static _dependencies: AiServiceDependencies | null = null;

  static getDependencies(): AiServiceDependencies {
    if (!this._dependencies) {
      this._dependencies = this.createDependencies();
    }
    return this._dependencies;
  }

  private static createDependencies(): AiServiceDependencies {
    const aiClient = new AiModelManager();
    const imageGenerator = new ImageFallbackChain();
    const questionGenerator = new QuestionService(aiClient);
    
    // Audio generator placeholder - would implement similarly
    const audioGenerator = {
      async generate() {
        throw new Error('Audio generation not yet refactored');
      }
    };

    return {
      chatClient: aiClient,
      imageGenerator,
      questionGenerator,
      audioGenerator
    };
  }

  // For testing - allows dependency injection
  static setDependencies(deps: Partial<AiServiceDependencies>) {
    this._dependencies = {
      ...this.getDependencies(),
      ...deps
    };
  }

  static resetDependencies() {
    this._dependencies = null;
  }
}