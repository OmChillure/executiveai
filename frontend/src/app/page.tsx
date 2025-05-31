import React from "react";
import HeroSection from "@/components/hero-section";
import { HeroHeader } from "@/components/hero5-header";

const Index: React.FC = () => {
  return (
    <main className="min-h-screen bg-[rgba(8,8,8,1)]">
      <HeroHeader />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center mb-16">
          <HeroSection />
        </div>
      </div>

    </main>
  );
};

export default Index;
