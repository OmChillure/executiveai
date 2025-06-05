import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db'; 
import { waitlist } from '@/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, role, description } = body;

    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

  const existingEntry = await db
      .select()
      .from(waitlist)
      .where(eq(waitlist.email, email))
      .limit(1);

    if (existingEntry.length > 0) {
      return NextResponse.json(
        { error: 'Email already registered in waitlist' },
        { status: 409 }
      );
    }

    const newWaitlistEntry = await db
      .insert(waitlist)
      .values({
        email,
        role,
        description: description || null,
      })
      .returning();

    try {
      await resend.emails.send({
        from: 'Onara <noreply@waitlist.onaraai.xyz>',
        to: [email],
        subject: 'Welcome to OnaraAI Waitlist!',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Welcome to OnaraAI Waitlist</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to OnaraAI! 🎉</h1>
                <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">You're now on our exclusive waitlist</p>
              </div>
              
              <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
                <h2 style="color: #333; margin-top: 0;">Thank you for joining our waitlist!</h2>
                <p>Hi there,</p>
                <p>We're thrilled to have you on board! We will be sharing your login credentials very soon.</strong>.</p>
                
                
                <p>Here's what happens next:</p>
                <ul style="padding-left: 20px;">
                  <li> We'll notify you as soon as we beta launch</li>
                  <li> You'll get exclusive early access</li>
                  <li> Updates on our development progress</li>
                </ul>
              </div>
              
              <div style="background: white; border: 2px solid #e9ecef; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                <h3 style="color: #333; margin-top: 0;">Stay Connected</h3>
                <p>Follow us on social media for the latest updates:</p>
                <p>
                  <a href="https://x.com/onaraai" style="color: #667eea; text-decoration: none; font-weight: bold;">
                    🐦 Follow us on X (Twitter)
                  </a>
                </p>
              </div>
              
              <div style="text-align: center; color: #666; font-size: 14px; border-top: 1px solid #e9ecef; padding-top: 20px;">
                <p>Questions? Reply to this email - we'd love to hear from you!</p>
                <p>Best regards,<br>The Onara Team</p>
              </div>
            </body>
          </html>
        `,
        text: `
Welcome to OnaraAI Waitlist! 🎉

Hi there,

We're thrilled to have you on board! We will be sharing your login credentials very soon.


Here's what happens next:
   We'll notify you as soon as we launch
   You'll get exclusive early access
   Updates on our development progress

Stay Connected:
Follow us on X (Twitter): https://x.com/onaraai

Questions? Reply to this email - we'd love to hear from you!

Best regards,
The Onara Team
        `,
      });

      console.log('Confirmation email sent successfully');
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    return NextResponse.json(
      { 
        message: 'Successfully added to waitlist',
        data: newWaitlistEntry[0]
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Waitlist registration error:', error);
    
    // Handle specific database errors
    if ((error as any).code === '23505') { // Unique constraint violation
      return NextResponse.json(
        { error: 'Email already registered in waitlist' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to register for waitlist' },
      { status: 500 }
    );
  }
}

// Optional: GET method to retrieve waitlist entries (admin only)
export async function GET(request: NextRequest) {
  try {
    // Add authentication check here for admin access
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const entries = await db
      .select({
        id: waitlist.id,
        email: waitlist.email,
        role: waitlist.role,
        description: waitlist.description,
        createdAt: waitlist.createdAt,
      })
      .from(waitlist)
      .orderBy(desc(waitlist.createdAt))
      .limit(limit)
      .offset(offset);

    const total = await db
      .select({ count: count() })
      .from(waitlist);

    return NextResponse.json({
      entries,
      total: total[0].count,
      limit,
      offset,
    });

  } catch (error) {
    console.error('Failed to fetch waitlist entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch waitlist entries' },
      { status: 500 }
    );
  }
}