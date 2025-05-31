import type React from "react"
import PurposeStatement from "./purposeStatement"
import ImageOverlay from "./imageLayer"

const HeroSection: React.FC = () => {
  return (
    <section className= "max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 lg:py-16">
      <div className="flex flex-col items-center">
        <PurposeStatement />
        <ImageOverlay imageSrc="https://xpd3v1jptv.ufs.sh/f/6qqjniOzwJUTgqkQoCARNC9fd7T2tD5QhxSYkjcsboLHZGUF" />
      </div>
    </section>
  )
}

export default HeroSection
