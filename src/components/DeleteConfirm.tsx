'use client'

import Modal from './Modal'
import { AlertTriangle } from 'lucide-react'

interface DeleteConfirmProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  loading?: boolean
}

export default function DeleteConfirm({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  loading = false
}: DeleteConfirmProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-12 h-12 text-red-600" />
          </div>
          <p className="text-gray-700">{message}</p>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-danger"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
