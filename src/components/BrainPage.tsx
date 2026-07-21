import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Trash2, Pin, PinOff, Check, X } from 'lucide-react';
import {
  storeCompanyBrainWithEmbedding,
  storeAdditionalContext,
  searchSimilarContent
} from '@/lib/embeddings';
import type { CompanyBrain, BrainDocument, CompanyContextMemory, DocumentGroup } from '@/types';

interface ChatSource {
  content_type?: string;
  content: string;
  similarity: number;
  metadata?: {
    file_name?: string;
    category?: string;
    [key: string]: unknown;
  };
}

// Automatic text extraction function via API
async function extractTextFromFile(file: File): Promise<{ success: boolean; text: string | null; message?: string }> {
  try {
    // For text files, read directly (no API call needed)
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const text = await file.text();
      return { success: true, text: text.trim(), message: `${text.length} characters extracted` };
    }
    
    // For PDF and Word files, use API route
    const formData = new FormData();
    formData.append('file', file);

    console.log(`Calling /api/extract-text for ${file.name}...`);
    
    const response = await fetch('/api/extract-text', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error for ${file.name}: ${response.status}`, errorText);
      return {
        success: false,
        text: null,
        message: `Extraction failed (HTTP ${response.status})`
      };
    }

    const result = await response.json();
    console.log(`API result for ${file.name}:`, result);
    
    return {
      success: result.success,
      text: result.text,
      message: result.message || (result.text ? `${result.text.length} characters extracted` : 'No text extracted')
    };
  } catch (error) {
    console.error(`Exception extracting text from ${file.name}:`, error);
    return {
      success: false,
      text: null,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

interface BrainPageProps {
  onBack: () => void;
}

export default function BrainPage({ onBack }: BrainPageProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'documents' | 'context-memory' | 'search'>('info');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Company Brain State
  const [companyBrain, setCompanyBrain] = useState<Partial<CompanyBrain>>({
    company_name: '',
    tagline: '',
    company_description: '',
    industry: '',
    founded_year: undefined,
    company_size: '',
    location: '',
    website: '',
    email: '',
    phone: '',
    mission_statement: '',
    vision_statement: '',
    core_values: [],
    unique_selling_points: [],
    target_audience: '',
    pricing_model: '',
    key_features: [],
    founder_info: '',
    additional_context: ''
  });
  
  // Documents State
  const [documents, setDocuments] = useState<BrainDocument[]>([]);
  const [, setGroups] = useState<DocumentGroup[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedTexts, setExtractedTexts] = useState<Map<string, string>>(new Map());
  const [extracting, setExtracting] = useState(false);
  
  // Context Memory State
  const [contextMemories, setContextMemories] = useState<CompanyContextMemory[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextFilter, setContextFilter] = useState<'all' | 'pinned'>('all');
  const [contextApprovalFilter, setContextApprovalFilter] = useState<'all' | 'approved' | 'pending' | 'disapproved'>('all');
  const [contextSortBy, setContextSortBy] = useState<'recent' | 'accessed' | 'confidence'>('recent');
  
  const [uploadMetadata, setUploadMetadata] = useState({
    title: '',
    description: '',
    category: '',
    tags: '',
    budgetCurrency: 'USD',
    budgetAmount: ''
  });
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{
    role: 'user' | 'assistant';
    content: string;
    sources?: ChatSource[];
    timestamp: Date;
  }>>([]);
  const [searching, setSearching] = useState(false);

  const loadContextMemories = useCallback(async () => {
    if (!userId) return;
    setContextLoading(true);
    try {
      const params = new URLSearchParams({
        filter: contextFilter,
        approvalStatus: contextApprovalFilter,
        sort: contextSortBy,
        includePending: 'true',
      });
      const res = await fetch(`/api/admin/company-context-memory?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch company context memory');
      const data = await res.json();
      setContextMemories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading context memories:', error);
    } finally {
      setContextLoading(false);
    }
  }, [userId, contextFilter, contextApprovalFilter, contextSortBy]);

  // Run once on mount to hydrate admin session and base datasets.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.authenticated && data.admin) {
          setUserId(data.admin.id);
          await loadCompanyBrain(data.admin.id);
          await loadDocuments(data.admin.id);
          await loadGroups(data.admin.id);
        }
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    };

    void initializeUser();
  }, []);
  
  useEffect(() => {
    if (activeTab === 'context-memory' && userId) {
      void loadContextMemories();
    }
  }, [activeTab, userId, loadContextMemories]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function loadCompanyBrain(uid: string) {
    try {
      const { data, error } = await supabase
        .from('company_brain')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) setCompanyBrain(data);
    } catch (error) {
      console.error('Error loading company brain:', error);
    }
  }

  async function loadDocuments(uid: string) {
    try {
      const { data, error } = await supabase
        .from('brain_documents')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  }

  async function loadGroups(uid: string) {
    try {
      const { data, error } = await supabase
        .from('document_groups')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroups(data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  }

  async function togglePinContext(id: string, isPinned: boolean) {
    try {
      const res = await fetch('/api/admin/company-context-memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_pinned: !isPinned }),
      });
      if (!res.ok) throw new Error('Failed to update company context memory');
      await loadContextMemories();
    } catch (error) {
      console.error('Error updating context:', error);
    }
  }

  async function deleteContext(id: string) {
    try {
      const res = await fetch(`/api/admin/company-context-memory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete company context memory');
      await loadContextMemories();
    } catch (error) {
      console.error('Error deleting context:', error);
    }
  }

  async function approveContext(id: string) {
    try {
      const res = await fetch('/api/admin/company-context-memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      });
      if (!res.ok) throw new Error('Failed to approve context memory');
      await loadContextMemories();
    } catch (error) {
      console.error('Error approving context:', error);
    }
  }

  async function disapproveContext(id: string) {
    try {
      const res = await fetch('/api/admin/company-context-memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'disapprove' }),
      });
      if (!res.ok) throw new Error('Failed to disapprove context memory');
      await loadContextMemories();
    } catch (error) {
      console.error('Error disapproving context:', error);
    }
  }

  async function handleSave() {
    if (!userId) return;
    
    setLoading(true);
    try {
      // Save company brain with embedding
      const result = await storeCompanyBrainWithEmbedding(
        supabase,
        userId,
        companyBrain
      );

      if (!result.success) {
        alert(`Error: ${result.error}`);
        return;
      }

      // Save additional context if provided
      if (companyBrain.additional_context && result.brainId) {
        const contextResult = await storeAdditionalContext(
          supabase,
          userId,
          result.brainId,
          companyBrain.additional_context
        );

        if (contextResult.success) {
          alert(`Saved successfully! Generated ${contextResult.chunksProcessed || 0} context chunks.`);
        }
      } else {
        alert('Company Brain saved successfully!');
      }

      await loadCompanyBrain(userId);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error saving company brain');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setSelectedFiles(fileArray);
    setShowUploadModal(true);
    
    // Set default title from first file name
    if (fileArray.length === 1) {
      setUploadMetadata(prev => ({
        ...prev,
        title: fileArray[0].name.replace(/\.[^/.]+$/, '') // Remove extension
      }));
    } else {
      setUploadMetadata(prev => ({
        ...prev,
        title: `${fileArray.length} files`
      }));
    }
    
    // Try to extract text from supported files automatically
    setExtracting(true);
    const textsMap = new Map<string, string>();
    
    for (const file of fileArray) {
      const result = await extractTextFromFile(file);
      if (result.success && result.text) {
        textsMap.set(file.name, result.text);
        console.log(`✓ Extracted ${result.text.length} characters from ${file.name}`);
      } else {
        console.log(`⚠ ${result.message || 'No text extracted'} from ${file.name}`);
      }
    }
    
    setExtractedTexts(textsMap);
    setExtracting(false);

    // Reset file input
    event.target.value = '';
  }

  async function handleUploadWithMetadata() {
    if (!selectedFiles.length || !userId) return;

    setUploading(true);
    try {
      const uploadedDocs = [];
      
      for (const file of selectedFiles) {
        // Sanitize filename - remove special characters, replace spaces with underscores
        const sanitizedName = file.name
          .replace(/[^\w\s.-]/g, '') // Remove special characters except spaces, dots, hyphens
          .replace(/\s+/g, '_')      // Replace spaces with underscores
          .replace(/_{2,}/g, '_')    // Replace multiple underscores with single
          .normalize('NFD')          // Normalize unicode characters
          .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
        
        // Upload to Supabase Storage
        const fileName = `${Date.now()}_${sanitizedName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('brain-documents')
          .upload(`${userId}/${fileName}`, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('brain-documents')
          .getPublicUrl(uploadData.path);

        // Determine file type
        let fileType: BrainDocument['file_type'] = 'other';
        if (file.type.includes('pdf')) fileType = 'pdf';
        else if (file.type.includes('image')) fileType = 'image';
        else if (file.type.includes('video')) fileType = 'video';
        else if (file.type.includes('audio')) fileType = 'audio';
        else if (file.type.includes('document') || file.type.includes('text')) fileType = 'document';

        // Parse tags
        const tags = uploadMetadata.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean);

        // Get extracted text for this file
        const contentText = extractedTexts.get(file.name) || null;

        // Insert document record
        const { data: docData, error: docError } = await supabase
          .from('brain_documents')
          .insert({
            user_id: userId,
            file_name: selectedFiles.length === 1 ? uploadMetadata.title || file.name : file.name,
            file_type: fileType,
            file_size: file.size,
            mime_type: file.type,
            storage_path: uploadData.path,
            storage_url: urlData.publicUrl,
            description: uploadMetadata.description || null,
            category: uploadMetadata.category || null,
            tags: tags.length > 0 ? tags : null,
            content_text: contentText,
            budget_currency: uploadMetadata.budgetCurrency || null,
            budget_amount: uploadMetadata.budgetAmount ? parseFloat(uploadMetadata.budgetAmount) : null,
            status: 'uploaded'
          })
          .select()
          .single();

        if (docError) throw docError;

        // Generate embedding for document
        const embeddingContent = [
          `File: ${docData.file_name}`,
          uploadMetadata.description ? `Description: ${uploadMetadata.description}` : '',
          uploadMetadata.category ? `Category: ${uploadMetadata.category}` : '',
          tags.length ? `Tags: ${tags.join(', ')}` : '',
          `Type: ${fileType}`,
          contentText ? `\nCONTENT:\n${contentText}` : ''
        ].filter(Boolean).join('\n');
        
        const { generateEmbedding } = await import('@/lib/embeddings');
        const embeddingResult = await generateEmbedding(embeddingContent);
        
        if (!embeddingResult.error && embeddingResult.embedding.length > 0) {
          // Convert embedding array to string for pgvector
          const embeddingStr = `[${embeddingResult.embedding.join(',')}]`;
          
          await supabase
            .from('company_brain_embeddings')
            .insert({
              user_id: userId,
              content_type: 'document',
              content_id: docData.id,
              content: embeddingContent,
              embedding: embeddingStr,
              metadata: {
                file_name: docData.file_name,
                file_type: fileType,
                category: uploadMetadata.category,
                tags: tags
              }
            });
        }

        uploadedDocs.push(docData);
      }

      alert(`✓ Successfully uploaded ${uploadedDocs.length} document${uploadedDocs.length > 1 ? 's' : ''}!`);
      await loadDocuments(userId);
      
      // Reset modal
      setShowUploadModal(false);
      setSelectedFiles([]);
      setExtractedTexts(new Map());
      setUploadMetadata({ title: '', description: '', category: '', tags: '', budgetCurrency: 'USD', budgetAmount: '' });
    } catch (error) {
      console.error('Error uploading files:', error);
      alert(`✗ Error uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  }

  function cancelUpload() {
    setShowUploadModal(false);
    setSelectedFiles([]);
    setExtractedTexts(new Map());
    setUploadMetadata({ title: '', description: '', category: '', tags: '', budgetCurrency: 'USD', budgetAmount: '' });
  }

  function scoreByQueryOverlap(query: string, text: string, keywords?: string[]) {
    const queryTerms = query.toLowerCase().split(/\W+/).filter(term => term.length > 2);
    const haystack = `${text} ${(keywords || []).join(' ')}`.toLowerCase();
    const matches = queryTerms.filter(term => haystack.includes(term)).length;
    return queryTerms.length ? matches / queryTerms.length : 0;
  }

  async function handleSearch() {
    if (!searchQuery || !userId) return;

    // Add user message to chat
    const userMessage = {
      role: 'user' as const,
      content: searchQuery,
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, userMessage]);

    const currentQuery = searchQuery;
    setSearchQuery(''); // Clear input
    setSearching(true);

    try {
      // Step 1: Search for relevant context using embeddings
      const embeddingContext = await searchSimilarContent(
        supabase,
        userId,
        currentQuery,
        0.7, // Lower threshold for more context
        5 // Get top 5 results
      );

      // Step 2: Fetch context memory and rank by query overlap
      const memoryRes = await fetch('/api/admin/company-context-memory?filter=all&sort=recent');
      const memoryItems = memoryRes.ok ? await memoryRes.json() : [];
      const rankedMemoryContext: ChatSource[] = (Array.isArray(memoryItems) ? memoryItems : [])
        .map((item: CompanyContextMemory) => ({
          content_type: 'context_memory',
          content: item.insight_text,
          similarity: scoreByQueryOverlap(currentQuery, item.insight_text || '', item.keywords),
          metadata: {
            category: item.category,
            confidence_score: item.confidence_score,
            keywords: item.keywords,
            source_meeting_id: item.source_meeting_id,
          },
        }))
        .filter((item: ChatSource) => item.similarity > 0)
        .sort((a: ChatSource, b: ChatSource) => b.similarity - a.similarity)
        .slice(0, 3);

      const context = [...embeddingContext, ...rankedMemoryContext];
      const chatContext = context.map((item) => ({
        content: item.content,
        similarity: String(item.similarity),
        content_type: String(item.content_type ?? ''),
        metadata: item.metadata ? JSON.stringify(item.metadata) : '',
      }));

      // Step 3: Generate AI response using RAG
      const { generateChatResponse } = await import('@/lib/embeddings');
      const { answer, error } = await generateChatResponse(currentQuery, chatContext);

      if (error) {
        throw new Error(error);
      }

      // Add assistant message to chat
      const assistantMessage = {
        role: 'assistant' as const,
        content: answer,
        sources: context,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Error in chat:', error);
      const errorMessage = {
        role: 'assistant' as const,
        content: 'Sorry, I encountered an error while processing your question. Please try again.',
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setSearching(false);
    }
  }

  function handleArrayInput(field: 'core_values' | 'unique_selling_points' | 'key_features', value: string) {
    const array = value.split(',').map(s => s.trim()).filter(Boolean);
    setCompanyBrain(prev => ({ ...prev, [field]: array }));
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <button
              onClick={onBack}
              className="text-blue-600 hover:text-blue-700 mb-2 flex items-center"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Company Brain</h1>
            <p className="text-gray-600 mt-2">
              Store and manage your company-wide knowledge with semantic search
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {[
                { id: 'info' as const, label: 'Company Info' },
                { id: 'documents' as const, label: 'Documents' },
                { id: 'context-memory' as const, label: 'Context Memory' },
                { id: 'search' as const, label: '🤖 AI Chat' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Company Info Tab */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={companyBrain.company_name || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, company_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Industry
                    </label>
                    <input
                      type="text"
                      value={companyBrain.industry || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, industry: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tagline
                  </label>
                  <input
                    type="text"
                    value={companyBrain.tagline || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, tagline: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Your company's tagline or slogan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Description
                  </label>
                  <textarea
                    value={companyBrain.company_description || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, company_description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Founded Year
                    </label>
                    <input
                      type="number"
                      value={companyBrain.founded_year || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, founded_year: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="2020"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Size
                    </label>
                    <input
                      type="text"
                      value={companyBrain.company_size || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, company_size: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="1-10, 11-50, 51-200, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      value={companyBrain.location || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="San Francisco, CA"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={companyBrain.website || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, website: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="https://example.com"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={companyBrain.email || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="info@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={companyBrain.phone || ''}
                      onChange={(e) => setCompanyBrain(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mission Statement
                  </label>
                  <textarea
                    value={companyBrain.mission_statement || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, mission_statement: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vision Statement
                  </label>
                  <textarea
                    value={companyBrain.vision_statement || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, vision_statement: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Core Values (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={companyBrain.core_values?.join(', ') || ''}
                    onChange={(e) => handleArrayInput('core_values', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Innovation, Integrity, Excellence"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unique Selling Points (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={companyBrain.unique_selling_points?.join(', ') || ''}
                    onChange={(e) => handleArrayInput('unique_selling_points', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="24/7 Support, AI-Powered, Cloud-Native"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Audience
                  </label>
                  <input
                    type="text"
                    value={companyBrain.target_audience || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, target_audience: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pricing Model
                  </label>
                  <input
                    type="text"
                    value={companyBrain.pricing_model || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, pricing_model: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Subscription, One-time, Freemium, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Key Features (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={companyBrain.key_features?.join(', ') || ''}
                    onChange={(e) => handleArrayInput('key_features', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Real-time Analytics, API Access, Custom Integrations"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Founder Information
                  </label>
                  <textarea
                    value={companyBrain.founder_info || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, founder_info: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Information about founders and their background"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Context
                  </label>
                  <textarea
                    value={companyBrain.additional_context || ''}
                    onChange={(e) => setCompanyBrain(prev => ({ ...prev, additional_context: e.target.value }))}
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Add any additional information about your company that should be searchable..."
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    This text will be chunked and embedded for semantic search
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save & Generate Embeddings'}
                  </button>
                </div>
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer"
                  >
                    <div className="text-blue-600 hover:text-blue-700 font-medium">
                      {uploading ? 'Uploading...' : '📁 Click to select documents'}
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      PDF, images, documents, videos, audio files accepted
                    </p>
                  </label>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Uploaded Documents ({documents.length})
                  </h3>
                  
                  {documents.length === 0 ? (
                    <p className="text-gray-500 text-sm">No documents uploaded yet</p>
                  ) : (
                    <div className="grid gap-4">
                      {documents.map(doc => (
                        <div
                          key={doc.id}
                          className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{doc.file_name}</h4>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span className="px-2 py-1 bg-gray-100 rounded uppercase text-xs font-medium">
                                  {doc.file_type}
                                </span>
                                <span>{((doc.file_size || 0) / 1024).toFixed(2)} KB</span>
                                {doc.category && (
                                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                                    {doc.category}
                                  </span>
                                )}
                              </div>
                              {doc.description && (
                                <p className="text-sm text-gray-600 mt-2">{doc.description}</p>
                              )}
                              {doc.tags && doc.tags.length > 0 && (
                                <div className="flex gap-2 mt-2 flex-wrap">
                                  {doc.tags.map((tag, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {doc.storage_url && (
                              <a
                                href={doc.storage_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-4 px-3 py-1 text-blue-600 hover:text-blue-700 text-sm border border-blue-300 rounded hover:bg-blue-50 transition-colors"
                              >
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Context Memory Tab */}
            {activeTab === 'context-memory' && (
              <div className="space-y-6">
                {/* Filters and Sorting */}
                <div className="flex gap-4 items-center">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Filter:</label>
                    <select
                      value={contextFilter}
                      onChange={(e) => setContextFilter(e.target.value as 'all' | 'pinned')}
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="all">All Items</option>
                      <option value="pinned">Pinned Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Approval:</label>
                    <select
                      value={contextApprovalFilter}
                      onChange={(e) => setContextApprovalFilter(e.target.value as 'all' | 'approved' | 'pending' | 'disapproved')}
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="all">All Statuses</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="disapproved">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sort by:</label>
                    <select
                      value={contextSortBy}
                      onChange={(e) => setContextSortBy(e.target.value as 'recent' | 'accessed' | 'confidence')}
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="recent">Most Recent</option>
                      <option value="accessed">Last Accessed</option>
                      <option value="confidence">Highest Confidence</option>
                    </select>
                  </div>
                </div>

                {/* Context Memories List */}
                {contextLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="text-gray-500">Loading...</div>
                  </div>
                ) : contextMemories.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No context memories yet. They&apos;ll appear here when meetings are processed.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contextMemories.map((memory) => (
                      <div
                        key={memory.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {memory.is_pinned && <Pin className="w-4 h-4 text-yellow-500" />}
                              <div className="flex gap-2">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                                  {(memory.confidence_score * 100).toFixed(0)}% confidence
                                </span>
                                {memory.approval_status === 'approved' && (
                                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded font-medium">
                                    Approved
                                  </span>
                                )}
                                {memory.approval_status === 'pending' && (
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded font-medium">
                                    Pending Approval
                                  </span>
                                )}
                                {memory.approval_status === 'disapproved' && (
                                  <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs rounded font-medium">
                                    Rejected
                                  </span>
                                )}
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">
                                  {memory.access_count} accessed
                                </span>
                              </div>
                            </div>
                            <p className="text-gray-900 font-medium line-clamp-2">{memory.insight_text}</p>
                            {memory.keywords && memory.keywords.length > 0 && (
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {memory.keywords.slice(0, 3).map((keyword: string, idx: number) => (
                                  <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded">
                                    #{keyword}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            {memory.approval_status === 'pending' ? (
                              <>
                                <button
                                  onClick={() => approveContext(memory.id)}
                                  className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
                                  title="Approve"
                                >
                                  <Check className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => disapproveContext(memory.id)}
                                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                  title="Disapprove"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => togglePinContext(memory.id, memory.is_pinned)}
                                className="p-2 text-gray-400 hover:text-yellow-500 transition-colors"
                                title={memory.is_pinned ? 'Unpin' : 'Pin'}
                              >
                                {memory.is_pinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
                              </button>
                            )}
                            <button
                              onClick={() => deleteContext(memory.id)}
                              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Search Tab - AI Chat */}
            {activeTab === 'search' && (
              <div className="flex flex-col h-[600px]">
                {/* Header */}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">🤖 AI Assistant</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Ask questions about your company and I&apos;ll answer using your knowledge base
                  </p>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  {chatMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-gray-400">
                        <svg className="w-16 h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p className="text-sm">Start a conversation by asking a question</p>
                        <p className="text-xs mt-2">Example: &quot;What is our mission statement?&quot;</p>
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((message, idx) => (
                      <div
                        key={idx}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[80%] ${message.role === 'user' ? 'order-2' : 'order-1'}`}>
                          {/* Message Bubble */}
                          <div
                            className={`rounded-lg px-4 py-3 ${
                              message.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-200 text-gray-900'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            <p className={`text-xs mt-1 ${
                              message.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                            }`}>
                              {message.timestamp.toLocaleTimeString()}
                            </p>
                          </div>

                          {/* Sources Section (only for assistant messages) */}
                          {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                            <details className="mt-2 bg-gray-100 rounded-lg overflow-hidden">
                              <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors">
                                📚 View {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                              </summary>
                              <div className="p-3 space-y-2 border-t border-gray-200">
                                {message.sources.map((source, srcIdx) => (
                                  <div
                                    key={srcIdx}
                                    className="bg-white rounded p-3 border border-gray-200"
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                                        {source.content_type}
                                      </span>
                                      <span className="text-xs font-medium text-green-600">
                                        {(source.similarity * 100).toFixed(0)}% match
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-700 leading-relaxed">
                                      {source.content}
                                    </p>
                                    {source.metadata && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {source.metadata.file_name && (
                                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                            📄 {source.metadata.file_name}
                                          </span>
                                        )}
                                        {source.metadata.category && (
                                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                                            {source.metadata.category}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {/* Loading Indicator */}
                  {searching && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </div>
                          <span className="text-xs text-gray-500">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scroll anchor */}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !searching && searchQuery && handleSearch()}
                      placeholder="Ask me anything about your company..."
                      disabled={searching}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={searching || !searchQuery}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {searching ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Sending
                        </span>
                      ) : (
                        '➤ Send'
                      )}
                    </button>
                  </div>
                  {chatMessages.length > 0 && (
                    <button
                      onClick={() => setChatMessages([])}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                      🗑️ Clear conversation
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Add Document Metadata
                </h2>
                
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <span className="font-medium">
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected:
                    </span>
                    {' '}
                    {selectedFiles.map(f => f.name).join(', ')}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    File type{selectedFiles.length > 1 ? 's' : ''} will be automatically detected
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title {selectedFiles.length === 1 && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={uploadMetadata.title}
                      onChange={(e) => setUploadMetadata(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Document title"
                    />
                    {selectedFiles.length > 1 && (
                      <p className="text-xs text-gray-500 mt-1">
                        For multiple files, individual filenames will be used
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={uploadMetadata.description}
                      onChange={(e) => setUploadMetadata(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Brief description of the document(s)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <input
                      type="text"
                      value={uploadMetadata.category}
                      onChange={(e) => setUploadMetadata(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Marketing, Legal, Technical, Financial"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={uploadMetadata.tags}
                      onChange={(e) => setUploadMetadata(prev => ({ ...prev, tags: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="proposal, client, 2026, important"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Add searchable tags separated by commas
                    </p>
                  </div>

                  {/* Document Content Entry */}
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      🤖 Automatic Text Extraction {extracting && <span className="text-blue-600">(Processing...)</span>}
                    </h4>
                    
                    {extracting ? (
                      <div className="flex items-center gap-2 text-sm text-blue-700 py-4">
                        <span className="animate-spin">⏳</span>
                        <span>Extracting text from documents for AI search...</span>
                      </div>
                    ) : (
                      <>
                        {selectedFiles.map((file, index) => {
                          const hasExtractedText = extractedTexts.has(file.name);
                          const extractedText = extractedTexts.get(file.name) || '';
                          const isPdfOrWord = file.type === 'application/pdf' || 
                                             file.type.includes('word') || 
                                             file.name.endsWith('.pdf') || 
                                             file.name.endsWith('.docx') ||
                                             file.name.endsWith('.doc');
                          
                          return (
                            <div key={index} className="mb-4 last:mb-0">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                {file.name}
                                {hasExtractedText && (
                                  <span className="ml-2 text-green-600 text-xs font-semibold">
                                    ✓ {extractedText.length.toLocaleString()} characters extracted
                                  </span>
                                )}
                                {!hasExtractedText && isPdfOrWord && (
                                  <span className="ml-2 text-yellow-600 text-xs">
                                    ⚠ Failed to auto-extract - paste text manually
                                  </span>
                                )}
                              </label>
                              <textarea
                                value={extractedText}
                                onChange={(e) => {
                                  const newMap = new Map(extractedTexts);
                                  newMap.set(file.name, e.target.value);
                                  setExtractedTexts(newMap);
                                }}
                                rows={6}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                placeholder={
                                  isPdfOrWord
                                    ? "Text will be extracted automatically, or paste manually if extraction fails..."
                                    : "Enter document content for AI search..."
                                }
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                {extractedText.length.toLocaleString()} characters
                                {extractedText.length === 0 && (
                                  <span className="ml-2 text-yellow-600 font-medium">
                                    • Without content, AI cannot search this document
                                  </span>
                                )}
                              </p>
                            </div>
                          );
                        })}
                        
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <p className="text-xs text-gray-600">
                            💡 <strong>AI Search:</strong> Text content is automatically extracted from PDF/Word files. 
                            If extraction fails, copy text from your document (Ctrl+A, Ctrl+C) and paste above.
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Budget
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={uploadMetadata.budgetCurrency}
                        onChange={(e) => setUploadMetadata(prev => ({ ...prev, budgetCurrency: e.target.value }))}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="JPY">JPY (¥)</option>
                        <option value="INR">INR (₹)</option>
                        <option value="AUD">AUD (A$)</option>
                        <option value="CAD">CAD (C$)</option>
                        <option value="CHF">CHF (Fr)</option>
                      </select>
                      <input
                        type="number"
                        value={uploadMetadata.budgetAmount}
                        onChange={(e) => setUploadMetadata(prev => ({ ...prev, budgetAmount: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter amount"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Optional: Specify budget for this document/project
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={cancelUpload}
                    disabled={uploading || extracting}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUploadWithMetadata}
                    disabled={uploading || extracting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        Upload {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


