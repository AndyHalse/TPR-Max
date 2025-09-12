import { db } from "./db";
import { inductionSettings, type CompanySettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ServiceFactory } from './factories/ServiceFactory';
import type { AiServiceDependencies } from './interfaces/ai';
import { ResultUtils } from './utils/result';
import { ImageFallbackChain } from './managers/ImageFallbackChain';

export class VideoGenerationService {
  private companySettings: CompanySettings | null = null;
  private services: AiServiceDependencies;

  constructor(settings?: CompanySettings, deps?: Partial<AiServiceDependencies>) {
    this.companySettings = settings || null;
    
    // Create services with company settings for proper branding
    const defaultServices = ServiceFactory.getDependencies();
    const imageGenerator = new ImageFallbackChain(this.companySettings);
    
    this.services = { 
      ...defaultServices, 
      imageGenerator, // Override with company-aware image generator
      ...deps 
    };
  }

  // Shim methods for AI operations
  private async aiComplete(prompt: string, options: any = {}): Promise<string> {
    const result = await this.services.chatClient.complete(prompt, options);
    if (ResultUtils.isSuccess(result)) {
      return result.data;
    }
    throw new Error(result.error?.message || 'AI completion failed');
  }

  private async aiCompleteJson<T>(prompt: string, schemaHints?: string, options: any = {}): Promise<T> {
    const result = await this.services.chatClient.completeJson<T>(prompt, schemaHints, options);
    if (ResultUtils.isSuccess(result)) {
      return result.data;
    }
    throw new Error(result.error?.message || 'AI JSON completion failed');
  }

  // Message-compatible shim methods
  private async aiFromMessages(messages: Array<{role: string, content: string}>, options: any = {}): Promise<string> {
    // Convert messages to single prompt - combine system and user messages
    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content);
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    
    let combinedPrompt = '';
    if (systemMessages.length > 0) {
      combinedPrompt = systemMessages.join('\n\n') + '\n\n';
    }
    combinedPrompt += userMessages.join('\n\n');
    
    return this.aiComplete(combinedPrompt, options);
  }

  private async aiJsonFromMessages<T>(messages: Array<{role: string, content: string}>, schemaHints?: string, options: any = {}): Promise<T> {
    // Convert messages to single prompt - combine system and user messages
    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content);
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    
    let combinedPrompt = '';
    if (systemMessages.length > 0) {
      combinedPrompt = systemMessages.join('\n\n') + '\n\n';
    }
    combinedPrompt += userMessages.join('\n\n');
    
    return this.aiCompleteJson<T>(combinedPrompt, schemaHints, options);
  }
  
  // Generate AI-powered questions based on video script content
  async generateQuestionsFromScript(script: string, scenes: any[], roleType: string, modelType: string = 'gpt-5'): Promise<Array<{
    questionText: string;
    questionType: string;
    correctAnswer: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    explanation: string;
    category: string;
    roleType: string;
  }>> {
    const result = await this.services.questionGenerator.generate(script, scenes, roleType);
    
    if (ResultUtils.isSuccess(result)) {
      return result.data;
    }

    console.error('❌ Question generation failed:', result.error?.message);
    return this.getFallbackQuestions(roleType);
  }

  // Fallback questions if AI generation fails
  private getFallbackQuestions(roleType: string): Array<any> {
    const commonQuestions = {
      visitor: [
        {
          questionText: "What must you do before entering any work areas as a visitor?",
          questionType: "multiple_choice",
          correctAnswer: "C",
          optionA: "Put on a hard hat",
          optionB: "Find your meeting location",
          optionC: "Report to reception and wait for your escort",
          optionD: "Go directly to your destination",
          explanation: "All visitors must report to reception and wait for an escort before entering any work areas.",
          category: "visitor_safety_protocols",
          roleType: "visitor"
        },
        {
          questionText: "What PPE must visitors wear in designated areas?",
          questionType: "multiple_choice",
          correctAnswer: "B",
          optionA: "Only safety boots",
          optionB: "Hard hat, safety boots, and high-visibility vest",
          optionC: "Just a high-visibility vest",
          optionD: "No PPE required for visitors",
          explanation: "Visitors entering work areas must wear the same basic PPE as workers.",
          category: "ppe_requirements",
          roleType: "visitor"
        }
      ],
      staff: [
        {
          questionText: "How often must you attend H&S refresher training?",
          questionType: "multiple_choice",
          correctAnswer: "B",
          optionA: "Every 6 months",
          optionB: "Annually",
          optionC: "Every 2 years",
          optionD: "Only when required by law",
          explanation: "Staff must attend annual H&S refresher training to maintain competency.",
          category: "staff_safety_protocols",
          roleType: "staff"
        }
      ],
      contractor: [
        {
          questionText: "What must contractors provide before starting work?",
          questionType: "multiple_choice",
          correctAnswer: "A",
          optionA: "Risk assessment and method statement",
          optionB: "Only insurance certificate",
          optionC: "Just qualification certificates",
          optionD: "Equipment inspection records only",
          explanation: "Contractors must provide comprehensive risk assessments and method statements.",
          category: "contractor_safety_protocols",
          roleType: "contractor"
        }
      ]
    };

    return commonQuestions[roleType as keyof typeof commonQuestions] || [];
  }
  
  // Generate comprehensive induction script for a specific role
  async generateInductionScript(roleType: string, videoFormat: string = 'interactive_slides', modelType: string = 'gpt-5'): Promise<{
    script: string;
    scenes: Array<{
      title: string;
      content: string;
      duration: number;
      imagePrompt: string;
    }>;
    totalDuration: number;
  }> {
    
    // Get comprehensive company details for enhanced AI personalization
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    const companyLogo = this.companySettings?.bannerUrl ? `Company Logo: ${this.companySettings.bannerUrl}` : "Professional company branding";
    const aiInstructions = this.companySettings?.aiInstructionsPrompt || "Create comprehensive, engaging safety induction content";
    
    // Enhanced company context for better AI generation
    const companyWebsite = this.companySettings?.website || "";
    const companyAddress = this.companySettings?.address || "";
    const companyPhone = this.companySettings?.phone || "";
    const industryContext = this.getIndustryContext(companyName, companyWebsite);
    const companySize = this.estimateCompanySize();
    const companyBranding = this.getBrandingTheme();
    
    // Enhanced prompts based on video format
    const formatSpecificInstructions = {
      'interactive_slides': 'Create clear, concise content perfect for slide-by-slide navigation with strong visual cues.',
      'full_video': 'Create cinematic, flowing content with smooth transitions and professional narration style.',
      'hybrid_enhanced': 'Create vivid, detailed content with rich visual descriptions for AI image generation. Include specific details about workplace scenes, safety equipment, and professional environments.'
    };
    
    const formatInstruction = formatSpecificInstructions[videoFormat as keyof typeof formatSpecificInstructions] || formatSpecificInstructions['interactive_slides'];
    
    const roleSpecificPrompts = {
      visitor: `Generate a comprehensive safety induction script for VISITORS to ${companyName}. ${formatInstruction}
      
      Company Profile:
      - Name: ${companyName}
      - Industry Context: ${industryContext}
      - Organization Size: ${companySize}
      - Visual Branding: ${companyBranding}
      ${companyLogo}
      ${companyWebsite ? `- Website: ${companyWebsite}` : ''}
      ${companyAddress ? `- Location: ${companyAddress}` : ''}
      ${companyPhone ? `- Contact: ${companyPhone}` : ''}
      
      AI Customization Instructions: ${aiInstructions}
      
      Content Requirements (tailor to company industry and context):
        - Personalized welcome reflecting company culture and industry
        - Industry-specific site access protocols and escort requirements
        - PPE requirements relevant to the company's operational environment
        - Emergency procedures specific to the facility and location
        - Restricted areas and safety zones relevant to the business type
        - Company-specific contact information and reporting procedures
        - Professional sign-in/sign-out procedures aligned with company standards`,
      
      staff: `Generate a comprehensive safety induction script for new STAFF MEMBERS at ${companyName}. ${formatInstruction}
      
      Company Profile:
      - Name: ${companyName}
      - Industry Context: ${industryContext}
      - Organization Size: ${companySize}
      - Visual Branding: ${companyBranding}
      ${companyLogo}
      ${companyWebsite ? `- Website: ${companyWebsite}` : ''}
      ${companyAddress ? `- Workplace Location: ${companyAddress}` : ''}
      ${companyPhone ? `- HR/Safety Contact: ${companyPhone}` : ''}
      
      AI Customization Instructions: ${aiInstructions}
      
      Content Requirements (customize for company's industry and organizational context):
        - Company safety culture and policies reflecting industry standards and organizational values
        - Industry-specific workplace hazards and comprehensive risk assessments
        - Role-appropriate PPE requirements and usage protocols for the business environment
        - Company-specific emergency procedures and evacuation routes tailored to facility layout
        - Internal incident reporting procedures and escalation pathways
        - Departmental health and safety responsibilities aligned with company structure
        - Equipment and technology safety protocols relevant to the organization's operations
        - Mandatory training requirements and refresher schedules per company policy`,
      
      contractor: `Generate a comprehensive safety induction script for CONTRACTORS working at ${companyName}. ${formatInstruction}
      
      Company Profile:
      - Name: ${companyName}
      - Industry Context: ${industryContext}
      - Organization Size: ${companySize}
      - Visual Branding: ${companyBranding}
      ${companyLogo}
      ${companyWebsite ? `- Website: ${companyWebsite}` : ''}
      ${companyAddress ? `- Site Location: ${companyAddress}` : ''}
      ${companyPhone ? `- Site Management Contact: ${companyPhone}` : ''}
      
      AI Customization Instructions: ${aiInstructions}
      
      Content Requirements (adapt to company's industry environment and operational context):
        - Industry-specific site safety requirements aligned with business operations
        - Company-specific permit to work procedures and authorization protocols
        - Risk assessment requirements tailored to the organization's operational hazards
        - PPE standards and compliance appropriate to the industry and work environment
        - Red and Yellow card disciplinary system explanation with company-specific escalation procedures
        - Method statements and documentation requirements matching company quality standards
        - Subcontractor responsibilities reflecting the organization's management structure
        - Site rules and regulations specific to the company's facilities and operations
        - Emergency contact procedures with company-specific escalation pathways
        - Quality and safety standards aligned with the company's industry certifications and commitments`
    };

    const prompt = roleSpecificPrompts[roleType as keyof typeof roleSpecificPrompts] || roleSpecificPrompts.contractor;

    try {
      console.log(`🔧 Starting script generation with comprehensive logging...`);
      console.log(`🔧 Company settings available: ${this.companySettings ? 'YES' : 'NO'}`);
      console.log(`🔧 OpenAI API key configured: ${process.env.OPENAI_API_KEY ? 'YES' : 'NO'}`);
      
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('CRITICAL: OpenAI API key not configured');
      }
      
      // Use the latest available model with intelligent fallback
      let selectedModel = this.companySettings?.openaiModel || "gpt-4o";
      
      // Try GPT-5 first if configured, with fallback strategy
      if (selectedModel === "gpt-5") {
        console.log(`🤖 Attempting to use GPT-5 for enhanced induction generation...`);
      } else {
        console.log(`🤖 Selected AI model: ${selectedModel}`);
      }
      
      let response;
      let content: any = null;
      let apiStartTime: number = Date.now();
      try {
        console.log(`🚀 Making API call to ${selectedModel}...`);
        console.log(`📝 Prompt length: ${prompt.length} characters`);
        
        apiStartTime = Date.now();
        const systemMessage = `You are a UK Health & Safety expert with extensive experience in workplace safety training and induction program development. Your expertise includes:

            - NEBOSH and IOSH certified safety training principles
            - UK HSE regulations and industry-specific compliance requirements  
            - Adult learning psychology and engagement techniques
            - Modern safety training methodologies and best practices
            - Risk assessment and hazard identification expertise
            - Emergency response planning and procedures
            
            Your task is to create professional, engaging safety induction content that meets UK standards and is tailored to the specific company and industry context provided.`;
        
        const fullPrompt = `${systemMessage}\n\n${prompt}

            ENHANCED INSTRUCTION SET:
            
            Step 1: Content Planning
            - Analyze the company profile and industry context provided
            - Identify key safety risks and regulatory requirements specific to this organization
            - Plan content flow that builds from basic concepts to advanced applications
            
            Step 2: Script Development  
            - Create an engaging, conversational narration script (750-1200 words)
            - Use UK Health & Safety terminology and legal frameworks
            - Include specific examples relevant to the company's industry and operations
            - Maintain professional yet approachable tone throughout
            
            Step 3: Scene Structure (6-8 scenes, 2-3 minutes each)
            Required scenes with industry-specific adaptations:
            1. Welcome & Company Introduction (incorporate company culture and values)
            2. Legal Framework & Responsibilities (UK HSE requirements + industry-specific regulations)
            3. PPE Requirements (role and environment-specific equipment)
            4. Hazard Identification (company-specific workplace hazards)
            5. Emergency Procedures (facility-specific protocols and assembly points)
            6. Safe Work Practices (industry and role-specific procedures)
            7. Environmental & Health Considerations (company sustainability and wellness policies)
            8. Assessment & Continuous Learning (company training requirements and feedback mechanisms)
            
            Step 4: Visual Content Planning
            - Each scene requires an "imagePrompt" for AI image generation
            - Prompts should be detailed, professional, and contextually relevant
            - Include specific safety equipment, workplace settings, and diverse representation
            - Avoid text/logos in image descriptions (pure visual content)
            
            CRITICAL OUTPUT REQUIREMENTS:
            Respond with ONLY valid JSON in this exact structure (no additional text):
            {
              "script": "Complete narration script incorporating company context and industry-specific safety requirements...",
              "scenes": [
                {
                  "title": "Descriptive scene title",
                  "content": "Detailed scene narration (100-150 words)",
                  "duration": 180,
                  "imagePrompt": "Detailed visual description for AI image generation, photorealistic, professional workplace setting, diverse representation, no text or logos"
                }
              ],
              "totalDuration": 1200
            }
            
            Quality Standards:
            - Script must be informative, engaging, and legally compliant
            - Each scene must advance the learning objectives progressively  
            - Content must reflect the company's industry and operational context
            - Include UK-specific emergency numbers, legal references, and procedures
            - Ensure accessibility and inclusive language throughout`
        
        // Use aiJsonFromMessages instead of direct OpenAI call
        const messages = [
          {
            role: "system",
            content: systemMessage
          },
          {
            role: "user", 
            content: fullPrompt
          }
        ];
        
        const options = {
          model: selectedModel,
          temperature: 0.7,
          response_format: { type: "json_object" },
          // Dynamic token allocation based on complexity and model capabilities
          ...(selectedModel === 'gpt-5' || selectedModel?.includes('gpt-6') || selectedModel?.includes('gpt-7')
            ? { 
              max_completion_tokens: this.calculateOptimalTokens(prompt.length, roleType, videoFormat),
              stream: false
            }
            : { 
              max_tokens: Math.min(4000, this.calculateOptimalTokens(prompt.length, roleType, videoFormat))
            })
        };
        
        content = await this.aiJsonFromMessages(messages, "Induction script with scenes array", options);
      } catch (error: any) {
        console.log(`⚠️ AI generation failed: ${error.message}`);
        console.log(`🚨 Using emergency fallback content due to AI failure...`);
        // AiModelManager handles retries, so if we get here, use fallback content
        return this.generateEmergencyFallbackScript(roleType, videoFormat);
      }

      const apiDuration = Date.now() - apiStartTime;
      console.log(`⏱️ AI call completed in ${apiDuration}ms`);
      
      // Ensure content is defined (aiJsonFromMessages returns parsed JSON directly)
      if (!content) {
        console.log(`🚨 No content received, using emergency fallback content...`);
        return this.generateEmergencyFallbackScript(roleType, videoFormat);
      }
      
      // Debug the AI response structure
      console.log('🔍 AI response structure:', JSON.stringify({
        hasScript: !!content.script,
        scriptLength: content.script?.length || 0,
        scenesCount: content.scenes?.length || 0,
        totalDuration: content.totalDuration
      }, null, 2));
      
      console.log(`📥 AI response script length: ${content.script?.length || 0} characters`);
      console.log(`📥 AI response scenes count: ${content.scenes?.length || 0}`);
      
      // Validate content structure
      if (!content.scenes || content.scenes.length === 0) {
        console.error('🚨 CRITICAL: AI returned response but NO SCENES!');
        console.error('🚨 Response structure:', JSON.stringify(content, null, 2));
        
        // Use fallback scenes if AI didn't provide proper scenes
        console.log('🔄 Using fallback scenes due to missing scenes');
        content = {
          script: content.script || `Welcome to the ${roleType} safety induction. This presentation covers essential health and safety requirements.`,
          scenes: [
            {
              title: "Welcome & Introduction",
              content: `Welcome to VisiGate Pro's comprehensive safety induction for ${roleType}s. This presentation will cover all essential health and safety requirements you need to know before starting work on our premises.`,
              duration: 120,
              imagePrompt: "Professional office reception area with safety notices"
            },
            {
              title: "Personal Protective Equipment (PPE)",
              content: "Personal Protective Equipment is essential for your safety. You must wear appropriate PPE at all times including safety helmets, high-visibility vests, safety footwear, and eye protection where required.",
              duration: 150,
              imagePrompt: "Various types of PPE equipment laid out professionally"
            },
            {
              title: "Emergency Procedures",
              content: "In case of emergency, remain calm and follow the evacuation procedures. Know your nearest fire exit, assembly point locations, and emergency contact numbers. Report all incidents immediately.",
              duration: 180,
              imagePrompt: "Clear emergency exit sign and assembly point"
            },
            {
              title: "Hazard Identification",
              content: "Be aware of potential hazards including moving machinery, electrical equipment, slip and trip hazards, and chemical substances. Always assess your work area before starting.",
              duration: 160,
              imagePrompt: "Workplace hazard warning signs and safety barriers"
            },
            {
              title: "Safe Work Practices",
              content: "Follow all safety procedures, use equipment properly, maintain good housekeeping, and never take shortcuts. If you're unsure about any procedure, ask for guidance.",
              duration: 140,
              imagePrompt: "Workers following proper safety procedures"
            },
            {
              title: "Health & Wellbeing",
              content: "Your health and wellbeing are important. Take regular breaks, stay hydrated, report any health concerns, and use proper lifting techniques to avoid injury.",
              duration: 130,
              imagePrompt: "Ergonomic workplace setup and health safety poster"
            }
          ],
          totalDuration: 880
        };
      }
      
      const result = {
        script: content.script || '',
        scenes: content.scenes || [],
        totalDuration: content.totalDuration || 900
      };
      
      console.log('🎬 Final result - scenes count:', result.scenes.length);
      console.log('🎬 First scene title:', result.scenes[0]?.title || 'No scenes');
      console.log('🎬 All scene titles:', result.scenes.map((s: any) => s.title));
      
      if (result.scenes.length === 0) {
        console.error('🚨 FINAL VALIDATION: Zero scenes in result - this will cause fallback!');
        console.error('🚨 Full AI response structure:', JSON.stringify(content, null, 2));
      }
      
      return result;
      
    } catch (error: any) {
      console.error('🚨 CRITICAL ERROR in generateInductionScript:', error);
      console.error('🚨 Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      // Check specific error types for better debugging
      if (error.response?.status === 429) {
        console.error('🚫 RATE LIMIT ERROR: Too many requests to OpenAI API');
        throw new Error('Rate limit exceeded. Please wait and try again.');
      }
      
      if (error.response?.status === 401) {
        console.error('🚫 AUTHENTICATION ERROR: Invalid OpenAI API key');
        throw new Error('Invalid OpenAI API key. Please check configuration.');
      }
      
      if (error.response?.status === 404) {
        console.error('🚫 MODEL ERROR: Requested model not available');
        throw new Error(`Model ${modelType} not available. Falling back to default.`);
      }
      
      if (error.response?.status >= 500) {
        console.error('🚫 SERVER ERROR: OpenAI service unavailable');
        throw new Error('OpenAI service temporarily unavailable. Please try again later.');
      }
      
      throw new Error(`Failed to generate induction script: ${error.message}`);
    }
  }

  // Generate scene images for the induction (optimized for speed with parallel processing)
  async generateSceneImages(scenes: Array<{imagePrompt: string}>): Promise<string[]> {
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    // GENERATE IMAGES FOR ALL SCENES - Critical for professional presentation
    const selectedScenes = scenes; // Use all scenes to ensure every page has an image
    
    try {
      console.log(`🎨 Generating ${selectedScenes.length} AI images for ${companyName} induction (parallel processing for speed)...`);
      
      // Parallelize image generation for 3x-5x speed improvement
      const imagePromises = selectedScenes.map(async (scene, i) => {
        console.log(`🖼️ Starting image generation ${i + 1}/${selectedScenes.length}`);
        
        // Enhanced prompt with latest DALL-E 3 capabilities for photorealistic safety training
        const companyBranding = "professional blue and safety orange"; // Use consistent corporate theme
        const enhancedPrompt = `Ultra-realistic corporate safety training photograph for ${this.companySettings?.companyName || "professional workplace"} induction. ${scene.imagePrompt}. 
        
        Visual Style: Photorealistic, high-end corporate photography with perfect lighting and composition.
        Color Scheme: ${companyBranding} theme with modern professional aesthetics.
        Environment: State-of-the-art modern workplace with contemporary safety equipment and infrastructure.
        Quality: 4K professional photography quality, crystal clear focus, perfect exposure.
        People: Diverse, professional individuals demonstrating proper safety procedures, modern business attire with appropriate PPE.
        Equipment: Latest generation safety equipment, modern facilities, contemporary industrial design.
        Composition: Dynamic angles showing clear demonstration of safety concepts without relying on text.
        Lighting: Professional studio-quality lighting highlighting safety features and proper procedures.
        
        CRITICAL: Create photorealistic images without any text, logos, or written content. Focus on clear visual demonstration of safety concepts through body language, equipment positioning, and environmental cues.
        Avoid: Any text, signage, cartoons, sketches, outdated equipment, poor lighting, amateur composition.`;
        
        try {
          const result = await this.services.imageGenerator.generate(
            'safety_training',
            `Safety Image ${i + 1}`,
            enhancedPrompt
          );
          
          if (ResultUtils.isSuccess(result)) {
            console.log(`✅ Image ${i + 1} generated successfully`);
            return result.data.url;
          } else {
            console.log(`⚠️ Image ${i + 1} generation failed: ${result.error?.message}`);
            return this.generateFallbackImage(scene.imagePrompt, i + 1);
          }
        } catch (error) {
          console.error(`❌ Failed to generate image ${i + 1}:`, error);
          console.log(`🔄 Using fallback image generation for image ${i + 1}...`);
          return this.generateFallbackImage(scene.imagePrompt, i + 1);
        }
      });
      
      // Process in batches of 3 to avoid rate limits while maximizing speed
      const batchSize = 3;
      const imageUrls: string[] = [];
      
      for (let i = 0; i < imagePromises.length; i += batchSize) {
        const batch = imagePromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        imageUrls.push(...batchResults);
        
        // Small delay between batches to respect rate limits
        if (i + batchSize < imagePromises.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`🎉 Successfully generated ${imageUrls.filter(url => url).length}/${selectedScenes.length} AI images in parallel`);
      return imageUrls;
    } catch (error: any) {
      console.error('❌ Error generating scene images:', error);
      if (error?.response) {
        console.error('API Response:', error.response.data);
      }
      // Return empty array rather than failing completely
      return new Array(selectedScenes.length).fill('');
    }
  }

  // Generate fallback images using Canvas when AI generation fails
  private generateFallbackImage(prompt: string, imageNumber: number): string {
    // Create a professional safety image using Canvas/SVG
    const width = 1792;
    const height = 1024;
    
    // Determine the safety theme based on prompt content
    let theme = 'general';
    let bgColor = '#1a365d'; // Professional blue
    let accentColor = '#ed8936'; // Safety orange
    let icon = '🛡️';
    let title = 'Safety First';
    
    if (prompt.toLowerCase().includes('ppe') || prompt.toLowerCase().includes('personal protective')) {
      theme = 'ppe';
      icon = '👷';
      title = 'Personal Protective Equipment';
    } else if (prompt.toLowerCase().includes('emergency') || prompt.toLowerCase().includes('evacuation')) {
      theme = 'emergency';
      icon = '🚨';
      title = 'Emergency Procedures';
      bgColor = '#c53030'; // Emergency red
    } else if (prompt.toLowerCase().includes('welcome') || prompt.toLowerCase().includes('introduction')) {
      theme = 'welcome';
      icon = '👋';
      title = 'Welcome & Safety Orientation';
    }

    // Escape text content for SVG safety
    const escapeXml = (text: string) => text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Re-generate SVG with escaped content
    const companyNameEscaped = escapeXml(this.companySettings?.companyName || 'VisiGate Pro');
    const titleEscaped = escapeXml(title);
    
    const safeSvg = `<?xml version="1.0" encoding="UTF-8"?>
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="bgGradient${imageNumber}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${this.darkenColor(bgColor, 20)};stop-opacity:1" />
          </linearGradient>
          <linearGradient id="accentGradient${imageNumber}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${accentColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${this.lightenColor(accentColor, 20)};stop-opacity:1" />
          </linearGradient>
        </defs>
        
        <!-- Background -->
        <rect width="100%" height="100%" fill="url(#bgGradient${imageNumber})" />
        
        <!-- Company Branding Bar -->
        <rect x="0" y="0" width="100%" height="120" fill="url(#accentGradient${imageNumber})" opacity="0.9" />
        
        <!-- Company Name -->
        <text x="80" y="75" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white">
          ${companyNameEscaped} - Safety Induction
        </text>
        
        <!-- Main Icon Circle -->
        <circle cx="${width/2}" cy="${height/2 - 50}" r="150" fill="white" opacity="0.9" stroke="${bgColor}" stroke-width="8" />
        
        <!-- Vector Icon Instead of Emoji -->
        ${this.getSafetyVectorIcon(theme, width/2, height/2 - 50, bgColor)}
        
        <!-- Title -->
        <text x="${width/2}" y="${height/2 + 120}" font-family="Arial, sans-serif" font-size="64" font-weight="bold" 
              text-anchor="middle" fill="white">${titleEscaped}</text>
        
        <!-- Professional Badge -->
        <rect x="${width - 300}" y="${height - 150}" width="250" height="100" rx="10" fill="white" opacity="0.9" stroke="${bgColor}" stroke-width="2" />
        <text x="${width - 175}" y="${height - 110}" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
              text-anchor="middle" fill="${bgColor}">Professional</text>
        <text x="${width - 175}" y="${height - 80}" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
              text-anchor="middle" fill="${bgColor}">Safety Training</text>
        
        <!-- Safety Pattern -->
        <pattern id="safetyStripes${imageNumber}" patternUnits="userSpaceOnUse" width="40" height="40">
          <rect width="40" height="40" fill="${accentColor}" opacity="0.1" />
          <rect x="0" y="0" width="20" height="20" fill="white" opacity="0.1" />
          <rect x="20" y="20" width="20" height="20" fill="white" opacity="0.1" />
        </pattern>
        <rect x="0" y="${height - 60}" width="100%" height="60" fill="url(#safetyStripes${imageNumber})" />
      </svg>`;

    // Convert to proper data URL that browsers can use
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSvg)}`;
    
    console.log(`✅ Generated fallback safety image ${imageNumber} for theme: ${theme}`);
    return svgDataUrl;
  }

  // Helper function to darken a hex color
  private darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + 
                  (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + 
                  (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  // Helper function to lighten a hex color
  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R > 255 ? 255 : R) * 0x10000 + 
                  (G > 255 ? 255 : G) * 0x100 + 
                  (B > 255 ? 255 : B)).toString(16).slice(1);
  }

  // Generate vector icons instead of emojis for professional appearance
  private getSafetyVectorIcon(theme: string, centerX: number, centerY: number, color: string): string {
    switch (theme) {
      case 'ppe':
        return `
          <!-- Hard Hat Icon -->
          <path d="M ${centerX-60} ${centerY-20} Q ${centerX-60} ${centerY-60} ${centerX} ${centerY-60} Q ${centerX+60} ${centerY-60} ${centerX+60} ${centerY-20} 
                   L ${centerX+50} ${centerY+20} Q ${centerX+50} ${centerY+40} ${centerX} ${centerY+40} Q ${centerX-50} ${centerY+40} ${centerX-50} ${centerY+20} Z" 
                fill="${color}" stroke="white" stroke-width="3" />
          <rect x="${centerX-70}" y="${centerY+20}" width="140" height="20" rx="10" fill="${color}" stroke="white" stroke-width="2" />
        `;
      case 'emergency':
        return `
          <!-- Emergency Exit Icon -->
          <rect x="${centerX-80}" y="${centerY-60}" width="160" height="120" rx="10" fill="none" stroke="${color}" stroke-width="8" />
          <path d="M ${centerX-40} ${centerY-20} L ${centerX+20} ${centerY-20} L ${centerX+10} ${centerY-40} L ${centerX+40} ${centerY} L ${centerX+10} ${centerY+40} 
                   L ${centerX+20} ${centerY+20} L ${centerX-40} ${centerY+20} Z" fill="${color}" />
          <rect x="${centerX-60}" y="${centerY-10}" width="40" height="20" fill="${color}" />
        `;
      case 'welcome':
        return `
          <!-- Handshake Icon -->
          <path d="M ${centerX-60} ${centerY-30} Q ${centerX-80} ${centerY-50} ${centerX-60} ${centerY-70} Q ${centerX-40} ${centerY-50} ${centerX-20} ${centerY-30} 
                   Q ${centerX} ${centerY-50} ${centerX+20} ${centerY-30} Q ${centerX+40} ${centerY-50} ${centerX+60} ${centerY-70} Q ${centerX+80} ${centerY-50} ${centerX+60} ${centerY-30}
                   L ${centerX+40} ${centerY+10} Q ${centerX+20} ${centerY+30} ${centerX} ${centerY+10} Q ${centerX-20} ${centerY+30} ${centerX-40} ${centerY+10} Z" 
                fill="${color}" stroke="white" stroke-width="3" />
        `;
      default:
        return `
          <!-- Shield Icon -->
          <path d="M ${centerX} ${centerY-70} L ${centerX-50} ${centerY-50} L ${centerX-50} ${centerY+20} Q ${centerX-50} ${centerY+60} ${centerX} ${centerY+70} 
                   Q ${centerX+50} ${centerY+60} ${centerX+50} ${centerY+20} L ${centerX+50} ${centerY-50} Z" 
                fill="${color}" stroke="white" stroke-width="4" />
          <text x="${centerX}" y="${centerY+10}" font-family="Arial, sans-serif" font-size="36" font-weight="bold" 
                text-anchor="middle" fill="white">✓</text>
        `;
    }
  }
  
  // Generate audio narration for scenes using Text-to-Speech
  async generateSceneAudio(scenes: Array<{content: string; title: string}>): Promise<string[]> {
    const audioUrls: string[] = [];
    
    try {
      console.log(`🎤 Generating audio narration for ${scenes.length} scenes...`);
      
      // Use Google Text-to-Speech for natural narration
      const audioPromises = scenes.map(async (scene, i) => {
        const narrationText = `${scene.title}. ${scene.content}`;
        
        try {
          const result = await this.services.audioGenerator.generate(narrationText, {
            voice: 'nova',
            speed: 0.92,
            format: 'mp3'
          });
          
          if (ResultUtils.isSuccess(result)) {
            console.log(`✅ Audio ${i + 1} generated successfully`);
            return result.data;
          } else {
            console.warn(`⚠️ Audio generation not available for scene ${i + 1}, skipping audio`);
            return ''; // Return empty string when audio service unavailable
          }
        } catch (error) {
          console.warn(`⚠️ Audio generation failed for scene ${i + 1}:`, error.message);
          return ''; // Return empty string for failed audio
        }
      });
      
      // Process all audio in parallel for speed
      const results = await Promise.all(audioPromises);
      audioUrls.push(...results);
      
      console.log(`🎉 Successfully generated ${audioUrls.filter(url => url).length}/${scenes.length} audio narrations`);
    } catch (error) {
      console.error('❌ Error generating audio narration:', error);
      // Return empty array rather than failing completely
      return new Array(scenes.length).fill('');
    }
    
    return audioUrls;
  }

  // Generate comprehensive UK H&S compliant scenes
  private generateComprehensiveUKHSScenes(roleType: string): any[] {
    const baseScenes = [
      {
        title: "Welcome & Legal Framework",
        content: `Welcome to our comprehensive Health & Safety induction. This presentation covers your legal obligations under UK Health & Safety legislation including the Health and Safety at Work Act 1974, Management of Health and Safety at Work Regulations 1999, and CDM Regulations 2015. As a ${roleType}, you have both rights and responsibilities to maintain a safe working environment. This induction is mandatory and must be completed before commencing work on site.`,
        duration: 180,
        imagePrompt: "Professional corporate reception with UK health and safety legislation certificates and legal compliance documentation displayed"
      },
      {
        title: "Personal Protective Equipment (PPE) - Legal Requirements",
        content: "Under the Personal Protective Equipment at Work Regulations 2022, you must wear appropriate PPE at all times. This includes safety helmets to BS EN 397 standards, high-visibility clothing to EN ISO 20471 Class 2/3, safety footwear to EN ISO 20345 standards, and eye protection to EN 166 where required. PPE must be properly maintained, stored correctly, and replaced when damaged. Failure to wear PPE is a disciplinary offense and may result in immediate removal from site.",
        duration: 200,
        imagePrompt: "High-quality PPE equipment display showing hard hats, hi-vis vests, safety boots, safety glasses, and gloves arranged professionally with British Standard certification labels visible"
      },
      {
        title: "Risk Assessment & Method Statements (RAMS)",
        content: "Every work activity requires a documented Risk Assessment and Method Statement. You must read, understand, and sign the RAMS before starting work. Dynamic risk assessments must be conducted continuously as work progresses. If conditions change, stop work immediately and reassess. The hierarchy of control must be followed: Elimination, Reduction, Engineering Controls, Administrative Controls, and PPE as the final measure. Report all hazards immediately to your supervisor.",
        duration: 220,
        imagePrompt: "Professional workplace showing workers reviewing detailed RAMS documentation with clipboards, risk assessment forms, and method statements in a modern office environment"
      },
      {
        title: "Emergency Procedures & Evacuation",
        content: "In case of emergency, follow the Emergency Action Plan immediately. Know your nearest fire exit, alternative escape routes, and designated assembly points. Fire alarm signals: Continuous alarm = Evacuate immediately, Intermittent alarm = Standby. Emergency contact numbers are displayed throughout the site. In case of injury, call First Aid immediately on extension 999 or use emergency phones. Never re-enter a building until authorized by the Emergency Coordinator or Fire Service.",
        duration: 200,
        imagePrompt: "Clear emergency signage showing fire exits, assembly points, emergency phone locations, and evacuation route maps in a professional building environment"
      },
      {
        title: "Workplace Hazards & Control Measures",
        content: "Common workplace hazards include: Moving machinery and vehicles, Electrical installations and equipment, Slip, trip and fall hazards, Manual handling risks, Hazardous substances (COSHH), Noise exposure, Vibration, Working at height, Confined spaces, and Lone working. Each hazard requires specific control measures. Always use designated walkways, observe speed limits, maintain three points of contact on stairs, and report damaged flooring, lighting, or equipment immediately.",
        duration: 240,
        imagePrompt: "Comprehensive workplace safety display showing various hazard warning signs, safety barriers, machine guards, and control equipment in an industrial setting"
      },
      {
        title: "Manual Handling & Ergonomics",
        content: "Manual Handling Operations Regulations 1992 require proper lifting techniques to prevent musculoskeletal injuries. Assess loads before lifting: Can it be eliminated? Can mechanical aids be used? Maximum recommended weights: 25kg for men, 16kg for women. Use team lifting for heavy items. Maintain natural spinal curves, get a firm grip, lift with legs not back, avoid twisting, and keep loads close to body. Take regular breaks and report any discomfort immediately.",
        duration: 200,
        imagePrompt: "Professional workplace ergonomics demonstration showing proper lifting techniques, mechanical lifting aids, and ergonomic workstation setup"
      },
      {
        title: "Working at Height Safety",
        content: "Work at Height Regulations 2005 apply to any work where a person could fall and be injured. Heights above 2 meters require additional precautions. Hierarchy: Avoid working at height where possible, Use existing safe places of work, Use equipment to prevent falls, Use equipment to minimize distance of falls. All ladders, scaffolding, and access equipment must be inspected before use. Safety harnesses and lanyards must be worn when required. Never work at height in adverse weather conditions.",
        duration: 220,
        imagePrompt: "Professional height safety equipment display showing scaffolding, safety harnesses, hard hats, and fall prevention systems with workers demonstrating proper usage"
      },
      {
        title: "Electrical Safety & COSHH",
        content: "Electricity at Work Regulations 1989 require all electrical work to be performed by competent persons. Never attempt electrical repairs. Report damaged cables, equipment, or plugs immediately. Use RCD-protected equipment outdoors. Control of Substances Hazardous to Health (COSHH) Regulations 2002 cover chemicals, fumes, dusts, vapors, and biological agents. Safety Data Sheets must be available for all hazardous substances. Use appropriate storage, handling, and disposal methods.",
        duration: 210,
        imagePrompt: "Professional laboratory and electrical safety setup showing COSHH safety cabinet, electrical testing equipment, safety data sheets, and properly labeled chemical storage"
      },
      {
        title: "Incident Reporting & Investigation",
        content: "All incidents, accidents, near misses, and dangerous occurrences must be reported immediately. Under RIDDOR (Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013), serious incidents must be reported to HSE within 24 hours. Complete accident report forms accurately and provide witness statements. Do not disturb accident scenes unless making them safe. Participate fully in incident investigations to prevent recurrence.",
        duration: 180,
        imagePrompt: "Professional incident reporting setup showing accident report forms, investigation documentation, and safety management systems on computer screens"
      },
      {
        title: "Health & Wellbeing - Occupational Health",
        content: "Your health and wellbeing are protected under Management of Health and Safety at Work Regulations 1999. Regular health surveillance may be required for certain roles. Report work-related health concerns immediately. Take regular breaks, stay hydrated, use proper workstation setup to prevent RSI. Mental health support is available through our Employee Assistance Programme. Smoking is prohibited in all buildings and designated areas only outdoors.",
        duration: 190,
        imagePrompt: "Modern workplace wellbeing center showing ergonomic workstations, health monitoring equipment, hydration stations, and wellness information displays"
      },
      {
        title: "Environmental & Waste Management",
        content: "Environmental Protection Act 1990 and Waste Management Regulations require proper waste segregation and disposal. Use designated waste streams: General waste, Recycling, Hazardous waste, and Confidential waste. Prevent pollution incidents by proper storage of materials and immediate cleanup of spills. Report environmental concerns to the Environmental Manager. Minimize energy consumption and water usage as part of our sustainability commitments.",
        duration: 170,
        imagePrompt: "Professional waste management and environmental compliance area showing proper waste segregation bins, spill kits, and environmental monitoring equipment"
      },
      {
        title: "Security & Site Access Control",
        content: "Site security is essential for health and safety. Your ID badge must be worn visibly at all times and not shared with others. Report lost cards immediately. Visitors must be escorted at all times. Do not allow tailgating or unauthorized access. Lock valuable equipment and secure work areas when unattended. Report suspicious activity to Security immediately. Emergency procedures override normal access controls.",
        duration: 160,
        imagePrompt: "Modern security access control system showing ID card readers, CCTV monitoring, and professional security checkpoint with clear signage"
      }
    ];

    // Add role-specific scenes
    if (roleType === 'contractor') {
      baseScenes.push(
        {
          title: "CDM Regulations & Principal Contractor Duties",
          content: "Construction (Design and Management) Regulations 2015 place specific duties on contractors. You must coordinate with the Principal Contractor, comply with site rules, and maintain high standards of welfare facilities. Toolbox talks are mandatory before starting new activities. All plant and equipment must have current test certificates. Method statements must be signed by all operatives before work commences.",
          duration: 200,
          imagePrompt: "Construction site showing CDM compliance documentation, toolbox talk areas, and contractors reviewing method statements with hard hats and hi-vis clothing"
        },
        {
          title: "Permit to Work Systems",
          content: "High-risk activities require Permits to Work including Hot Work, Confined Space Entry, Electrical Work, Working at Height, and Excavation. Permits must be obtained before starting work and displayed at the work location. All safety precautions must be implemented before permit authorization. Work must stop if conditions change. Permits must be closed out on completion and returned to the issuing authority.",
          duration: 190,
          imagePrompt: "Professional permit to work system showing permit documentation, safety checklists, and contractors following formal authorization procedures"
        }
      );
    }

    if (roleType === 'staff') {
      baseScenes.push(
        {
          title: "DSE Regulations & Workstation Assessment",
          content: "Display Screen Equipment Regulations 1992 require proper workstation setup to prevent health issues. Your workstation must be assessed annually. Adjust chair height so feet are flat on floor, monitor top at eye level, keyboard and mouse at elbow height. Take regular breaks every hour, use proper lighting to avoid glare, and report any discomfort immediately. Eye tests are provided for DSE users.",
          duration: 180,
          imagePrompt: "Modern ergonomic office workspace showing properly adjusted desk setup, ergonomic chair, monitor positioning, and lighting for optimal DSE compliance"
        },
        {
          title: "Stress Management & Mental Health",
          content: "Management of Health and Safety at Work Regulations include stress-related risks. Work-related stress can be caused by workload, lack of control, poor support, role clarity, and relationships. Early recognition is key: mood changes, sleep problems, concentration difficulties. Speak to your manager or HR if experiencing work-related stress. Confidential counselling services are available through our Employee Assistance Programme.",
          duration: 190,
          imagePrompt: "Professional wellness room showing comfortable seating, stress management resources, mental health awareness materials, and peaceful environment"
        }
      );
    }

    return baseScenes;
  }

  // Generate HTML5 video-like presentation
  async generateVideoPresentation(roleType: string, videoFormat: string = 'interactive_slides', modelType: string = 'gpt-5'): Promise<{
    htmlContent: string;
    script: string;
    scenes: any[];
    totalDuration: number;
  }> {
    
    // Generate the script and scenes with format and model
    const { script, scenes, totalDuration } = await this.generateInductionScript(roleType, videoFormat, modelType);
    
    // Log for debugging
    console.log(`🎬 Generated ${scenes.length} scenes for ${roleType} induction`);
    console.log(`🎬 Scene titles:`, scenes.map(s => s.title));
    
    // CRITICAL FIX: Ensure we always have scenes, force fallback if empty
    if (!scenes || scenes.length === 0) {
      console.log('🚨 CRITICAL: No scenes generated, forcing fallback scenes');
      // UK H&S Compliant Professional Scenes based on role type
      const fallbackScenes = this.generateComprehensiveUKHSScenes(roleType);
      
      // Override empty scenes with fallback
      scenes.splice(0, scenes.length, ...fallbackScenes);
      console.log(`🔧 Applied ${scenes.length} fallback scenes`);
    }
    
    // Generate images and audio for hybrid enhanced mode
    let sceneImages: string[] = [];
    let sceneAudio: string[] = [];
    
    if (videoFormat === 'hybrid_enhanced') {
      try {
        console.log('🎨 Generating AI images and audio for hybrid enhanced mode...');
        
        // Generate images and audio in parallel for maximum speed
        const [images, audio] = await Promise.all([
          this.generateSceneImages(scenes),
          this.generateSceneAudio(scenes)
        ]);
        
        sceneImages = images;
        sceneAudio = audio;
        
        console.log(`✨ Generated ${sceneImages.filter(img => img).length} images and ${sceneAudio.filter(aud => aud).length} audio tracks`);
      } catch (error) {
        console.error('❌ AI generation failed:', error);
      }
    }
    
    // Get company name for branding
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    // Create content based on format
    let htmlContent: string;
    
    if (videoFormat === 'hybrid_enhanced') {
      console.log('🎨 Creating hybrid enhanced presentation...');
      htmlContent = await this.createEnhancedHTMLPresentation(scenes, roleType, modelType, sceneImages, sceneAudio);
    } else if (videoFormat === 'full_video') {
      console.log('🎬 Creating full video with Sora API...');
      htmlContent = await this.createVideoPresentation(scenes, roleType, modelType);
    } else {
      console.log('📄 Creating standard slide presentation...');
      htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Safety Induction</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #f97316, #ea580c);
            color: white;
            overflow: hidden;
        }
        .presentation-container {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            position: relative;
            padding: 40px 40px 140px 40px;
        }
        .scene {
            display: none;
            padding: 40px;
            max-width: 800px;
            animation: fadeIn 1s ease-in;
        }
        .scene.active {
            display: block;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .scene h1 {
            font-size: 2.5rem;
            margin-bottom: 20px;
            color: #fff;
        }
        .scene h2 {
            font-size: 2rem;
            margin-bottom: 15px;
            color: #fef3c7;
        }
        .scene p {
            font-size: 1.2rem;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .controls {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 15px;
        }
        .btn {
            padding: 12px 24px;
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            color: white;
            cursor: pointer;
            font-size: 1rem;
            backdrop-filter: blur(10px);
        }
        .btn:hover {
            background: rgba(255,255,255,0.3);
        }
        .progress-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            height: 4px;
            background: #fef3c7;
            transition: width 0.3s ease;
        }
        .scene-counter {
            position: fixed;
            top: 30px;
            right: 30px;
            background: rgba(0,0,0,0.3);
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 0.9rem;
        }
        .logo {
            position: fixed;
            top: 30px;
            left: 30px;
            font-size: 1.5rem;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="logo">
        ${this.companySettings?.bannerUrl ? 
            `<img src="${this.companySettings.bannerUrl}" alt="${companyName}" style="height: 50px; max-width: 200px; margin-right: 15px; vertical-align: middle; border-radius: 8px; object-fit: contain;" onerror="this.style.display='none';" />` : 
            '🛡️'
        }
        <span style="font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${companyName}</span>
    </div>
    <div class="scene-counter">
        <span id="current-scene">1</span> / <span id="total-scenes">${scenes.length}</span>
    </div>
    
    <div class="presentation-container">
        ${scenes.map((scene, index) => `
            <div class="scene ${index === 0 ? 'active' : ''}" data-duration="${scene.duration}">
                <h1>${scene.title}</h1>
                <div>${scene.content.split('\n').map((line: string) => `<p>${line}</p>`).join('')}</div>
            </div>
        `).join('')}
    </div>
    
    <div class="controls">
        <button class="btn" onclick="previousScene()">← Previous</button>
        <button class="btn" id="play-pause-btn" onclick="togglePlayPause()">⏸️ Pause</button>
        <button class="btn" onclick="nextScene()">Next →</button>
    </div>
    
    <div class="progress-bar" id="progress-bar"></div>
    
    <script>
        let currentScene = 0;
        let isPlaying = true;
        let sceneTimer = null;
        const scenes = ${JSON.stringify(scenes)};
        const totalScenes = ${scenes.length};
        
        // Update total scenes display immediately
        document.getElementById('total-scenes').textContent = totalScenes;
        
        function showScene(index) {
            document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.scene')[index].classList.add('active');
            document.getElementById('current-scene').textContent = index + 1;
            updateProgressBar();
            
            if (isPlaying) {
                startSceneTimer();
            }
        }
        
        function nextScene() {
            if (currentScene < totalScenes - 1) {
                currentScene++;
                showScene(currentScene);
            }
        }
        
        function previousScene() {
            if (currentScene > 0) {
                currentScene--;
                showScene(currentScene);
            }
        }
        
        function togglePlayPause() {
            isPlaying = !isPlaying;
            const btn = document.getElementById('play-pause-btn');
            
            if (isPlaying) {
                btn.textContent = '⏸️ Pause';
                startSceneTimer();
            } else {
                btn.textContent = '▶️ Play';
                clearTimeout(sceneTimer);
            }
        }
        
        function startSceneTimer() {
            clearTimeout(sceneTimer);
            const duration = scenes[currentScene].duration * 1000;
            
            sceneTimer = setTimeout(() => {
                if (currentScene < totalScenes - 1) {
                    nextScene();
                } else {
                    // End of presentation
                    togglePlayPause();
                    alert('Induction complete! You will now be redirected to the quiz.');
                }
            }, duration);
        }
        
        function updateProgressBar() {
            const progress = ((currentScene + 1) / totalScenes) * 100;
            document.getElementById('progress-bar').style.width = progress + '%';
        }
        
        // Initialize
        updateProgressBar();
        if (isPlaying) {
            startSceneTimer();
        }
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowRight':
                case ' ':
                    e.preventDefault();
                    nextScene();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    previousScene();
                    break;
                case 'p':
                case 'P':
                    togglePlayPause();
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
    
    return {
      htmlContent,
      script,
      scenes,
      totalDuration
    };
  }

  // Generate full video presentation using Sora API or Google Veo 3
  async createVideoPresentation(scenes: any[], roleType: string, modelType: string): Promise<string> {
    console.log(`🎬 Attempting Full Video Generation with ${modelType}...`);
    
    // Check if using Google Veo 3
    if (modelType === 'google-veo-3') {
      return this.createVeo3VideoPresentation(scenes, roleType);
    }
    
    try {
      // Try to generate actual video with Sora
      const videoUrl = await this.generateSoraVideo(scenes, roleType);
      
      if (videoUrl) {
        console.log('✅ Sora video generated successfully!');
        return this.createVideoPlayerHTML(videoUrl, roleType, scenes);
      }
    } catch (error: any) {
      console.log('⚠️ Sora API not available or failed:', error?.message || 'Unknown error');
    }
    
    console.log('🔄 Falling back to enhanced HTML presentation');
    return await this.createEnhancedHTMLPresentation(scenes, roleType, modelType);
  }

  // Generate video using Google Veo 3 API
  async createVeo3VideoPresentation(scenes: any[], roleType: string): Promise<string> {
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    try {
      // Create comprehensive video prompt from all scenes  
      const videoPrompt = this.createVideoPromptFromScenes(scenes, roleType, companyName);
      
      console.log('🎥 Generating video with Google Veo 3 API...');
      console.log('📝 Video prompt:', videoPrompt.substring(0, 200) + '...');
      
      // Check if we have Google API access (would need GOOGLE_API_KEY)
      if (!process.env.GOOGLE_API_KEY) {
        console.log('⚠️ Google API key not configured, falling back to enhanced presentation');
        return await this.createEnhancedHTMLPresentation(scenes, roleType, 'google-veo-3');
      }
      
      // Use Google's Gemini API to access Veo 3
      // This would be the actual implementation when Veo 3 API is available
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3:generateVideo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GOOGLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: videoPrompt,
          duration: 8, // Veo 3 supports up to 8 seconds with audio
          resolution: "1080p",
          aspect_ratio: "16:9",
          include_audio: true // Veo 3's unique feature
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        const videoUrl = result.video_url;
        
        if (videoUrl) {
          console.log('✅ Google Veo 3 video generated successfully with audio!');
          return this.createVideoPlayerHTML(videoUrl, roleType, scenes);
        }
      }
      
      throw new Error('Veo 3 API request failed');
      
    } catch (error: any) {
      console.log('⚠️ Google Veo 3 API not available or failed:', error?.message || 'Unknown error');
      console.log('🔄 Falling back to enhanced HTML presentation');
      return await this.createEnhancedHTMLPresentation(scenes, roleType, 'google-veo-3');
    }
  }

  // Generate actual video using Sora API
  async generateSoraVideo(scenes: any[], roleType: string): Promise<string | null> {
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    try {
      // Create comprehensive video prompt from all scenes
      const videoPrompt = this.createVideoPromptFromScenes(scenes, roleType, companyName);
      
      console.log('🎥 Generating video with Sora API...');
      console.log('📝 Video prompt:', videoPrompt.substring(0, 200) + '...');
      
      // Check if Sora API is available in OpenAI client
      // Note: Sora API structure may vary - checking for availability
      // Video generation is currently not available - gracefully skip
      if (false) { // Disabled for now - OpenAI video generation not implemented
        console.warn('⚠️ Video generation feature not yet available, using static content');
        const videoResponse = await Promise.resolve({
          model: "sora-1.0",
          prompt: videoPrompt,
          duration: 20, // Maximum 20 seconds for safety induction
          resolution: "1080p",
          aspect_ratio: "16:9"
        });
        
        return videoResponse.data?.[0]?.url || null;
      } else {
        throw new Error('Sora API not available in current OpenAI client version');
      }
      
    } catch (error: any) {
      console.error('❌ Sora video generation failed:', error);
      
      // Check specific error types
      if (error.code === 'model_not_found') {
        throw new Error('Sora model not available - API access not enabled');
      } else if (error.code === 'invalid_request_error') {
        throw new Error('Invalid video generation request');
      } else {
        throw new Error('Sora API currently unavailable');
      }
    }
  }

  // Create comprehensive video prompt from scenes
  createVideoPromptFromScenes(scenes: any[], roleType: string, companyName: string): string {
    const sceneDescriptions = scenes.map((scene, index) => {
      return `Scene ${index + 1}: ${scene.title} - ${scene.content.substring(0, 150)}...`;
    }).join(' ');

    return `Professional workplace safety induction video for ${companyName}. 
    Create a cinematic, educational video showing: ${sceneDescriptions}
    
    Style: Professional corporate training video with smooth transitions, clear narration, and modern workplace settings.
    Content: UK Health & Safety compliance training for ${roleType}s including PPE requirements, emergency procedures, and safety protocols.
    Visual Elements: Modern office/industrial environments, safety equipment, professional staff, clear signage, emergency exits.
    Quality: High-definition, professional corporate video style with clear audio narration.
    Duration: Comprehensive coverage of all safety topics in sequence.
    
    CRITICAL SPELLING REQUIREMENT: All text, signs, labels, safety warnings, company names, and written words MUST be spelled correctly with perfect spelling. Pay special attention to safety terms like "EMERGENCY", "PPE", "SAFETY", "VISITOR", "RESTRICTED".`;
  }

  // Create video player HTML for actual Sora-generated video
  createVideoPlayerHTML(videoUrl: string, roleType: string, scenes: any[]): string {
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Safety Induction Video</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .video-container {
            width: 90%;
            max-width: 1200px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(25px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .video-header {
            text-align: center;
            margin-bottom: 30px;
        }
        .video-header h1 {
            font-size: 2.5rem;
            margin: 0 0 10px 0;
            background: linear-gradient(45deg, #ffd700, #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .video-header p {
            font-size: 1.2rem;
            opacity: 0.9;
            margin: 0;
        }
        .video-player {
            width: 100%;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }
        .video-player video {
            width: 100%;
            height: auto;
            display: block;
        }
        .video-info {
            margin-top: 20px;
            padding: 20px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            border-left: 4px solid #ffd700;
        }
        .video-info h3 {
            margin: 0 0 10px 0;
            color: #ffd700;
        }
        .video-info p {
            margin: 0;
            line-height: 1.6;
            opacity: 0.9;
        }
        .controls-info {
            text-align: center;
            margin-top: 20px;
            font-size: 0.9rem;
            opacity: 0.7;
        }
        .ai-badge {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.6);
            color: white;
            padding: 10px 15px;
            border-radius: 20px;
            font-size: 0.8rem;
            backdrop-filter: blur(10px);
        }
    </style>
</head>
<body>
    <div class="video-container">
        <div class="video-header">
            <h1>${companyName} Safety Induction</h1>
            <p>AI-Generated Professional Training Video for ${roleType.charAt(0).toUpperCase() + roleType.slice(1)}s</p>
        </div>
        
        <div class="video-player">
            <video controls autoplay muted>
                <source src="${videoUrl}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
        </div>
        
        <div class="video-info">
            <h3>🎯 Training Covers:</h3>
            <p>${scenes.map(scene => scene.title).join(' • ')}</p>
        </div>
        
        <div class="controls-info">
            <p>💡 Use video controls to play, pause, seek, and adjust volume</p>
        </div>
    </div>
    
    <div class="ai-badge">
        🤖 Generated with Sora AI
    </div>
    
    <script>
        // Ensure video plays automatically when ready
        document.addEventListener('DOMContentLoaded', () => {
            const video = document.querySelector('video');
            if (video) {
                video.play().catch(e => {
                    console.log('Autoplay prevented, user interaction required');
                });
            }
        });
    </script>
</body>
</html>`;
  }

  // Generate hybrid enhanced presentation with AI images and audio narration
  async createEnhancedHTMLPresentation(scenes: any[], roleType: string, modelType: string, preGeneratedImages: string[] = [], preGeneratedAudio: string[] = []): Promise<string> {
    console.log('🎨 Generating enhanced presentation with AI images...');
    
    // Get company name for branding
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    // Use pre-generated AI images and audio if available
    let sceneImages: string[] = preGeneratedImages;
    let sceneAudio: string[] = preGeneratedAudio;
    
    // Generate images if not provided
    if (sceneImages.length === 0) {
      try {
        console.log('🖼️ No pre-generated images found, generating AI images for enhanced mode...');
        sceneImages = await this.generateSceneImages(scenes);
        console.log(`✨ Successfully generated ${sceneImages.length} AI images`);
      } catch (error) {
        console.error('❌ AI image generation failed:', error);
        console.log('⚠️ Continuing with enhanced styling but no AI images');
      }
    } else {
      console.log(`✅ Using ${sceneImages.length} pre-generated AI images`);
    }
    
    // Generate audio if not provided
    if (sceneAudio.length === 0) {
      try {
        console.log('🎤 No pre-generated audio found, generating narration...');
        sceneAudio = await this.generateSceneAudio(scenes);
        console.log(`✨ Successfully generated ${sceneAudio.length} audio narrations`);
      } catch (error) {
        console.error('❌ Audio generation failed:', error);
        console.log('⚠️ Continuing without audio narration');
      }
    } else {
      console.log(`✅ Using ${sceneAudio.length} pre-generated audio narrations`);
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Enhanced Safety Induction</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 50%, #1e1b4b 100%);
            background-size: 400% 400%;
            animation: gradientShift 10s ease infinite;
            color: white;
            overflow: hidden;
        }
        
        @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .presentation-container {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            align-items: center;
            text-align: center;
            position: relative;
            padding: 0;
            overflow: hidden;
        }
        .scene {
            display: none;
            padding: 15px 15px 60px 15px;
            width: 100%;
            height: calc(100vh - 20px);
            animation: slideIn 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            background: rgba(255,255,255,0.18);
            backdrop-filter: blur(25px);
            border-radius: 0;
            box-shadow: 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.25);
            position: relative;
            overflow-y: auto;
            box-sizing: border-box;
        }
        .scene.active {
            display: block;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(50px) scale(0.95); }
            to { opacity: 1; transform: translateX(0) scale(1); }
        }
        .scene-image {
            width: 100%;
            height: 45vh;
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            margin: 10px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
            backdrop-filter: blur(10px);
            border: 2px solid rgba(255,255,255,0.2);
            overflow: hidden;
        }
        .scene-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 12px;
        }
        .scene h1 {
            font-size: 2.8rem;
            margin-bottom: 20px;
            color: #fff;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .scene p {
            font-size: 1.3rem;
            line-height: 1.6;
            margin-bottom: 15px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
        }
        .controls {
            position: fixed;
            bottom: 15px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 15px;
            background: rgba(0,0,0,0.8);
            padding: 12px 20px;
            border-radius: 20px;
            backdrop-filter: blur(20px);
            border: 2px solid rgba(255,255,255,0.2);
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            z-index: 1000;
        }
        .btn {
            padding: 8px 16px;
            background: rgba(255,255,255,0.25);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 20px;
            color: white;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            backdrop-filter: blur(15px);
            text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
            min-width: 80px;
        }
        .btn:hover {
            background: rgba(255,255,255,0.4);
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
            border-color: rgba(255,255,255,0.5);
        }
        .progress-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 0%;
            height: 4px;
            background: #10b981;
            transition: width 0.3s ease;
        }
        .scene-counter {
            position: fixed;
            top: 30px;
            right: 30px;
            background: rgba(0,0,0,0.4);
            padding: 12px 20px;
            border-radius: 20px;
            font-size: 1rem;
            backdrop-filter: blur(10px);
        }
        .header-section {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 15px;
            z-index: 999;
            background: rgba(0,0,0,0.6);
            padding: 20px 40px;
            border-radius: 20px;
            backdrop-filter: blur(15px);
            border: 2px solid rgba(255,255,255,0.2);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .company-logo {
            width: 80px;
            height: 80px;
            background: rgba(255,255,255,0.9);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.8rem;
            font-weight: bold;
            color: #4338ca;
            border: 3px solid rgba(255,255,255,0.3);
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        }
        .company-name {
            font-size: 1.4rem;
            font-weight: bold;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            margin: 0;
        }
        .enhanced-badge {
            position: fixed;
            top: 80px;
            right: 30px;
            background: rgba(16, 185, 129, 0.8);
            padding: 8px 16px;
            border-radius: 15px;
            font-size: 0.8rem;
            backdrop-filter: blur(10px);
        }
    </style>
</head>
<body>
    
    <div class="presentation-container">
        ${scenes.map((scene, index) => `
            <div class="scene ${index === 0 ? 'active' : ''}" data-duration="${scene.duration}">
                <div class="scene-counter">
                    <span id="current-scene">${index + 1}</span> / <span id="total-scenes">${scenes.length}</span>
                </div>
                <h1>${scene.title}</h1>
                ${sceneImages[index] ? `
                    <div class="scene-image" style="position: relative;">
                        <img src="${sceneImages[index]}" alt="${scene.title}" />
                        <!-- Text overlay for critical information -->
                        <div style="position: absolute; bottom: 10px; left: 10px; right: 10px; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 8px;">
                            <h3 style="color: white; margin: 0; font-size: 1.2rem;">${scene.title}</h3>
                        </div>
                    </div>
                ` : `
                    <div class="scene-image">
                        <div>🎨 ${scene.title}</div>
                    </div>
                `}
                <div>${scene.content.split('\n').map((line: string) => `<p>${line}</p>`).join('')}</div>
                
                <!-- Audio narration element -->
                ${sceneAudio && sceneAudio[index] ? `
                    <audio id="audio-${index}" class="scene-audio" preload="auto">
                        <source src="${sceneAudio[index]}" type="audio/mp3">
                        Your browser does not support the audio element.
                    </audio>
                ` : ''}
            </div>
        `).join('')}
    </div>
    
    <!-- Audio controls -->
    <div style="position: fixed; top: 10px; right: 10px; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);">
        <button id="audio-toggle" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;">
            🔊 Audio ON
        </button>
    </div>
    
    <div class="controls">
        <button class="btn" onclick="previousScene()">← Previous</button>
        <button class="btn" id="play-pause-btn" onclick="togglePlayPause()">⏸️ Pause</button>
        <button class="btn" onclick="nextScene()">Next →</button>
    </div>
    
    <div class="progress-bar" id="progress-bar"></div>
    
    <script>
        let currentScene = 0;
        let isPlaying = true;
        let sceneTimer = null;
        let audioEnabled = true;
        const scenes = ${JSON.stringify(scenes)};
        const totalScenes = ${scenes.length};
        
        document.getElementById('total-scenes').textContent = totalScenes;
        
        // Setup audio toggle button
        document.getElementById('audio-toggle').addEventListener('click', function() {
            audioEnabled = !audioEnabled;
            this.textContent = audioEnabled ? '🔊 Audio ON' : '🔇 Audio OFF';
            
            // If audio was enabled, play current scene's audio
            if (audioEnabled) {
                const audio = document.getElementById(\`audio-\${currentScene}\`);
                if (audio) {
                    audio.play().catch(e => console.log('Audio playback prevented:', e));
                }
            } else {
                // Stop all audio
                document.querySelectorAll('audio').forEach(audio => {
                    audio.pause();
                });
            }
        });
        
        function showScene(index) {
            // Stop any currently playing audio
            document.querySelectorAll('audio').forEach(audio => {
                audio.pause();
                audio.currentTime = 0;
            });
            
            // Switch scenes
            document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.scene')[index].classList.add('active');
            // Update all scene counters since each scene now has its own counter
            document.querySelectorAll('.scene-counter span[id="current-scene"]').forEach(el => {
                el.textContent = index + 1;
            });
            updateProgressBar();
            
            // Play audio for new scene if audio is enabled
            if (audioEnabled) {
                const audio = document.getElementById(\`audio-\${index}\`);
                if (audio) {
                    audio.play().catch(e => console.log('Audio playback prevented:', e));
                }
            }
        }
        
        function nextScene() {
            if (currentScene < totalScenes - 1) {
                currentScene++;
                showScene(currentScene);
                if (isPlaying) startSceneTimer();
            }
        }
        
        function previousScene() {
            if (currentScene > 0) {
                currentScene--;
                showScene(currentScene);
                if (isPlaying) startSceneTimer();
            }
        }
        
        function togglePlayPause() {
            isPlaying = !isPlaying;
            const btn = document.getElementById('play-pause-btn');
            if (isPlaying) {
                btn.textContent = '⏸️ Pause';
                startSceneTimer();
            } else {
                btn.textContent = '▶️ Play';
                if (sceneTimer) clearTimeout(sceneTimer);
            }
        }
        
        function startSceneTimer() {
            if (sceneTimer) clearTimeout(sceneTimer);
            const duration = scenes[currentScene]?.duration || 5;
            sceneTimer = setTimeout(() => {
                if (isPlaying && currentScene < totalScenes - 1) {
                    nextScene();
                } else if (currentScene >= totalScenes - 1) {
                    togglePlayPause();
                }
            }, duration * 1000);
        }
        
        function updateProgressBar() {
            const progress = ((currentScene + 1) / totalScenes) * 100;
            document.getElementById('progress-bar').style.width = progress + '%';
        }
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                    previousScene();
                    break;
                case 'ArrowRight':
                case ' ':
                    e.preventDefault();
                    nextScene();
                    break;
                case 'Escape':
                    togglePlayPause();
                    break;
            }
        });
        
        // Auto-start presentation
        updateProgressBar();
        if (isPlaying) startSceneTimer();
    </script>
</body>
</html>`;

    return htmlContent;
  }

  // Update induction settings with generated content
  async updateSettingsWithGeneratedContent(roleType: string, generatedContent: any): Promise<void> {
    try {
      // Create data URL for the HTML content
      const htmlBlob = Buffer.from(generatedContent.htmlContent).toString('base64');
      const dataUrl = `data:text/html;base64,${htmlBlob}`;
      
      await db
        .update(inductionSettings)
        .set({
          videoUrl: dataUrl,
          videoTitle: `${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Induction`,
          videoDescription: `Comprehensive AI-generated safety induction covering all essential requirements for ${roleType}s. Duration: ${Math.round(generatedContent.totalDuration / 60)} minutes.`,
          videoDurationMinutes: Math.round(generatedContent.totalDuration / 60),
          updatedAt: new Date()
        })
        .where(eq(inductionSettings.roleType, roleType));
        
    } catch (error) {
      console.error('Error updating settings:', error);
      throw new Error('Failed to update induction settings');
    }
  }

  // Helper method to determine industry context from company information
  private getIndustryContext(companyName: string, website: string): string {
    const name = companyName.toLowerCase();
    const site = website.toLowerCase();
    
    // Analyze company name and website for industry indicators
    if (name.includes('construction') || name.includes('building') || name.includes('contractor') || 
        site.includes('construction') || site.includes('building')) {
      return "Construction and Building Industry - Focus on CDM regulations, site safety, heavy machinery, working at height, and contractor coordination.";
    }
    
    if (name.includes('manufacturing') || name.includes('factory') || name.includes('industrial') ||
        site.includes('manufacturing') || site.includes('industrial')) {
      return "Manufacturing Industry - Emphasize machine safety, COSHH regulations, production line protocols, and industrial accident prevention.";
    }
    
    if (name.includes('hospital') || name.includes('medical') || name.includes('healthcare') ||
        site.includes('health') || site.includes('medical')) {
      return "Healthcare Industry - Focus on infection control, patient safety, medical equipment protocols, and healthcare-specific H&S requirements.";
    }
    
    if (name.includes('office') || name.includes('consulting') || name.includes('services') ||
        name.includes('technology') || name.includes('software')) {
      return "Office and Professional Services - Emphasize DSE regulations, ergonomics, fire safety, and workplace wellbeing.";
    }
    
    if (name.includes('retail') || name.includes('shop') || name.includes('store') ||
        site.includes('retail') || site.includes('shop')) {
      return "Retail Industry - Focus on customer safety, manual handling, security protocols, and public access areas.";
    }
    
    // Default to general workplace safety
    return "General Business Operations - Comprehensive workplace safety covering all essential H&S requirements for modern business environments.";
  }

  // Helper method to estimate company size for tailored content
  private estimateCompanySize(): string {
    // Since we don't have employee count, use reasonable defaults
    // This could be enhanced with actual data if available in company settings
    return "Medium-sized organization (50-200 employees)";
  }

  // Helper method to get branding theme based on company settings
  private getBrandingTheme(): string {
    const logoUrl = this.companySettings?.logoUrl || this.companySettings?.bannerUrl;
    const hasCustomBranding = logoUrl && logoUrl.length > 0;
    
    if (hasCustomBranding) {
      return "Corporate branded theme with company-specific visual identity and professional color scheme.";
    }
    
    return "Professional blue and orange safety theme with modern corporate aesthetics.";
  }

  // Helper method to calculate optimal token allocation based on content complexity
  private calculateOptimalTokens(promptLength: number, roleType: string, videoFormat: string): number {
    // Base token allocation
    let baseTokens = 3000;
    
    // Adjust for prompt complexity
    if (promptLength > 2000) baseTokens += 1000;
    if (promptLength > 3000) baseTokens += 500;
    
    // Role-specific adjustments
    const roleComplexity = {
      'contractor': 1.3,    // Higher complexity - more regulations and procedures
      'staff': 1.2,        // Medium complexity - comprehensive employee training
      'visitor': 1.0       // Standard complexity - basic safety requirements
    };
    
    const roleMultiplier = roleComplexity[roleType as keyof typeof roleComplexity] || 1.0;
    baseTokens = Math.floor(baseTokens * roleMultiplier);
    
    // Format-specific adjustments
    const formatComplexity = {
      'full_video': 1.4,           // Highest complexity - complete narrative structure
      'hybrid_enhanced': 1.2,      // Enhanced with multimedia elements
      'interactive_slides': 1.0    // Standard complexity - slide-based content
    };
    
    const formatMultiplier = formatComplexity[videoFormat as keyof typeof formatComplexity] || 1.0;
    baseTokens = Math.floor(baseTokens * formatMultiplier);
    
    // Cap at reasonable limits to avoid excessive costs
    return Math.min(6000, Math.max(2000, baseTokens));
  }

  // Emergency fallback method when all AI models fail
  private generateEmergencyFallbackScript(roleType: string, videoFormat: string): {
    script: string;
    scenes: Array<{
      title: string;
      content: string;
      duration: number;
      imagePrompt: string;
    }>;
    totalDuration: number;
  } {
    console.log(`🆘 Generating emergency fallback script for ${roleType} in ${videoFormat} format`);
    
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    const fallbackContent = {
      visitor: {
        script: `Welcome to ${companyName}. This is your essential health and safety induction. As a visitor to our premises, your safety is our top priority. Please follow all safety instructions, report to reception upon arrival, and ensure you are accompanied by your host at all times. In case of emergency, follow the green exit signs to the nearest assembly point. Thank you for your cooperation in maintaining a safe workplace.`,
        scenes: [
          {
            title: "Welcome & Introduction",
            content: `Welcome to ${companyName}. This safety induction will prepare you for a safe visit to our premises.`,
            duration: 120,
            imagePrompt: "Professional office reception area with safety signage and welcome desk"
          },
          {
            title: "PPE Requirements", 
            content: "Personal protective equipment may be required in designated areas. Your host will provide necessary equipment.",
            duration: 120,
            imagePrompt: "Safety equipment including hard hats, safety glasses, and high-visibility vests"
          },
          {
            title: "Emergency Procedures",
            content: "In case of emergency, remain calm, follow evacuation signs, and proceed to the designated assembly point.",
            duration: 120,
            imagePrompt: "Emergency exit signs and assembly point in a modern building"
          }
        ]
      },
      staff: {
        script: `Welcome to ${companyName}. As a new team member, understanding health and safety procedures is essential. You have responsibilities under UK health and safety law to take reasonable care of yourself and others. Report hazards immediately, use provided safety equipment correctly, and participate in all required training. Together we maintain a safe and healthy workplace for everyone.`,
        scenes: [
          {
            title: "Health & Safety Responsibilities",
            content: `Welcome to ${companyName}. Learn your essential health and safety responsibilities as a team member.`,
            duration: 180,
            imagePrompt: "Professional team meeting discussing workplace safety in modern office"
          },
          {
            title: "Workplace Hazards",
            content: "Identify common workplace hazards and understand risk assessment procedures specific to your role.",
            duration: 180,
            imagePrompt: "Workplace safety assessment with hazard identification charts and equipment"
          },
          {
            title: "Emergency Response",
            content: "Know your emergency procedures, evacuation routes, and first aid procedures for workplace incidents.",
            duration: 180,
            imagePrompt: "Emergency response equipment and evacuation route signage in workplace"
          }
        ]
      },
      contractor: {
        script: `Welcome contractors to ${companyName}. As external workers, you must comply with our site safety requirements and UK CDM regulations. Complete risk assessments, obtain necessary permits, and follow our safety management system. Report all incidents immediately and ensure your work meets our quality and safety standards. Your cooperation ensures everyone's safety.`,
        scenes: [
          {
            title: "Contractor Safety Requirements",
            content: `Essential safety requirements for contractors working at ${companyName} premises.`,
            duration: 180,
            imagePrompt: "Construction workers in PPE reviewing safety documentation at building site"
          },
          {
            title: "Permit to Work Systems",
            content: "Understand permit to work procedures, risk assessments, and method statements required for your activities.",
            duration: 180,
            imagePrompt: "Safety permit documentation and authorization process in industrial setting"
          },
          {
            title: "Site Safety Compliance",
            content: "Follow site rules, report incidents, and maintain safety standards throughout your work.",
            duration: 180,
            imagePrompt: "Safety compliance checklist and reporting procedures at construction site"
          }
        ]
      }
    };

    const content = fallbackContent[roleType as keyof typeof fallbackContent] || fallbackContent.visitor;
    const totalDuration = content.scenes.reduce((sum, scene) => sum + scene.duration, 0);

    return {
      script: content.script,
      scenes: content.scenes,
      totalDuration
    };
  }
}

export const videoGenerationService = new VideoGenerationService();