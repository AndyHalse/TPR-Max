import { useState } from "react";
import { LogIn, Menu, X, Shield, KeyRound, Cctv, LayoutGrid, MapPin, Lock, MessageSquare, TrendingUp, Mail } from "lucide-react";
import acsLogoBlue from "@assets/acs-logo-blue_1780569831762.png";
import acsLogoWhite from "@assets/acs-logo-white_1780569831763.png";
import heroFireMarshal from "@assets/hero-fire-marshal_1780569831762.jpg";
import dashboardImg from "@assets/dashboard_1780569831762.png";
import visitorImg from "@assets/visitor-management_1780569831762.png";
import contractorImg from "@assets/contractor-management_1780569831762.png";
import complianceImg from "@assets/compliance-dashboard_1780569831763.png";
import ppmImg from "@assets/ppm-planner_1780569831762.png";

const BRAND = "#2460A9";
const BRAND_DARK = "#1c4d88";

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export default function AboutPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-slate-900 antialiased min-h-screen font-sans">

      {/* NAV */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <a
              href="/marketing"
              className="flex items-center space-x-2 no-underline"
            >
              <img src={acsLogoBlue} alt="ACS" className="h-9 w-9 object-contain" />
              <span className="flex flex-col leading-none">
                <span className="text-xl font-bold" style={{ color: BRAND }}>TPR</span>
                <span className="text-xs text-slate-500 -mt-0.5">Workplace Compliance &amp; Safety</span>
              </span>
            </a>

            <div className="hidden md:flex items-center space-x-8">
              {[
                { label: "Platform", href: "/marketing#features" },
                { label: "Industries", href: "/marketing#industries" },
                { label: "Pricing", href: "/marketing#pricing" },
                { label: "Contact", href: "/marketing#contact" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="text-slate-600 transition-colors hover:text-[#2460A9] no-underline text-sm"
                >
                  {label}
                </a>
              ))}
              <span className="text-sm font-semibold" style={{ color: BRAND }}>About</span>
              <a
                href="/marketing#contact"
                className="inline-flex items-center gap-1.5 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors no-underline"
                style={{ backgroundColor: BRAND }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = BRAND_DARK)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = BRAND)}
              >
                Book a Demo
              </a>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors no-underline"
              >
                <LogIn className="h-4 w-4" />
                Login
              </a>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <a
                href="/"
                className="inline-flex items-center gap-1 border text-sm font-medium px-3 py-1.5 rounded-lg no-underline"
                style={{ borderColor: BRAND, color: BRAND }}
              >
                <LogIn className="h-4 w-4" />
                Login
              </a>
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="p-2 rounded-md text-slate-600 hover:bg-slate-100"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {mobileOpen && (
            <div className="md:hidden border-t border-slate-200 py-4 space-y-1">
              {[
                { label: "Platform", href: "/marketing#features" },
                { label: "Industries", href: "/marketing#industries" },
                { label: "Pricing", href: "/marketing#pricing" },
                { label: "Contact", href: "/marketing#contact" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="block px-4 py-2 text-slate-600 hover:text-[#2460A9] hover:bg-slate-50 rounded-md no-underline"
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </a>
              ))}
              <span className="block px-4 py-2 font-semibold rounded-md" style={{ color: BRAND }}>About</span>
              <div className="px-4 pt-2">
                <a
                  href="/marketing#contact"
                  className="block text-center text-white font-medium px-4 py-2 rounded-lg no-underline"
                  style={{ backgroundColor: BRAND }}
                >
                  Book a Demo
                </a>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section className="py-16 lg:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span
            className="inline-flex items-center gap-1 text-white text-xs font-medium px-3 py-1 rounded-full mb-4"
            style={{ backgroundColor: BRAND }}
          >
            <Shield className="h-3 w-3" />
            About ACS
          </span>
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-5 leading-tight">
            Built by a safety &amp; security company — not a software house
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            TPR comes from ACS, a UK safety and security business. We don't just write the software; we work in this world every day. That's why TPR handles the things that actually matter on a real site.
          </p>
        </div>
      </section>

      {/* HERO IMAGE */}
      <section className="pb-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-2xl overflow-hidden shadow-2xl">
            <img
              src={heroFireMarshal}
              alt="Fire marshal using TPR on site"
              className="w-full object-cover"
              style={{ maxHeight: 480 }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-white font-semibold text-lg drop-shadow">
                Real software for real sites
              </p>
              <p className="text-blue-100 text-sm mt-1 drop-shadow">
                TPR is used by fire marshals, safety managers, and site teams across the UK every day.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STORY */}
      <section className="pb-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-slate-700 leading-relaxed text-base">
          <p>
            ACS has spent years in safety and security — fitting <strong>access control systems</strong> and{" "}
            <strong>CCTV</strong> for businesses across the UK. That work put us on hundreds of sites, and we kept
            seeing the same problem.
          </p>
          <p>
            Site safety was being run on a patchwork of tools. A visitor book on the front desk. A spreadsheet for
            contractor insurance. A separate app for mustering that nobody could find when the alarm went off. A
            folder somewhere for RAMS. None of it joined up, and the gaps between the systems were exactly where
            compliance fell through.
          </p>
          <p>
            So we built <strong>TPR — Workplace Compliance &amp; Safety</strong>. One platform that handles everyone on
            a site, from the moment they sign in to the second the alarm sounds. It came out of real sites and real
            problems, not a whiteboard.
          </p>
          <p>
            It's still ours, and it's still UK-built and UK-supported. When you ring us, you get people who understand
            both the software and the safety side — because we do both.
          </p>
        </div>
      </section>

      {/* SCREENSHOTS */}
      <section className="py-12 bg-white/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 text-center mb-3">
            One platform for your whole site
          </h2>
          <p className="text-slate-600 text-center mb-10 max-w-xl mx-auto">
            Visitors, contractors, staff, maintenance, mustering and compliance — all in one place.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { src: dashboardImg, label: "Reception Dashboard" },
              { src: visitorImg, label: "Visitor Management" },
              { src: contractorImg, label: "Contractor Management" },
              { src: complianceImg, label: "Compliance Dashboard" },
              { src: ppmImg, label: "PPM Planner" },
            ].map(({ src, label }) => (
              <div key={label} className="rounded-xl overflow-hidden shadow-md border border-slate-100 bg-white group hover:shadow-lg transition-shadow">
                <img src={src} alt={label} className="w-full object-cover object-top" style={{ maxHeight: 200 }} />
                <div className="px-4 py-2.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT WE DO */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 text-center mb-10">What ACS does</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <KeyRound className="h-6 w-6" style={{ color: BRAND }} />,
                title: "Access Control",
                desc: "Physical security that controls who gets into your building or site — and integrates straight into TPR.",
              },
              {
                icon: <Cctv className="h-6 w-6" style={{ color: BRAND }} />,
                title: "CCTV",
                desc: "Surveillance and monitoring for commercial and industrial sites, designed and supported in the UK.",
              },
              {
                icon: <LayoutGrid className="h-6 w-6" style={{ color: BRAND }} />,
                title: "TPR Platform",
                desc: "Our flagship SaaS — visitors, contractors, staff, mustering, compliance and maintenance, all in one.",
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="text-center rounded-xl p-6"
                style={{
                  background: "rgba(255,255,255,0.75)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.35)",
                }}
              >
                <div
                  className="w-12 h-12 mx-auto rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${BRAND}18` }}
                >
                  {icon}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW WE WORK */}
      <section className="py-12 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="rounded-xl p-8"
            style={{
              background: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.35)",
            }}
          >
            <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">How we work</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                { icon: <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />, title: "UK first", desc: "Built around UK regulations, supported by a UK team." },
                { icon: <Lock className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />, title: "Your data, isolated", desc: "Every customer gets their own database. GDPR-compliant by design." },
                { icon: <MessageSquare className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />, title: "Plain English", desc: "No jargon, no hard sell. We explain what it does and let it speak for itself." },
                { icon: <TrendingUp className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: BRAND }} />, title: "Always improving", desc: "New modules ship regularly, included in your subscription." },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-3">
                  {icon}
                  <div>
                    <h3 className="font-semibold text-slate-900">{title}</h3>
                    <p className="text-sm text-slate-600">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16" style={{ background: "linear-gradient(135deg, #1e293b, #1c4d88)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Let's talk about your site</h2>
          <p className="text-lg text-blue-100 mb-8">Whether it's TPR, access control or CCTV — we'd be glad to help.</p>
          <a
            href="/marketing#contact"
            className="inline-flex items-center justify-center gap-2 bg-white text-slate-900 text-lg font-medium px-8 py-3 rounded-lg shadow-lg hover:bg-slate-100 transition-colors no-underline"
          >
            <Mail className="h-5 w-5" />
            Get in touch
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <img src={acsLogoWhite} alt="ACS" className="h-10 mb-4 object-contain" />
              <p className="text-sm max-w-md">
                TPR (Workplace Compliance &amp; Safety) is built and supported by ACS, a UK safety &amp; security
                company. One platform for everyone on your site — visitors, contractors and staff — with mustering,
                compliance and maintenance built in.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold mb-4 text-white">Platform</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="/marketing#features" className="hover:text-white no-underline">All modules</a></li>
                <li><a href="/marketing#industries" className="hover:text-white no-underline">Industries</a></li>
                <li><a href="/marketing#pricing" className="hover:text-white no-underline">Pricing</a></li>
                <li><a href="/" className="hover:text-white no-underline">Login</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-base font-semibold mb-4 text-white">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="/about" className="hover:text-white no-underline text-white">About ACS</a></li>
                <li><a href="/marketing#contact" className="hover:text-white no-underline">Contact</a></li>
                <li><a href="mailto:andy@acsltd.eu" className="hover:text-white no-underline">andy@acsltd.eu</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-sm">
            <span>&copy; {new Date().getFullYear()} ACS Ltd. All rights reserved.</span>
            <span>TPR — Workplace Compliance &amp; Safety · Built &amp; supported in the UK</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
