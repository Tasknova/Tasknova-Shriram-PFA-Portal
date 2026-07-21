import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Pin, PinOff, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  storeProjectMetadataWithEmbedding,
  generateDocumentEmbeddingClientSide,
  searchProjectContent,
  generateProjectChatResponse
} from '@/lib/projectEmbeddings';

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
import type { Project, ProjectMetadata, ProjectDocument, ProjectContextMemory } from '@/types';

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

interface ProjectBrainPageProps {
  projectId: string;
  onBack: () => void;
}

export default function ProjectBrainPage({ projectId, onBack }: ProjectBrainPageProps) {
  const [activeTab, setActiveTab] = useState<'metadata' | 'documents' | 'context-memory' | 'chat'>('metadata');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Project State
  const [project, setProject] = useState<Project | null>(null);
  const [metadata, setMetadata] = useState<Partial<ProjectMetadata>>({
    domain: '',
    industry: '',
    project_type: '',
    target_audience: '',
    tech_stack: [],
    requirements: '',
    key_goals: [],
    budget_currency: 'USD',
    budget_amount: undefined,
    priority_level: 'medium',
    pricing_information: '',
    additional_context: ''
  });
  
  // Documents State
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedTexts, setExtractedTexts] = useState<Map<string, string>>(new Map());
  const [extracting, setExtracting] = useState(false);
  const [regeneratingEmbeddings, setRegeneratingEmbeddings] = useState(false);
  const [regeneratingDocId, setRegeneratingDocId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editContentText, setEditContentText] = useState<string>('');
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Context Memory State
  const [contextMemories, setContextMemories] = useState<ProjectContextMemory[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextFilter, setContextFilter] = useState<'all' | 'pinned'>('all');
  const [contextApprovalFilter, setContextApprovalFilter] = useState<'all' | 'approved' | 'pending' | 'disapproved'>('all');
  const [contextSortBy, setContextSortBy] = useState<'recent' | 'accessed' | 'confidence'>('recent');
  const [, setSelectedContext] = useState<ProjectContextMemory | null>(null);
  
  const [uploadMetadata, setUploadMetadata] = useState({
    title: '',
    description: '',
    category: '',
    tags: ''
  });
  
  // Chat State
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
        projectId,
        filter: contextFilter,
        approvalStatus: contextApprovalFilter,
        sort: contextSortBy,
        includePending: 'true',
      });
      const res = await fetch(`/api/admin/project-context-memory?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch project context memory');
      const data = await res.json();
      setContextMemories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading context memories:', error);
    } finally {
      setContextLoading(false);
    }
  }, [userId, projectId, contextFilter, contextApprovalFilter, contextSortBy]);

  useEffect(() => {
    const initializeProject = async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.authenticated && data.admin) {
          setUserId(data.admin.id);

          const [projectResult, metadataResult, documentsResult] = await Promise.all([
            supabase.from('projects').select('*').eq('id', projectId).single(),
            supabase.from('project_metadata').select('*').eq('project_id', projectId).maybeSingle(),
            supabase
              .from('project_documents')
              .select('*')
              .eq('project_id', projectId)
              .eq('is_deleted', false)
              .order('created_at', { ascending: false }),
          ]);

          if (projectResult.error) {
            throw projectResult.error;
          }
          setProject(projectResult.data);

          if (metadataResult.error && metadataResult.error.code !== 'PGRST116') {
            throw metadataResult.error;
          }
          if (metadataResult.data) {
            setMetadata(metadataResult.data);
          }

          if (documentsResult.error) {
            throw documentsResult.error;
          }
          setDocuments(documentsResult.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    };

    void initializeProject();
  }, [projectId]);
  
  useEffect(() => {
    if (activeTab === 'context-memory' && userId) {
      void loadContextMemories();
    }
  }, [activeTab, userId, loadContextMemories]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function loadMetadata() {
    try {
      const { data, error } = await supabase
        .from('project_metadata')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) setMetadata(data);
    } catch (error) {
      console.error('Error loading metadata:', error);
    }
  }

  async function loadDocuments() {
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  }

  async function togglePinContext(id: string, isPinned: boolean) {
    try {
      const res = await fetch('/api/admin/project-context-memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId, is_pinned: !isPinned }),
      });
      if (!res.ok) throw new Error('Failed to update project context memory');
      await loadContextMemories();
    } catch (error) {
      console.error('Error updating context:', error);
    }
  }

  async function deleteContext(id: string) {
    try {
      const res = await fetch(
        `/api/admin/project-context-memory?id=${encodeURIComponent(id)}&projectId=${encodeURIComponent(projectId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete project context memory');
      await loadContextMemories();
      setSelectedContext(null);
    } catch (error) {
      console.error('Error deleting context:', error);
    }
  }

  async function approveContext(id: string) {
    try {
      const res = await fetch('/api/admin/project-context-memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId, action: 'approve' }),
      });
      if (!res.ok) throw new Error('Failed to approve project context memory');
      await loadContextMemories();
    } catch (error) {
      console.error('Error approving context:', error);
    }
  }

  async function disapproveContext(id: string) {
    try {
      const res = await fetch('/api/admin/project-context-memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId, action: 'disapprove' }),
      });
      if (!res.ok) throw new Error('Failed to disapprove project context memory');
      await loadContextMemories();
    } catch (error) {
      console.error('Error disapproving context:', error);
    }
  }

  async function handleSaveMetadata() {
    if (!userId || !project) return;
    
    setLoading(true);
    try {
      const result = await storeProjectMetadataWithEmbedding(
        supabase,
        projectId,
        project.company_id,
        project.project_name,
        metadata
      );

      if (!result.success) {
        alert(`Error: ${result.error}`);
        return;
      }

      alert('✓ Project metadata saved successfully!');
      await loadMetadata();
    } catch (error) {
      console.error('Error saving:', error);
      alert('✗ Error saving project metadata');
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
    if (!userId || !project) return;

    setUploading(true);
    try {
      const uploadedDocs: ProjectDocument[] = [];

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
          .from('project-documents')
          .upload(`${projectId}/${fileName}`, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('project-documents')
          .getPublicUrl(uploadData.path);

        // Determine file type
        let fileType: ProjectDocument['file_type'] = 'other';
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

        // Get extracted text for this file (will be null since we don't auto-extract)
        const contentText = extractedTexts.get(file.name) || null;

        // Insert document record
        const { data: docData, error: docError } = await supabase
          .from('project_documents')
          .insert({
            project_id: projectId,
            company_id: project.company_id,
            uploaded_by: userId,
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
            status: 'uploaded',
            is_deleted: false
          })
          .select()
          .single();

        if (docError) throw docError;

        // Generate embedding for document directly on client-side
        generateDocumentEmbeddingClientSide(
          supabase,
          projectId,
          project.company_id,
          docData.id,
          project.project_name
        ).then(result => {
          if (result.success) {
            console.log('✓ Successfully generated embedding for:', docData.file_name);
          } else {
            console.warn('⚠ Failed to generate embedding for:', docData.file_name, result.error);
          }
        }).catch(error => {
          console.warn('⚠ Error generating embedding for:', docData.file_name, error);
        });

        uploadedDocs.push(docData);
      }

      alert(`✓ Successfully uploaded ${uploadedDocs.length} document${uploadedDocs.length > 1 ? 's' : ''}!`);
      await loadDocuments();
      
      // Reset modal
      setShowUploadModal(false);
      setSelectedFiles([]);
      setExtractedTexts(new Map());
      setUploadMetadata({ title: '', description: '', category: '', tags: '' });
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
    setUploadMetadata({ title: '', description: '', category: '', tags: '' });
  }

  async function regenerateDocumentEmbedding(documentId: string) {
    if (!project || !userId) return;

    setRegeneratingDocId(documentId);
    try {
      const result = await generateDocumentEmbeddingClientSide(
        supabase,
        projectId,
        project.company_id,
        documentId,
        project.project_name
      );

      if (result.success) {
        alert('✓ Successfully regenerated embedding!');
      } else {
        throw new Error(result.error || 'Failed to regenerate embedding');
      }
    } catch (error) {
      console.error('Error regenerating embedding:', error);
      alert(`✗ Error: ${error instanceof Error ? error.message : 'Failed to regenerate embedding'}`);
    } finally {
      setRegeneratingDocId(null);
    }
  }

  function confirmDeleteDocument(documentId: string) {
    setDeletingDocId(documentId);
    setShowDeleteConfirm(true);
  }

  async function deleteDocument() {
    if (!deletingDocId || !userId) return;

    try {
      const docToDelete = documents.find(d => d.id === deletingDocId);
      if (!docToDelete) throw new Error('Document not found');

      // Delete from storage if exists
      if (docToDelete.storage_url) {
        const path = docToDelete.storage_url.split('/').slice(-2).join('/');
        const { error: storageError } = await supabase.storage
          .from('project-documents')
          .remove([path]);
        
        if (storageError) {
          console.warn('Storage deletion warning:', storageError);
        }
      }

      // Delete document and embeddings from database
      const { error: deleteError } = await supabase
        .from('project_documents')
        .delete()
        .eq('id', deletingDocId);

      if (deleteError) throw deleteError;

      alert('✓ Successfully deleted document!');
      await loadDocuments();
      
    } catch (error) {
      console.error('Error deleting document:', error);
      alert(`✗ Error: ${error instanceof Error ? error.message : 'Failed to delete document'}`);
    } finally {
      setDeletingDocId(null);
      setShowDeleteConfirm(false);
    }
  }

  async function regenerateAllEmbeddings() {
    if (!project || !userId) return;

    setRegeneratingEmbeddings(true);
    try {
      let successCount = 0;
      let failCount = 0;

      for (const doc of documents) {
        try {
          const result = await generateDocumentEmbeddingClientSide(
            supabase,
            projectId,
            project.company_id,
            doc.id!,
            project.project_name
          );

          if (result.success) {
            successCount++;
            console.log(`✓ Generated embedding for: ${doc.file_name}`);
          } else {
            failCount++;
            console.error(`✗ Failed for: ${doc.file_name}`, result.error);
          }
        } catch (error) {
          failCount++;
          console.error(`✗ Error for: ${doc.file_name}`, error);
        }
      }

      alert(`✓ Regeneration complete!\n${successCount} succeeded, ${failCount} failed`);
    } catch (error) {
      console.error('Error regenerating embeddings:', error);
      alert(`✗ Error: ${error instanceof Error ? error.message : 'Failed to regenerate embeddings'}`);
    } finally {
      setRegeneratingEmbeddings(false);
    }
  }

  function startEditingContent(doc: ProjectDocument) {
    setEditingDocId(doc.id!);
    setEditContentText(doc.content_text || '');
  }

  async function saveDocumentContent() {
    if (!editingDocId || !project) return;

    try {
      const { error } = await supabase
        .from('project_documents')
        .update({ content_text: editContentText })
        .eq('id', editingDocId);

      if (error) throw error;

      // Regenerate embedding with new content
      await generateDocumentEmbeddingClientSide(
        supabase,
        projectId,
        project.company_id,
        editingDocId,
        project.project_name
      );

      alert('✓ Content updated and embedding regenerated!');
      setEditingDocId(null);
      setEditContentText('');
      await loadDocuments();
    } catch (error) {
      console.error('Error saving content:', error);
      alert(`✗ Error: ${error instanceof Error ? error.message : 'Failed to save content'}`);
    }
  }

  function cancelEditContent() {
    setEditingDocId(null);
    setEditContentText('');
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
    setSearching(true);
    setSearchQuery('');

    try {
      // Search for relevant content
      const embeddingResults = await searchProjectContent(
        supabase,
        projectId,
        userMessage.content,
        0.75,
        5
      );

      const params = new URLSearchParams({
        projectId,
        filter: 'all',
        sort: 'recent',
      });
      const memoryRes = await fetch(`/api/admin/project-context-memory?${params.toString()}`);
      const memoryItems = memoryRes.ok ? await memoryRes.json() : [];
      const rankedMemoryContext: ChatSource[] = (Array.isArray(memoryItems) ? memoryItems : [])
        .map((item: ProjectContextMemory) => ({
          content_type: 'context_memory',
          content: item.insight_text,
          similarity: scoreByQueryOverlap(userMessage.content, item.insight_text || '', item.keywords),
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

      const searchResults = [...embeddingResults, ...rankedMemoryContext];
      const chatContext = searchResults.map((item) => ({
        content: item.content,
        similarity: item.similarity,
        content_type: item.content_type,
        metadata: item.metadata ? JSON.stringify(item.metadata) : undefined,
      }));

      // Generate AI response using RAG
      const { answer, error } = await generateProjectChatResponse(
        userMessage.content,
        chatContext
      );

      if (error) {
        throw new Error(error);
      }

      // Add assistant message to chat
      const assistantMessage = {
        role: 'assistant' as const,
        content: answer || 'I apologize, but I encountered an error generating a response.',
        sources: searchResults,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error searching:', error);
      const errorMessage = {
        role: 'assistant' as const,
        content: `Error: ${error instanceof Error ? error.message : 'Failed to search project knowledge'}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setSearching(false);
    }
  }

  function handleArrayInput(field: 'tech_stack' | 'key_goals', value: string) {
    const array = value.split(',').map(s => s.trim()).filter(Boolean);
    setMetadata(prev => ({ ...prev, [field]: array }));
  }

  if (!project) {
    return <div className="p-8">Loading project...</div>;
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
              ← Back to Projects
            </button>
            <h1 className="text-3xl font-bold text-gray-900">{project.project_name} - Brain</h1>
            <p className="text-gray-600 mt-2">
              Store and manage project-specific knowledge with semantic search and AI chat
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {[
                { id: 'metadata' as const, label: 'Project Metadata', icon: '📋' },
                { id: 'documents' as const, label: 'Documents', icon: '📄' },
                { id: 'context-memory' as const, label: 'Context Memory', icon: '💭' },
                { id: 'chat' as const, label: 'AI Chat', icon: '💬' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 border-b-2 font-medium text-sm flex items-center gap-2 ${ 
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Metadata Tab */}
            {activeTab === 'metadata' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Domain
                    </label>
                    <input
                      type="text"
                      value={metadata.domain || ''}
                      onChange={(e) => setMetadata(prev => ({ ...prev, domain: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Healthcare, Finance, Education"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Industry
                    </label>
                    <input
                      type="text"
                      value={metadata.industry || ''}
                      onChange={(e) => setMetadata(prev => ({ ...prev, industry: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., SaaS, E-commerce, Healthcare"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Type
                    </label>
                    <input
                      type="text"
                      value={metadata.project_type || ''}
                      onChange={(e) => setMetadata(prev => ({ ...prev, project_type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Web App, Mobile App, API"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Budget
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={metadata.budget_currency || 'USD'}
                        onChange={(e) => setMetadata(prev => ({ ...prev, budget_currency: e.target.value }))}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="INR">INR (₹)</option>
                        <option value="JPY">JPY (¥)</option>
                      </select>
                      <input
                        type="number"
                        value={metadata.budget_amount || ''}
                        onChange={(e) => setMetadata(prev => ({ ...prev, budget_amount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter budget amount"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Audience
                  </label>
                  <input
                    type="text"
                    value={metadata.target_audience || ''}
                    onChange={(e) => setMetadata(prev => ({ ...prev, target_audience: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Small businesses, Enterprise clients, Consumers"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tech Stack (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={metadata.tech_stack?.join(', ') || ''}
                    onChange={(e) => handleArrayInput('tech_stack', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="React, Node.js, PostgreSQL, AWS"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Key Goals (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={metadata.key_goals?.join(', ') || ''}
                    onChange={(e) => handleArrayInput('key_goals', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Improve performance, Reduce costs, Increase engagement"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Requirements
                  </label>
                  <textarea
                    value={metadata.requirements || ''}
                    onChange={(e) => setMetadata(prev => ({ ...prev, requirements: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Detailed project requirements..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pricing Information
                  </label>
                  <textarea
                    value={metadata.pricing_information || ''}
                    onChange={(e) => setMetadata(prev => ({ ...prev, pricing_information: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Details about pricing model, tiers, packages..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Context
                  </label>
                  <textarea
                    value={metadata.additional_context || ''}
                    onChange={(e) => setMetadata(prev => ({ ...prev, additional_context: e.target.value }))}
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Add any additional project information that should be searchable..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority Level
                  </label>
                  <select
                    value={metadata.priority_level || 'medium'}
                    onChange={(e) => setMetadata(prev => ({ ...prev, priority_level: e.target.value as ProjectMetadata['priority_level'] }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveMetadata}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Saving...
                      </>
                    ) : (
                      'Save Metadata & Generate Embeddings'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors">
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
                    <div className="text-5xl mb-3">📁</div>
                    <span className="text-blue-600 hover:text-blue-700 font-medium">
                      {uploading ? 'Uploading...' : 'Click to upload project documents'}
                    </span>
                    <p className="text-sm text-gray-500 mt-2">
                      Upload requirements, designs, specs, or any project-related files
                    </p>
                  </label>
                </div>

                {/* Upload Metadata Modal */}
                {showUploadModal && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                      <h2 className="text-xl font-semibold mb-4">Document Details</h2>
                      
                      <div className="mb-4 bg-blue-50 rounded-lg p-3">
                        <p className="text-sm text-blue-800">
                          📎 Selected: <strong>{selectedFiles.length}</strong> file{selectedFiles.length > 1 ? 's' : ''}
                        </p>
                        <div className="text-xs text-blue-600 mt-1">
                          {selectedFiles.map(f => f.name).join(', ')}
                        </div>
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
                            placeholder="e.g., Requirements, Design, Specifications, Legal"
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
                            placeholder="sprint-1, backend, api, important"
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
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">
                      Project Documents ({documents.length})
                    </h3>
                    {documents.length > 0 && (
                      <button
                        onClick={regenerateAllEmbeddings}
                        disabled={regeneratingEmbeddings}
                        className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {regeneratingEmbeddings ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <span>🔄</span>
                            Regenerate All Embeddings
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {documents.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                      <p className="text-gray-500 text-sm">No documents uploaded yet</p>
                      <p className="text-gray-400 text-xs mt-1">Upload your first document to get started</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {documents.map(doc => (
                        <div
                          key={doc.id}
                          className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">
                                {doc.title || doc.file_name}
                              </h4>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span className="px-2 py-1 bg-gray-100 rounded uppercase text-xs font-medium">
                                  {doc.file_type}
                                </span>
                                <span>{((doc.file_size || 0) / 1024).toFixed(2)} KB</span>
                                {doc.category && (
                                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
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
                              {doc.content_text && (
                                <div className="mt-2">
                                  <details className="text-sm">
                                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                                      📄 Document Content ({doc.content_text.length} characters)
                                    </summary>
                                    <div className="mt-2 p-3 bg-gray-50 rounded text-xs text-gray-600 max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
                                      {doc.content_text}
                                    </div>
                                  </details>
                                </div>
                              )}
                              {!doc.content_text && (
                                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                                  ⚠️ No content text - AI cannot search this document. Click &quot;Add Content&quot; to fix.
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => startEditingContent(doc)}
                                className="px-3 py-1.5 bg-green-100 text-green-700 text-sm rounded hover:bg-green-200 flex items-center gap-1"
                                title="Add/Edit document content for AI"
                              >
                                <span>✏️</span>
                                <span className="text-xs">{doc.content_text ? 'Edit' : 'Add'} Content</span>
                              </button>
                              <button
                                onClick={() => regenerateDocumentEmbedding(doc.id!)}
                                disabled={regeneratingDocId === doc.id}
                                className="px-3 py-1.5 bg-purple-100 text-purple-700 text-sm rounded hover:bg-purple-200 disabled:opacity-50 flex items-center gap-1"
                                title="Regenerate AI embeddings"
                              >
                                {regeneratingDocId === doc.id ? (
                                  <>
                                    <span className="animate-spin text-xs">⏳</span>
                                    <span className="text-xs">Regenerating...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>🔄</span>
                                    <span className="text-xs">Regenerate</span>
                                  </>
                                )}
                              </button>
                              {doc.storage_url && (
                                <a
                                  href={doc.storage_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium hover:bg-blue-50 rounded"
                                  title="View document"
                                >
                                  View →
                                </a>
                              )}
                              <button
                                onClick={() => confirmDeleteDocument(doc.id!)}
                                className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 flex items-center gap-1"
                                title="Delete document"
                              >
                                <span>🗑️</span>
                                <span className="text-xs">Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit Content Modal */}
                {editingDocId && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                      <h2 className="text-xl font-semibold mb-4">Edit Document Content</h2>
                      
                      <div className="mb-4 bg-blue-50 rounded-lg p-3">
                        <p className="text-sm text-blue-800">
                          📝 Paste the actual text content from your document. This is what the AI will use to answer questions.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Document Content <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={editContentText}
                            onChange={(e) => setEditContentText(e.target.value)}
                            rows={20}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                            placeholder="Paste the complete text content from your PDF or Word document here..."
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {editContentText.length} characters • This text will be used to generate AI embeddings
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end gap-3">
                        <button
                          onClick={cancelEditContent}
                          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveDocumentContent}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                        >
                          <span>💾</span>
                          Save & Regenerate Embedding
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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
                          <div className="flex-1 cursor-pointer" onClick={() => setSelectedContext(memory)}>
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

            {/* Chat/Search Tab */}
            {activeTab === 'chat' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-1">💬 AI Project Assistant</h3>
                  <p className="text-sm text-gray-600">
                    Ask questions about your project using natural language. The AI will search through project metadata and documents to provide accurate answers.
                  </p>
                </div>

                {/* Chat Messages */}
                <div className="border border-gray-200 rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto bg-white">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                      <div className="text-6xl mb-4">💡</div>
                      <p className="text-sm text-center">
                        Start a conversation by asking about your project
                      </p>
                      <p className="text-xs text-center mt-2">
                        Example: &quot;What are the technical requirements?&quot; or &quot;What&apos;s the project timeline?&quot;
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {chatMessages.map((message, idx) => (
                        <div
                          key={idx}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-4 ${
                              message.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-900'
                            }`}
                          >
                            <div className="flex items-start gap-2 mb-1">
                              <span className="text-sm font-semibold">
                                {message.role === 'user' ? '👤 You' : '🤖 AI Assistant'}
                              </span>
                              <span className="text-xs opacity-70">
                                {message.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            
                            {message.sources && message.sources.length > 0 && (
                              <details className="mt-3 text-xs">
                                <summary className="cursor-pointer font-medium opacity-80 hover:opacity-100">
                                  📚 Sources ({message.sources.length})
                                </summary>
                                <div className="mt-2 space-y-2 pl-4">
                                  {message.sources.map((source, sidx) => (
                                    <div key={sidx} className="bg-white/10 rounded p-2">
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                          {source.content_type}
                                        </span>
                                        <span className="text-green-600 font-medium">
                                          {(source.similarity * 100).toFixed(1)}% match
                                        </span>
                                      </div>
                                      {source.metadata && (
                                        <div className="mt-1">
                                          {source.metadata.file_name && (
                                            <div className="text-xs">
                                              📄 {source.metadata.file_name}
                                            </div>
                                          )}
                                          {source.metadata.category && (
                                            <div className="text-xs">
                                              🏷️ Category: {source.metadata.category}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <p className="mt-1 text-xs opacity-70 line-clamp-2">
                                        {source.content}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Search Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !searching && handleSearch()}
                    placeholder="Ask about your project... (e.g., 'What are the technical requirements?')"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={searching}
                  />
                  {chatMessages.length > 0 && (
                    <button
                      onClick={() => setChatMessages([])}
                      className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 font-medium"
                      title="Clear chat history"
                    >
                      <span>🗑️</span>
                      <span>Clear</span>
                    </button>
                  )}
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                  >
                    {searching ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Thinking...
                      </>
                    ) : (
                      <>
                        <span>Send</span>
                        <span>→</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  The AI assistant searches through your project metadata and documents to provide accurate, context-aware answers
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && deletingDocId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4 text-gray-900">🗑️ Delete Document</h2>
              
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  Are you sure you want to delete this document?
                </p>
                <p className="text-sm text-gray-600">
                  This will permanently remove:
                </p>
                <ul className="text-sm text-gray-600 mt-2 ml-4 list-disc space-y-1">
                  <li>The document file from storage</li>
                  <li>Document metadata and content</li>
                  <li>AI embeddings for this document</li>
                </ul>
                <p className="text-sm text-red-600 font-medium mt-3">
                  ⚠️ This action cannot be undone.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletingDocId(null);
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteDocument}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
                >
                  <span>🗑️</span>
                  Delete Document
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


