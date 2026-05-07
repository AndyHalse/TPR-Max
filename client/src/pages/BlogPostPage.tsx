import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, User, ArrowLeft, BookOpen, Tag } from "lucide-react";
import acsLogo from "@assets/acs-logo-2460A9-200px.jpg";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  author: string;
  coverImageUrl: string | null;
  tags: string[];
  publishedAt: string | null;
  createdAt: string;
}

interface BlogPostPageProps {
  slug: string;
}

export default function BlogPostPage({ slug }: BlogPostPageProps) {
  const { data, isLoading, isError } = useQuery<{ post: BlogPost }>({
    queryKey: ["/api/blog", slug],
    queryFn: async () => {
      const res = await fetch(`/api/blog/${slug}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
  });

  const post = data?.post;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a href="/marketing" className="flex items-center space-x-2">
              <img src={acsLogo} alt="ACS logo" className="h-8 w-8 object-contain" />
              <div className="flex flex-col">
                <span className="text-xl font-bold" style={{ color: "#2460A9" }}>TPR Max</span>
                <span className="text-xs text-slate-500 -mt-1">Total Personnel Register</span>
              </div>
            </a>
            <div className="flex items-center space-x-4">
              <a href="/blog" className="text-slate-600 hover:text-[#2460A9] transition-colors text-sm">
                ← All Posts
              </a>
              <Button size="sm" onClick={() => window.location.href = "/"}>Sign In</Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : isError || !post ? (
          <div className="text-center py-20">
            <BookOpen className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-700 mb-2">Post not found</h1>
            <p className="text-slate-500 mb-6">This article doesn't exist or has been removed.</p>
            <a href="/blog">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Blog
              </Button>
            </a>
          </div>
        ) : (
          <article>
            {/* Breadcrumb */}
            <a href="/blog" className="inline-flex items-center text-sm text-slate-500 hover:text-[#2460A9] mb-6">
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to Blog
            </a>

            {/* Cover image */}
            {post.coverImageUrl && (
              <div className="rounded-2xl overflow-hidden mb-8 shadow-lg">
                <img src={post.coverImageUrl} alt={post.title} className="w-full max-h-80 object-cover" />
              </div>
            )}

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {post.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    <Tag className="h-3 w-3 mr-1" />{tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Title */}
            <h1 className="text-3xl lg:text-5xl font-bold text-slate-900 mb-4 leading-tight">{post.title}</h1>

            {/* Meta */}
            <div className="flex items-center gap-6 text-sm text-slate-500 mb-6 pb-6 border-b border-slate-200">
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {post.author}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(post.publishedAt || post.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </span>
            </div>

            {/* Summary */}
            <p className="text-xl text-slate-600 leading-relaxed mb-8 font-medium">{post.summary}</p>

            {/* Body content — stored as plain text with line breaks */}
            <div className="prose prose-slate max-w-none">
              {post.content.split("\n").map((paragraph, i) =>
                paragraph.trim() ? (
                  <p key={i} className="text-slate-700 leading-relaxed mb-4">
                    {paragraph}
                  </p>
                ) : (
                  <div key={i} className="mb-4" />
                )
              )}
            </div>

            {/* CTA */}
            <div className="mt-12 p-8 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl text-center border border-blue-200">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Ready to transform your site's safety?</h3>
              <p className="text-slate-600 mb-4">See TPR Max in action with a free personalised demo.</p>
              <Button
                size="lg"
                style={{ backgroundColor: "#2460A9" }}
                onClick={() => window.location.href = "/marketing#contact"}
              >
                Book a Free Demo
              </Button>
            </div>

            {/* Back link */}
            <div className="mt-8 text-center">
              <a href="/blog" className="text-[#2460A9] hover:underline text-sm">
                ← View all posts
              </a>
            </div>
          </article>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>© {new Date().getFullYear()} ACS Safety &amp; Security Ltd. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
