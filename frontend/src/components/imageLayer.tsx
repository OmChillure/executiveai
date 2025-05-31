import type React from "react"

interface ImageOverlayProps {
  imageSrc: string
}

const ImageOverlay: React.FC<ImageOverlayProps> = ({ imageSrc }) => {
  return (
    <div className="relative w-full aspect-square md:aspect-auto md:h-[300px] lg:h-[400px] mt-8 md:mt-12 overflow-hidden rounded-full">
      <img
        src={imageSrc || "/placeholder.svg"}
        alt="Career transformation background"
        className="absolute h-full w-full object-cover inset-0"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center text-center">
          <span className="text-[rgba(151,59,42,1)] text-[6px] md:text-[8px] lg:text-[10px]">(w3</span>
          <p className="text-[rgba(162,116,106,1)] text-[10px] md:text-sm lg:text-base font-normal leading-relaxed mt-1">
            You turn your career
            <br />
            into a calling.
          </p>
          <p className="text-[rgba(37,35,33,1)] text-[11px] md:text-sm lg:text-base mt-12 md:mt-16 lg:mt-20">
            You contribute
          </p>
          <p className="text-[rgba(24,24,22,1)] text-[8px] md:text-xs lg:text-sm mt-2">more to society.</p>
        </div>
      </div>
    </div>
  )
}

export default ImageOverlay
