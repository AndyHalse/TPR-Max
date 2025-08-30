import OpenAI from "openai";
import { db } from "./db";
import { inductionSettings, type CompanySettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class VideoGenerationService {
  private companySettings: CompanySettings | null = null;

  constructor(settings?: CompanySettings) {
    this.companySettings = settings || null;
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
    console.log(`🧠 Generating AI questions for ${roleType} induction video...`);
    
    try {
      const companyName = this.companySettings?.companyName || "VisiGate Pro";
      
      // Create comprehensive prompt for question generation
      const prompt = `Based on the following ${roleType} safety induction video content, generate 8-12 comprehensive multiple choice questions that test understanding of the key safety concepts covered.

INDUCTION VIDEO SCRIPT:
${script}

SCENE DETAILS:
${scenes.map((scene, index) => `Scene ${index + 1}: ${scene.title}\n${scene.content}`).join('\n\n')}

REQUIREMENTS:
- Generate 8-12 multiple choice questions (A, B, C, D options)
- Focus on critical safety knowledge from the video content
- Include questions about PPE, emergency procedures, hazards, and role-specific requirements
- Make questions practical and scenario-based where possible
- Ensure questions directly relate to content covered in the video
- Provide clear, educational explanations for correct answers
- Use UK Health & Safety terminology and standards
- Vary difficulty levels from basic recall to application of concepts

QUESTION CATEGORIES to cover:
- ${roleType}_safety_protocols
- emergency_procedures  
- ppe_requirements
- hazard_identification
- company_policies
- risk_assessment
- legal_compliance
- workplace_behavior

Company: ${companyName}
Role Type: ${roleType}

IMPORTANT: Respond ONLY with a valid JSON array in this exact format:
[
  {
    "questionText": "What is the first step when entering the site as a visitor?",
    "questionType": "multiple_choice",
    "correctAnswer": "C",
    "optionA": "Put on safety helmet immediately",
    "optionB": "Find your meeting location",
    "optionC": "Report to reception and sign in",
    "optionD": "Contact your host directly",
    "explanation": "All visitors must report to reception first to sign in and receive safety briefing before entering any work areas.",
    "category": "${roleType}_safety_protocols",
    "roleType": "${roleType}"
  }
]`;

      let selectedModel = modelType || this.companySettings?.openaiModel || "gpt-5";
      
      const response = await openai.chat.completions.create({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content: `You are a UK Health & Safety expert creating assessment questions. Generate comprehensive questions that test understanding of the safety content provided. You MUST respond with valid JSON format.`
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        // GPT-5 and newer use max_completion_tokens instead of max_tokens
        ...(selectedModel === 'gpt-5' || selectedModel?.includes('gpt-6') || selectedModel?.includes('gpt-7')
          ? { max_completion_tokens: parseInt(this.companySettings?.openaiMaxTokens || "3000") }
          : { max_tokens: parseInt(this.companySettings?.openaiMaxTokens || "3000") }),
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No content received from AI');
      }

      // Parse the JSON response
      const parsedResponse = JSON.parse(content);
      
      // Handle both direct array and object with questions property
      const questions = Array.isArray(parsedResponse) ? parsedResponse : 
                      (parsedResponse.questions || parsedResponse.data || []);

      console.log(`✅ Generated ${questions.length} AI questions based on video content`);
      return questions;

    } catch (error) {
      console.error('❌ Error generating questions from script:', error);
      
      // Return fallback questions based on role type
      const fallbackQuestions = this.getFallbackQuestions(roleType);
      console.log(`⚠️ Using ${fallbackQuestions.length} fallback questions for ${roleType}`);
      return fallbackQuestions;
    }
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
    
    // Get company details for professional branding
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    const companyLogo = this.companySettings?.bannerUrl ? `Company Logo: ${this.companySettings.bannerUrl}` : "Professional company branding";
    const aiInstructions = this.companySettings?.aiInstructionsPrompt || "Create comprehensive, engaging safety induction content";
    
    // Enhanced prompts based on video format
    const formatSpecificInstructions = {
      'interactive_slides': 'Create clear, concise content perfect for slide-by-slide navigation with strong visual cues.',
      'full_video': 'Create cinematic, flowing content with smooth transitions and professional narration style.',
      'hybrid_enhanced': 'Create vivid, detailed content with rich visual descriptions for AI image generation. Include specific details about workplace scenes, safety equipment, and professional environments.'
    };
    
    const formatInstruction = formatSpecificInstructions[videoFormat as keyof typeof formatSpecificInstructions] || formatSpecificInstructions['interactive_slides'];
    
    const roleSpecificPrompts = {
      visitor: `Generate a comprehensive safety induction script for VISITORS to ${companyName}. ${formatInstruction}
      
      Company Details: ${companyName}
      ${companyLogo}
      AI Instructions: ${aiInstructions}
      
      Include:
        - Welcome and introduction
        - Site access protocols and escort requirements
        - Basic PPE requirements in designated areas
        - Emergency procedures and assembly points
        - Restricted areas and safety zones
        - Key contact information
        - Sign-in/sign-out procedures`,
      
      staff: `Generate a comprehensive safety induction script for new STAFF MEMBERS at ${companyName}. ${formatInstruction}
      
      Company Details: ${companyName}
      ${companyLogo}
      AI Instructions: ${aiInstructions}
      
      Include:
        - Company safety culture and policies
        - Workplace hazards and risk assessments
        - PPE requirements and usage
        - Emergency procedures and evacuation routes
        - Incident reporting procedures
        - Health and safety responsibilities
        - Equipment safety protocols
        - Training requirements and refresher schedules`,
      
      contractor: `Generate a comprehensive safety induction script for CONTRACTORS working at ${companyName}. ${formatInstruction}
      
      Company Details: ${companyName}
      ${companyLogo}
      AI Instructions: ${aiInstructions}
      
      Include:
        - Site-specific safety requirements
        - Permit to work procedures
        - Risk assessment requirements
        - PPE standards and compliance
        - Red and Yellow card system explanation
        - Method statements and documentation
        - Subcontractor responsibilities
        - Site rules and regulations
        - Emergency contact procedures
        - Quality and safety standards`
    };

    const prompt = roleSpecificPrompts[roleType as keyof typeof roleSpecificPrompts] || roleSpecificPrompts.contractor;

    try {
      console.log(`🔧 Starting script generation with comprehensive logging...`);
      console.log(`🔧 Company settings available: ${this.companySettings ? 'YES' : 'NO'}`);
      console.log(`🔧 OpenAI API key configured: ${process.env.OPENAI_API_KEY ? 'YES' : 'NO'}`);
      
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('CRITICAL: OpenAI API key not configured');
      }
      
      let selectedModel = modelType || this.companySettings?.openaiModel || "gpt-5";
      console.log(`🤖 Selected AI model: ${selectedModel}`);
      
      let response;
      try {
        console.log(`🚀 Making API call to ${selectedModel}...`);
        console.log(`📝 Prompt length: ${prompt.length} characters`);
        
        const startTime = Date.now();
        response = await openai.chat.completions.create({
          model: selectedModel,
        messages: [
          {
            role: "system",
            content: `You are a UK Health & Safety expert creating professional induction content. You MUST respond with valid JSON format containing script, scenes array, and totalDuration. Each scene must have title, content, duration, and imagePrompt fields.`
          },
          {
            role: "user", 
            content: `${prompt}

            Create an induction script with 6-8 scenes, each 2-3 minutes long.

            IMPORTANT: Respond ONLY with a valid JSON object in this exact format:
            {
              "script": "Full narration text here",
              "scenes": [
                {
                  "title": "Scene title",
                  "content": "Scene content/narration",
                  "duration": 180,
                  "imagePrompt": "Description for safety illustration"
                }
              ],
              "totalDuration": 1200
            }

            Include exactly 6-8 scenes covering: Introduction, PPE requirements, Emergency procedures, Hazard identification, Safe work practices, Environmental responsibilities, Health requirements, and Summary.`
          }
        ],
        response_format: { type: "json_object" },
        // GPT-5 only supports temperature 1.0, older models support custom values
        ...(this.companySettings?.openaiModel === 'gpt-5' || this.companySettings?.openaiModel?.includes('gpt-6') || this.companySettings?.openaiModel?.includes('gpt-7')
          ? {} // Use default temperature (1.0) for GPT-5+
          : { temperature: parseFloat(this.companySettings?.openaiTemperature || "0.7") }),
        // GPT-5 and newer use max_completion_tokens instead of max_tokens
        ...(selectedModel === 'gpt-5' || selectedModel?.includes('gpt-6') || selectedModel?.includes('gpt-7')
          ? { max_completion_tokens: parseInt(this.companySettings?.openaiMaxTokens || "4000") }
          : { max_tokens: parseInt(this.companySettings?.openaiMaxTokens || "4000") }),
        });
      } catch (error: any) {
        if (error.code === 'model_not_found' && selectedModel === 'gpt-5') {
          console.log('⚠️ GPT-5 model not found, retrying with GPT-5');
          selectedModel = 'gpt-5';
          
          response = await openai.chat.completions.create({
            model: selectedModel,
            messages: [
              {
                role: "system",
                content: `You are a UK Health & Safety expert creating professional induction content. You MUST respond with valid JSON format. Create a detailed, engaging script that covers all essential safety points for ${roleType}s.`
              },
              {
                role: "user", 
                content: `${prompt}

                Create an induction script with 6-8 scenes, each 2-3 minutes long.

                IMPORTANT: Respond ONLY with a valid JSON object in this exact format:
                {
                  "script": "Full narration text here",
                  "scenes": [
                    {
                      "title": "Scene title",
                      "content": "Scene content/narration",
                      "duration": 180,
                      "imagePrompt": "Description for safety illustration"
                    }
                  ],
                  "totalDuration": 1200
                }

                Include exactly 6-8 scenes covering: Introduction, PPE requirements, Emergency procedures, Hazard identification, Safe work practices, Environmental responsibilities, Health requirements, and Summary.`
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 4000
          });
        } else {
          throw error;
        }
      }

      const apiDuration = Date.now() - startTime;
      console.log(`⏱️ API call completed in ${apiDuration}ms`);
      
      const rawContent = response.choices[0].message.content;
      console.log(`📥 Raw AI response length: ${rawContent?.length || 0} characters`);
      console.log(`📥 Raw AI response preview: ${rawContent?.substring(0, 200) || 'NO CONTENT'}...`);
      
      if (!rawContent) {
        throw new Error('CRITICAL: No content received from OpenAI API');
      }
      
      let content;
      try {
        content = JSON.parse(rawContent);
        console.log('✅ JSON parsing successful, scenes found:', content.scenes?.length || 0);
        
        if (!content.scenes || content.scenes.length === 0) {
          console.error('🚨 CRITICAL: AI returned valid JSON but NO SCENES!');
          console.error('🚨 Response structure:', JSON.stringify(content, null, 2));
        }
      } catch (parseError) {
        console.error('❌ JSON parsing failed:', parseError);
        console.error('❌ Raw content that failed parsing:', rawContent);
        // Fallback: create default scenes if parsing fails
        console.log('🔄 Using fallback scenes');
        content = {
          script: `Welcome to the ${roleType} safety induction. This presentation covers essential health and safety requirements.`,
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
      console.log('🎬 All scene titles:', result.scenes.map(s => s.title));
      
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

  // Generate scene images for the induction (optimized for speed)
  async generateSceneImages(scenes: Array<{imagePrompt: string}>): Promise<string[]> {
    const imageUrls: string[] = [];
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    // GENERATE IMAGES FOR ALL SCENES - Critical for professional presentation
    const selectedScenes = scenes; // Use all scenes to ensure every page has an image
    
    try {
      console.log(`🎨 Generating ${selectedScenes.length} AI images for ${companyName} induction (complete coverage)...`);
      
      for (let i = 0; i < selectedScenes.length; i++) {
        const scene = selectedScenes[i];
        console.log(`🖼️ Generating image ${i + 1}/${selectedScenes.length}: ${scene.imagePrompt}`);
        
        // Enhanced prompt with company branding and CRITICAL spelling requirements
        const enhancedPrompt = `Professional workplace safety illustration for ${companyName}: ${scene.imagePrompt}. 
        Style: Clean, modern corporate safety design with professional photography quality. 
        Colors: Professional blue (#3b82f6) and safety orange (#f97316) corporate theme. 
        Setting: Modern office/industrial environment with ${companyName} branding. 
        Quality: High-resolution, crystal clear, informative, realistic photography style.
        Details: Include safety equipment, professional uniforms, clear signage, modern facilities.
        
        CRITICAL SPELLING AND TEXT REQUIREMENTS:
        - All visible text MUST be spelled correctly with perfect accuracy
        - Company names MUST be spelled exactly as provided: "${companyName}"
        - Safety terms MUST be spelled perfectly: "EMERGENCY", "SAFETY", "PPE", "VISITOR", "RESTRICTED", "AUTHORIZED", "PERSONNEL", "CAUTION", "WARNING", "DANGER"
        - Legal terms MUST be accurate: "CORPORATION", "LIMITED", "COMPLIANCE", "REGULATIONS", "CERTIFICATION"
        - No misspellings, typos, or text errors are acceptable
        - If unsure about spelling, use simple clear text or generic terms
        - Focus on visual elements rather than complex text if spelling accuracy cannot be guaranteed
        
        Avoid: Cartoons, sketches, amateur photography, cluttered backgrounds, misspelled text, unclear signage.`;
        
        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt: enhancedPrompt,
          n: 1,
          size: "1024x1024",
          quality: "standard", // Use standard quality for speed
        });
        
        const imageUrl = imageResponse.data?.[0]?.url;
        if (imageUrl) {
          imageUrls.push(imageUrl);
          console.log(`✅ Image ${i + 1} generated successfully`);
        } else {
          console.log(`⚠️ Image ${i + 1} generation returned no URL - retrying...`);
          // Add placeholder for failed image to maintain array index alignment
          imageUrls.push('');
        }
        
        // Minimal delay for API rate limits while ensuring reliability
        await new Promise(resolve => setTimeout(resolve, 300)); // Reduced to 0.3 seconds for faster completion
      }
      
      console.log(`🎉 Successfully generated ${imageUrls.length}/${selectedScenes.length} AI images`);
    } catch (error: any) {
      console.error('❌ Error generating scene images:', error);
      if (error?.response) {
        console.error('API Response:', error.response.data);
      }
      // Continue with empty images rather than failing completely
    }
    
    return imageUrls;
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
    
    // Generate images for hybrid enhanced mode
    let sceneImages: string[] = [];
    if (videoFormat === 'hybrid_enhanced') {
      try {
        console.log('🎨 Generating AI images for hybrid enhanced mode...');
        sceneImages = await this.generateSceneImages(scenes);
        console.log(`✨ Generated ${sceneImages.length} AI images for enhanced presentation`);
      } catch (error) {
        console.error('❌ AI image generation failed:', error);
      }
    }
    
    // Get company name for branding
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    // Create content based on format
    let htmlContent: string;
    
    if (videoFormat === 'hybrid_enhanced') {
      console.log('🎨 Creating hybrid enhanced presentation...');
      htmlContent = await this.createEnhancedHTMLPresentation(scenes, roleType, modelType, sceneImages);
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
      if (typeof (openai as any).videos?.generate === 'function') {
        const videoResponse = await (openai as any).videos.generate({
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

  // Generate hybrid enhanced presentation with AI images
  async createEnhancedHTMLPresentation(scenes: any[], roleType: string, modelType: string, preGeneratedImages: string[] = []): Promise<string> {
    console.log('🎨 Generating enhanced presentation with AI images...');
    
    // Get company name for branding
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    // Use pre-generated AI images if available (passed from generateVideoPresentation)
    // This prevents duplicate generation when called from hybrid enhanced mode
    let sceneImages: string[] = preGeneratedImages;
    
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
      console.log(`✅ Using ${sceneImages.length} pre-generated AI images (no duplication)`);
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Enhanced Safety Induction</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            overflow: hidden;
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
                    <div class="scene-image">
                        <img src="${sceneImages[index]}" alt="${scene.title}" />
                    </div>
                ` : `
                    <div class="scene-image">
                        <div>🎨 AI Image: ${scene.imagePrompt}</div>
                    </div>
                `}
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
        
        document.getElementById('total-scenes').textContent = totalScenes;
        
        function showScene(index) {
            document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.scene')[index].classList.add('active');
            // Update all scene counters since each scene now has its own counter
            document.querySelectorAll('.scene-counter span[id="current-scene"]').forEach(el => {
                el.textContent = index + 1;
            });
            updateProgressBar();
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
}

export const videoGenerationService = new VideoGenerationService();