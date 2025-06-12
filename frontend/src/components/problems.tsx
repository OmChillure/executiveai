import shiftCard from "../../public/feature-1.webp"
import family from "../../public/feature-2.webp"
import carousel from "../../public/feature-3.webp"
import textureFull from "../../public/feature-4.webp"
// import skiper from "@/assets/skiper.png"
import textureCard from "../../public/texture-card.webp"
import { cn } from "@/lib/utils"

import { SkiperCard } from "@/components/ui/cards"

export function ProblemCard() {
  return (
    <section className="relative my-14 w-full overflow-hidden " id="features">
      <div className=" p-2">
        <div className="mb-8 mx-auto pt-4 md:container">
          <div className=" mx-auto">
            <div className=" mx-auto max-w-6xl rounded-[34px] bg-neutral-700">
              <div className="relative z-10 grid w-full gap-8 rounded-[28px] bg-neutral-950 p-2">
                <SkiperCard
                  step1img1Class={cn(
                    "pointer-events-none w-[35%] h-[80%] border border-stone-100/10 transition-all duration-500 dark:border-stone-700/50",
                    "left-1/4 top-[45%] rounded-[24px] max-md:scale-[160%] max-md:rounded-[24px] md:left-[200px] md:top-[29%]",
                    "md:group-hover:translate-y-2"
                  )}
                  step1img2Class={cn(
                    "pointer-events-none w-[50%] h-[75%] overflow-hidden border border-stone-100/10 transition-all duration-500 dark:border-stone-700/50",
                    "left-[75%] top-[53%] rounded-2xl max-md:scale-[160%] max-md:rounded-[24px] md:left-[calc(48%+50px+1rem)] md:top-[21%]",
                    "md:group-hover:-translate-y-6 "
                  )}
                  step2img1Class={cn(
                    "pointer-events-none w-[50%] overflow-hidden rounded-t-[24px] border border-stone-100/10 transition-all duration-500 dark:border-stone-700",
                    "left-1/4 top-[69%] max-md:scale-[160%] md:left-[35px] md:top-[30%]",
                    "md:group-hover:translate-y-2"
                  )}
                  step2img2Class={cn(
                    "pointer-events-none w-2/5 overflow-hidden rounded-2xl rounded-t-[24px] border border-stone-100/10 transition-all duration-500 group-hover:-translate-y-6 dark:border-stone-700",
                    "left-[70%] top-[53%] max-md:scale-[140%] md:left-[calc(50%+27px+1rem)] md:top-1/4",
                    "md:group-hover:-translate-y-6"
                  )}
                  step3imgClass={cn(
                    "pointer-events-none w-[60%] overflow-hidden rounded-t-[24px] border border-stone-100/10 transition-all duration-500 dark:border-stone-700",
                    "left-[50%] top-[40%] md:left-1/2 md:left-[230px] md:top-[28%]"
                  )}
                  step4imgClass={cn(
                    "pointer-events-none w-[90%] overflow-hidden rounded-t-[24px] border border-stone-100/10 transition-all duration-500 dark:border-stone-700",
                    "left-[5%] top-[50%] md:left-1/2 md:left-[68px] md:top-[30%]"
                  )}
                  description="Make your app 🤌"
                  bgClass="lg:bg-gradient-to-tr"
                  //  eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  //   @ts-ignore
                  image={{
                    step1light1: family,
                    step1light2: shiftCard,
                    step2light1: carousel,
                    step2light2: textureFull,
                    step3light: textureCard,
                    step4light: textureCard,
                    alt: "Something",
                  }}
                  title="Components that pop"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}