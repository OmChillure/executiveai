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
          <p className="text-[#ad9894] text-[14px] md:text-sm lg:text-lg font-normal leading-relaxed mt-1">
            Turn your career
            <br />
            into prompting.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ImageOverlay
