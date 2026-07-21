'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileText, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

interface FileUploadProps {
  value?: string
  onChange: (url: string) => void
  label?: string
  bucket?: string
  accept?: string
  fileType?: 'pdf' | 'document'
  maxSizeMB?: number
  className?: string
}

export default function FileUpload({
  value,
  onChange,
  label = 'Upload File',
  bucket = 'documents',
  accept = '.pdf',
  fileType = 'pdf',
  maxSizeMB = 10,
  className = ''
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(
    value ? value.split('/').pop() || null : null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (fileType === 'pdf' && file.type !== 'application/pdf') {
      toast.error('Please select a PDF file')
      return
    }

    // Validate file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`File size must be less than ${maxSizeMB}MB`)
      return
    }

    setUploading(true)

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = fileName

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Upload error:', error)
        throw error
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath)

      setFileName(file.name)
      onChange(publicUrl)
      toast.success('File uploaded successfully')
    } catch (error) {
      console.error('Error uploading file:', error)
      const message = error instanceof Error ? error.message : 'Failed to upload file'
      toast.error(message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = () => {
    setFileName(null)
    onChange('')
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      
      {fileName || value ? (
        <div className="relative group border-2 border-gray-300 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {fileName || value?.split('/').pop() || 'File attached'}
                </p>
                <p className="text-xs text-gray-500">PDF Document</p>
              </div>
            </div>
            <button
              onClick={handleRemove}
              className="bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors ml-2"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
              type="button"
            >
              <Upload className="w-4 h-4" />
              Change File
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition-colors cursor-pointer flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 py-8"
        >
          {uploading ? (
            <>
              <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-2" />
              <p className="text-sm text-gray-600">Uploading...</p>
            </>
          ) : (
            <>
              <FileText className="w-12 h-12 text-gray-400 mb-2" />
              <div className="flex items-center gap-2 text-primary-600 font-medium">
                <Upload className="w-5 h-5" />
                Click to upload PDF
              </div>
              <p className="text-xs text-gray-500 mt-1">PDF up to {maxSizeMB}MB</p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
    </div>
  )
}
