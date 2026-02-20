import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Presentation, Lightbulb, TrendingUp, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SalesPitch {
  valueProposition: string;
  painPointSolutions: string[];
  roiProjection: string;
  implementationPlan: string;
  competitiveAdvantages: string[];
  nextSteps: string[];
}

export default function AISalesPitchGenerator() {
  const [companyName, setCompanyName] = useState("Acme Corporation");
  const [industry, setIndustry] = useState("manufacturing");
  const [companySize, setCompanySize] = useState("150");
  const [currentChallenges, setCurrentChallenges] = useState("Manual visitor check-in causing delays and security concerns");
  const [budget, setBudget] = useState("£1000-£3000/month");
  const { toast } = useToast();

  const pitchMutation = useMutation({
    mutationFn: async (data: { 
      companyName: string; 
      industry: string; 
      companySize: string; 
      currentChallenges: string; 
      budget: string;
    }): Promise<{
      success: boolean;
      pitch: SalesPitch;
      timestamp: string;
    }> => {
      const response = await fetch('/api/ai/sales-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate sales pitch');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "AI Sales Pitch Generated",
        description: "Customized presentation ready for prospect",
      });
    },
    onError: () => {
      toast({
        title: "Pitch Generation Failed",
        description: "Unable to generate sales pitch",
        variant: "destructive"
      });
    }
  });

  const handleGenerate = () => {
    pitchMutation.mutate({ companyName, industry, companySize, currentChallenges, budget });
  };

  return (
    <GlassCard className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800">
      <div className="flex items-center space-x-3 mb-6">
        <Presentation className="text-amber-600 dark:text-amber-400" size={32} />
        <h2 className="text-xl font-bold text-amber-800 dark:text-amber-200">AI Sales Pitch Generator</h2>
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          Custom Pitches
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="company-name" className="text-slate-700 dark:text-slate-300">
              Prospect Company Name
            </Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-company-name"
            />
          </div>
          
          <div>
            <Label htmlFor="industry" className="text-slate-700 dark:text-slate-300">
              Industry
            </Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="mt-1" data-testid="select-industry">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manufacturing">Manufacturing</SelectItem>
                <SelectItem value="technology">Technology</SelectItem>
                <SelectItem value="healthcare">Healthcare</SelectItem>
                <SelectItem value="finance">Finance & Banking</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="construction">Construction</SelectItem>
                <SelectItem value="professional services">Professional Services</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="company-size" className="text-slate-700 dark:text-slate-300">
              Company Size (Employees)
            </Label>
            <Input
              id="company-size"
              type="number"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              placeholder=""
              className="mt-1"
              data-testid="input-company-size-pitch"
            />
          </div>
          
          <div>
            <Label htmlFor="challenges" className="text-slate-700 dark:text-slate-300">
              Current Challenges
            </Label>
            <Textarea
              id="challenges"
              value={currentChallenges}
              onChange={(e) => setCurrentChallenges(e.target.value)}
              placeholder="Describe their current visitor management challenges..."
              className="mt-1 min-h-[80px]"
              data-testid="textarea-challenges"
            />
          </div>
          
          <div>
            <Label htmlFor="budget" className="text-slate-700 dark:text-slate-300">
              Budget Range
            </Label>
            <Select value={budget} onValueChange={setBudget}>
              <SelectTrigger className="mt-1" data-testid="select-budget">
                <SelectValue placeholder="Select budget range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="£500-£1000/month">£500-£1,000/month</SelectItem>
                <SelectItem value="£1000-£3000/month">£1,000-£3,000/month</SelectItem>
                <SelectItem value="£3000-£5000/month">£3,000-£5,000/month</SelectItem>
                <SelectItem value="£5000+/month">£5,000+/month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={handleGenerate}
            disabled={pitchMutation.isPending}
            className="w-full mt-4"
            data-testid="button-generate-pitch"
          >
            {pitchMutation.isPending ? 'Generating...' : 'Generate AI Sales Pitch'}
          </Button>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {pitchMutation.data ? (
            <div className="space-y-4">
              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border-2 border-amber-300 dark:border-amber-700">
                <div className="flex items-center space-x-2 mb-2">
                  <Sparkles className="text-amber-600" size={18} />
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200">Value Proposition</h3>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300" data-testid="value-proposition">
                  {pitchMutation.data.pitch.valueProposition}
                </p>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center space-x-2 mb-3">
                  <Lightbulb className="text-blue-600" size={18} />
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200">Pain Point Solutions</h3>
                </div>
                <ul className="space-y-2" data-testid="pain-point-solutions">
                  {pitchMutation.data.pitch.painPointSolutions.map((solution, index) => (
                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                      <span className="text-blue-600 mr-2 mt-1">💡</span>
                      {solution}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingUp className="text-green-600" size={18} />
                  <h3 className="font-semibold text-green-800 dark:text-green-200">ROI Projection</h3>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300" data-testid="roi-projection">
                  {pitchMutation.data.pitch.roiProjection}
                </p>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center space-x-2 mb-3">
                  <CheckCircle2 className="text-purple-600" size={18} />
                  <h3 className="font-semibold text-purple-800 dark:text-purple-200">Competitive Advantages</h3>
                </div>
                <ul className="space-y-2" data-testid="competitive-advantages">
                  {pitchMutation.data.pitch.competitiveAdvantages.map((advantage, index) => (
                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                      <span className="text-purple-600 mr-2 mt-1">⭐</span>
                      {advantage}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-center space-x-2 mb-3">
                  <ArrowRight className="text-orange-600" size={18} />
                  <h3 className="font-semibold text-orange-800 dark:text-orange-200">Next Steps</h3>
                </div>
                <ul className="space-y-2" data-testid="next-steps">
                  {pitchMutation.data.pitch.nextSteps.map((step, index) => (
                    <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                      <span className="text-orange-600 mr-2 mt-1">{index + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 p-4 rounded-lg border border-amber-300 dark:border-amber-700">
                <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">Implementation Plan</h4>
                <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="implementation-plan">
                  {pitchMutation.data.pitch.implementationPlan}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white/50 dark:bg-slate-800/50 p-8 rounded-lg text-center">
              <Presentation className="mx-auto text-slate-400 mb-4" size={48} />
              <p className="text-slate-600 dark:text-slate-400">
                Generate a customized AI-powered sales pitch for your prospect
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-amber-100 dark:bg-amber-900/30 p-4 rounded-lg">
        <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">Sales Team Benefits:</h4>
        <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
          <li>• <strong>Personalized Pitches:</strong> AI creates customized presentations for each prospect</li>
          <li>• <strong>Faster Preparation:</strong> Generate compelling sales materials in seconds</li>
          <li>• <strong>Higher Conversion:</strong> Address specific pain points and industry needs</li>
          <li>• <strong>Consistent Messaging:</strong> Ensure all sales reps deliver value-focused pitches</li>
        </ul>
      </div>
    </GlassCard>
  );
}