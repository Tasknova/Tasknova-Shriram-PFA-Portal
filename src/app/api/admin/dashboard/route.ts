import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    // Fetch counts
    const [
      { count: demoCount },
      { count: applicantCount },
      { count: activeJobsCount },
      { count: publishedBlogsCount },
      { count: playbookCount },
      { count: reportCount },
      { count: voiceCount },
      { count: chatCount },
    ] = await Promise.all([
      supabase.from('demo_requests').select('*', { count: 'exact', head: true }),
      supabase.from('job_applicants').select('*', { count: 'exact', head: true }),
      supabase.from('job_openings').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('blogs').select('*', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('playbooks').select('*', { count: 'exact', head: true }),
      supabase.from('industry_reports').select('*', { count: 'exact', head: true }),
      supabase.from('voice_conversations').select('*', { count: 'exact', head: true }),
      supabase.from('chat_conversations').select('*', { count: 'exact', head: true }),
    ])

    // Fetch recent data
    const { data: recentDemos } = await supabase
      .from('demo_requests')
      .select('id, name, company, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: recentApplicants } = await supabase
      .from('job_applicants')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: recentVoiceCalls } = await supabase
      .from('voice_conversations')
      .select('id, customer_name, customer_email, status, duration_seconds, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      stats: {
        totalDemoRequests: demoCount || 0,
        totalJobApplicants: applicantCount || 0,
        activeJobOpenings: activeJobsCount || 0,
        publishedBlogs: publishedBlogsCount || 0,
        totalPlaybooks: playbookCount || 0,
        totalReports: reportCount || 0,
        totalVoiceConversations: voiceCount || 0,
        totalChatConversations: chatCount || 0,
      },
      recentDemos: recentDemos || [],
      recentApplicants: recentApplicants || [],
      recentVoiceCalls: recentVoiceCalls || [],
    })
  } catch (error) {
    console.error('Dashboard fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
