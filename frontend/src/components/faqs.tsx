'use client'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import Link from 'next/link'

type FAQItem = {
    id: string
    icon: IconName
    question: string
    answer: string
}

export default function FAQsThree() {
    const faqItems: FAQItem[] = [
        {
            id: 'item-1',
            icon: 'globe-2',
            question: 'What is OnaraAI, and how does it work?',
            answer: 'OnaraAI is an executive assistant powered by AI that handles tasks across your everyday tools like Google Workspace, GitHub, Notion, research platforms, and more. You simply give it a prompt, and it automatically selects the best-suited AI agents to get the job done.',
        },
        {
            id: 'item-2',
            icon: 'user-check',
            question: 'Who is OnaraAI best suited for?',
            answer: 'OnaraAI is built for busy professionals, founders, team leads, and anyone who juggles multiple tools and responsibilities. Whether you need help with operations, research, reporting, or coordination, OnaraAI helps you reclaim your time and stay focused on high-impact work.',
        },
        {
            id: 'item-3',
            icon: 'credit-card',
            question: 'How do subscription payments work?',
            answer: 'Subscription payments are automatically charged to your default payment method on the same day each month or year, depending on your billing cycle. You can update your payment information and view billing history in your account dashboard.',
        },
        {
            id: 'item-4',
            icon: 'clock',
            question: 'What are your business hours?',
            answer: 'Our customer service team is available Monday through Saturday from 10:00 AM to 7:00 PM IST. During holidays, hours may vary and will be posted on our website.',
        },
        {
            id: 'item-5',
            icon: 'git-compare',
            question: 'How is OnaraAI different from other AI assistants?',
            answer: 'Unlike traditional AI tools that perform simple single tasks, OnaraAI operates like a task manager. It intelligently breaks down your request, assigns it to the right agents, and ensures the output is actionable. It works across tools, not just within one, making it a true cross-platform productivity assistant.',
        },
    ]

    return (
        <section className="py-20">
            <div className="mx-auto max-w-6xl px-4 md:px-6">
                <div className="flex flex-col gap-10 md:flex-row md:gap-16">
                    <div className="md:w-1/3">
                        <div className="sticky top-20">
                            <h2 className="mt-4 text-3xl font-bold">Frequently Asked Questions</h2>
                            <p className="text-muted-foreground mt-4">
                                Can't find what you're looking for? Contact our{' '}
                                <Link
                                    href="#"
                                    className="text-primary font-medium hover:underline">
                                    customer support team
                                </Link>
                            </p>
                        </div>
                    </div>
                    <div className="md:w-2/3">
                        <Accordion
                            type="single"
                            collapsible
                            className="w-full space-y-2">
                            {faqItems.map((item) => (
                                <AccordionItem
                                    key={item.id}
                                    value={item.id}
                                    className="bg-background shadow-xs rounded-lg border px-4 last:border-b">
                                    <AccordionTrigger className="cursor-pointer items-center py-5 hover:no-underline">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-6">
                                                <DynamicIcon
                                                    name={item.icon}
                                                    className="m-auto size-4"
                                                />
                                            </div>
                                            <span className="text-base">{item.question}</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pb-5">
                                        <div className="px-9">
                                            <p className="text-base">{item.answer}</p>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>
                </div>
            </div>
        </section>
    )
}