import type { Express } from 'express';
import { requireAuth } from '../auth';
import { databaseService } from '../databaseService';
import { aiService } from '../aiService';
import { logger } from '../utils/logger';

export function registerAiFeatureRoutes(app: Express): void {
  // AI Generated Images endpoints
  app.post("/api/ai/generate-safety-image", requireAuth, async (req, res) => {
    try {
      const { slideType, title, description } = req.body;
      
      if (!slideType || !title || !description) {
        return res.status(400).json({ error: "slideType, title, and description are required" });
      }

      logger.info(`Generating AI safety image for ${slideType}: ${title}`);
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Generate the image using AI service with customer context
      const { imageUrl, dallePrompt } = await aiService.generateSafetyImage(context, slideType, title, description);
      
      // Store the generated image metadata in customer-isolated database
      const savedImage = await databaseService.createAiGeneratedImage(context, {
        slideType,
        title,
        description,
        imageUrl,
        dallePrompt,
        dalleRevision: "dall-e-3",
        imageSize: "1024x1024",
        quality: "standard",
        style: "vivid",
        isActive: true
      });

      logger.info(`AI safety image generated and saved: ${savedImage.id}`);
      
      res.json({
        success: true,
        image: savedImage
      });
    } catch (error) {
      logger.error('Error generating AI safety image:', error);
      res.status(500).json({ error: 'Failed to generate AI safety image' });
    }
  });

  app.get("/api/ai/safety-images", requireAuth, async (req, res) => {
    try {
      const { slideType } = req.query;
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get images from customer-isolated database
      const images = await databaseService.getAiGeneratedImages(context, slideType as string);
      
      res.json({ images });
    } catch (error) {
      logger.error('Error fetching AI safety images:', error);
      res.status(500).json({ error: 'Failed to fetch AI safety images' });
    }
  });

  app.get("/api/ai/safety-images/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get image from customer-isolated database
      const image = await databaseService.getAiGeneratedImageById(context, id);
      
      if (!image) {
        return res.status(404).json({ error: 'AI safety image not found' });
      }
      
      res.json({ image });
    } catch (error) {
      logger.error('Error fetching AI safety image:', error);
      res.status(500).json({ error: 'Failed to fetch AI safety image' });
    }
  });

  // Get AI image by slide type (returns most recent)
  app.get("/api/ai/images/type/:slideType", requireAuth, async (req, res) => {
    try {
      const { slideType } = req.params;
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get image from customer-isolated database
      const image = await databaseService.getAiGeneratedImageBySlideType(context, slideType);
      
      if (!image) {
        return res.status(404).json({ 
          success: false, 
          error: 'No AI safety image found for this slide type' 
        });
      }
      
      res.json({ 
        success: true, 
        image 
      });
    } catch (error) {
      logger.error('Error fetching AI safety image by type:', error);
      res.status(500).json({ error: 'Failed to fetch AI safety image' });
    }
  });
}
