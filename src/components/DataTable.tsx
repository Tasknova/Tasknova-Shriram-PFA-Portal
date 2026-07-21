'use client'

import { useState } from 'react'
import { Search, Edit, Trash2, Eye } from 'lucide-react'

interface Column<T> {
  key: string
  label: string
  render?(value: unknown, row: T): React.ReactNode
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onView?: (row: T) => void
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  searchable?: boolean
  searchKeys?: string[]
}

export default function DataTable<T extends { id?: string | number }>({
  data,
  columns,
  onView,
  onEdit,
  onDelete,
  searchable = true,
  searchKeys = []
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const filteredData = searchable && searchQuery
    ? data.filter((row) =>
        searchKeys.some((key) => {
          const value = (row as Record<string, unknown>)[key]
          return String(value ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        })
      )
    : data

  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-12 input-field bg-white shadow-sm"
          />
        </div>
      )}

      <div className="table-container shadow-md">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider"
                  >
                    {column.label}
                  </th>
                ))}
                {(onView || onEdit || onDelete) && (
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-12 h-12 text-gray-300" />
                      <p className="text-sm">No data found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, index) => (
                  <tr key={row.id || index} className="hover:bg-gradient-to-r hover:from-primary-50 hover:to-purple-50 transition-colors duration-200">
                    {columns.map((column) => (
                      <td key={column.key} className="px-6 py-4 text-sm text-gray-900">
                        {(() => {
                          const value = (row as Record<string, unknown>)[column.key]
                          return column.render ? column.render(value, row) : String(value ?? '-')
                        })()}
                      </td>
                    ))}
                    {(onView || onEdit || onDelete) && (
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                          {onView && (
                            <button
                              onClick={() => onView(row)}
                              className="text-primary-600 hover:text-primary-900 inline-flex items-center transition-transform hover:scale-110"
                              title="View"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                          )}
                          {onEdit && (
                            <button
                              onClick={() => onEdit(row)}
                              className="text-blue-600 hover:text-blue-900 inline-flex items-center transition-transform hover:scale-110"
                              title="Edit"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(row)}
                              className="text-red-600 hover:text-red-900 inline-flex items-center transition-transform hover:scale-110"
                              title="Delete"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-700 font-medium">
              Showing <span className="font-bold text-primary-600">{startIndex + 1}</span> to <span className="font-bold text-primary-600">{Math.min(startIndex + itemsPerPage, filteredData.length)}</span> of{' '}
              <span className="font-bold text-primary-600">{filteredData.length}</span> results
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white hover:shadow-md transition-all"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white hover:shadow-md transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
