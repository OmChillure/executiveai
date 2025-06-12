"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const testimonials = [
    {
        quote:
            "Using TailsUI has been like unlocking a secret design superpower. It's the perfect fusion of simplicity and versatility, enabling us to create UIs that are as stunning as they are user-friendly.",
        author: "John Doe",
        role: "CEO, Nvidia",
        logo: "https://html.tailus.io/blocks/customers/nvidia.svg",
    },
    {
        quote:
            "The component library has transformed our development workflow. What used to take days now takes hours, and the quality is consistently exceptional.",
        author: "Sarah Chen",
        role: "Lead Designer, Google",
        logo: "https://html.tailus.io/blocks/customers/google.svg",
    },
    {
        quote:
            "Finally, a design system that understands both developers and designers. The documentation is clear, the components are flexible, and the results speak for themselves.",
        author: "Michael Rodriguez",
        role: "CTO, Microsoft",
        logo: "https://html.tailus.io/blocks/customers/microsoft.svg",
    },
    {
        quote:
            "We've been able to ship features 3x faster while maintaining our high design standards. This toolkit is a game-changer for any product team.",
        author: "Emily Watson",
        role: "Product Manager, Apple",
        logo: "https://html.tailus.io/blocks/customers/apple.svg",
    },
]

export default function TestimonialsSection() {
    const [currentIndex, setCurrentIndex] = useState(0)

    const nextTestimonial = () => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % testimonials.length)
    }

    const prevTestimonial = () => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + testimonials.length) % testimonials.length)
    }

    useEffect(() => {
        const interval = setInterval(nextTestimonial, 5000)
        return () => clearInterval(interval)
    }, [])

    return (
        <section className="relative py-16 md:py-32  text-white overflow-hidden">
            <div
                className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20"
                style={{
                    backgroundImage: `radial-gradient(circle, rgba(139, 92, 246, 0.3) 1px, transparent 1px)`,
                    backgroundSize: "24px 24px",
                }}
            />

            <div className="relative mx-auto max-w-5xl px-6">
                <div className="text-center mb-16">
                    <div className="relative inline-block mb-8">
                        <div
                            className="absolute -inset-8 pointer-events-none "
                            style={{
                                backgroundImage: `radial-gradient(circle, rgba(86, 37, 247, 0.6) 2px, transparent 1px)`,
                                backgroundSize: "10px 8px",
                                maskImage: "radial-gradient(ellipse 120px 60px at center, black 40%, transparent 70%)",
                                WebkitMaskImage: "radial-gradient(ellipse 120px 60px at center, black 40%, transparent 70%)",
                            }}
                        />

                        <div className="relative inline-flex items-center px-4 py-1 rounded-full bg-[#5625F7] text-white text-sm font-medium">
                            Trusted by makers
                        </div>
                    </div>

                    <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                        Used by people who
                        <br />
                        don't have time to design
                    </h2>

                    <p className="text-xl text-gray-300 max-w-2xl mx-auto">Design is hard. Once UI takes care of it for you.</p>
                </div>

                <div className="relative">
                    <div className="mx-auto max-w-3xl">
                        <div className="relative min-h-[300px] flex items-center">
                            <blockquote className="text-center">
                                <p className="text-lg font-semibold sm:text-xl md:text-2xl mb-8 leading-relaxed">
                                    "{testimonials[currentIndex].quote}"
                                </p>

                                <div className="flex items-center justify-center gap-6">
                                    <img
                                        className="h-8 w-fit brightness-0 invert"
                                        src={testimonials[currentIndex].logo || "/placeholder.svg"}
                                        alt={`${testimonials[currentIndex].author} Company Logo`}
                                        height="32"
                                        width="auto"
                                    />
                                    <div className="space-y-1 border-l border-gray-600 pl-6 text-left">
                                        <cite className="font-medium text-white not-italic">{testimonials[currentIndex].author}</cite>
                                        <span className="text-gray-400 block text-sm">{testimonials[currentIndex].role}</span>
                                    </div>
                                </div>
                            </blockquote>
                        </div>

                        <div className="flex items-center justify-center gap-4 mt-8">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={prevTestimonial}
                                className="rounded-full border-gray-600 bg-transparent hover:bg-gray-800 text-white"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>

                            <div className="flex gap-2">
                                {testimonials.map((_, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setCurrentIndex(index)}
                                        className={`w-2 h-2 rounded-full transition-colors ${index === currentIndex ? "bg-[#5625F7]" : "bg-gray-600"
                                            }`}
                                    />
                                ))}
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                onClick={nextTestimonial}
                                className="rounded-full border-gray-600 bg-transparent hover:bg-gray-800 text-white"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
