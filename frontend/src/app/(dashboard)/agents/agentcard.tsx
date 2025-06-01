import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardImage,
  MinimalCardTitle,
} from "@/components/ui/minimal-card"

export function MinimalCards() {
  const cards = [
    {
      title: "Sick title",
      description:
        "How to design with gestures and motion that feel intuitive and natural.",
      src: "https://pbs.twimg.com/media/GgMiuRpa4AAoW2y?format=jpg&name=medium",
    },
    {
      title: "Sick title",
      description:
        "How to design with gestures and motion that feel intuitive and natural.",
      src: "https://pbs.twimg.com/media/GgHZJN0aoAA__92?format=jpg&name=medium",
    },
    
    {
      title: "Sick title",
      description:
        "How to design with gestures and motion that feel intuitive and natural.",
      src: "https://pbs.twimg.com/media/GgCPjsQacAAWvm3?format=jpg&name=medium",
    },
    {
      title: "Sick title",
      description:
        "How to design with gestures and motion that feel intuitive and natural.",
      src: "https://pbs.twimg.com/media/GgCPjsQacAAWvm3?format=jpg&name=medium",
    },
    {
      title: "Sick title",
      description:
        "How to design with gestures and motion that feel intuitive and natural.",
      src: "https://pbs.twimg.com/media/GgCPjsQacAAWvm3?format=jpg&name=medium",
    },
    {
      title: "Sick title",
      description:
        "How to design with gestures and motion that feel intuitive and natural.",
      src: "https://pbs.twimg.com/media/GgCPjsQacAAWvm3?format=jpg&name=medium",
    },
  ]
  return (
    <div className="w-full max-w-8xl ">
      <div className="flex flex-col justify-center rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          {cards.map((card, index) => (
            <MinimalCard className="m-1 w-[280px] " key={index}>
              <MinimalCardImage
                className="h-[200px]"
                src={card.src}
                alt={card.title}
              />
              <MinimalCardTitle>{card.title}</MinimalCardTitle>
              <MinimalCardDescription>
                {card.description}
              </MinimalCardDescription>
            </MinimalCard>
          ))}
        </div>
      </div>
    </div>
  )
}
