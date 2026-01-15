/**
 * Login API Route for Crane Command Center
 *
 * Simple password-based authentication that sets a cookie.
 * Password is stored in COMMAND_CENTER_PASSWORD environment variable.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Trim submitted password
    const submittedPassword = body.password?.trim();

    // Get password from environment with fallback
    const expectedPassword = (process.env.COMMAND_CENTER_PASSWORD || 'crane2026').trim();

    // Detailed debug logging
    console.log('Expected:', expectedPassword, 'Length:', expectedPassword.length);
    console.log('Submitted:', submittedPassword, 'Length:', submittedPassword?.length);
    console.log('Match:', expectedPassword === submittedPassword);
    console.log('Env var raw:', process.env.COMMAND_CENTER_PASSWORD);

    if (!submittedPassword) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Validate password
    if (submittedPassword !== expectedPassword) {
      console.log('[auth] Password mismatch - authentication failed');
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    console.log('[auth] Password match - authentication successful');

    // Set auth cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: 'crane-command-auth',
      value: 'authenticated',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[auth] Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
