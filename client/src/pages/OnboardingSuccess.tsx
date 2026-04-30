import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface OnboardingSuccessProps {}

export default function OnboardingSuccess({}: OnboardingSuccessProps) {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const processOnboarding = async () => {
      try {
        // Get session_id from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        
        if (!sessionId) {
          throw new Error('Missing payment session ID');
        }

        console.info('🔄 Processing onboarding success...');
        
        // SECURITY FIX: Call POST endpoint instead of GET to prevent CSRF
        const response = await fetch('/api/onboarding/success', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include session cookies
          body: JSON.stringify({ session_id: sessionId })
        });

        if (response.redirected) {
          // Server redirected (likely to /welcome) - follow the redirect
          console.info('✅ Server redirected to:', response.url);
          window.location.href = response.url;
          return;
        }

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Onboarding failed');
        }

        const result = await response.json();
        console.info('✅ Onboarding completed successfully');
        
        setStatus('success');
        
        // Redirect to welcome page after a brief success message
        setTimeout(() => {
          setLocation('/welcome');
        }, 2000);
        
      } catch (err) {
        console.error('❌ Onboarding error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setStatus('error');
      }
    };

    processOnboarding();
  }, [setLocation]);

  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              Setting up your account
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-slate-600 dark:text-slate-400">
              Processing your payment and creating your secure workspace...
            </p>
            <div className="flex justify-center">
              <div className="animate-pulse flex space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-6 w-6" />
              Setup Failed
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-slate-600 dark:text-slate-400">
              There was an issue setting up your account:
            </p>
            <p className="text-red-600 dark:text-red-400 font-medium">
              {error}
            </p>
            <div className="flex gap-2 justify-center">
              <Button 
                variant="outline" 
                onClick={() => setLocation('/signup')}
                data-testid="button-retry-signup"
              >
                Try Again
              </Button>
              <Button 
                onClick={() => window.location.href = 'mailto:support@visigatepro.com'}
                data-testid="button-contact-support"
              >
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="h-6 w-6" />
            Account Created Successfully!
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Your TPR Max account has been set up successfully. Redirecting to your dashboard...
          </p>
          <div className="flex justify-center">
            <div className="animate-pulse flex space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}