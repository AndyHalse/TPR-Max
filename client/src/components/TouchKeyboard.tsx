import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Delete, Space, ArrowRight } from "lucide-react";
import { formatName } from "@/utils/textFormat";

interface TouchKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "phone";
  fieldType?: "name" | "general";
  onNext?: () => void;
  nextLabel?: string;
  showNext?: boolean;
}

const KEYBOARD_LAYOUTS = {
  text: [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"]
  ],
  numbers: [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "@"]
  ],
  symbols: [
    ["!", "@", "#", "$", "%"],
    ["^", "&", "*", "(", ")"],
    ["-", "_", "=", "+"],
    ["[", "]", "{", "}", "|"],
    [";", ":", "'", "\""],
    [",", ".", "<", ">", "?", "/"]
  ]
};

export default function TouchKeyboard({ value, onChange, placeholder, type = "text", fieldType = "general", onNext, nextLabel, showNext = true }: TouchKeyboardProps) {
  const [layout, setLayout] = useState<"text" | "numbers" | "symbols">("text");
  const [isUppercase, setIsUppercase] = useState(true);

  const handleKeyPress = (key: string) => {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
    
    if (key === "SPACE") {
      onChange(value + " ");
    } else if (key === "BACKSPACE") {
      onChange(value.slice(0, -1));
    } else if (key === "CLEAR") {
      onChange("");
    } else if (key === "CAPS") {
      setIsUppercase(!isUppercase);
    } else {
      const finalKey = layout === "text" && !isUppercase ? key.toLowerCase() : key;
      const newValue = value + finalKey;
      
      if (fieldType === "name" && layout === "text") {
        onChange(formatName(newValue));
      } else {
        onChange(newValue);
      }
    }
  };

  const getKeyboardLayout = () => {
    if (type === "email" && layout === "text") {
      return [
        ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
        ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
        ["Z", "X", "C", "V", "B", "N", "M"],
        ["@", ".", "-", "_"]
      ];
    }
    if (type === "phone") {
      return [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["+", "0", "-"]
      ];
    }
    return KEYBOARD_LAYOUTS[layout] || KEYBOARD_LAYOUTS.text;
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-white/30">
      {/* Display */}
      <div className="mb-8">
        <div className="bg-[var(--background)] rounded-2xl p-6 min-h-[80px] flex items-center shadow-inner">
          <span className={`text-2xl font-medium ${value ? "text-fixed" : "text-variable"}`}>
            {value || placeholder || "Type here..."}
          </span>
          <span className="ml-2 animate-pulse text-variable text-2xl font-light">|</span>
          {onNext && showNext && (
            <Button
              onClick={onNext}
              className="ml-auto h-14 px-8 text-lg font-bold bg-green-500 hover:bg-green-600 text-white rounded-xl transition-all transform active:scale-95 shadow-lg"
            >
              {nextLabel || "Next"}
              <ArrowRight className="ml-2" size={20} />
            </Button>
          )}
        </div>
      </div>

      {/* Layout switcher for text mode */}
      {type === "text" && (
        <div className="flex gap-3 mb-6">
          <Button
            onClick={() => setLayout("text")}
            size="lg"
            className={`flex-1 text-lg font-semibold py-4 rounded-xl transition-all transform active:scale-95 ${
              layout === "text" 
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg" 
                : "bg-white/70 hover:bg-white/90 border-slate-300 text-variable"
            }`}
          >
            ABC
          </Button>
          <Button
            onClick={() => setLayout("numbers")}
            size="lg"
            className={`flex-1 text-lg font-semibold py-4 rounded-xl transition-all transform active:scale-95 ${
              layout === "numbers" 
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg" 
                : "bg-white/70 hover:bg-white/90 border-slate-300 text-variable"
            }`}
          >
            123
          </Button>
          <Button
            onClick={() => setLayout("symbols")}
            size="lg"
            className={`flex-1 text-lg font-semibold py-4 rounded-xl transition-all transform active:scale-95 ${
              layout === "symbols" 
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg" 
                : "bg-white/70 hover:bg-white/90 border-slate-300 text-variable"
            }`}
          >
            #+=
          </Button>
        </div>
      )}

      {/* Keyboard */}
      <div className="space-y-3">
        {getKeyboardLayout().map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-3 justify-center">
            {row.map((key) => (
              <Button
                key={key}
                className="h-16 flex-1 max-w-[70px] text-xl font-semibold bg-white text-slate-800 hover:bg-blue-50 border border-slate-200 hover:border-blue-400 transition-all transform active:scale-95 hover:shadow-md rounded-xl"
                onClick={() => handleKeyPress(key)}
              >
                {layout === "text" && !isUppercase ? key.toLowerCase() : key}
              </Button>
            ))}
          </div>
        ))}

        {/* Action row */}
        <div className="flex gap-3 justify-center mt-6">
          {layout === "text" && (
            <Button
              className={`h-16 px-8 text-lg font-semibold rounded-xl transition-all transform active:scale-95 ${
                isUppercase 
                  ? "bg-blue-100 border-blue-400 text-blue-700 hover:bg-blue-200" 
                  : "bg-white border-slate-300 text-variable hover:bg-slate-50"
              }`}
              onClick={() => handleKeyPress("CAPS")}
            >
              CAPS
            </Button>
          )}
          
          <Button
            className="h-16 flex-1 max-w-[140px] text-lg font-semibold bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-400 rounded-xl transition-all transform active:scale-95"
            onClick={() => handleKeyPress("SPACE")}
          >
            <Space className="mr-2" size={20} />
            Space
          </Button>
          
          <Button
            className="h-16 px-8 text-lg font-semibold bg-white hover:bg-red-50 border border-slate-200 hover:border-red-400 text-red-600 rounded-xl transition-all transform active:scale-95"
            onClick={() => handleKeyPress("BACKSPACE")}
          >
            <Delete size={20} />
          </Button>
          
          <Button
            className="h-16 px-8 text-lg font-semibold bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-400 text-orange-600 rounded-xl transition-all transform active:scale-95"
            onClick={() => handleKeyPress("CLEAR")}
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
