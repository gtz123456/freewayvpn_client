import { useEffect, useRef, useState } from "react";

export default function Tooltip({ content, children, maxWidth = "max-w-xs" }) {
  const tooltipRef = useRef(null);
  const [transformStyle, setTransformStyle] = useState("translateX(-50%)");

  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const screenWidth = window.innerWidth;

    if (rect.left < 10) {
      setTransformStyle("translateX(0)");
    } else if (rect.right > screenWidth - 10) {
      setTransformStyle("translateX(-100%)");
    } else {
      setTransformStyle("translateX(-50%)");
    }
  }, []);

  return (
    <span className="relative group cursor-pointer">
      {children}
      <div
        ref={tooltipRef}
        className={`absolute bottom-full left-1/2 mb-2 p-2 rounded bg-white text-gray-800 text-sm shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 ${maxWidth} w-[90vw]`}
        style={{ transform: transformStyle, wordBreak: "break-word" }}
      >
        {content}
      </div>
    </span>
  );
}
