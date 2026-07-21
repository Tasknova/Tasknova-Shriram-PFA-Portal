export interface Admin {
  id: string
  full_name: string
  email: string
  password_hash: string
  role: 'super_admin' | 'admin'
  is_active: boolean
  created_at: string
  last_login: string | null
}

export interface DemoRequest {
  id: string
  name: string
  email: string
  company: string
  role: string
  team_size: string
  notes: string
  company_website: string
  company_scraped_info: Record<string, unknown>
  preferred_date: string
  preferred_time: string
  timezone: string
  mail_sent: boolean
  created_at: string
}

export interface JobOpening {
  id: string
  title: string
  department: string
  location: string
  type: string
  description: string
  about: string
  responsibilities: string[]
  skills: string[]
  gradient: string
  is_active: boolean
  created_at: string
}

export interface JobApplicant {
  id: string
  job_id: string
  full_name: string
  email: string
  phone: string
  experience_years: number
  portfolio_url: string
  resume_url: string
  cover_letter: string
  linkedin_url: string
  linkedin_scraped_data: Record<string, unknown>
  portfolio_scraped_data: Record<string, unknown>
  ai_score: number | null
  ai_score_reasoning: string
  analysis_status: 'not_started' | 'processing' | 'completed' | 'failed'
  analysis_data: Record<string, unknown> | null
  analyzed_at: string | null
  analysis_error: string | null
  resume_extracted_text: string | null
  job_opening?: JobOpening | null
  answers: Record<string, unknown>
  created_at: string
}

export interface Blog {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  hero_image_url: string
  author: string
  author_role: string
  author_avatar_url: string
  category: string
  tags: string[]
  read_time: number
  is_published: boolean
  published_at: string
  created_at: string
  updated_at: string
}

export interface Playbook {
  id: string
  title: string
  slug: string
  description: string
  topics: string[]
  pages: number
  downloads: number
  gradient: string
  file_path: string
  file_url: string
  created_at: string
}

export interface IndustryReport {
  id: string
  title: string
  slug: string
  description: string
  year: string
  pages: number
  downloads: string
  gradient: string
  icon: string
  key_findings: string[]
  pdf_url: string
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface VoiceConversation {
  id: string
  org_id: string
  assistant_id: string
  status: string
  type: string
  started_at: string
  ended_at: string
  ended_reason: string
  duration_seconds: number
  cost: number
  cost_breakdown: Record<string, unknown>
  transcript: string
  summary: string
  messages: Record<string, unknown>
  recording_url: string
  stereo_recording_url: string
  web_call_url: string
  analysis: Record<string, unknown>
  analysis_status: 'not_started' | 'processing' | 'completed' | 'failed'
  analysis_generated_at: string | null
  analysis_error: string | null
  artifact: Record<string, unknown>
  transport: Record<string, unknown>
  monitor: Record<string, unknown>
  customer_name: string
  customer_email: string
  customer_phone: string
  lead_details: string
  created_at: string
  updated_at: string
}

export interface Agent {
  agent_id: string
  name: string
  description?: string
  status?: string
  metadata?: Record<string, unknown>
  total_calls?: number
  valid_calls?: number
  failed_calls?: number
  avg_score?: number
  created_at?: string
}

export interface AICallEvaluation {
  id: string
  call_id: string
  status: 'processing' | 'completed' | 'failed'
  score: number | null
  overall_score: number | null
  overall_feedback?: string | null
  transcript_text?: string | null
  transcript_source?: string | null
  call_summary?: string | null
  customer_intent?: string | null
  lead_status?: 'Interested' | 'Not Interested' | 'Follow-up Required' | 'Callback Requested' | null
  meeting_datetime?: string | null
  meeting_location?: string | null
  main_discussion_points?: string[]
  call_outcome?: string | null
  agent_performance?: Record<string, unknown>
  strengths?: string[]
  areas_for_improvement?: string[]
  next_best_actions?: string[]
  analysis_json?: Record<string, unknown> | null
  issues?: string[]
  suggestions?: string[]
  agent_performance_score?: number | null
  customer_engagement_score?: number | null
  communication_score?: number | null
  qualification_score?: number | null
  error_message?: string | null
  processed_at?: string | null
  created_at: string
}

export interface ChatConversation {
  id: string
  agent_id: string
  session_id: string
  user_id: string
  messages: Record<string, unknown>
  summary: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface DashboardStats {
  totalDemoRequests: number
  totalJobApplicants: number
  activeJobOpenings: number
  publishedBlogs: number
  totalPlaybooks: number
  totalReports: number
  totalVoiceConversations: number
  totalChatConversations: number
}

// =====================================================
// COMPANY BRAIN & PROJECT BRAIN TYPES
// =====================================================

export interface CompanyBrain {
  id: string
  user_id: string
  // Company Details
  company_name?: string
  tagline?: string
  company_description?: string
  industry?: string
  founded_year?: number
  company_size?: string
  location?: string
  // Contact Information
  website?: string
  email?: string
  phone?: string
  // Values & Mission
  mission_statement?: string
  vision_statement?: string
  core_values?: string[]
  unique_selling_points?: string[]
  // Business Information
  target_audience?: string
  products_services?: Record<string, unknown>
  pricing_model?: string
  key_features?: string[]
  // Team Information
  founder_info?: string
  leadership_team?: Record<string, unknown>
  team_size_details?: string
  // Additional Data
  additional_context?: string
  custom_fields?: Record<string, unknown>
  // Timestamps
  created_at: string
  updated_at: string
}

export interface DocumentGroup {
  id: string
  user_id: string
  group_name: string
  description?: string
  created_at: string
  updated_at: string
}

export interface BrainDocument {
  id: string
  user_id: string
  company_brain_id?: string
  document_group_id?: string
  // File Metadata
  file_name: string
  file_type: 'pdf' | 'document' | 'image' | 'video' | 'audio' | 'other'
  file_size?: number
  mime_type?: string
  storage_path: string
  storage_url?: string
  // Organization
  description?: string
  tags?: string[]
  category?: string
  // Processing
  status: 'uploaded' | 'processing' | 'processed' | 'failed'
  extracted_text?: string
  // Timestamps
  created_at: string
  updated_at: string
}

export interface CompanyBrainEmbedding {
  id: string
  user_id: string
  content_type: 'company_info' | 'document' | 'additional_context'
  content_id?: string
  content: string
  embedding: number[] // 768 dimensions
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  company_id: string
  created_by: string
  project_name: string
  description?: string
  status: 'active' | 'on_hold' | 'completed' | 'archived'
  start_date?: string
  end_date?: string
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface ProjectMetadata {
  id: string
  project_id: string
  company_id: string
  // Project Context
  domain?: string
  industry?: string
  project_type?: string
  target_audience?: string
  // Technical Information
  tech_stack?: string[]
  requirements?: string
  // Planning Information
  key_goals?: string[]
  milestones?: Record<string, unknown>
  team_size?: number
  budget_currency?: string
  budget_amount?: number
  // Priority & Pricing
  priority_level?: 'low' | 'medium' | 'high' | 'critical'
  pricing_information?: string
  // Additional Data
  custom_fields?: Record<string, unknown>
  additional_context?: string
  // Timestamps
  created_at: string
  updated_at: string
}

export interface ProjectDocument {
  id: string
  project_id: string
  company_id: string
  uploaded_by: string
  // File Metadata
  file_name: string
  file_type: 'pdf' | 'document' | 'image' | 'video' | 'audio' | 'other'
  file_size?: number
  mime_type?: string
  storage_path: string
  storage_url?: string
  // Organization
  title?: string
  description?: string
  tags?: string[]
  category?: string
  // Content
  content_text?: string  // Text content for AI embeddings
  extracted_text?: string
  // Processing
  status: 'uploaded' | 'processing' | 'processed' | 'failed'
  // Soft Delete
  is_deleted: boolean
  // Timestamps
  created_at: string
  updated_at: string
}

export interface ProjectEmbedding {
  id: string
  project_id: string
  company_id: string
  content_type: 'project_metadata' | 'document' | 'document_chunk'
  content_id?: string
  content: string
  embedding: number[] // 768 dimensions
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SearchResult {
  id: string
  project_id?: string
  company_id?: string
  user_id?: string
  content_type: string
  content_id?: string
  content: string
  metadata?: Record<string, unknown>
  similarity: number
}

// =====================================================
// CONTEXT MEMORY & STANDUP TYPES
// =====================================================

export interface Insight {
  type: 'company' | 'project' | 'team'
  confidence: number
  text: string
  keywords: string[]
  mentioned_projects?: string[]
  mentioned_company?: string
  mentioned_people?: string[]
  mentioned_dates?: string[]
  category?: 'decision' | 'blocker' | 'update' | 'action_item' | 'risk' | 'opportunity'
  source_text?: string
}

export interface Classification {
  type: 'company' | 'project'
  project_id?: string
  confidence: number
}

export interface DailyStandupMeeting {
  id: string
  meeting_date: string
  meeting_end_time?: string
  meeting_duration?: number
  meeting_title?: string
  meeting_transcript: Record<string, unknown>
  meeting_summary?: Record<string, unknown>
  memory_context_analysis?: {
    insights: Insight[]
  }
  processed: boolean
  processed_at?: string
  processing_error?: string
  created_at: string
}

export interface MeetingIntelligence {
  id: string
  meeting_id: string
  tasks_completed?: number
  tasks_completed_details?: string
  tasks_delayed?: number
  tasks_delayed_details?: string
  blockers_detected?: number
  blockers_detected_details?: string
  critical_blockers?: number
  critical_blockers_details?: string
  pipeline_deals_progressed?: number
  pipeline_deals_progressed_details?: string
  pipeline_deals_stalled?: number
  pipeline_deals_stalled_details?: string
  revenue_impact_discussions?: number
  revenue_impact_discussions_details?: string
  revenue_risk_signals?: number
  revenue_risk_signals_details?: string
  customer_feedback_count?: number
  customer_feedback_details?: string
  feature_requests?: number
  feature_requests_details?: string
  followups_assigned?: number
  followups_assigned_details?: string
  followups_pending?: number
  followups_pending_details?: string
  sentiment_score?: number
  sentiment_reasoning?: string
  meeting_efficiency_score?: number
  meeting_efficiency_reasoning?: string
  key_insights?: string
  participants_analysis?: Record<string, unknown>
  analysis?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ContextMemoryItem {
  id: string
  user_id: string
  project_id?: string
  approval_status: 'pending' | 'approved' | 'disapproved'
  approved_at?: string
  approved_by?: string
  approved_disapproved_at?: string
  approved_disapproved_by?: string
  insight_text: string
  confidence_score: number
  relevance_score: number
  keywords: string[]
  category?: string
  last_accessed_at: string
  access_count: number
  is_pinned: boolean
  source_insight_id?: string
  source_meeting_id?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CompanyContextMemory = ContextMemoryItem;

export interface ProjectContextMemory extends ContextMemoryItem {
  project_id: string // Required for project context
}

export interface ContextEmbedding {
  id: string
  user_id: string
  context_memory_id: string
  embedding: number[] // 768 dimensions
  created_at: string
}

export interface EmbeddingResponse {
  embedding: number[]
  error?: string
}
