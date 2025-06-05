"use client";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useScroll } from "@/hooks/ScrollContext";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const menuItems = [
  { name: "Features", id: "features" },
  { name: "About", id: "about" },
  { name: "Pricing", id: "pricing" },
  { name: "FAQs", id: "faqs" },
  { name: "Marketplace", id: "" },
];

export const HeroHeader = () => {
  const [menuState, setMenuState] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [showWaitlistDialog, setShowWaitlistDialog] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    email: "",
    role: "",
    description: ""
  });

  const { scrollToSection } = useScroll();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavigation = (sectionId: string) => {
    if (menuState) setMenuState(false);

    if (pathname === "/") {
      scrollToSection(sectionId);
    } else {
      router.push("/");
      setTimeout(() => scrollToSection(sectionId), 100);
    }
  };

  const handleWaitlistSubmit = async () => {
    if (!formData.email || !formData.role) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    console.log('Starting submission with data:', formData);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          toast.error("This email is already registered in our waitlist!");
        } else {
          throw new Error(data.error || 'Failed to register');
        }
        return;
      }

      // Success!
      toast.success("🎉 Welcome to the waitlist! Check your email for confirmation.", {
        duration: 5000,
      });

      setShowWaitlistDialog(false);
      setFormData({ email: "", role: "", description: "" });

    } catch (error) {
      console.error('Submission error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to join waitlist. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <header>
        <nav
          data-state={menuState && "active"}
          className="fixed z-20 w-full px-2"
        >
          <div
            className={cn(
              "mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12",
              isScrolled &&
              "bg-background/50 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-5"
            )}
          >
            <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
              <div className="flex w-full justify-between lg:w-auto">
                <Link
                  href="/"
                  aria-label="home"
                  className="flex items-center space-x-2"
                >
                  Onara
                </Link>

                <button
                  onClick={() => setMenuState(!menuState)}
                  aria-label={menuState ? "Close Menu" : "Open Menu"}
                  className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
                >
                  <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                  <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                </button>
              </div>

              <div
                className={cn(
                  "bg-background mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent",
                  menuState && "block lg:flex"
                )}
              >
                <div className="lg:hidden">
                  <ul className="space-y-6 text-base">
                    {menuItems.map((item, index) => (
                      <li key={index}>
                        <button
                          onClick={() => handleNavigation(item.id)}
                          className="text-muted-foreground hover:text-accent-foreground block duration-150"
                        >
                          <span>{item.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                  <Button
                    size="sm"
                    onClick={() => setShowWaitlistDialog(true)}
                    className="bg-white text-black"
                  >
                    Join Waitlist
                  </Button>

                  <Button
                    asChild
                    size="sm"
                    className={cn(isScrolled && "lg:hidden")}
                  >
                    <Link href="https://x.com/onaraai">
                      <Image
                        src={"/brand-x.svg"}
                        height={20}
                        width={20}
                        alt="Twitter"
                      />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <Dialog open={showWaitlistDialog} onOpenChange={setShowWaitlistDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Join Our Waitlist</DialogTitle>
            <DialogDescription>
              Be among the first to experience our platform. We'll notify you as soon as we launch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email *
              </label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium">
                Who are you? *
              </label>
              <Input
                id="role"
                placeholder="e.g., Developer, Designer, Student"
                value={formData.role}
                onChange={(e) => handleInputChange('role', e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Additional Information (Optional)
              </label>
              <Textarea
                id="description"
                placeholder="Tell us more about yourself or what interests you about our platform"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="h-24"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleWaitlistSubmit}
              className="w-full bg-black hover:bg-gray-800 text-white disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                "Join Waitlist"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};