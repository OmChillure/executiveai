import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Calendar, type LucideIcon, MapIcon } from "lucide-react"
import Image from "next/image"
import type { ReactNode } from "react"
import { Gemini, Replit, MagicUI, VSCodium, MediaWiki, GooglePaLM } from '@/components/logos'
import { LogoIcon } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { InfiniteSlider } from '@/components/ui/infinite-slider'

export default function Features() {
  return (
    <section className="bg-zinc-50 py-16 md:py-32 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-6 lg:max-w-6xl">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">Features</h2>
        </div>

        <div className="mx-auto grid gap-x-8 gap-y-40 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-40">
          <FeatureCard>
            <CardHeader className="pb-3">
              <CardHeading
                icon={MapIcon}
                title="Real time location tracking"
                description="Advanced tracking system, Instantly locate all your assets."
              />
            </CardHeader>

            <div className="relative mb-6 border-t border-dashed sm:mb-0">
              <div className="absolute inset-0 [background:radial-gradient(125%_125%_at_50%_0%,transparent_40%,var(--color-blue-600),var(--color-white)_100%)]"></div>
              <div className="aspect-76/59 p-1 px-6">
                <DualModeImage
                  darkSrc="/payments.png"
                  lightSrc="/payments-light.png"
                  alt="payments illustration"
                  width={1207}
                  height={929}
                />
              </div>
            </div>
          </FeatureCard>

          <div className="text-5xl font-bold text-gray-900 dark:text-white">Text</div>

          <div className="text-5xl font-bold text-gray-900 dark:text-white">Text</div>

          <FeatureCard>
            <CardHeader className="pb-3">
              <CardHeading
                icon={Calendar}
                title="Advanced Integrations"
                description="Works Where You Work. No Switching, No Friction."
              />
            </CardHeader>

            <CardContent>
              <div className="relative mb-6 sm:mb-0">
                <div className="absolute -inset-6 [background:radial-gradient(50%_50%_at_75%_50%,transparent,var(--color-background)_100%)]"></div>
                <div className="aspect-76/59 border">
                  <div className="bg-muted dark:bg-background py-20 md:py-24">
                    <div className="mx-auto max-w-7xl p-3">
                      <div className="bg-muted/25 group relative mx-auto max-w-[30rem] h-50  items-center justify-between space-y-6 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] sm:max-w-lg">
                        <div
                          role="presentation"
                          className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:40px_40px] opacity-50"></div>
                        <div>
                          <InfiniteSlider
                            gap={24}
                            speed={20}
                            speedOnHover={10}>
                            <IntegrationCard>
                              <VSCodium />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MediaWiki />
                            </IntegrationCard>
                            <IntegrationCard>
                              <GooglePaLM />
                            </IntegrationCard>
                            <IntegrationCard>
                              <Gemini />
                            </IntegrationCard>
                            <IntegrationCard>
                              <Replit />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MagicUI />
                            </IntegrationCard>
                          </InfiniteSlider>
                        </div>

                        <div>
                          <InfiniteSlider
                            gap={24}
                            speed={20}
                            speedOnHover={10}
                            reverse>
                            <IntegrationCard>
                              <Gemini />
                            </IntegrationCard>
                            <IntegrationCard>
                              <Replit />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MediaWiki />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MagicUI />
                            </IntegrationCard>
                            <IntegrationCard>
                              <VSCodium />
                            </IntegrationCard>
                            <IntegrationCard>
                              <GooglePaLM />
                            </IntegrationCard>
                          </InfiniteSlider>
                        </div>
                        <div>
                          <InfiniteSlider
                            gap={24}
                            speed={20}
                            speedOnHover={10}>
                            <IntegrationCard>
                              <Replit />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MagicUI />
                            </IntegrationCard>
                            <IntegrationCard>
                              <Gemini />
                            </IntegrationCard>
                            <IntegrationCard>
                              <VSCodium />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MediaWiki />
                            </IntegrationCard>
                            <IntegrationCard>
                              <GooglePaLM />
                            </IntegrationCard>
                          </InfiniteSlider>
                        </div>
                        <div>
                          <InfiniteSlider
                            gap={24}
                            speed={20}
                            speedOnHover={10}
                            reverse>
                            <IntegrationCard>
                              <Gemini />
                            </IntegrationCard>
                            <IntegrationCard>
                              <Replit />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MediaWiki />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MagicUI />
                            </IntegrationCard>
                            <IntegrationCard>
                              <VSCodium />
                            </IntegrationCard>
                            <IntegrationCard>
                              <GooglePaLM />
                            </IntegrationCard>
                          </InfiniteSlider>
                        </div>
                                                <div>
                          <InfiniteSlider
                            gap={24}
                            speed={20}
                            speedOnHover={10}>
                            <IntegrationCard>
                              <VSCodium />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MediaWiki />
                            </IntegrationCard>
                            <IntegrationCard>
                              <GooglePaLM />
                            </IntegrationCard>
                            <IntegrationCard>
                              <Gemini />
                            </IntegrationCard>
                            <IntegrationCard>
                              <Replit />
                            </IntegrationCard>
                            <IntegrationCard>
                              <MagicUI />
                            </IntegrationCard>
                          </InfiniteSlider>
                        </div>
                        <div className="absolute inset-0 m-auto flex size-fit justify-center gap-2">
                          <IntegrationCard
                            className="shadow-black-950/10 size-16 bg-white/25 shadow-xl backdrop-blur-md backdrop-grayscale dark:border-white/10 dark:shadow-white/15"
                            isCenter={true}>
                            <LogoIcon />
                          </IntegrationCard>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </FeatureCard>


          <FeatureCard className="p-6 lg:col-span-2 mt-8">
            <p className="mx-auto my-6 max-w-md text-balance text-center text-2xl font-semibold">
              Smart scheduling with automated reminders for maintenance.
            </p>

            <div className="flex justify-center gap-6 overflow-hidden">
              <CircularUI label="Inclusion" circles={[{ pattern: "border" }, { pattern: "border" }]} />

              <CircularUI label="Inclusion" circles={[{ pattern: "none" }, { pattern: "primary" }]} />

              <CircularUI label="Join" circles={[{ pattern: "blue" }, { pattern: "none" }]} />

              <CircularUI
                label="Exclusion"
                circles={[{ pattern: "primary" }, { pattern: "none" }]}
                className="hidden sm:block"
              />
            </div>
          </FeatureCard>

          <div className="text-5xl -mt-24 font-bold text-gray-900 dark:text-white">Text</div>
        </div>
      </div>
    </section>
  )
}

interface FeatureCardProps {
  children: ReactNode
  className?: string
}

const FeatureCard = ({ children, className }: FeatureCardProps) => (
  <Card className={cn("group relative rounded-none shadow-zinc-950/5", className)}>
    <CardDecorator />
    {children}
  </Card>
)

const CardDecorator = () => (
  <>
    <span className="border-primary absolute -left-px -top-px block size-2 border-l-2 border-t-2"></span>
    <span className="border-primary absolute -right-px -top-px block size-2 border-r-2 border-t-2"></span>
    <span className="border-primary absolute -bottom-px -left-px block size-2 border-b-2 border-l-2"></span>
    <span className="border-primary absolute -bottom-px -right-px block size-2 border-b-2 border-r-2"></span>
  </>
)

interface CardHeadingProps {
  icon: LucideIcon
  title: string
  description: string
}

const CardHeading = ({ icon: Icon, title, description }: CardHeadingProps) => (
  <div className="p-6">
    <span className="text-muted-foreground flex items-center gap-2">
      <Icon className="size-4" />
      {title}
    </span>
    <p className="mt-8 text-2xl font-semibold">{description}</p>
  </div>
)

interface DualModeImageProps {
  darkSrc: string
  lightSrc: string
  alt: string
  width: number
  height: number
  className?: string
}

const DualModeImage = ({ darkSrc, lightSrc, alt, width, height, className }: DualModeImageProps) => (
  <>
    <Image
      src={darkSrc || "/placeholder.svg"}
      className={cn("hidden dark:block", className)}
      alt={`${alt} dark`}
      width={width}
      height={height}
    />
    <Image
      src={lightSrc || "/placeholder.svg"}
      className={cn("shadow dark:hidden", className)}
      alt={`${alt} light`}
      width={width}
      height={height}
    />
  </>
)

interface CircleConfig {
  pattern: "none" | "border" | "primary" | "blue"
}

interface CircularUIProps {
  label: string
  circles: CircleConfig[]
  className?: string
}

const CircularUI = ({ label, circles, className }: CircularUIProps) => (
  <div className={className}>
    <div className="bg-linear-to-b from-border size-fit rounded-2xl to-transparent p-px">
      <div className="bg-linear-to-b from-background to-muted/25 relative flex aspect-square w-fit items-center -space-x-4 rounded-[15px] p-4">
        {circles.map((circle, i) => (
          <div
            key={i}
            className={cn("size-7 rounded-full border sm:size-8", {
              "border-primary": circle.pattern === "none",
              "border-primary bg-[repeating-linear-gradient(-45deg,var(--color-border),var(--color-border)_1px,transparent_1px,transparent_4px)]":
                circle.pattern === "border",
              "border-primary bg-background bg-[repeating-linear-gradient(-45deg,var(--color-primary),var(--color-primary)_1px,transparent_1px,transparent_4px)]":
                circle.pattern === "primary",
              "bg-background z-1 border-blue-500 bg-[repeating-linear-gradient(-45deg,var(--color-blue-500),var(--color-blue-500)_1px,transparent_1px,transparent_4px)]":
                circle.pattern === "blue",
            })}
          ></div>
        ))}
      </div>
    </div>
    <span className="text-muted-foreground mt-1.5 block text-center text-sm">{label}</span>
  </div>
)

const IntegrationCard = ({ children, className, isCenter = false }: { children: React.ReactNode; className?: string; position?: 'left-top' | 'left-middle' | 'left-bottom' | 'right-top' | 'right-middle' | 'right-bottom'; isCenter?: boolean }) => {
  return (
    <div className={cn('bg-background relative z-20 flex size-12 rounded-full border', className)}>
      <div className={cn('m-auto size-fit *:size-5', isCenter && '*:size-8')}>{children}</div>
    </div>
  )
}