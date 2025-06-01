"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { AnimatePresence, motion } from "framer-motion"
import { Paperclip, Send, ChevronDown, ArrowUp, Loader2, Settings, Youtube, LineChart, FileSpreadsheet, Globe, X, File, FileText } from 'lucide-react'

import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  description?: string;
}

interface ProcessedFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  type: 'text' | 'document' | 'spreadsheet' | 'image' | 'pdf' | 'unknown';
  content?: string;
  hasFullContent: boolean;
  processingError?: string;
}

interface AiInputProps {
  onSubmit: (message: string, modelId: string, sessionId: string) => Promise<void>;
  models?: AIModel[];
  loading?: boolean;
  loadingModels?: boolean;
  loadingAgents?: boolean;
  sessionId: string;
}

// Hook for auto-resize textarea (same as before)
function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: {
  minHeight: number
  maxHeight?: number
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current
      if (!textarea) return

      if (reset) {
        textarea.style.height = `${minHeight}px`
        return
      }

      textarea.style.height = `${minHeight}px`
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      )

      textarea.style.height = `${newHeight}px`
    },
    [minHeight, maxHeight]
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = `${minHeight}px`
    }
  }, [minHeight])

  useEffect(() => {
    const handleResize = () => adjustHeight()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [adjustHeight])

  return { textareaRef, adjustHeight }
}

const MIN_HEIGHT = 48
const MAX_HEIGHT = 164

const AnimatedPlaceholder = ({ showSearch }: { showSearch: boolean }) => (
  <AnimatePresence mode="wait">
    <motion.p
      key={showSearch ? "search" : "ask"}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.1 }}
      className="pointer-events-none w-[150px] text-sm absolute text-black/70 dark:text-white/70"
    >
      {showSearch ? "Search the web..." : "Ask Taurus AI..."}
    </motion.p>
  </AnimatePresence>
)

// File icon component
const FileIcon = ({ type, mimeType }: { type: string; mimeType: string }) => {
  switch (type) {
    case 'image':
      return <FileText className="w-5 h-5 text-blue-400" />
    case 'pdf':
      return <FileSpreadsheet className="w-5 h-5 text-red-400" />
    case 'spreadsheet':
      return <FileSpreadsheet className="w-5 h-5 text-green-400" />
    case 'document':
      return <FileText className="w-5 h-5 text-blue-400" />
    case 'text':
      return <FileText className="w-5 h-5 text-gray-400" />
    default:
      return <File className="w-5 h-5 text-gray-400" />
  }
}

export function AiInput({
  onSubmit,
  models = [],
  loading = false,
  loadingModels = false,
  loadingAgents = false,
  sessionId
}: AiInputProps) {
  const [value, setValue] = useState("")
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
  })
  const [showSearch, setShowSearch] = useState(true)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([])
  const [fileUploadLoading, setFileUploadLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedModel, setSelectedModel] = useState("")

  // Set default model when models are loaded
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id)
    }
  }, [models, selectedModel])

  // Upload files to backend
  const uploadFiles = async (files: File[]) => {
    if (!sessionId) {
      toast.error("Session ID is required for file upload")
      return
    }

    setFileUploadLoading(true)
    
    try {
      const formData = new FormData()
      formData.append('sessionId', sessionId)
      
      files.forEach(file => {
        formData.append('files', file)
      })

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to upload files')
      }

      const result = await response.json()
      
      if (result.success) {
        setProcessedFiles(prev => [...prev, ...result.files])
        toast.success(`Successfully uploaded ${result.files.length} file(s)`)
        
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach((error: string) => toast.error(error))
        }
      } else {
        throw new Error('Upload failed')
      }
      
    } catch (error) {
      console.error('Error uploading files:', error)
      toast.error('Failed to upload files')
    } finally {
      setFileUploadLoading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const newFiles = Array.from(files)
      setUploadedFiles(prev => [...prev, ...newFiles])
      
      // Immediately upload files to backend
      await uploadFiles(newFiles)
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveFile = async (fileId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/files/remove`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          sessionId,
          fileId
        })
      })

      if (response.ok) {
        setProcessedFiles(prev => prev.filter(f => f.id !== fileId))
        toast.success('File removed')
      } else {
        throw new Error('Failed to remove file')
      }
    } catch (error) {
      console.error('Error removing file:', error)
      toast.error('Failed to remove file')
    }
  }

  const handleSubmit = async () => {
    if (!value.trim() || loading || !selectedModel) return

    try {
      await onSubmit(value, selectedModel, sessionId)
      setValue("")
      adjustHeight(true)
    } catch (error) {
      console.error("Error submitting message:", error)
      toast.error("Failed to send message")
    }
  }

  return (
    <div className="w-full py-4">
      <div className="relative max-w-3xl border rounded-[22px] border-black/5 p-1 w-full mx-auto">
        {processedFiles.length > 0 && (
          <div className="mb-1 p-2 rounded-xl border border-neutral-700/30">
            <div className="flex items-center gap-3 overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#6b7280 transparent' }}>
              {processedFiles.map((file) => (
                <div key={file.id} className="relative flex-shrink-0 group">
                  <div className="w-12 h-12 rounded-lg border border-neutral-700/50 bg-neutral-800/20 flex items-center justify-center overflow-hidden">
                    {file.type === 'image' && file.content ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileIcon type={file.type} mimeType={file.mimeType} />
                      </div>
                    ) : (
                      <FileIcon type={file.type} mimeType={file.mimeType} />
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveFile(file.id)}
                    className="absolute -top-[0.5px] -right-[6px] w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="mt-1 text-xs text-gray-400 truncate w-12 text-center">
                    {file.originalName}
                  </div>
                  {file.processingError && (
                    <div className="mt-1 text-xs text-red-400 truncate w-12 text-center">
                      Error
                    </div>
                  )}
                </div>
              ))}
              {fileUploadLoading && (
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg border border-neutral-700/50 bg-neutral-800/20 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                  <div className="mt-1 text-xs text-gray-400 text-center">
                    Uploading...
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="relative rounded-2xl border border-black/5 bg-neutral-800/5 flex flex-col h-24">
          <div className="overflow-y-auto scrollbar-hide" style={{ maxHeight: `${MAX_HEIGHT}px` }}>
            <div className="relative">
              <Textarea
                value={value}
                placeholder=""
                className="w-full rounded-2xl rounded-b-none px-4 py-3 bg-black/5 dark:bg-white/5 border-none dark:text-white resize-none focus-visible:ring-0 leading-[1.2] font-medium"
                ref={textareaRef}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                onChange={(e) => {
                  setValue(e.target.value)
                  adjustHeight()
                }}
                style={{ overflowY: 'auto', lineHeight: '1.2' }}
                disabled={loading}
              />
              {!value && (
                <div className="absolute left-4 top-3">
                  <AnimatedPlaceholder showSearch={showSearch} />
                </div>
              )}
            </div>
          </div>

          <div className="px-3 py-2 bg-black/5 dark:bg-white/5 rounded-b-xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <label className={cn(
                  "cursor-pointer relative rounded-full p-2",
                  processedFiles.length > 0 || fileUploadLoading
                    ? "bg-[#ff3f17]/15 border border-[#ff3f17] text-[#ff3f17]"
                    : "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                )}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.json,.js,.py,.html,.css,.xml"
                    multiple
                    disabled={loading || fileUploadLoading}
                  />
                  {fileUploadLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Paperclip className={cn(
                      "w-4 h-4 transition-colors",
                      (processedFiles.length > 0) && "text-[#ff3f17]"
                    )} />
                  )}
                </label>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative inline-block">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="appearance-none border border-gray-700/50 rounded-md px-2 py-1 text-gray-400 hover:text-gray-300 pr-7 cursor-pointer focus:outline-none text-sm disabled:opacity-50"
                    disabled={loading || loadingModels}
                  >
                    {loadingModels ? (
                      <option value="">Loading models...</option>
                    ) : models.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      models.map(model => (
                        <option key={model.id}
                          value={model.id}
                          className="bg-white dark:bg-[#111111] text-gray-700 dark:text-gray-300">
                          {model.name}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                </div>

                <button
                  onClick={handleSubmit}
                  type="button"
                  className={cn(
                    "rounded-full p-2 transition-colors",
                    value
                      ? "bg-[#ff3f17]/15 text-[#ff3f17]"
                      : "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                  )}
                  disabled={!value.trim() || loading || !selectedModel}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 hover:rotate-45 transition-transform hover:text-[#ff3f17]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        
        /* Custom scrollbar for file preview */
        div[style*="scrollbar-width"]::-webkit-scrollbar {
          height: 6px;
        }
        div[style*="scrollbar-width"]::-webkit-scrollbar-track {
          background: transparent;
        }
        div[style*="scrollbar-width"]::-webkit-scrollbar-thumb {
          background: #6b7280;
          border-radius: 3px;
        }
        div[style*="scrollbar-width"]::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
    </div>
  )
}