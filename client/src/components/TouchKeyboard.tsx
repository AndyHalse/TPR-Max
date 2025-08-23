import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Delete, Space } from "lucide-react";

interface TouchKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "phone";
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

export default function TouchKeyboard({ value, onChange, placeholder, type = "text" }: TouchKeyboardProps) {
  const [layout, setLayout] = useState<"text" | "numbers" | "symbols">("text");
  const [isUppercase, setIsUppercase] = useState(true);

  const handleKeyPress = (key: string) => {
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
      onChange(value + finalKey);
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
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
      {/* Display */}
      <div className="mb-6">
        <div className="bg-slate-100 rounded-xl p-4 min-h-[60px] flex items-center">
          <span className={`text-lg ${value ? "text-slate-800" : "text-slate-400"}`}>
            {value || placeholder || "Type here..."}
          </span>
          <span className="ml-1 animate-pulse text-slate-600">|</span>
        </div>
      </div>

      {/* Layout switcher for text mode */}
      {type === "text" && (
        <div className="flex gap-2 mb-4">
          <Button
            variant={layout === "text" ? "default" : "outline"}
            size="sm"
            onClick={() => setLayout("text")}
            className="flex-1"
          >
            ABC
          </Button>
          <Button
            variant={layout === "numbers" ? "default" : "outline"}
            size="sm"
            onClick={() => setLayout("numbers")}
            className="flex-1"
          >
            123
          </Button>
          <Button
            variant={layout === "symbols" ? "default" : "outline"}
            size="sm"
            onClick={() => setLayout("symbols")}
            className="flex-1"
          >
            #+=
          </Button>
        </div>
      )}

      {/* Keyboard */}
      <div className="space-y-2">
        {getKeyboardLayout().map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-2 justify-center">
            {row.map((key) => (
              <Button
                key={key}
                variant="outline"
                className="h-14 flex-1 max-w-[60px] text-lg font-medium bg-white hover:bg-blue-50 border-slate-300 hover:border-blue-300 transition-all"
                onClick={() => handleKeyPress(key)}
              >
                {layout === "text" && !isUppercase ? key.toLowerCase() : key}
              </Button>
            ))}
          </div>
        ))}

        {/* Action row */}
        <div className="flex gap-2 justify-center mt-4">
          {layout === "text" && (
            <Button
              variant="outline"
              className={`h-14 px-6 text-sm font-medium transition-all ${
                isUppercase ? "bg-blue-100 border-blue-300" : "bg-white border-slate-300"
              }`}
              onClick={() => handleKeyPress("CAPS")}
            >
              CAPS
            </Button>
          )}
          
          <Button
            variant="outline"
            className="h-14 flex-1 max-w-[120px] text-sm font-medium bg-white hover:bg-slate-50 border-slate-300"
            onClick={() => handleKeyPress("SPACE")}
          >
            <Space className="mr-2" size={16} />
            Space
          </Button>
          
          <Button
            variant="outline"
            className="h-14 px-6 text-sm font-medium bg-white hover:bg-red-50 border-slate-300 hover:border-red-300"
            onClick={() => handleKeyPress("BACKSPACE")}
          >
            <Delete size={18} />
          </Button>
          
          <Button
            variant="outline"
            className="h-14 px-6 text-sm font-medium bg-white hover:bg-orange-50 border-slate-300 hover:border-orange-300"
            onClick={() => handleKeyPress("CLEAR")}
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}