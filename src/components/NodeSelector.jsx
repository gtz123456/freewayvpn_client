import React, { useState } from "react";

const getCountryCode = (description) => {
  if (!description || description.length < 2) return "us"; // fallback
  return description.slice(0, 2).toLowerCase(); // e.g., "US" => "us"
};

const NodeSelector = ({
  servers,
  selectedServerIndex,
  setSelectedServerIndex,
  connected = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedServer = servers[selectedServerIndex];
  const countryCode = getCountryCode(selectedServer?.description);

  const handleSelect = (index) => {
    setSelectedServerIndex(index);
    setDropdownOpen(false);
  };

  const ChevronIcon = ({ open }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-7 h-7"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      {open ? (
        // ChevronUp
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      ) : (
        // ChevronDown
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      )}
    </svg>
  );


  return (
    <div className="relative w-[90%] max-w-xl p-2 border-white/90 rounded-lg bg-white/60 shadow flex items-center justify-between">
      <div className="flex items-center gap-3 w-full" onClick={() => setDropdownOpen((prev) => !prev)}>
        <div className="w-13 h-9 flex items-center justify-center rounded-lg overflow-hidden">
          <img
            src={`https://flagcdn.com/w80/${countryCode}.png`}
            alt={countryCode}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col flex-grow">
          <span className="text-xs text-gray-500">Select node:</span>
          <div className="text-md">
            {selectedServer?.description || selectedServer?.ip}
          </div>
        </div>
        {selectedServer?.tag && (
          <span className="text-sm border px-2 py-1 rounded-md">
            {selectedServer.tag}
          </span>
        )}
        <span className="text-lg">{selectedServer?.ping ?? "- "}ms</span>
      </div>

      <button
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="pl-3"
      >
        <ChevronIcon open={dropdownOpen} />
      </button>

      {dropdownOpen && (
        <div className="absolute left-0 top-full mt-2 w-full max-w-xl bg-white rounded-xl shadow-lg z-10 max-h-96 overflow-y-auto">
          {servers.map((s, index) => {
            const code = getCountryCode(s.description);
            return (
              <div
                key={index}
                onClick={() => handleSelect(index)}
                className={`p-3 cursor-pointer hover:bg-gray-100 flex items-center justify-between ${
                  index === selectedServerIndex ? "bg-gray-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={`https://flagcdn.com/w40/${code}.png`}
                    alt={code}
                    className="w-7 h-5 object-cover rounded"
                  />
                  <div className="flex flex-row items-center gap-2">
                    <div className="">{s.description || s.ip}</div>
                    <div className="text-sm text-gray-500">{s.tag ?? "Free"}</div>
                  </div>
                </div>
                <div className="text-sm">{s.ping ?? "- "}ms</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NodeSelector;
