import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ObjectUploaderProps {
  onUploadComplete?: (fileUrl: string) => void;
  buttonClassName?: string;
  children?: ReactNode;
  accept?: string;
  maxSize?: number; // in bytes
}

export function ObjectUploader({
  onUploadComplete,
  buttonClassName,
  children,
  accept = "image/*",
  maxSize = 5 * 1024 * 1024, // 5MB default
}: ObjectUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > maxSize) {
      toast({
        title: "Error",
        description: `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    // Auto-upload the file immediately after selection
    await handleUpload(file);
  };

  const handleUpload = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    setIsUploading(true);
    try {
      // Get upload URL from backend
      const response = await fetch('/api/objects/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL } = await response.json();

      // Upload file directly to object storage
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      // Extract object ID from upload URL for serving
      // uploadURL format: https://storage.googleapis.com/bucket/path/to/uploads/objectId?params
      const url = new URL(uploadURL);
      const pathParts = url.pathname.split('/');
      const objectId = pathParts[pathParts.length - 1]; // Get the last part (object ID)
      const normalizedPath = `/objects/uploads/${objectId}`;
      
      console.log('Upload URL:', uploadURL);
      console.log('Extracted object ID:', objectId);
      console.log('Normalized path:', normalizedPath);
      
      // Notify parent component with the object path
      onUploadComplete?.(normalizedPath);
      
      toast({
        title: "Success",
        description: "File uploaded successfully!",
      });

      setSelectedFile(null);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload">
          <Button
            type="button"
            variant="outline"
            className={buttonClassName}
            asChild
          >
            <span>
              <Upload className="mr-2" size={16} />
              {children || "Choose File"}
            </span>
          </Button>
        </label>

        {selectedFile && (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
            <span className="text-sm text-slate-700 truncate max-w-40">
              {selectedFile.name}
            </span>
            <button
              onClick={clearFile}
              className="text-slate-500 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span>Uploading...</span>
        </div>
      )}
    </div>
  );
}