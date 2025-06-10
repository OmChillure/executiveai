import React from "react";
import HeroSection from "@/components/hero-section";
import { HeroHeader } from "@/components/hero5-header";
import FAQsThree from "@/components/faqs";
import FooterSection from "@/components/footer";
import Features from "@/components/features";
import PricingPage from "@/components/pricing";
import TestimonialsSection from "@/components/testimonials";

const Index: React.FC = () => {
  return (
    <main className="bg-black">
      <HeroHeader />
      <div className="container">
        <div className="flex flex-col justify-center">
          <div className="py-8">
          <HeroSection />
          </div>
          <Features />
          <PricingPage/>
          <TestimonialsSection />
          <FAQsThree />
          <FooterSection />
        </div>
      </div>

    </main>
  );
};

export default Index;
