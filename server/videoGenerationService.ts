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
      const response = await openai.chat.completions.create({
        model: modelType || this.companySettings?.openaiModel || "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
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
        // GPT-5 only supports temperature 1.0, older models support custom values
        ...(this.companySettings?.openaiModel === 'gpt-5' || this.companySettings?.openaiModel?.includes('gpt-6') || this.companySettings?.openaiModel?.includes('gpt-7')
          ? {} // Use default temperature (1.0) for GPT-5+
          : { temperature: parseFloat(this.companySettings?.openaiTemperature || "0.7") }),
        // GPT-5 and newer use max_completion_tokens instead of max_tokens
        ...(this.companySettings?.openaiModel === 'gpt-5' || this.companySettings?.openaiModel?.includes('gpt-6') || this.companySettings?.openaiModel?.includes('gpt-7')
          ? { max_completion_tokens: parseInt(this.companySettings?.openaiMaxTokens || "4000") }
          : { max_tokens: parseInt(this.companySettings?.openaiMaxTokens || "4000") }),
      });

      let content;
      try {
        content = JSON.parse(response.choices[0].message.content || '{}');
        console.log('✅ JSON parsing successful, scenes found:', content.scenes?.length || 0);
      } catch (parseError) {
        console.error('❌ JSON parsing failed:', parseError);
        console.error('Raw response:', response.choices[0].message.content);
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
      
      return result;
      
    } catch (error) {
      console.error('Error generating induction script:', error);
      throw new Error('Failed to generate induction script');
    }
  }

  // Generate scene images for the induction
  async generateSceneImages(scenes: Array<{imagePrompt: string}>): Promise<string[]> {
    const imageUrls: string[] = [];
    const companyName = this.companySettings?.companyName || "VisiGate Pro";
    
    try {
      console.log(`🎨 Generating ${scenes.length} AI images for ${companyName} induction...`);
      
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        console.log(`🖼️ Generating image ${i + 1}/${scenes.length}: ${scene.imagePrompt}`);
        
        // Enhanced prompt with company branding and professional styling
        const enhancedPrompt = `Professional workplace safety illustration for ${companyName}: ${scene.imagePrompt}. 
        Style: Clean, modern corporate safety design with professional photography quality. 
        Colors: Professional blue (#3b82f6) and safety orange (#f97316) corporate theme. 
        Setting: Modern office/industrial environment with ${companyName} branding. 
        Quality: High-resolution, crystal clear, informative, realistic photography style.
        Details: Include safety equipment, professional uniforms, clear signage, modern facilities.
        Avoid: Cartoons, sketches, amateur photography, cluttered backgrounds.`;
        
        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt: enhancedPrompt,
          n: 1,
          size: "1024x1024",
          quality: "hd", // Upgraded to HD quality
        });
        
        const imageUrl = imageResponse.data?.[0]?.url;
        if (imageUrl) {
          imageUrls.push(imageUrl);
          console.log(`✅ Image ${i + 1} generated successfully`);
        } else {
          console.log(`⚠️ Image ${i + 1} generation returned no URL`);
        }
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay for stability
      }
      
      console.log(`🎉 Successfully generated ${imageUrls.length}/${scenes.length} AI images`);
    } catch (error: any) {
      console.error('❌ Error generating scene images:', error);
      if (error?.response) {
        console.error('API Response:', error.response.data);
      }
      // Continue with empty images rather than failing completely
    }
    
    return imageUrls;
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
      const fallbackScenes = [
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
      ];
      
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
      htmlContent = await this.createEnhancedHTMLPresentation(scenes, roleType, modelType);
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
            `<img src="${this.companySettings.bannerUrl}" alt="${companyName}" style="height: 40px; margin-right: 10px; vertical-align: middle;" />` : 
            '🛡️'
        }
        ${companyName}
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

  // Generate full video presentation using Sora
  async createVideoPresentation(scenes: any[], roleType: string, modelType: string): Promise<string> {
    console.log('🎬 Full Video Generation with Sora is currently in development');
    console.log('⚠️ Falling back to enhanced HTML presentation for now');
    
    // For now, return enhanced HTML until Sora API is available
    return await this.createEnhancedHTMLPresentation(scenes, roleType, modelType);
  }

  // Generate hybrid enhanced presentation with AI images
  async createEnhancedHTMLPresentation(scenes: any[], roleType: string, modelType: string): Promise<string> {
    console.log('🎨 Generating enhanced presentation with AI images...');
    
    // Generate AI images for each scene (enabled for hybrid enhanced mode)
    let sceneImages: string[] = [];
    try {
      console.log('🖼️ Starting AI image generation for enhanced mode...');
      sceneImages = await this.generateSceneImages(scenes);
      console.log(`✨ Successfully generated ${sceneImages.length} AI images`);
    } catch (error) {
      console.error('❌ AI image generation failed:', error);
      console.log('⚠️ Continuing with enhanced styling but no AI images');
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
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            position: relative;
        }
        .scene {
            display: none;
            padding: 40px;
            max-width: 900px;
            animation: slideIn 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
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
            max-width: 400px;
            height: 250px;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            margin: 20px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
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
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 20px;
        }
        .btn {
            padding: 12px 24px;
            background: rgba(255,255,255,0.2);
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 25px;
            color: white;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        }
        .btn:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
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
        .logo {
            position: fixed;
            top: 30px;
            left: 30px;
            font-size: 1.8rem;
            font-weight: bold;
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
    <div class="logo">
        ${this.companySettings?.bannerUrl ? 
            `<img src="${this.companySettings.bannerUrl}" alt="${companyName}" style="height: 40px; margin-right: 10px; vertical-align: middle;" />` : 
            '🛡️'
        }
        ${companyName}
    </div>
    <div class="scene-counter">
        <span id="current-scene">1</span> / <span id="total-scenes">${scenes.length}</span>
    </div>
    <div class="enhanced-badge">✨ Enhanced with AI</div>
    
    <div class="presentation-container">
        ${scenes.map((scene, index) => `
            <div class="scene ${index === 0 ? 'active' : ''}" data-duration="${scene.duration}">
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
            document.getElementById('current-scene').textContent = index + 1;
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
          videoTitle: `AI-Generated ${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Safety Induction`,
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