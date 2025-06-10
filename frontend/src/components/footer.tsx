"use client"

import { Logo } from "@/components/ui/logo"
import Link from "next/link"
import { X, Linkedin, Facebook, TreesIcon as Threads, Instagram, TwitterIcon as TikTok } from "lucide-react"

const links = [
    {
        group: "Product",
        items: [
            {
                title: "Features",
                href: "#",
            },
            {
                title: "Solution",
                href: "#",
            },
            {
                title: "Customers",
                href: "#",
            },
            {
                title: "Pricing",
                href: "#",
            },
            {
                title: "Help",
                href: "#",
            },
            {
                title: "About",
                href: "#",
            },
        ],
    },
    {
        group: "Solution",
        items: [
            {
                title: "Startup",
                href: "#",
            },
            {
                title: "Freelancers",
                href: "#",
            },
            {
                title: "Organizations",
                href: "#",
            },
            {
                title: "Students",
                href: "#",
            },
            {
                title: "Collaboration",
                href: "#",
            },
            {
                title: "Design",
                href: "#",
            },
            {
                title: "Management",
                href: "#",
            },
        ],
    },
    {
        group: "Company",
        items: [
            {
                title: "About",
                href: "#",
            },
            {
                title: "Careers",
                href: "#",
            },
            {
                title: "Blog",
                href: "#",
            },
            {
                title: "Press",
                href: "#",
            },
            {
                title: "Contact",
                href: "#",
            },
            {
                title: "Help",
                href: "#",
            },
        ],
    },
    {
        group: "Legal",
        items: [
            {
                title: "Licence",
                href: "#",
            },
            {
                title: "Privacy",
                href: "#",
            },
            {
                title: "Cookies",
                href: "#",
            },
            {
                title: "Security",
                href: "#",
            },
        ],
    },
]

export default function FooterSection() {
    return (
        <div className="bg-transparent text-white bg-[linear-gradient(to_bottom,_#000000,_#5a1f1f_40%,_#d14b1e_70%,_#ff8650_90%)] py-[72px] sm:py-24 relative overflow-clip animate-footer-appear">
            <div className="absolute h-[375px] w-[750px] sm:w-[1536px] sm:h-[768px] lg:w-[2400px] llg:h-[800px] bg-transparent rounded-[100%]  left-1/2 -translate-x-1/2 border border-[#b95834] bg-[radial-gradient(closest-side,_#100707_80%,_#e06d3b)] top-[calc(100%-96px)] sm:top-[calc(100%-120px)] animate-radial-glow"></div>
            <div className="container relative mx-auto max-w-7xl px-6">
                <div className="grid gap-12 md:grid-cols-5">
                    <div className="md:col-span-2 flex flex-col">
                        <Link href="/" aria-label="go home" className="block size-fit">
                            <Logo />
                        </Link>
                        <div className="flex gap-4 mt-6 text-sm">
                            <Link
                                href="#"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="X/Twitter"
                                className="text-gray-300 hover:text-white block"
                            >
                                <X className="size-6" />
                            </Link>
                            <Link
                                href="#"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="LinkedIn"
                                className="text-gray-300 hover:text-white block"
                            >
                                <Linkedin className="size-6" />
                            </Link>
                            <Link
                                href="#"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Facebook"
                                className="text-gray-300 hover:text-white block"
                            >
                                <Facebook className="size-6" />
                            </Link>
                            <Link
                                href="#"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Threads"
                                className="text-gray-300 hover:text-white block"
                            >
                                <Threads className="size-6" />
                            </Link>
                            <Link
                                href="#"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Instagram"
                                className="text-gray-300 hover:text-white block"
                            >
                                <Instagram className="size-6" />
                            </Link>
                            <Link
                                href="#"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="TikTok"
                                className="text-gray-300 hover:text-white block"
                            >
                                <TikTok className="size-6" />
                            </Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 md:col-span-3 mb-12">
                        {links.map((link, index) => (
                            <div key={index} className="space-y-4 text-sm">
                                <span className="block font-medium">{link.group}</span>
                                {link.items.map((item, index) => (
                                    <Link key={index} href={item.href} className="text-gray-300 hover:text-white block duration-150">
                                        <span>{item.title}</span>
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    )
}
