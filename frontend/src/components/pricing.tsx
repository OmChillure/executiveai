"use client"
import { CheckCircle, Star } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"


interface PricingCardProps {
  title: string
  price: string
  originalPrice?: string
  period: string
  features: string[]
  buttonText: string
  highlight?: boolean
}

export function PricingCard({
  title,
  price,
  originalPrice,
  period,
  features,
  buttonText,
  highlight = false,
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden min-w-[20rem] w-full",
        highlight
          ? "border-primary"
          : "border-neutral-200 dark:border-neutral-800 rounded-l-lg rounded-r-lg md:rounded-r-none md:rounded-l-lg first:rounded-r-none last:rounded-l-none",
      )}
    >
      {highlight && (
        <div className="flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-t-lg">
          <Star className="w-4 h-4 mr-2 fill-current" />
          Most popular
        </div>
      )}
      <CardContent className="flex flex-col flex-grow p-8 gap-8">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold text-left text-balance">{title}</h3>
          <span className="text-4xl font-bold text-left">
            {originalPrice && (
              <span className="text-neutral-400 dark:text-neutral-600 line-through mr-2">{originalPrice}</span>
            )}
            {price} <span className="text-base font-normal text-neutral-600 dark:text-neutral-400">{period}</span>
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {features.map((feature, index) => (
            <div key={index} className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">{feature}</span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter
        className={cn(
          "flex justify-center p-0 border-t",
          highlight ? "border-primary" : "border-neutral-200 dark:border-neutral-800",
        )}
      >
        <Button
          asChild
          variant={highlight ? "default" : "outline"}
          className={cn("w-full rounded-none py-6 text-base font-semibold", highlight ? "" : "border-none")}
        >
          <a href="#">{buttonText}</a>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function PricingSection() {
  // Arrow component recreated from original HTML for precise styling
  const Arrow = ({ onSolid = false }: { onSolid?: boolean }) => (
    <div className="flex center position-relative" style={{ transform: "scale(0.9)" }}>
      <div
        className={cn("absolute rounded-full h-[0.0875rem] w-2", onSolid ? "bg-white" : "bg-neutral-400")}
        style={{ transform: "rotate(45deg) translateX(0.25rem)" }}
      ></div>
      <div
        className={cn("absolute rounded-full h-[0.0875rem] w-2", onSolid ? "bg-white" : "bg-neutral-400")}
        style={{ transform: "rotate(-45deg) translateX(0.25rem)" }}
      ></div>
    </div>
  )

  // Inner component for a single pricing card
  const PricingCard = ({
    title,
    price,
    originalPrice,
    period,
    features,
    buttonText,
    highlight = false,
    isFirst = false,
    isLast = false,
  }: {
    title: string
    price: string
    originalPrice?: string
    period: string
    features: string[]
    buttonText: string
    highlight?: boolean
    isFirst?: boolean
    isLast?: boolean
  }) => {
    return (
      <Card
        className={cn(
          "relative flex flex-col overflow-hidden min-w-[20rem] w-full",
          // Base border and background for all cards
          "border border-solid bg-cardBackground",
          // Specific border radii based on position and highlight status
          highlight
            ? "rounded-none" // Pro card has no specific rounding
            : isFirst
              ? "rounded-l-lg rounded-r-none" // Free card
              : isLast
                ? "rounded-r-lg rounded-l-none" // Team card
                : "rounded-none", // Fallback for any middle non-highlighted (though not in this specific design)
          // Highlight specific styles
          highlight ? "border-highlightBorder z-10" : "border-darkBorder",
        )}
      >
        {/* Pro card background effects (gradient and dots) */}
        {highlight && (
          <>
            {/* Gradient glow */}
            <div
              className="absolute inset-0 pointer-events-none opacity-100"
              style={{
                background: `radial-gradient(circle at 50% 62.5%, rgba(74, 144, 226, 0.15) 0%, transparent 70%)`,
                transform: "rotate(30deg) scale(1.5)",
                transformOrigin: "center",
              }}
            />
            {/* Dots pattern */}
            <div
              className="absolute inset-0 pointer-events-none opacity-100"
              style={{
                backgroundImage: `radial-gradient(circle, #4A90E2 1px, transparent 1px)`,
                backgroundSize: "16px 16px",
                opacity: 0.1,
              }}
            />
          </>
        )}

        <CardContent className="flex flex-col flex-grow p-10 gap-8 relative z-20">
          <div className="flex flex-col gap-2">
            <h3
              className={cn(
                "text-2xl font-semibold text-left text-balance",
                highlight ? "text-highlightText" : "text-neutral-200",
              )}
            >
              {title}
            </h3>
            <span className="text-4xl font-bold text-left text-white">
              {originalPrice && <span className="text-neutral-500 line-through mr-2">{originalPrice}</span>}
              {price} <span className="text-base font-normal text-neutral-400">{period}</span>
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-featureIcon stroke-current fill-none" />
                <span className="text-sm text-neutral-400">{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter
          className={cn(
            "flex justify-center p-0 border-t relative z-20",
            highlight ? "border-highlightBorder" : "border-darkBorder",
          )}
        >
          <Button
            asChild
            className={cn(
              "w-full rounded-none py-6 text-base font-semibold",
              highlight
                ? "bg-buttonPrimaryBg text-buttonPrimaryText hover:bg-gray-100"
                : "bg-buttonSecondaryBg text-buttonSecondaryText hover:bg-gray-700 border-t border-darkBorder",
            )}
          >
            <a href="#" className="flex justify-center items-center w-full ml-[-1rem]">
              <div className="flex px-4 py-0 relative font-label font-m font-strong">{buttonText}</div>
              <Arrow onSolid={highlight} />
            </a>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  const pricingPlans = [
    {
      title: "Free",
      price: "$0",
      period: "/ year",
      features: ["Comprehensive variables", "Fluid component system"],
      buttonText: "Get started",
      highlight: false,
    },
    {
      title: "Pro",
      price: "$80",
      originalPrice: "$120",
      period: "/ year",
      features: [
        "Comprehensive variables",
        "Fluid component system",
        "Landing page examples",
        "Marketing resources",
        "Data viz module",
        "Social module",
        "Regular updates",
      ],
      buttonText: "Get started",
      highlight: true,
    },
    {
      title: "Team",
      price: "$160",
      originalPrice: "$240",
      period: "/ year",
      features: ["Comprehensive variables", "Fluid component system", "Landing page examples", "Marketing resources"],
      buttonText: "Get started",
      highlight: false,
    },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 ">
      <h1 className="text-4xl md:text-5xl font-bold text-center mb-12 text-white">Simple, Transparent Pricing</h1>
      <p className="text-lg text-center mb-16 max-w-2xl text-neutral-400">
        Choose the plan that best fits your needs. All plans include essential features to get you started.
      </p>
      <div className="flex flex-col md:flex-row gap-0 items-stretch justify-center w-full max-w-5xl">
        {pricingPlans.map((plan, index) => (
          <div key={index} className="flex flex-col items-center min-w-[20rem] w-full">
            {plan.highlight && (
              <div className="flex items-center justify-center px-4 py-2  border-t border-l border-r border-solid border-brandBorderAlphaMedium text-brandOnBackgroundStrong text-sm font-semibold rounded-t-md mb-[-1px] z-20 min-h-[var(--static-space-40)]">
                <Star className="w-4 h-4 mr-2 fill-current" />
                Most popular
              </div>
            )}
            <PricingCard {...plan} isFirst={index === 0} isLast={index === pricingPlans.length - 1} />
          </div>
        ))}
      </div>
    </div>
  )
}


export default function PricingPage() {
  const pricingPlans = [
    {
      title: "Free",
      price: "$0",
      period: "/ year",
      features: ["Comprehensive variables", "Fluid component system"],
      buttonText: "Get started",
      highlight: false,
    },
    {
      title: "Pro",
      price: "$80",
      originalPrice: "$120",
      period: "/ year",
      features: [
        "Comprehensive variables",
        "Fluid component system",
        "Landing page examples",
        "Marketing resources",
        "Data viz module",
        "Social module",
        "Regular updates",
      ],
      buttonText: "Get started",
      highlight: true,
    },
    {
      title: "Team",
      price: "$160",
      originalPrice: "$240",
      period: "/ year",
      features: ["Comprehensive variables", "Fluid component system", "Landing page examples", "Marketing resources"],
      buttonText: "Get started",
      highlight: false,
    },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 ">
      <h1 className="text-4xl md:text-5xl font-bold text-center mb-12 text-gray-900 dark:text-gray-50">
        Simple, Transparent Pricing
      </h1>
      <p className="text-lg text-center mb-16 max-w-2xl text-gray-600 dark:text-gray-400">
        Choose the plan that best fits your needs. All plans include essential features to get you started.
      </p>
      <div className="flex flex-col md:flex-row gap-0 md:gap-0 items-stretch justify-center w-full max-w-5xl">
        {pricingPlans.map((plan, index) => (
          <PricingCard key={index} {...plan} />
        ))}
      </div>
    </div>
  )
}
