import React from "react";

export default function ToggleSwitch({
  checked,
  onChange,
  onColor = "bg-green-500",
  offColor = "bg-gray-300",
  disabled = false,
}) {
  return (
    <div
      className={`w-13 h-7 flex items-center rounded-full p-1 transition-colors duration-300
        ${checked ? onColor : offColor}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
    >
      <div
        className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${
          checked ? "translate-x-6" : "translate-x-0"
        }`}
      ></div>
    </div>
  );
}
