import { useState, useEffect } from "react";
import DOMPurify from 'dompurify';
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X, Search, ChevronRight, Clock, ThumbsUp, ThumbsDown, BookOpen, Star, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { HelpArticle, HelpCategory, CompanySettings } from "@shared/schema";

function renderMarkdown(md: string): string {
  let content = md.replace(/^# .+\n+/, '');
  let html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-3 text-primary">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-5 mb-1 list-decimal">$2</li>')
    .replace(/^   - (.+)$/gm, '<li class="ml-10 mb-1 list-disc text-sm">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-5 mb-1 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/(<\/li>)\s*<\/p><p class="mb-3">\s*(<li)/g, '$1$2');

  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.includes('<li')) {
      if (!inList) {
        result.push('<ul class="my-2">');
        inList = true;
      }
      result.push(line);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(line);
    }
  }
  if (inList) result.push('</ul>');
  return result.join('\n');
}

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | null>(null);
  const [currentView, setCurrentView] = useState<"home" | "category" | "article" | "search">("home");

  // Get feature toggles to show relevant help content
  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
    staleTime: 10 * 60 * 1000,
  });

  // Get help categories
  const { data: categories = [] } = useQuery<HelpCategory[]>({
    queryKey: ["/api/help/categories"],
    staleTime: 5 * 60 * 1000,
  });

  // Get contextual help articles based on current page
  const { data: contextualArticles = [] } = useQuery<HelpArticle[]>({
    queryKey: [`/api/help/articles/contextual?location=${encodeURIComponent(location)}`],
    staleTime: 5 * 60 * 1000,
  });

  // Get featured help articles
  const { data: featuredArticles = [] } = useQuery<HelpArticle[]>({
    queryKey: ["/api/help/articles/featured"],
    staleTime: 5 * 60 * 1000,
  });

  // Get articles by category
  const { data: categoryArticles = [] } = useQuery<HelpArticle[]>({
    queryKey: ["/api/help/articles/category", selectedCategory?.id],
    queryFn: async () => {
      if (!selectedCategory?.id) return [];
      const res = await fetch(`/api/help/articles/category/${selectedCategory.id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedCategory?.id && currentView === "category",
    staleTime: 5 * 60 * 1000,
  });

  // Search articles
  const { data: searchResults = [] } = useQuery<HelpArticle[]>({
    queryKey: [`/api/help/articles/search?searchQuery=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length > 2,
    staleTime: 30 * 1000,
  });

  // Reset view when panel closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentView("home");
      setSelectedArticle(null);
      setSelectedCategory(null);
      setSearchQuery("");
    }
  }, [isOpen]);

  // Handle search input changes - only switch TO search view, not away from article
  useEffect(() => {
    if (searchQuery.length > 2 && currentView !== "article") {
      setCurrentView("search");
    } else if (searchQuery.length === 0 && currentView === "search") {
      setCurrentView("home");
    }
  }, [searchQuery]);

  const handleArticleClick = (article: HelpArticle) => {
    setSelectedArticle(article);
    setCurrentView("article");
    trackHelpInteraction("view", article.id);
  };

  const handleCategoryClick = (category: HelpCategory) => {
    setSelectedCategory(category);
    setCurrentView("category");
  };

  const handleBackClick = () => {
    if (currentView === "article") {
      if (searchQuery.length > 2) {
        setCurrentView("search");
      } else if (selectedCategory) {
        setCurrentView("category");
      } else {
        setCurrentView("home");
      }
      setSelectedArticle(null);
    } else if (currentView === "category") {
      setCurrentView("home");
      setSelectedCategory(null);
    } else if (currentView === "search") {
      setCurrentView("home");
      setSearchQuery("");
    }
  };

  const trackHelpInteraction = (type: string, articleId: string) => {
    // Track user interactions for analytics
    apiRequest("POST", "/api/help/interactions", {
      interactionType: type,
      articleId,
      pageContext: location,
      sessionId: Date.now().toString(),
      searchQuery: searchQuery || undefined,
    }).catch(console.error);
  };

  const getCurrentPageTitle = () => {
    const pageMap: Record<string, string> = {
      "/": "Dashboard",
      "/visitors": "Visitors",
      "/pre-bookings": "Pre-bookings & Invitations",
      "/contractors": "Contractors",
      "/staff": "Staff Management",
      "/members": "Members",
      "/meeting-rooms": "Meeting Rooms",
      "/time-attendance": "Time & Attendance",
      "/muster": "Muster List",
      "/reports": "Reports",
      "/induction-settings": "Induction Settings",
      "/kiosk": "Kiosk Mode",
      "/settings": "Settings",
      "/hr": "HR Module",
      "/hr/leave": "HR Leave",
      "/hr/training": "Training Matrix",
      "/hr/absence": "Absence Overview",
      "/hr/onboarding": "Onboarding",
      "/hr/leavers": "Leavers",
      "/hr/appraisals": "Appraisals",
      "/hr/payroll": "Payroll Export",
      "/hr/org-chart": "Org Chart",
      "/ppm": "PPM",
      "/lone-worker": "Lone Worker Monitoring",
      "/cdm": "CDM 2015",
      "/rams": "RAMS Documents",
      "/permits": "Permit-to-Work",
      "/permit-to-work": "Permit-to-Work",
      "/fire-risk": "Fire Risk Assessment",
      "/compliance": "Compliance",
      "/compliance/certificates": "Compliance Certificates",
      "/hs-incidents": "H&S Incidents (RIDDOR)",
      "/incidents": "Incidents",
      "/incident-reports": "Incident Reports",
      "/ra-builder": "Risk Assessment Builder",
      "/site-induction": "Site Induction",
      "/marketing": "Marketing",
    };
    return pageMap[location] || "Help";
  };

  const renderHomeView = () => (
    <div className="space-y-6">
      {/* Current Page Help */}
      {contextualArticles.length > 0 && (
        <div>
          <h3 className="font-semibold text-lg mb-3 flex items-center">
            <BookOpen size={20} className="mr-2" />
            Help for {getCurrentPageTitle()}
          </h3>
          <div className="space-y-2">
            {contextualArticles.slice(0, 3).map((article) => (
              <Card key={article.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleArticleClick(article)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{article.title}</h4>
                      <p className="text-sm text-muted-foreground">{article.summary}</p>
                      <div className="flex items-center mt-2 gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <Clock size={12} className="mr-1" />
                          {article.estimatedReadTime}min
                        </Badge>
                        {article.difficulty && (
                          <Badge variant="outline" className="text-xs">
                            {article.difficulty}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Featured Articles */}
      {featuredArticles.length > 0 && (
        <div>
          <h3 className="font-semibold text-lg mb-3 flex items-center">
            <Star size={20} className="mr-2" />
            Popular Help Topics
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {featuredArticles.slice(0, 4).map((article) => (
              <Card key={article.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleArticleClick(article)}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{article.title}</h4>
                      <div className="flex items-center mt-1 gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <Clock size={10} className="mr-1" />
                          {article.estimatedReadTime}min
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {article.viewCount} views
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div>
          <h3 className="font-semibold text-lg mb-3">Browse by Topic</h3>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <Card key={category.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleCategoryClick(category)}>
                <CardContent className="p-4 text-center">
                  <div className={`w-10 h-10 rounded-lg bg-${category.color}-100 text-${category.color}-600 flex items-center justify-center mx-auto mb-2`}>
                    {/* Icon would be rendered here based on category.icon */}
                    📚
                  </div>
                  <h4 className="font-medium text-sm">{category.name}</h4>
                  {category.description && (
                    <p className="text-xs text-muted-foreground mt-1">{category.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderCategoryView = () => {
    if (!selectedCategory) return null;
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-lg">{selectedCategory.name}</h3>
          {selectedCategory.description && (
            <p className="text-sm text-muted-foreground mt-1">{selectedCategory.description}</p>
          )}
        </div>
        {categoryArticles.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
            <p>No articles in this category yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {categoryArticles.map((article) => (
              <Card key={article.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleArticleClick(article)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{article.title}</h4>
                      <p className="text-sm text-muted-foreground">{article.summary}</p>
                      <div className="flex items-center mt-2 gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <Clock size={12} className="mr-1" />
                          {article.estimatedReadTime}min
                        </Badge>
                        {article.difficulty && (
                          <Badge variant="outline" className="text-xs">
                            {article.difficulty}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSearchView = () => (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Search Results</h3>
      {searchResults.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Search size={48} className="mx-auto mb-4 opacity-50" />
          <p>No articles found for "{searchQuery}"</p>
          <p className="text-sm mt-2">Try different keywords or browse categories below</p>
        </div>
      ) : (
        <div className="space-y-2">
          {searchResults.map((article) => (
            <Card key={article.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleArticleClick(article)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium mb-1">{article.title}</h4>
                    <p className="text-sm text-muted-foreground">{article.summary}</p>
                    <div className="flex items-center mt-2 gap-2">
                      <Badge variant="secondary" className="text-xs">
                        <Clock size={12} className="mr-1" />
                        {article.estimatedReadTime}min
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderArticleView = () => {
    if (!selectedArticle) return null;

    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold mb-2">{selectedArticle.title}</h2>
          {selectedArticle.summary && (
            <p className="text-muted-foreground mb-4">{selectedArticle.summary}</p>
          )}
          <div className="flex items-center gap-4 mb-6">
            <Badge variant="secondary">
              <Clock size={12} className="mr-1" />
              {selectedArticle.estimatedReadTime} min read
            </Badge>
            <Badge variant="outline">{selectedArticle.difficulty}</Badge>
          </div>
        </div>
        
        <Separator />
        
        <div className="text-sm leading-relaxed space-y-1">
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(selectedArticle.content)) }} />
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">Was this helpful?</p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => trackHelpInteraction("helpful", selectedArticle.id)}
            >
              <ThumbsUp size={14} className="mr-1" />
              Yes
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => trackHelpInteraction("not_helpful", selectedArticle.id)}
            >
              <ThumbsDown size={14} className="mr-1" />
              No
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      
      {/* Panel */}
      <div className="ml-auto w-full sm:w-96 bg-background border-l shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {(currentView !== "home") && (
              <Button variant="ghost" size="sm" onClick={handleBackClick}>
                <ArrowLeft size={16} />
              </Button>
            )}
            <h2 className="text-lg font-semibold">
              {currentView === "home" ? "Help Center" : 
               currentView === "search" ? "Search Results" :
               currentView === "category" ? selectedCategory?.name :
               selectedArticle?.title}
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="help-panel-close">
            <X size={16} />
          </Button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search help articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="help-search-input"
            />
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-4">
          {currentView === "home" && renderHomeView()}
          {currentView === "category" && renderCategoryView()}
          {currentView === "search" && renderSearchView()}
          {currentView === "article" && renderArticleView()}
        </ScrollArea>
      </div>
    </div>
  );
}