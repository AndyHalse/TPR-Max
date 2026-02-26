import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

    // Read file BEFORE any state changes to prevent browser invalidating the file reference
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch (readError: any) {
      toast({ title: "Error", description: "Could not read the file. Please try selecting it again.", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    await handleUpload(file, base64);
  };

  const handleUpload = async (fileToUpload?: File, preloadedBase64?: string) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    let base64: string;
    if (preloadedBase64) {
      base64 = preloadedBase64;
    } else {
      try {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      } catch (readError: any) {
        toast({ title: "Error", description: "Could not read the file. Please try selecting it again.", variant: "destructive" });
        return;
      }
    }

    setIsUploading(true);
    try {
      const response = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await response.json();
      onUploadComplete?.(objectPath);
      toast({ title: "Success", description: "File uploaded successfully!" });
      setSelectedFile(null);
    } catch (error: any) {
      console.error("Upload error:", error?.message || String(error));
      toast({ title: "Error", description: "Failed to upload file", variant: "destructive" });
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