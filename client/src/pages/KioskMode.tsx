import { useState } from "react";
import { Link } from "wouter";
import GlassCard from "@/components/GlassCard";
import { UserPlus, BadgeInfo, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function KioskMode() {
  const [checkoutQuery, setCheckoutQuery] = useState("");

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement checkout logic
    console.log("Checkout:", checkoutQuery);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">Welcome to TechCorp Ltd</h2>
        <p className="text-slate-600 text-lg">Please select your check-in option below</p>
      </div>

      {/* Kiosk Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Link href="/checkin">
          <GlassCard hover className="text-center p-8 group">
            <div className="w-24 h-24 gradient-blue rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <UserPlus className="text-white" size={32} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Visitor Check-In</h3>
            <p className="text-slate-600">New visitor or contractor arrival</p>
          </GlassCard>
        </Link>

        <GlassCard hover className="text-center p-8 group" data-testid="button-staff-checkin">
          <div className="w-24 h-24 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <BadgeInfo className="text-white" size={32} />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Staff Check-In</h3>
          <p className="text-slate-600">Scan your employee ID card</p>
        </GlassCard>
      </div>

      {/* Check-Out Section */}
      <GlassCard>
        <h3 className="text-xl font-semibold text-slate-800 mb-4 text-center">Quick Check-Out</h3>
        <form onSubmit={handleCheckout} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search by name or scan barcode..."
              value={checkoutQuery}
              onChange={(e) => setCheckoutQuery(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              data-testid="input-checkout-search"
            />
          </div>
          <Button
            type="submit"
            className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-8 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300"
            data-testid="button-checkout"
          >
            <LogOut className="mr-2" size={16} />
            Check Out
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
