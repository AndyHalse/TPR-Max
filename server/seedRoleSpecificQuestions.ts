import { eq } from "drizzle-orm";
import { db } from "./db";
import { inductionQuestions, type InsertInductionQuestion } from "@shared/schema";

// Visitor-specific H&S questions
const visitorQuestions: InsertInductionQuestion[] = [
  {
    questionText: "As a visitor, what must you do before entering the site?",
    questionType: "multiple_choice",
    correctAnswer: "C",
    optionA: "Show your ID to reception",
    optionB: "Put on a hard hat",
    optionC: "Sign in at reception and wait for your escort",
    optionD: "Go directly to your meeting location",
    explanation: "All visitors must sign in at reception and wait for an escort before entering any work areas.",
    category: "visitor_protocol",
    roleType: "visitor",
    orderIndex: 1
  },
  {
    questionText: "What PPE must visitors wear in designated areas?",
    questionType: "multiple_choice",
    correctAnswer: "B",
    optionA: "Only safety boots",
    optionB: "Hard hat, safety boots, and high-visibility vest",
    optionC: "Just a high-visibility vest",
    optionD: "No PPE required for visitors",
    explanation: "Visitors entering work areas must wear the same basic PPE as workers: hard hat, safety boots, and high-visibility vest.",
    category: "visitor_ppe",
    roleType: "visitor",
    orderIndex: 2
  },
  {
    questionText: "If the fire alarm sounds during your visit, what should you do?",
    questionType: "multiple_choice",
    correctAnswer: "A",
    optionA: "Follow your escort immediately to the assembly point",
    optionB: "Continue your meeting if it's important",
    optionC: "Wait in the meeting room for instructions",
    optionD: "Leave through the nearest exit on your own",
    explanation: "Always follow your escort immediately to the designated assembly point. Never attempt to evacuate independently.",
    category: "emergency_procedures",
    roleType: "visitor",
    orderIndex: 3
  }
];

// Staff-specific H&S questions
const staffQuestions: InsertInductionQuestion[] = [
  {
    questionText: "What is your responsibility if you witness unsafe behavior by a colleague?",
    questionType: "multiple_choice",
    correctAnswer: "A",
    optionA: "Stop the unsafe work immediately and report to your supervisor",
    optionB: "Ignore it if it doesn't affect you directly",
    optionC: "Mention it to your colleague during break time",
    optionD: "Report it at the end of the week",
    explanation: "You have a duty of care to stop unsafe work immediately and report it to prevent accidents.",
    category: "workplace_responsibility",
    roleType: "staff",
    orderIndex: 1
  },
  {
    questionText: "How often must you attend refresher H&S training as a permanent employee?",
    questionType: "multiple_choice",
    correctAnswer: "B",
    optionA: "Every 6 months",
    optionB: "Annually",
    optionC: "Every 2 years",
    optionD: "Only when regulations change",
    explanation: "All permanent staff must complete annual H&S refresher training to maintain current knowledge.",
    category: "training_requirements",
    roleType: "staff",
    orderIndex: 2
  },
  {
    questionText: "What should you do if you discover faulty equipment?",
    questionType: "multiple_choice",
    correctAnswer: "C",
    optionA: "Continue using it carefully",
    optionB: "Try to fix it yourself",
    optionC: "Tag it as defective and report it immediately",
    optionD: "Tell someone about it later",
    explanation: "Faulty equipment must be immediately tagged as defective and reported to prevent accidents.",
    category: "equipment_safety",
    roleType: "staff",
    orderIndex: 3
  }
];

// Contractor-specific H&S questions (building on existing ones)
const contractorQuestions: InsertInductionQuestion[] = [
  {
    questionText: "Before starting work, what documentation must contractors provide?",
    questionType: "multiple_choice",
    correctAnswer: "D",
    optionA: "Just a method statement",
    optionB: "Risk assessment only",
    optionC: "Insurance certificates only",
    optionD: "Risk assessment, method statement, and relevant insurance certificates",
    explanation: "Contractors must provide comprehensive documentation including risk assessments, method statements, and current insurance certificates before starting work.",
    category: "contractor_compliance",
    roleType: "contractor",
    orderIndex: 1
  },
  {
    questionText: "What is the consequence of receiving a red card?",
    questionType: "multiple_choice",
    correctAnswer: "A",
    optionA: "Immediate removal from site with potential ban",
    optionB: "A written warning only",
    optionC: "Additional training required",
    optionD: "Nothing, it's just a record",
    explanation: "Red cards result in immediate site removal and may lead to temporary or permanent bans depending on the severity of the violation.",
    category: "card_system",
    roleType: "contractor",
    orderIndex: 2
  },
  {
    questionText: "Who is responsible for the safety of subcontractors you bring to site?",
    questionType: "multiple_choice",
    correctAnswer: "B",
    optionA: "The site manager",
    optionB: "You as the main contractor",
    optionC: "The subcontractors themselves",
    optionD: "The client",
    explanation: "Main contractors are responsible for ensuring their subcontractors comply with site safety requirements and have proper documentation.",
    category: "contractor_responsibility",
    roleType: "contractor",
    orderIndex: 3
  }
];

export async function seedRoleSpecificQuestions() {
  console.log('🌱 Seeding role-specific H&S questions...');
  
  try {
    // Check if role-specific questions already exist
    const existingVisitorQ = await db.select().from(inductionQuestions)
      .where(eq(inductionQuestions.roleType, 'visitor')).limit(1);
    
    const existingStaffQ = await db.select().from(inductionQuestions)
      .where(eq(inductionQuestions.roleType, 'staff')).limit(1);

    let seedCount = 0;

    // Seed visitor questions if they don't exist
    if (existingVisitorQ.length === 0) {
      await db.insert(inductionQuestions).values(visitorQuestions);
      seedCount += visitorQuestions.length;
      console.log(`✅ Seeded ${visitorQuestions.length} visitor questions`);
    }

    // Seed staff questions if they don't exist
    if (existingStaffQ.length === 0) {
      await db.insert(inductionQuestions).values(staffQuestions);
      seedCount += staffQuestions.length;
      console.log(`✅ Seeded ${staffQuestions.length} staff questions`);
    }

    // Seed additional contractor questions
    await db.insert(inductionQuestions).values(contractorQuestions);
    seedCount += contractorQuestions.length;
    console.log(`✅ Seeded ${contractorQuestions.length} additional contractor questions`);
    
    if (seedCount > 0) {
      console.log(`✅ Total seeded ${seedCount} role-specific H&S questions`);
    }
  } catch (error) {
    console.error('❌ Failed to seed role-specific questions:', error);
    throw error;
  }
}