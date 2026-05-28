import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Calendar, User, Tag, BookOpen } from "lucide-react";
import acsLogo from "@assets/acs-logo-2460A9-200px.jpg";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  summary: string;
  author: string;
  coverImageUrl: string | null;
  tags: string[];
  publishedAt: string | null;
  createdAt: string;
}

export default function BlogListPage() {
  const { data, isLoading } = useQuery<{ posts: BlogPost[] }>({
    queryKey: ["/api/blog"],
    queryFn: async () => {
      const res = await fetch("/api/blog");
      if (!res.ok) throw new Error("Failed to load posts");
      return res.json();
    },
  });

  const posts = data?.posts || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a href="/marketing" className="flex items-center space-x-2">
              <img src={acsLogo} alt="ACS logo" className="h-8 w-8 object-contain" />
              <div className="flex flex-col">
                <span className="text-xl font-bold" style={{ color: "#2460A9" }}>TPR</span>
                <span className="text-xs text-slate-500 -mt-1">Total Protection & Response</span>
              </div>
            </a>
            <div className="flex items-center space-x-4">
              <a href="/marketing" className="text-slate-600 hover:text-[#2460A9] transition-colors text-sm">
                ← Back to Home
              </a>
              <Button size="sm" onClick={() => window.location.href = "/"}>Sign In</Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center mb-4">
            <BookOpen className="h-8 w-8 mr-3" style={{ color: "#2460A9" }} />
            <h1 className="text-4xl lg:text-5xl font-bold text-slate-900">TPR Blog</h1>
          </div>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Insights on visitor management, workplace safety, contractor compliance, and security best practices.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-slate-600 mb-2">No posts yet</h2>
            <p className="text-slate-500">Check back soon for insights and updates.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow border border-slate-200 flex flex-col">
                {post.coverImageUrl && (
                  <div className="h-48 overflow-hidden">
                    <img
                      src={post.coverImageUrl}
                      alt={post.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {!post.coverImageUrl && (
                  <div className="h-32 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <BookOpen className="h-12 w-12 text-white/60" />
                  </div>
                )}
                <CardContent className="p-6 flex flex-col flex-1">
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {post.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <h2 className="text-xl font-bold text-slate-900 mb-2 leading-tight">{post.title}</h2>
                  <p className="text-slate-600 text-sm leading-relaxed mb-4 flex-1">{post.summary}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {post.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(post.publishedAt || post.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </span>
                  </div>
                  <a href={`/blog/${post.slug}`}>
                    <Button variant="outline" size="sm" className="w-full border-[#2460A9] text-[#2460A9] hover:bg-[#2460A9] hover:text-white">
                      Read More <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>© {new Date().getFullYear()} ACS Safety &amp; Security Ltd. All rights reserved.</p>
          <a href="/marketing" className="text-[#2460A9] hover:underline mt-2 inline-block">
            ← Back to TPR Home
          </a>
        </div>
      </footer>
    </div>
  );
}
