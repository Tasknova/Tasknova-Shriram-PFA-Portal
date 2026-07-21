'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

interface ImageUploadProps {
  value?: string
  onChange: (url: string) => void
  label?: string
  bucket?: string
  className?: string
}

export default function ImageUpload({
  value,
  onChange,
  label = 'Upload Image',
  bucket = 'blog-images',
  className = ''
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(value || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
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

      setPreview(publicUrl)
      onChange(publicUrl)
      toast.success('Image uploaded successfully')
    } catch (error) {
      console.error('Error uploading image:', error)
      const message = error instanceof Error ? error.message : 'Failed to upload image'
      toast.error(message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = () => {
    setPreview(null)
    onChange('')
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      
      {preview ? (
        <div className="relative group">
          <Image
            src={preview} 
            alt="Preview" 
            width={800}
            height={384}
            className="w-full h-48 object-cover rounded-lg border border-gray-300"
          />
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
              type="button"
            >
              <Upload className="w-4 h-4" />
              Change Image
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition-colors cursor-pointer flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100"
        >
          {uploading ? (
            <>
              <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-2" />
              <p className="text-sm text-gray-600">Uploading...</p>
            </>
          ) : (
            <>
              <ImageIcon className="w-12 h-12 text-gray-400 mb-2" />
              <div className="flex items-center gap-2 text-primary-600 font-medium">
                <Upload className="w-5 h-5" />
                Click to upload
              </div>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 5MB</p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
    </div>
  )
}
