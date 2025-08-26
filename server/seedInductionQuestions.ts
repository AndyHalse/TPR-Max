import { db } from "./db";
import { inductionQuestions, type InsertInductionQuestion } from "@shared/schema";

// UK Health & Safety Induction Questions
const ukHSQuestions: InsertInductionQuestion[] = [
  {
    questionText: "What is the minimum age requirement for working on construction sites in the UK?",
    questionType: "multiple_choice",
    correctAnswer: "B",
    optionA: "16 years old",
    optionB: "18 years old",
    optionC: "21 years old",
    optionD: "No minimum age",
    explanation: "In the UK, you must be at least 18 years old to work on a construction site due to health and safety regulations.",
    category: "general_safety",
    orderIndex: 1
  },
  {
    questionText: "What does PPE stand for in workplace safety?",
    questionType: "multiple_choice",
    correctAnswer: "A",
    optionA: "Personal Protective Equipment",
    optionB: "Public Protection Equipment",
    optionC: "Professional Protective Equipment",
    optionD: "Primary Prevention Equipment",
    explanation: "PPE stands for Personal Protective Equipment, which includes items like hard hats, safety boots, and high-visibility clothing.",
    category: "ppe",
    orderIndex: 2
  },
  {
    questionText: "What are the minimum PPE requirements for all workers on this site?",
    questionType: "multiple_choice",
    correctAnswer: "D",
    optionA: "Hard hat only",
    optionB: "Hard hat and safety boots",
    optionC: "Hard hat, safety boots, and gloves",
    optionD: "Hard hat, safety boots, high-visibility clothing, and safety glasses",
    explanation: "All workers must wear hard hat, safety boots, high-visibility clothing, and safety glasses at all times on site.",
    category: "ppe",
    orderIndex: 3
  },
  {
    questionText: "If you discover a safety hazard, what should you do first?",
    questionType: "multiple_choice",
    correctAnswer: "A",
    optionA: "Stop work immediately and report it to your supervisor",
    optionB: "Continue working but avoid the hazard area",
    optionC: "Tell your colleagues about it during break time",
    optionD: "Fix it yourself if possible",
    explanation: "Always stop work immediately and report any safety hazards to your supervisor. Do not attempt to fix hazards unless specifically trained and authorized.",
    category: "hazard_identification",
    orderIndex: 4
  },
  {
    questionText: "What is the emergency assembly point for this site?",
    questionType: "multiple_choice",
    correctAnswer: "B",
    optionA: "Site entrance gate",
    optionB: "Car park area (marked with green signs)",
    optionC: "Site office",
    optionD: "Main road outside site",
    explanation: "In case of emergency, all personnel must assemble at the designated car park area marked with green emergency assembly signs.",
    category: "emergency_procedures",
    orderIndex: 5
  },
  {
    questionText: "Who is responsible for your safety on site?",
    questionType: "multiple_choice",
    correctAnswer: "C",
    optionA: "The site manager only",
    optionB: "The health and safety officer only", 
    optionC: "Everyone - including yourself",
    optionD: "Only supervisors and managers",
    explanation: "While managers have overall responsibility, everyone on site has a legal duty to take care of their own safety and that of others.",
    category: "general_safety",
    orderIndex: 6
  },
  {
    questionText: "When working at height above 2 meters, what protection must be in place?",
    questionType: "multiple_choice",
    correctAnswer: "A",
    optionA: "Proper fall protection systems (harnesses, guard rails, or safety nets)",
    optionB: "Just be extra careful",
    optionC: "Have someone watch you",
    optionD: "Work faster to minimize time at height",
    explanation: "UK regulations require proper fall protection systems when working at height above 2 meters, including safety harnesses, guard rails, or safety nets.",
    category: "working_at_height",
    orderIndex: 7
  },
  {
    questionText: "What should you do if you feel unwell or are taking medication that might affect your work?",
    questionType: "multiple_choice",
    correctAnswer: "B",
    optionA: "Continue working but be extra careful",
    optionB: "Inform your supervisor immediately",
    optionC: "Take a longer break",
    optionD: "Go home without telling anyone",
    explanation: "You must inform your supervisor immediately if you feel unwell or are taking medication that might affect your ability to work safely.",
    category: "general_safety",
    orderIndex: 8
  },
  {
    questionText: "What is the speed limit for vehicles on site?",
    questionType: "multiple_choice", 
    correctAnswer: "A",
    optionA: "5 mph (8 km/h)",
    optionB: "10 mph (16 km/h)",
    optionC: "15 mph (24 km/h)",
    optionD: "Normal road speed limits apply",
    explanation: "The maximum speed limit for all vehicles on site is 5 mph to ensure the safety of pedestrians and workers.",
    category: "site_rules",
    orderIndex: 9
  },
  {
    questionText: "What does COSHH stand for?",
    questionType: "multiple_choice",
    correctAnswer: "C",
    optionA: "Control of Safety and Health at Work",
    optionB: "Construction Safety and Health Handbook",
    optionC: "Control of Substances Hazardous to Health",
    optionD: "Committee on Safety and Health Hazards",
    explanation: "COSHH stands for Control of Substances Hazardous to Health - regulations that require employers to control exposure to hazardous substances.",
    category: "hazard_identification",
    orderIndex: 10
  },
  {
    questionText: "If you witness an accident, what is your first priority?",
    questionType: "multiple_choice",
    correctAnswer: "A",
    optionA: "Ensure your own safety and that of others, then provide assistance",
    optionB: "Immediately run to help the injured person",
    optionC: "Take photos for evidence",
    optionD: "Call your supervisor first",
    explanation: "Always ensure your own safety and that of others first. A safe rescuer can help; an injured rescuer becomes another casualty.",
    category: "emergency_procedures",
    orderIndex: 11
  },
  {
    questionText: "Smoking and vaping on site is:",
    questionType: "multiple_choice",
    correctAnswer: "B",
    optionA: "Allowed in designated areas only",
    optionB: "Completely prohibited anywhere on site",
    optionC: "Allowed during breaks only",
    optionD: "Allowed with supervisor permission",
    explanation: "Smoking and vaping are completely prohibited anywhere on this site due to fire risks and health and safety regulations.",
    category: "site_rules",
    orderIndex: 12
  }
];

export async function seedInductionQuestions(): Promise<void> {
  try {
    console.log("🌱 Seeding UK H&S induction questions...");
    
    // Insert all questions
    await db.insert(inductionQuestions).values(ukHSQuestions).onConflictDoNothing();
    
    console.log(`✅ Seeded ${ukHSQuestions.length} UK H&S induction questions`);
  } catch (error) {
    console.error("Failed to seed induction questions:", error);
    throw error;
  }
}